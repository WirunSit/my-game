import * as Phaser from 'phaser';
import { Terrain, addExp, baseWeaponStats, pickSkill, pvpRewards, type InstantSkill, type ServerMessage, type SkillState } from '@sciboom/shared';
import type { Combatant } from '../game/Combatant';
import { Fighter } from '../game/Fighter';
import type { Net } from '../net/Net';
import { updateSave } from '../save';
import { showQuiz, type QuizResult } from '../ui/QuizPopup';
import { sfx, type Ambience, type Track } from '../audio/Sound';
import { ArenaScene } from './ArenaScene';

type Start = Extract<ServerMessage, { t: 'start' }>;

/** Throttle for telling the other player where we walked/aimed */
const MOVE_SEND_MS = 100;

/**
 * PvP against a friend on another device. The server decides everything
 * (turns, wind, every shot); this scene shows it, and sends our moves.
 */
export class OnlineBattleScene extends ArenaScene {
  private net!: Net;
  private startMsg!: Start;
  private me!: Fighter;
  private them!: Fighter;
  private fighters = new Map<string, Fighter>();
  private lastMoveSent = 0;
  private countdown?: Phaser.Time.TimerEvent;
  private quizClosed: Promise<QuizResult> | null = null;
  private turnSeconds = 20;
  private over = false;
  /** Why the match ended early (friend left, connection lost), shown on the result panel */
  private endReason: string | null = null;

  constructor() {
    super('Online');
  }

  init(data: { net: Net; start: Start }) {
    this.net = data.net;
    this.startMsg = data.start;
  }

  create() {
    const s = this.startMsg;
    this.over = false;
    this.endReason = null;
    this.quizClosed = null;
    this.fighters = new Map();
    this.setupArena(s.seed, 'backgrounds/pvp_arena', 'terrain/arena_candy', Terrain.decode(s.map));
    for (const p of s.players) {
      const mine = p.id === s.you;
      const f = new Fighter(this, p.id, p.name, p.x, p.y, p.facing, { character: p.character, outfit: p.outfit }, baseWeaponStats(p.weaponId), mine ? 0x3a8dde : 0xff5e8a);
      this.fighters.set(p.id, f);
      if (mine) this.me = f;
      else this.them = f;
    }
    this.combatants = s.players.map((p) => this.fighters.get(p.id)!);
    this.setupHud('Lobby');
    for (const f of this.fighters.values()) this.enableSkills(f, true);
    this.net.onClose = () => {
      if (!this.over) this.finish(null, 'การเชื่อมต่อหลุด');
    };
    this.hud.banner(`เจอกับ ${this.them.name}!`, '#ffcc33');
    void this.loop();
  }

  // ---- Messages from the server ---------------------------------------------------

  private async loop() {
    const token = ++this.matchToken;
    for (;;) {
      const msg = await this.net.next();
      if (token !== this.matchToken) return;
      await this.handle(msg);
      if (token !== this.matchToken) return;
    }
  }

  private async handle(msg: ServerMessage) {
    switch (msg.t) {
      case 'turn':
        return this.onTurn(msg);
      case 'quiz':
        this.phase = 'quiz';
        this.quizClosed = showQuiz(this, msg.item, { title: 'Quiz Duel: ตอบถูก ยิงแรงขึ้น 15%', seconds: msg.seconds }).then((res) => {
          this.net.send({ t: 'answer', chosen: res.chosen });
          this.recordAnswer(msg.item.question.id, res);
          return res;
        });
        return;
      case 'quizResult':
        if (msg.id === this.me.id) {
          await this.quizClosed;
          this.quizClosed = null;
          if (msg.correct) this.hud.banner('ตอบถูก! ยิงแรงขึ้น 15%', '#7dff8a');
          this.startMyAim();
        } else {
          this.hud.banner(`${this.them.name} ตอบ${msg.correct ? 'ถูก' : 'ผิด'}`, msg.correct ? '#7dff8a' : '#ff9a9a');
        }
        return;
      case 'moved': {
        const f = this.fighters.get(msg.id);
        if (!f || f === this.me) return;
        f.facing = msg.facing;
        f.angle = msg.angle;
        this.tweens.killTweensOf(f);
        this.tweens.add({ targets: f, x: msg.x, duration: MOVE_SEND_MS, onUpdate: () => f.sync() });
        f.sync();
        return;
      }
      case 'skillUsed': {
        const f = this.fighters.get(msg.id)!;
        // Our own skill was already taken here when we tapped it (with our walking so far); keep that
        if (f !== this.me) this.applySkills(msg.skills);
        this.showInstantSkill(f, msg.slot);
        f.hp = msg.hp;
        this.hud.refreshHp();
        return;
      }
      case 'shot':
        return this.onShot(msg);
      case 'skipped':
        if (msg.id === this.me.id && this.human) this.finishHuman(null);
        this.hud.banner(msg.id === this.me.id ? 'หมดเวลา!' : `${this.them.name} หมดเวลา`, '#ff8866');
        return;
      case 'over':
        return this.finish(msg.winner, msg.reason === 'left' ? 'เพื่อนออกจากเกม' : null);
      case 'rematchWanted':
        this.hud.banner(`${this.them.name} อยากเล่นอีกรอบ!`, '#ffcc33');
        return;
      case 'start':
        this.scene.restart({ net: this.net, start: msg });
        return;
      case 'error':
        this.hud.banner(msg.message, '#ff9a9a');
        return;
    }
  }

  private async onTurn(msg: Extract<ServerMessage, { t: 'turn' }>) {
    this.countdown?.remove();
    const actor = this.fighters.get(msg.actor)!;
    this.turnSeconds = msg.seconds;
    this.setWind(msg.wind);
    this.hud.setActive(this.combatants.indexOf(actor));
    this.newGaugeTurn();
    if (actor.hidden) actor.setStealth(false);
    this.endShield(actor);
    if (msg.burn > 0) await this.showBurn(actor, msg.burn);
    for (const [id, hp] of Object.entries(msg.hp)) {
      const f = this.fighters.get(id);
      if (f) f.hp = hp;
    }
    this.hud.refreshHp();
    this.applySkills(msg.skills);
    if (!actor.alive) return;

    if (actor === this.me) {
      this.hud.banner('ตาของคุณ!');
      // Quiz Duel: the question comes first, aiming starts after the answer
      if (!this.startMsg.quizDuel) this.startMyAim();
    } else {
      this.hud.banner(`ตาของ ${actor.name}`);
      this.focusOn(actor);
      this.showCountdown(msg.seconds);
    }
  }

  private startMyAim() {
    if (this.over) return;
    void this.humanTurn(this.me, this.turnSeconds).then((power) => {
      if (this.over) return;
      if (power === null) {
        this.net.send({ t: 'pass' });
        return;
      }
      const armed = [...(this.skills.get(this.me)?.armed ?? [])];
      this.net.send({ t: 'fire', x: this.me.x, y: this.me.y, facing: this.me.facing, angle: this.me.angle, power, armed });
      this.hud.showTimer(false);
    });
  }

  private async onShot(msg: Extract<ServerMessage, { t: 'shot' }>) {
    this.countdown?.remove();
    const f = this.fighters.get(msg.id)!;
    if (f !== this.me) {
      this.tweens.killTweensOf(f);
      f.facing = msg.facing;
      f.angle = msg.angle;
      f.snapTo(msg.x, msg.y);
    }
    if (msg.armed.includes('ultimate')) {
      this.hud.banner('ไม้ตาย!', '#ffcc33');
      sfx.ultimate();
      await this.wait(400);
    }
    for (let i = 0; i < msg.timelines.length; i++) {
      if (i > 0) {
        this.hud.banner(`รอบที่ ${i + 1}!`, '#ffdd33');
        await this.wait(500);
      }
      await this.playTimeline(f, msg.timelines[i]);
    }
    await this.waitSettled();
    // The server has the final word on where everyone is and how much health they have
    for (const u of msg.units) {
      const c = this.fighters.get(u.id);
      if (!c) continue;
      c.hp = u.hp;
      if (c.alive && !u.alive) c.die();
      else if (u.alive && Math.hypot(c.x - u.x, c.y - u.y) > 2) c.snapTo(u.x, u.y);
    }
    this.hud.refreshHp();
    this.applySkills(msg.skills);
  }

  /** Our own skill state as the server sees it */
  private applySkills(state: SkillState | null) {
    if (!state) return;
    this.skills.set(this.me, state);
    this.refreshSkills();
  }

  private showCountdown(seconds: number) {
    let left = seconds;
    this.hud.showTimer(true);
    this.hud.setTimer(left);
    this.countdown = this.time.addEvent({
      delay: 250,
      loop: true,
      callback: () => {
        const before = Math.ceil(left);
        left -= 0.25;
        this.hud.setTimer(left);
        // The same big 5-4-3-2-1 while watching the other player
        const sec = Math.ceil(left);
        if (sec !== before && sec <= 5 && sec > 0) this.hud.countdown(sec);
        if (left <= 0) this.countdown?.remove();
      },
    });
  }

  private recordAnswer(id: string, res: QuizResult) {
    updateSave((d) => {
      d.answers.push({ id, ok: res.correct, ms: Math.round(res.timeMs), at: Date.now() });
      if (res.correct) d.crystals++;
    });
  }

  // ---- Hooks from ArenaScene ------------------------------------------------------------

  /** We only ever see our own camouflaged fighter */
  protected viewerOwns(c: Combatant): boolean {
    return c === this.me;
  }

  /** The server already started our turn; just clear what we picked last time */
  protected beginSkillTurn(sk: SkillState) {
    sk.armed = [];
  }

  /** Take it here right away (so stamina adds up while we keep walking); the server shows it to both of us */
  protected useInstantSkill(f: Fighter, slot: InstantSkill) {
    pickSkill(this.skills.get(f)!, slot);
    this.net.send({ t: 'skill', slot });
  }

  protected onHumanMoved(f: Fighter) {
    const now = this.time.now;
    if (now - this.lastMoveSent < MOVE_SEND_MS) return;
    this.lastMoveSent = now;
    this.net.send({ t: 'move', x: f.x, y: f.y, facing: f.facing, angle: f.angle });
  }

  protected leave(menuScene: string) {
    this.over = true;
    this.net.send({ t: 'leave' });
    this.net.close();
    this.scene.start(menuScene);
  }

  // ArenaScene's own match loop isn't used online: the server runs the turns
  protected async takeTurn(_actor: Combatant) {}

  protected musicTrack(): Track {
    return 'pvp';
  }

  protected ambienceKind(): Ambience {
    return 'arena';
  }

  // ---- End -------------------------------------------------------------------------------

  private finish(winnerId: string | null, why: string | null) {
    if (this.over) return;
    this.over = true;
    this.countdown?.remove();
    this.endReason = why;
    if (this.human) this.finishHuman(null);
    this.endMatch(winnerId ? (this.fighters.get(winnerId) ?? null) : null);
  }

  protected onMatchEnd(winner: Combatant | null) {
    const won = winner === this.me;
    if (won) sfx.win();
    else sfx.lose();
    const rewards = pvpRewards(won);
    let levelUp = 0;
    const saved = updateSave((d) => {
      const lv = addExp(d, rewards.exp);
      d.level = lv.level;
      d.exp = lv.exp;
      levelUp = lv.levelsGained;
      d.coins += rewards.coins;
    });
    if (winner) {
      winner.celebrate();
      this.focusOn(winner);
    }
    const lines = [`EXP +${rewards.exp} · เหรียญ +${rewards.coins}`];
    if (levelUp > 0) lines.push(`เลเวลอัป! ตอนนี้ Lv ${saved.level}`);
    if (this.endReason) lines.unshift(this.endReason);
    // A rematch needs both players still here
    const canRematch = this.net.isOpen && !this.endReason;
    const buttons = [];
    if (canRematch) {
      buttons.push({
        label: 'เล่นอีกครั้ง',
        onClick: () => {
          this.net.send({ t: 'rematch' });
          this.hud.banner('รอเพื่อนกดเล่นอีกครั้ง...', '#bfe8ff');
        },
      });
    }
    buttons.push({ label: 'กลับห้องรอ', onClick: () => this.leave('Lobby'), color: 0x3a8dde });
    this.showResult(won ? 'คุณชนะ!' : winner ? `${winner.name} ชนะ` : 'เสมอ!', lines, buttons, won ? '#ffcc33' : '#ff8866');
  }
}
