import * as Phaser from 'phaser';
import {
  ENEMY_AIM,
  GAUGE_CORRECT_ANSWER,
  MAX_WIND,
  QuizDeck,
  RARITY_NAMES,
  SPECIAL_MIN_RARITY,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  addExp,
  newlyUnlocked,
  nextEnemySkill,
  planShot,
  rollDrop,
  stageRewards,
  weaponDef,
  weaponStats,
  windFactor,
  type Hit,
  type Vec,
} from '@sciboom/shared';
import { sfx } from '../audio/Sound';
import { DEPTH, FONT_FAMILY, GAME_WIDTH, TEXT_STROKE } from '../config';
import type { Combatant } from '../game/Combatant';
import { Crate } from '../game/Crate';
import { Enemy } from '../game/Enemy';
import { Fighter } from '../game/Fighter';
import { UNITS } from '../game/questionBank';
import { STAGES, nextStage, stageById, type StageConfig } from '../game/stages';
import { equippedWeapon, loadSave, newUid, updateSave } from '../save';
import { showQuiz } from '../ui/QuizPopup';
import { RARITY_COLORS, addStars } from '../ui/rarity';
import { ArenaScene } from './ArenaScene';

type Item = 'heal' | 'shield' | 'double' | 'power';
const ITEMS: Record<Item, { label: string }> = {
  heal: { label: 'ฟื้นพลัง +250' },
  shield: { label: 'ได้โล่! ลดดาเมจครั้งต่อไปครึ่งหนึ่ง' },
  double: { label: 'ยิงสองนัดในตาถัดไป!' },
  power: { label: 'พลังโจมตี +30% นัดถัดไป!' },
};

/** Single-player stage: the student vs a minion or boss, with science questions. */
export class StageScene extends ArenaScene {
  private stage!: StageConfig;
  private player!: Fighter;
  private enemy!: Enemy;
  private deck!: QuizDeck;
  private crates: Crate[] = [];
  private pendingCrates = 0;
  private shield = false;
  private doubleShot = false;
  private damageMul = 1;
  private enemyTurns = 0;
  private enemySkill = 0;
  private stats = { asked: 0, correct: 0, crystals: 0 };
  /** Extra enemies that appear during the fight (Mixtron's second body) */
  private extras: Enemy[] = [];
  private didSplit = false;
  private swells = 0;
  /** Venomroot: where its roots will burst up next */
  private rootMark: { x: number; y: number; g: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image } | null = null;
  /** Magmadon: top of the lava (world y) */
  private lavaY = 0;
  private lava?: Phaser.GameObjects.Graphics;
  private lavaWave?: Phaser.GameObjects.TileSprite;
  private stormTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super('Stage');
  }

  init(data: { stageId?: string }) {
    this.stage = stageById(data.stageId ?? '') ?? STAGES[0];
  }

  create() {
    this.crates = [];
    this.pendingCrates = 0;
    this.shield = false;
    this.doubleShot = false;
    this.damageMul = 1;
    this.enemyTurns = 0;
    this.stats = { asked: 0, correct: 0, crystals: 0 };
    this.extras = [];
    this.didSplit = false;
    this.swells = 0;
    this.rootMark = null;
    this.lava = undefined;
    this.lavaWave = undefined;

    const seed = Math.floor(Math.random() * 1e9);
    const terrain = this.setupArena(seed, this.stage.background, this.stage.ground);
    const ground = (x: number) => terrain.groundBelow(x, 0) ?? WORLD_HEIGHT / 2;

    const save = loadSave();
    const px = 260 + this.rng.int(0, 100);
    const ex = WORLD_WIDTH - 300;
    this.player = new Fighter(this, 'player', 'คุณ', px, ground(px), 1, { character: save.character, outfit: save.outfit }, weaponStats(equippedWeapon(save)), 0x3a8dde);
    // A copy: some bosses change size during the fight
    this.enemy = new Enemy(this, 'enemy', { ...this.stage.enemy }, ex, ground(ex));
    this.enemySkill = this.stage.enemy.skill;
    this.combatants = [this.player, this.enemy];
    this.setupHud('WorldMap');
    this.enableSkills(this.player, equippedWeapon(save).rarity >= SPECIAL_MIN_RARITY);

    // Questions this student saw recently come last (answer history in the save)
    const lastSeen = new Map<string, number>();
    for (const a of save.answers) lastSeen.set(a.id, Math.max(lastSeen.get(a.id) ?? 0, a.at));
    this.deck = new QuizDeck(UNITS[this.stage.unit].questions, this.rng, this.stage.maxDifficulty, { lastSeen });
    for (let i = 0; i < this.stage.crates; i++) this.spawnCrate();
    if (this.stage.gimmick === 'lava') this.drawLava(WORLD_HEIGHT - 70);
    this.updateStatus();

    this.intro().then(() => this.runMatch());
  }

  private async intro() {
    this.focusOn(this.enemy);
    this.hud.banner(`ด่าน ${this.stage.id}: ${this.stage.title}`, this.stage.isBoss ? '#ff8866' : '#ffffff');
    await this.wait(1700);
  }

  // ---- Turns ----------------------------------------------------------------

  protected async takeTurn(actor: Combatant) {
    if (actor === this.player) await this.playerTurn();
    else if (actor === this.enemy) await this.enemyTurn();
    else await this.extraTurn(actor as Enemy);
  }

  /** Win when every enemy is down; lose when the player is */
  protected matchResult(): Combatant | null | undefined {
    if (!this.player.alive) return this.enemy;
    if (!this.enemy.alive && this.extras.every((e) => !e.alive)) return this.player;
    return undefined;
  }

  private async playerTurn() {
    this.enemy.clearStun();
    if (this.stage.gimmick === 'lava') await this.lavaBurn();
    if (!this.player.alive) return;
    if (this.turn > 0 && this.turn % 6 === 0 && this.activeCrates() < this.stage.crates) {
      this.spawnCrate();
      this.hud.banner('มีกล่องคำถามใหม่!', '#ffdd33');
      await this.wait(900);
    }
    this.hud.banner('ตาของคุณ!');
    // Stormlord: the wind swings round part-way through the turn
    if (this.stage.gimmick === 'storm') {
      this.stormTimer = this.time.delayedCall(7000, () => {
        if (this.phase !== 'aiming') return;
        this.newWind();
        this.hud.banner('ลมเปลี่ยนทิศ!', '#bfe8ff');
      });
    }
    const shots = await this.humanShot(this.player, { damageMul: this.damageMul });
    this.stormTimer?.remove();
    if (shots.length > 0) {
      this.damageMul = 1;
      // Double-shot item from a question crate: one more normal shot
      if (this.doubleShot && this.enemy.alive && this.player.lastPower !== null) {
        this.doubleShot = false;
        this.hud.banner('นัดเพิ่มจากกล่อง!', '#ffdd33');
        await this.wait(500);
        await this.shoot(this.player, this.player.lastPower);
      }
      this.updateStatus();
    }
    await this.wait(600);
    await this.openPendingCrates();
    await this.checkSplit();
    await this.wait(300);
  }

  private async enemyTurn() {
    const e = this.enemy;
    this.hud.showTimer(false);
    this.enemyTurns++;
    this.focusOn(e);
    await this.wait(700);

    if (this.stage.gimmick === 'roots') await this.rootsBurst();
    if (!this.player.alive) return;

    const every = this.stage.ultimateEvery;
    if (every > 0 && this.stage.ultimate && this.enemyTurns % every === 0) {
      await this.enemyUltimate();
    } else if (this.stage.gimmick === 'swell' && this.enemyTurns % 3 === 1 && this.enemyTurns > 1) {
      await this.swell();
    } else {
      const plan = this.plan(this.enemySkill);
      await e.windUp();
      const outcome = await this.shoot(e, plan.power, { angle: plan.angle });
      const hitPlayer = outcome.hits.some((h) => h.target === this.player);
      // Like a real player, the computer corrects its aim after a miss
      this.enemySkill = nextEnemySkill(this.enemySkill, this.stage.enemy.skill, hitPlayer);
    }
    if (this.stage.gimmick === 'roots' && this.player.alive) this.markRoots();
    if (this.stage.gimmick === 'lava' && this.enemyTurns % 2 === 0) this.raiseLava();
    await this.wait(800);
  }

  /** Mixtron's second body (and any other extra enemy) just shoots */
  private async extraTurn(e: Enemy) {
    this.hud.showTimer(false);
    this.focusOn(e);
    await this.wait(600);
    const plan = this.plan(e.config.skill, e);
    await e.windUp();
    await this.shoot(e, plan.power, { angle: plan.angle });
    await this.wait(600);
  }

  // ---- Boss tricks -------------------------------------------------------------

  /** Mixtron: at half health it separates into two bodies (a mixture can be separated!) */
  private async checkSplit() {
    const into = this.stage.splitInto;
    if (this.stage.gimmick !== 'split' || !into || this.didSplit || !this.enemy.alive || this.enemy.hp > this.enemy.maxHp / 2) return;
    this.didSplit = true;
    this.focusOn(this.enemy);
    this.hud.banner(`${this.enemy.name} แยกร่าง!`, '#ff8866');
    await this.wait(600);
    const x = Phaser.Math.Clamp(this.enemy.x - 230, 700, WORLD_WIDTH - 200);
    const extra = new Enemy(this, 'enemy2', { ...into }, x, this.terrain.groundBelow(x, 0) ?? WORLD_HEIGHT / 2);
    this.extras.push(extra);
    this.combatants.push(extra);
    this.floatText(x, extra.y - extra.height - 30, 'สารผสมแยกตัว!', '#ffcc33');
    await this.wait(1200);
  }

  /** Amoebox: takes in water by osmosis — heals and grows (bigger, so easier to hit) */
  private async swell() {
    const e = this.enemy;
    const heal = Math.min(150, e.maxHp - e.hp);
    e.hp += heal;
    if (this.swells < 2) {
      this.swells++;
      e.grow(1.12);
    }
    this.hud.refreshHp();
    this.hud.banner(`${e.name} ดูดน้ำเข้าเซลล์ (ออสโมซิส)!`, '#7dd3ff');
    if (heal > 0) this.floatText(e.x, e.y - e.height - 30, `+${heal}`, '#7dff8a');
    await this.wait(1400);
  }

  /** Venomroot: mark where the player stands; next enemy turn roots burst up there */
  private markRoots() {
    this.rootMark?.g.destroy();
    const x = this.player.x;
    const y = this.terrain.groundBelow(x, this.player.y - 30) ?? this.player.y;
    let g: Phaser.GameObjects.Graphics | Phaser.GameObjects.Image;
    if (this.textures.exists('fx/warning_circle')) {
      g = this.add.image(x, y, 'fx/warning_circle').setDepth(DEPTH.fx);
      g.setScale(130 / g.width);
    } else {
      const d = this.add.graphics().setDepth(DEPTH.fx);
      d.lineStyle(5, 0xff3b30, 0.9).strokeEllipse(x, y, 120, 34);
      d.lineStyle(4, 0xff3b30, 0.9).lineBetween(x - 22, y - 22, x + 22, y + 10).lineBetween(x + 22, y - 22, x - 22, y + 10);
      g = d;
    }
    this.tweens.add({ targets: g, alpha: 0.35, duration: 450, yoyo: true, repeat: -1 });
    this.rootMark = { x, y, g };
    this.hud.banner('รากพิษกำลังจะโผล่! เดินหนีออกจากวงแดง', '#ff8866');
  }

  private async rootsBurst() {
    const mark = this.rootMark;
    if (!mark) return;
    this.rootMark = null;
    mark.g.destroy();
    this.focusOn(this.player);
    if (this.textures.exists('fx/roots')) {
      // Roots shoot up out of the ground, then sink back
      const roots = this.add.image(mark.x, mark.y + 10, 'fx/roots').setOrigin(0.5, 1).setDepth(DEPTH.fx);
      const h = 170 / roots.height;
      roots.setScale(h, 0);
      this.tweens.add({ targets: roots, scaleY: h, duration: 220, ease: 'Back.out', yoyo: true, hold: 500, onComplete: () => roots.destroy() });
    } else {
      const boom = this.add.sprite(mark.x, mark.y, 'fx/explosion_0').setDepth(DEPTH.fx);
      boom.setScale(130 / 256);
      boom.play('explosion');
    }
    this.cameras.main.shake(200, 0.006);
    this.terrainView.carve(mark.x, mark.y, 40);
    this.hud.drawMinimap(this.terrain);
    if (Math.abs(this.player.x - mark.x) < 70) {
      const dmg = this.modifyDamage(this.player, 150);
      this.player.takeDamage(dmg);
      this.floatText(this.player.x, this.player.y - this.player.height - 30, `-${dmg}`, '#ff5544');
      this.hud.banner('โดนรากพิษ!', '#ff5544');
      this.hud.refreshHp();
    } else {
      this.hud.banner('หลบรากพิษได้!', '#7dff8a');
    }
    await this.wait(1100);
  }

  /** Magmadon: lava fills the low ground and rises during the fight */
  private drawLava(y: number) {
    this.lavaY = y;
    this.lava?.destroy();
    const g = this.add.graphics().setDepth(DEPTH.terrain + 1);
    g.fillStyle(0xff5a1f, 0.88).fillRect(0, y, WORLD_WIDTH, WORLD_HEIGHT - y);
    g.fillStyle(0xffc040, 0.95).fillRect(0, y, WORLD_WIDTH, 5);
    this.tweens.add({ targets: g, alpha: 0.78, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    this.lava = g;
    // Wavy lava surface art (art/raw/15.png -> fx/lava_wave), tiled along the top, if added
    this.lavaWave?.destroy();
    if (this.textures.exists('fx/lava_wave')) {
      const frame = this.textures.getFrame('fx/lava_wave');
      const h = 48;
      this.lavaWave = this.add.tileSprite(0, y - h / 2, WORLD_WIDTH, h, 'fx/lava_wave').setOrigin(0, 0).setDepth(DEPTH.terrain + 2);
      this.lavaWave.setTileScale(h / frame.height);
      this.tweens.add({ targets: this.lavaWave, tilePositionX: frame.width, duration: 6000, repeat: -1 });
    }
  }

  private raiseLava() {
    const top = Math.max(WORLD_HEIGHT - 160, this.lavaY - 15);
    if (top === this.lavaY) return;
    this.drawLava(top);
    this.hud.banner('ลาวาสูงขึ้น!', '#ff8844');
  }

  private async lavaBurn() {
    if (this.player.y < this.lavaY - 4) return;
    this.focusOn(this.player);
    this.player.takeDamage(80);
    this.floatText(this.player.x, this.player.y - this.player.height - 30, '-80', '#ff8844');
    this.hud.banner('ยืนในลาวา ร้อนมาก! ขึ้นที่สูงเร็ว', '#ff8844');
    this.hud.refreshHp();
    await this.wait(900);
  }

  /** Stormlord: much stronger wind (beginner help only softens it a little) */
  protected newWind() {
    if (this.stage.gimmick !== 'storm') return super.newWind();
    const soften = Math.max(0.7, windFactor(this.assistLevel));
    this.setWind(Math.round(this.rng.range(-MAX_WIND, MAX_WIND) * soften * 1.4));
  }

  /** Charge → question. Right answer interrupts; wrong answer lets the ultimate fire. */
  private async enemyUltimate() {
    const e = this.enemy;
    const ult = this.stage.ultimate!;
    e.startCharge();
    this.hud.banner(`${e.name} กำลังชาร์จ "${ult.name}"!`, '#ff8866');
    await this.wait(1500);

    const ok = await this.ask('ตอบให้ถูกเพื่อขัดท่าไม้ตาย!');
    e.stopCharge();
    if (ok) {
      e.showStun();
      this.damageMul = 1.3;
      this.updateStatus();
      this.hud.banner('ขัดท่าสำเร็จ! ศัตรูมึนงง', '#7dff8a');
      await this.wait(1300);
      return;
    }

    this.hud.banner(`${ult.name}!`, '#ff5544');
    await this.wait(700);
    const plan = this.plan(Math.min(ENEMY_AIM.max, this.enemySkill + 0.15));
    for (let k = 0; k < ult.shots && this.player.alive; k++) {
      const offset = k - (ult.shots - 1) / 2;
      await this.shoot(e, Phaser.Math.Clamp(plan.power + offset * 3, 10, 100), { weapon: ult.weapon, angle: plan.angle + offset * 2 });
      await this.wait(250);
    }
  }

  private plan(skill: number, shooter: Enemy = this.enemy) {
    const targets = this.combatants.filter((c) => c.alive).map((c) => c.toTarget());
    let target = this.player.toTarget();
    // Camouflaged player: the enemy can only guess roughly where they are
    if (this.player.hidden) {
      target = { ...target, x: target.x + (this.rng.next() < 0.5 ? -1 : 1) * this.rng.range(180, 320) };
      skill = 0;
    }
    return planShot(shooter.muzzle(), shooter.facing, target, this.wind, this.terrain, targets, shooter.id, skill, this.rng);
  }

  // ---- Questions & items ----------------------------------------------------

  private async ask(title: string): Promise<boolean> {
    this.phase = 'quiz';
    const item = this.deck.next();
    const res = await showQuiz(this, item, { title });
    this.phase = 'idle';
    this.deck.report(item.question, res.correct);
    this.stats.asked++;
    if (res.correct) {
      this.stats.crystals++;
      this.stats.correct++;
      this.addGauge(this.player, GAUGE_CORRECT_ANSWER);
    }
    updateSave((d) => {
      d.answers.push({ id: item.question.id, ok: res.correct, ms: Math.round(res.timeMs), at: Date.now() });
      if (res.correct) d.crystals++;
    });
    this.updateStatus();
    return res.correct;
  }

  private async openPendingCrates() {
    while (this.pendingCrates > 0 && this.player.alive) {
      this.pendingCrates--;
      const ok = await this.ask('กล่องคำถาม! ตอบถูกรับไอเท็ม');
      if (ok) {
        const item = (['heal', 'shield', 'double', 'power'] as Item[])[this.rng.int(0, 3)];
        this.grant(item);
        this.hud.banner(ITEMS[item].label, '#7dff8a');
        await this.wait(1200);
      }
    }
  }

  private grant(item: Item) {
    switch (item) {
      case 'heal':
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 250);
        this.hud.refreshHp();
        this.floatText(this.player.x, this.player.y - 130, '+250', '#7dff8a');
        break;
      case 'shield':
        this.shield = true;
        break;
      case 'double':
        this.doubleShot = true;
        break;
      case 'power':
        this.damageMul = 1.3;
        break;
    }
    this.updateStatus();
  }

  protected modifyDamage(target: Combatant, damage: number): number {
    if (target === this.player && this.shield) {
      this.shield = false;
      return Math.round(damage / 2);
    }
    return damage;
  }

  /** The shield was used up when the shot was worked out; tell the player when it actually lands */
  protected onHit(target: Combatant, hit: Hit) {
    if (target === this.player && hit.reduced) {
      this.updateStatus();
      this.hud.banner('โล่ช่วยไว้!', '#7dd3ff');
    }
  }

  protected onExplosion(at: Vec, radius: number, shooter: Combatant) {
    for (const c of this.crates) {
      if (c.opened || Math.hypot(c.x - at.x, c.centerY - at.y) > radius + 30) continue;
      c.open();
      if (shooter === this.player) this.pendingCrates++;
      else this.hud.banner('กล่องคำถามแตก!', '#cccccc');
    }
  }

  private spawnCrate() {
    for (let tries = 0; tries < 30; tries++) {
      const x = this.rng.int(520, WORLD_WIDTH - 560);
      const tooClose = [this.player, this.enemy, ...this.extras, ...this.crates.filter((c) => !c.opened)].some((o) => Math.abs(o.x - x) < 140);
      const y = this.terrain.groundBelow(x, 0);
      if (tooClose || y === null) continue;
      this.crates.push(new Crate(this, x, y));
      return;
    }
  }

  private activeCrates(): number {
    return this.crates.filter((c) => !c.opened).length;
  }

  private updateStatus() {
    const items = [{ icon: 'ui/crystal', text: `${this.stats.crystals}` }];
    if (this.shield) items.push({ icon: 'fx/fx_shield', text: 'โล่' });
    if (this.doubleShot) items.push({ icon: 'fx/proj_cannonball', text: 'x2' });
    if (this.damageMul > 1) items.push({ icon: 'fx/fx_spark', text: '+30%' });
    this.hud.setStatus(items);
    this.player.setShieldVisible(this.shield);
  }

  update(time: number, delta: number) {
    super.update(time, delta);
    if (!Number.isFinite(delta) || delta < 0) return;
    const dt = Math.min(delta, 50) / 1000;
    for (const c of this.crates) c.settle(this.terrain, dt);
  }

  // ---- End ------------------------------------------------------------------

  protected onMatchEnd(winner: Combatant | null) {
    const won = winner === this.player;
    const { asked, correct, crystals } = this.stats;
    const restart = () => this.scene.restart({ stageId: this.stage.id });
    const toMap = () => this.scene.start('WorldMap');
    const hpFrac = this.player.hp / this.player.maxHp;
    const stars = won ? (hpFrac >= 0.6 ? 3 : hpFrac >= 0.3 ? 2 : 1) : 0;

    // Rewards: EXP + coins always (right answers count even when losing), weapon drop on a win
    const rewards = stageRewards({ won, stars, correct, isBoss: !!this.stage.isBoss });
    const drop = won ? rollDrop(this.stage.drops, this.rng) : null;
    let levelsGained = 0;
    const saved = updateSave((d) => {
      const lv = addExp(d, rewards.exp);
      d.level = lv.level;
      d.exp = lv.exp;
      levelsGained = lv.levelsGained;
      d.coins += rewards.coins;
      if (won) d.stars[this.stage.id] = Math.max(d.stars[this.stage.id] ?? 0, stars);
      if (drop) d.weapons.push({ uid: newUid(), id: drop.id, rarity: drop.rarity, level: 1 });
    });
    const rewardLines = [`EXP +${rewards.exp} · เหรียญ +${rewards.coins} · ผลึกความรู้ +${crystals}`];
    if (levelsGained > 0) rewardLines.push(`เลเวลอัป! ตอนนี้ Lv ${saved.level}`);
    // New wardrobe items from the level-up: tell the player and offer a shortcut
    const unlocked = newlyUnlocked(saved.level - levelsGained, saved.level);
    if (unlocked.length > 0) {
      const names = unlocked.slice(0, 2).map((c) => c.name).join(', ');
      rewardLines.push(`ปลดล็อกของแต่งใหม่: ${names}${unlocked.length > 2 ? ' และอื่น ๆ' : ''}`);
    }
    const wardrobeButton = { label: 'ห้องแต่งตัว', onClick: () => this.scene.start('Wardrobe', { from: 'WorldMap' }), color: 0xe0559a };

    if (levelsGained > 0) this.time.delayedCall(1200, () => sfx.levelUp());
    if (!won) {
      sfx.lose();
      this.enemy.celebrate();
      this.showResult(
        'แพ้แล้ว ลองใหม่นะ!',
        [`ตอบถูก ${correct}/${asked} ข้อ`, ...rewardLines, 'ตอบคำถามให้ถูกเพื่อขัดท่าไม้ตายของศัตรู'],
        [
          { label: 'ลองอีกครั้ง', onClick: restart },
          { label: 'คลังอาวุธ', onClick: () => this.scene.start('Inventory'), color: 0x8a5cf6 },
          ...(unlocked.length > 0 ? [wardrobeButton] : []),
          { label: 'แผนที่', onClick: toMap, color: 0x3a8dde },
        ],
        '#ff8866',
      );
      return;
    }

    sfx.win();
    this.player.celebrate();
    this.focusOn(this.player);
    const next = nextStage(this.stage.id);
    const buttons = [];
    if (next) buttons.push({ label: 'ด่านต่อไป', onClick: () => this.scene.start('Stage', { stageId: next.id }) });
    buttons.push({ label: 'เล่นอีกครั้ง', onClick: restart, color: next ? 0x8a5cf6 : undefined });
    buttons.push({ label: 'คลังอาวุธ', onClick: () => this.scene.start('Inventory'), color: 0x2fbf5b });
    if (unlocked.length > 0) buttons.push(wardrobeButton);
    buttons.push({ label: 'แผนที่', onClick: toMap, color: 0x3a8dde });
    // First line left empty: the star images go there
    this.showResult(this.stage.isBoss ? 'ปราบบอสสำเร็จ!' : 'ผ่านด่าน!', ['', `ตอบถูก ${correct}/${asked} ข้อ`, ...rewardLines], buttons);
    for (let i = 0; i < 3; i++) {
      const star = this.add.image(GAME_WIDTH / 2 + (i - 1) * 64, 242, 'ui/star').setScrollFactor(0).setDepth(DEPTH.overlay);
      const size = 46 / star.height;
      star.setScale(0).setAlpha(i < stars ? 1 : 0.25);
      this.tweens.add({ targets: star, scale: size, duration: 400, delay: 300 + i * 250, ease: 'Back.out' });
    }
    if (drop) this.showDropCard(drop.id, drop.rarity);
  }

  /** "ได้อาวุธใหม่!" card under the result buttons */
  private showDropCard(id: string, rarity: number) {
    const cx = GAME_WIDTH / 2;
    const cy = 600;
    const parts: Phaser.GameObjects.GameObject[] = [];
    const g = this.add.graphics();
    g.fillStyle(0x1b1d3a, 0.9).fillRoundedRect(cx - 260, cy - 62, 520, 124, 20);
    g.lineStyle(4, RARITY_COLORS[rarity] ?? 0xffffff, 1).strokeRoundedRect(cx - 260, cy - 62, 520, 124, 20);
    parts.push(g);
    const img = this.add.image(cx - 170, cy, `weapons/${id}`);
    img.setScale(Math.min(140 / img.width, 100 / img.height));
    parts.push(img);
    const style = (size: number, color: string) => ({ fontFamily: FONT_FAMILY, fontSize: `${size}px`, fontStyle: '700', color, stroke: TEXT_STROKE, strokeThickness: 4, padding: { top: 6 } });
    parts.push(this.add.text(cx - 80, cy - 38, 'ได้อาวุธใหม่!', style(22, '#ffcc33')).setOrigin(0, 0.5));
    parts.push(this.add.text(cx - 80, cy - 4, weaponDef(id).name, style(26, '#ffffff')).setOrigin(0, 0.5));
    parts.push(this.add.text(cx - 80, cy + 32, `ระดับ ${RARITY_NAMES[rarity]}`, style(18, '#dddddd')).setOrigin(0, 0.5));
    parts.push(...addStars(this, cx + 150, cy + 32, rarity));
    for (const p of parts) (p as unknown as Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth).setScrollFactor(0).setDepth(DEPTH.overlay);
    this.tweens.add({ targets: parts, alpha: { from: 0, to: 1 }, duration: 500, delay: 1100 });
  }
}
