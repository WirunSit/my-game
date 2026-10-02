import * as Phaser from 'phaser';
import {
  BURN_TURNS,
  GAUGE_HIT,
  GAUGE_HURT,
  GAUGE_MAX,
  HEAL_AMOUNT,
  ITEM_SKILLS,
  MAX_WIND,
  Rng,
  SKILL_SLOTS,
  SPECIAL_KINDS,
  STEP,
  TURN_SECONDS,
  Terrain,
  WALK_PER_TURN,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  addGauge,
  aimGuideLength,
  flightOptions,
  fly,
  isInstantSkill,
  launchState,
  newSkillState,
  pathPrefix,
  resolveShot,
  shotModeFor,
  skillBlocker,
  spendSkill,
  startSkillTurn,
  tickBurn,
  weaponSpecial,
  windFactor,
  type Hit,
  type ShotMode,
  type ShotTimeline,
  type SkillSlot,
  type SkillState,
  type Unit,
  type Vec,
  type WeaponStats,
} from '@sciboom/shared';
import { DEPTH, FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';
import { drawArtBackground } from '../game/background';
import type { Combatant } from '../game/Combatant';
import type { Fighter } from '../game/Fighter';
import { TerrainView } from '../game/TerrainView';
import { Controls } from '../ui/Controls';
import { Hud } from '../ui/Hud';
import { SkillBar, type SlotState } from '../ui/SkillBar';
import { addTextButton } from '../ui/TextButton';
import { loadSave } from '../save';

const WALK_SPEED = 110; // px/s
const AIM_SPEED = 40; // degrees/s while holding ↑/↓
const CHARGE_SPEED = 65; // power/s while holding fire (0→100 in ~1.5 s)
const GUIDE_DOT_GAP = 22; // px between dots of the aim guide

export type Phase = 'idle' | 'aiming' | 'charging' | 'flying' | 'quiz' | 'over';

export interface ShotOptions {
  /** Use a different weapon than the shooter's own (e.g. a boss ultimate) */
  weapon?: WeaponStats;
  /** Override the shooter's aim angle */
  angle?: number;
  /** Damage multiplier (quiz bonus) */
  damageMul?: number;
  /** Skill shot (default: a normal shot) */
  mode?: ShotMode;
}

export interface ShotOutcome {
  impact: Vec | null;
  hits: { target: Combatant; damage: number }[];
}

/** A shot timeline being played back on screen */
interface Playback {
  timeline: ShotTimeline;
  shooter: Combatant;
  projectile: string;
  sprites: Phaser.GameObjects.Image[];
  /** Index of the next event to show */
  next: number;
  elapsed: number;
  outcome: ShotOutcome;
  resolve: (o: ShotOutcome) => void;
}

/**
 * Everything every battle mode shares: map, camera, HUD, controls, skills, the
 * human player's turn (walk/aim/charge) and playing shots back on screen.
 * The rules themselves (where shots go, damage, effects) are in @sciboom/shared
 * (resolveShot), so the PvP server plays by exactly the same rules.
 * Subclasses decide whose turn it is and what happens after each shot.
 */
export abstract class ArenaScene extends Phaser.Scene {
  protected terrainView!: TerrainView;
  protected combatants: Combatant[] = [];
  protected hud!: Hud;
  protected controls!: Controls;
  protected rng!: Rng;
  protected phase: Phase = 'idle';
  protected wind = 0;
  protected turn = 0;
  /** Player level that sets the beginner help (aim guide length, gentler wind) */
  protected assistLevel = 1;
  protected skills = new Map<Combatant, SkillState>();
  /** Turns of burning left (burn special) */
  protected burns = new Map<Combatant, number>();
  /** The fighter whose input is being read right now */
  protected human: Fighter | null = null;

  private timeLeft = 0;
  private walkLeft = 0;
  private power = 0;
  private resolveHuman: ((power: number | null) => void) | null = null;
  private playback: Playback | null = null;
  private skillBar!: SkillBar;
  private skyMarker!: Phaser.GameObjects.Triangle;
  private guide!: Phaser.GameObjects.Graphics;
  private guideKey = '';
  private panning = false;
  private camTarget: Combatant | null = null;
  /** Bumped when the scene shuts down so an old match loop stops */
  protected matchToken = 0;

  protected get terrain(): Terrain {
    return this.terrainView.terrain;
  }

  // ---- Setup ----------------------------------------------------------------

  /** Build background, ground and camera. Call first in create(). Online games pass the server's map. */
  protected setupArena(seed: number, backgroundKey: string, groundKey: string, map?: Terrain): Terrain {
    // The same Scene object is reused on restart, so reset everything
    this.combatants = [];
    this.phase = 'idle';
    this.turn = 0;
    this.playback = null;
    this.skills = new Map();
    this.burns = new Map();
    this.human = null;
    this.resolveHuman = null;
    this.camTarget = null;
    this.panning = false;
    this.rng = new Rng(seed);
    this.assistLevel = loadSave().level;
    this.guideKey = '';
    this.events.once('shutdown', () => this.matchToken++);

    drawArtBackground(this, backgroundKey, WORLD_WIDTH);
    const terrain = map ?? Terrain.generate(seed);
    this.terrainView = new TerrainView(this, terrain, groundKey);

    this.skyMarker = this.add
      .triangle(0, 14, 0, 18, 18, 18, 9, 0, 0xffffff)
      .setStrokeStyle(2, 0x1b1d3a)
      .setDepth(DEPTH.fx)
      .setVisible(false);
    this.guide = this.add.graphics().setDepth(DEPTH.projectile);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.setupCameraDrag();
    return terrain;
  }

  /** HUD + controls. Call after this.combatants holds the two sides (left, right). */
  protected setupHud(menuScene = 'Menu') {
    this.hud = new Hud(this, this.combatants, WORLD_WIDTH);
    this.hud.drawMinimap(this.terrain);
    this.controls = new Controls(this);
    this.controls.onFireDown = () => {
      if (this.phase !== 'aiming') return;
      this.phase = 'charging';
      this.power = 0;
    };
    this.controls.onFireUp = () => {
      if (this.phase === 'charging') this.finishHuman(this.power);
    };
    this.skillBar = new SkillBar(this);
    this.skillBar.onPick = (slot) => this.pickSkill(slot);

    const back = this.add
      .text(GAME_WIDTH / 2 + 150, 30, '☰ ออก', {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        color: '#ffffff',
        stroke: TEXT_STROKE,
        strokeThickness: 4,
      })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud)
      .setInteractive({ useHandCursor: true });
    back.on('pointerup', () => this.leave(menuScene));
  }

  /** Hook: leaving the match from the ☰ button (online games tell the server first) */
  protected leave(menuScene: string) {
    this.scene.start(menuScene);
  }

  // ---- Match loop -----------------------------------------------------------

  /** Whose-turn loop. Runs until one side is left standing. */
  protected async runMatch() {
    const token = ++this.matchToken;
    for (;;) {
      const actor = this.combatants[this.turn % this.combatants.length];
      if (actor.alive) {
        this.newWind();
        this.hud.setActive(this.combatants.indexOf(actor));
        await this.startOfTurn(actor);
        if (token !== this.matchToken) return;
      }
      if (actor.alive) {
        await this.takeTurn(actor);
        if (token !== this.matchToken) return;
        await this.waitSettled();
        if (token !== this.matchToken) return;
      }
      const alive = this.combatants.filter((c) => c.alive);
      if (alive.length <= 1) {
        this.endMatch(alive[0] ?? null);
        return;
      }
      this.turn++;
    }
  }

  protected endMatch(winner: Combatant | null) {
    this.phase = 'over';
    this.combatants.forEach((c) => c.setActive(false));
    this.onMatchEnd(winner);
  }

  /** Play one turn for `actor` (player input, AI, quiz…) */
  protected abstract takeTurn(actor: Combatant): Promise<void>;
  protected abstract onMatchEnd(winner: Combatant | null): void;

  /** Things that happen before anyone acts: camouflage wears off, fire burns, cooldowns tick */
  protected async startOfTurn(actor: Combatant) {
    if (actor.hidden) (actor as Fighter).setStealth(false);
    const unit = this.unitOf(actor);
    const dmg = tickBurn(unit);
    this.burns.set(actor, unit.burn);
    if (dmg > 0) await this.showBurn(actor, dmg);
  }

  protected async showBurn(actor: Combatant, dmg: number) {
    this.focusOn(actor);
    this.hud.banner(`${actor.name} โดนไฟไหม้!`, '#ff8844');
    await this.wait(500);
    actor.takeDamage(dmg);
    this.floatText(actor.x, actor.y - actor.height - 30, `-${dmg}`, '#ff8844');
    this.hud.refreshHp();
    await this.wait(700);
  }

  /** Let a human walk, aim and charge. Resolves with the power, or null if the turn was lost. */
  protected humanTurn(f: Fighter, seconds = TURN_SECONDS): Promise<number | null> {
    this.human = f;
    const sk = this.skills.get(f);
    if (sk) {
      startSkillTurn(sk);
      this.skillBar.setIcons(f.weapon.id, f.portraitKey);
      this.skillBar.setVisible(true);
      this.refreshSkills();
    }
    this.phase = 'aiming';
    this.timeLeft = seconds;
    this.walkLeft = WALK_PER_TURN;
    this.power = 0;
    f.setActive(true);
    this.hud.showTimer(true);
    this.hud.setAngle(f.angle);
    this.hud.setPower(0, f.lastPower);
    this.hud.setStamina(1);
    this.focusOn(f);
    return new Promise((resolve) => (this.resolveHuman = resolve));
  }

  /** End the human's input: with a power to shoot, or null if the turn is lost */
  protected finishHuman(power: number | null) {
    const resolve = this.resolveHuman;
    this.resolveHuman = null;
    this.human?.setActive(false);
    this.skillBar.setVisible(false);
    this.guide.clear();
    this.guideKey = '';
    if (power !== null && this.human) this.human.lastPower = power;
    this.human = null;
    this.phase = 'idle';
    resolve?.(power);
  }

  // ---- Skills ---------------------------------------------------------------

  /** Give a human fighter item skills, a special and the knowledge gauge for this match */
  protected enableSkills(f: Fighter, specialUnlocked: boolean) {
    this.skills.set(f, newSkillState(specialUnlocked));
  }

  /** Fill the knowledge gauge: right answers, hits and getting hit all add to it */
  protected addGauge(c: Combatant, amount: number) {
    const sk = this.skills.get(c);
    if (!sk) return;
    if (addGauge(sk, amount)) this.floatText(c.x, c.y - c.height - 90, 'ไม้ตายพร้อม!', '#ffcc33');
    if (c === this.human) this.refreshSkills();
  }

  private slotState(sk: SkillState, slot: SkillSlot, f: Fighter): SlotState {
    const armed = sk.armed === slot;
    const blocker = skillBlocker(sk, slot, f.hp >= f.maxHp);
    const enabled = blocker === null;
    if (slot === 'special') {
      if (blocker === 'locked') return { enabled, armed, note: '★3' };
      if (blocker === 'cooldown') return { enabled, armed, note: `อีก ${sk.specialCooldown}` };
      return { enabled, armed };
    }
    if (slot === 'ultimate') return { enabled, armed, fill: sk.gauge / GAUGE_MAX };
    return { enabled, armed, count: sk.uses[slot] };
  }

  private skillHint(sk: SkillState, f: Fighter): string {
    switch (sk.armed) {
      case null:
        return '';
      case 'special': {
        const sp = weaponSpecial(f.weapon.id);
        return `ท่าพิเศษ "${sp.name}": ${SPECIAL_KINDS[sp.kind]}`;
      }
      case 'ultimate':
        return 'ไม้ตาย: ลูกใหญ่ ดาเมจ x2 ไม่โดนลม และเห็นเส้นนำทางเต็มเส้น';
      default:
        return `${ITEM_SKILLS[sk.armed].name}: ${ITEM_SKILLS[sk.armed].desc}`;
    }
  }

  protected refreshSkills() {
    const f = this.human;
    const sk = f && this.skills.get(f);
    if (!f || !sk) return;
    const states = {} as Record<SkillSlot, SlotState>;
    for (const slot of SKILL_SLOTS) states[slot] = this.slotState(sk, slot, f);
    this.skillBar.update(states, this.skillHint(sk, f));
    this.guideKey = '';
  }

  /** Tap on a skill: instant ones happen now; shot skills are armed (tap again to cancel) */
  private pickSkill(slot: SkillSlot) {
    const f = this.human;
    const sk = f && this.skills.get(f);
    if (!f || !sk || this.phase !== 'aiming') return;
    if (sk.armed === slot) {
      sk.armed = null;
      this.refreshSkills();
      return;
    }
    if (skillBlocker(sk, slot, f.hp >= f.maxHp) !== null) {
      if (sk.usedThisTurn) this.hud.banner('ใช้สกิลได้ตาละ 1 ครั้ง', '#cccccc');
      return;
    }
    if (isInstantSkill(slot)) this.useInstantSkill(f, slot);
    else sk.armed = slot;
    this.refreshSkills();
  }

  /** Heal or camouflage right now (online games ask the server instead) */
  protected useInstantSkill(f: Fighter, slot: 'heal' | 'stealth') {
    spendSkill(this.skills.get(f)!, slot);
    this.showInstantSkill(f, slot);
  }

  protected showInstantSkill(f: Fighter, slot: 'heal' | 'stealth') {
    if (slot === 'heal') {
      f.heal(HEAL_AMOUNT);
      this.floatText(f.x, f.y - f.height - 30, `+${HEAL_AMOUNT}`, '#7dff8a');
      this.hud.refreshHp();
    } else {
      f.setStealth(true);
      this.hud.banner('พรางตัว!', '#bfe8ff');
    }
    if (f === this.human) this.refreshSkills();
  }

  /**
   * A whole human turn with skills: walk/aim/charge, then fire using whatever
   * skill was armed (uses are only spent if the shot is actually fired).
   */
  protected async humanShot(f: Fighter, opts: ShotOptions = {}): Promise<ShotOutcome[]> {
    const power = await this.humanTurn(f);
    if (power === null) return [];
    const sk = this.skills.get(f);
    const armed = sk?.armed ?? null;
    if (sk && armed) spendSkill(sk, armed);
    if (armed === 'double') {
      const first = await this.shoot(f, power, opts);
      if (!this.combatants.some((c) => c !== f && c.alive)) return [first];
      this.hud.banner('นัดที่สอง!', '#ffdd33');
      await this.wait(500);
      return [first, await this.shoot(f, power, { ...opts, damageMul: 1 })];
    }
    const mode = shotModeFor(armed);
    if (mode === 'ultimate') {
      this.hud.banner('ไม้ตาย!', '#ffcc33');
      await this.wait(400);
    }
    return [await this.shoot(f, power, { ...opts, mode })];
  }

  // ---- Shooting -------------------------------------------------------------

  /** The rules' view of a combatant */
  protected unitOf(c: Combatant): Unit {
    const t = c.toTarget();
    return { id: c.id, x: c.x, y: c.y, hp: c.hp, maxHp: c.maxHp, alive: c.alive, radius: t.radius!, offsetY: t.offsetY!, burn: this.burns.get(c) ?? 0 };
  }

  /** Fire a shot from `shooter`: work it out with the shared rules, then play it on screen */
  protected shoot(shooter: Combatant, power: number, opts: ShotOptions = {}): Promise<ShotOutcome> {
    const weapon = opts.weapon ?? shooter.weapon;
    if (opts.angle !== undefined) {
      shooter.angle = opts.angle;
      shooter.sync();
    }
    const mode = opts.mode ?? 'normal';
    const m = shooter.muzzle();
    const timeline = resolveShot(
      this.terrain,
      this.combatants.map((c) => this.unitOf(c)),
      {
        shooterId: shooter.id,
        input: { x: m.x, y: m.y, angleDeg: shooter.angle, facing: shooter.facing, power, wind: this.wind },
        mode,
        special: mode === 'special' ? weaponSpecial(weapon.id).kind : null,
        damage: weapon.damage,
        radius: weapon.radius,
        damageMul: opts.damageMul ?? 1,
      },
      {
        modifyDamage: (id, dmg) => {
          const c = this.combatants.find((o) => o.id === id);
          return c ? this.modifyDamage(c, dmg) : dmg;
        },
      },
    );
    return this.playTimeline(shooter, timeline, weapon.projectile);
  }

  /** Animate a shot (worked out here or by the PvP server); resolves once everything has landed */
  protected playTimeline(shooter: Combatant, timeline: ShotTimeline, projectile = shooter.weapon.projectile): Promise<ShotOutcome> {
    this.phase = 'flying';
    this.camTarget = null;
    this.cameras.main.stopFollow();
    const sprites = timeline.flights.map((fl) => {
      const key = fl.look === 'plane' ? 'fx/paper_plane' : fl.look === 'bolt' ? 'fx/proj_lightning' : `fx/${projectile}`;
      const img = this.add.image(fl.path[0].x, fl.path[0].y, key).setOrigin(0.7, 0.5).setDepth(DEPTH.projectile).setVisible(false);
      return img.setScale((40 * fl.size) / img.height);
    });
    return new Promise((resolve) => {
      this.playback = { timeline, shooter, projectile, sprites, next: 0, elapsed: 0, outcome: { impact: null, hits: [] }, resolve };
    });
  }

  private updatePlayback(dt: number) {
    const pb = this.playback!;
    pb.elapsed += dt;
    const step = Math.floor(pb.elapsed / STEP);
    let lead: Phaser.GameObjects.Image | null = null;
    pb.timeline.flights.forEach((fl, i) => {
      const sprite = pb.sprites[i];
      const k = step - fl.start;
      if (!sprite.active || k < 0) return;
      if (k >= fl.path.length - 1) {
        sprite.destroy();
        return;
      }
      const p = fl.path[k];
      const prev = fl.path[Math.max(0, k - 1)];
      sprite.setVisible(true).setPosition(p.x, p.y);
      if (p.x !== prev.x || p.y !== prev.y) sprite.rotation = Math.atan2(p.y - prev.y, p.x - prev.x);
      lead ??= sprite;
    });
    const events = pb.timeline.events;
    while (pb.next < events.length && events[pb.next].t <= step) this.showEvent(pb, events[pb.next++]);

    // Camera and sky marker follow the first projectile still in the air
    const live = lead as Phaser.GameObjects.Image | null;
    this.skyMarker.setVisible(!!live && live.y < 0);
    if (live) {
      const cam = this.cameras.main;
      cam.scrollX += (live.x - GAME_WIDTH / 2 - cam.scrollX) * 0.15;
      if (live.y < 0) this.skyMarker.x = live.x;
    }
    if (step >= pb.timeline.end && pb.next >= events.length) {
      pb.sprites.forEach((s) => s.destroy());
      this.playback = null;
      this.skyMarker.setVisible(false);
      this.phase = 'idle';
      pb.resolve(pb.outcome);
    }
  }

  private byId(id: string): Combatant | undefined {
    return this.combatants.find((c) => c.id === id);
  }

  private showEvent(pb: Playback, e: ShotTimeline['events'][number]) {
    pb.sprites[(e as { flight?: number }).flight ?? -1]?.destroy();
    switch (e.kind) {
      case 'explode':
        pb.outcome.impact ??= e.at;
        this.showExplosion(e.at, e.radius, e.hits, pb);
        break;
      case 'teleport':
        (this.byId(e.id) as Fighter).teleportTo(e.x, e.y);
        this.hud.banner('บินไปแล้ว!', '#bfe8ff');
        break;
      case 'miss':
        this.hud.banner(pb.timeline.flights[e.flight].look === 'plane' ? 'จรวดกระดาษหลุดไป!' : 'พลาด!', '#cccccc');
        break;
      case 'heal': {
        const c = this.byId(e.id) as Fighter;
        c.heal(e.amount);
        this.floatText(c.x, c.y - c.height - 30, `+${e.amount}`, '#7dff8a');
        this.hud.refreshHp();
        break;
      }
    }
  }

  private showExplosion(at: Vec, radius: number, hits: Hit[], pb: Playback) {
    const boom = this.add.sprite(at.x, at.y, 'fx/explosion_0').setDepth(DEPTH.fx);
    boom.setScale((radius * 2.8) / 256);
    boom.play('explosion');
    this.cameras.main.shake(220, 0.008);
    this.terrainView.carve(at.x, at.y, radius);
    this.hud.drawMinimap(this.terrain);

    for (const h of hits) {
      const c = this.byId(h.id);
      if (!c || !c.alive) continue;
      c.takeDamage(h.damage);
      pb.outcome.hits.push({ target: c, damage: h.damage });
      this.floatText(c.x, c.y - c.height - 30, `-${h.damage}`, h.direct ? '#ffdd33' : '#ff5544');
      if (c !== pb.shooter) {
        this.addGauge(pb.shooter, GAUGE_HIT);
        this.addGauge(c, GAUGE_HURT);
      }
      if (h.burn) {
        this.burns.set(c, BURN_TURNS);
        this.floatText(c.x, c.y - c.height - 80, 'ติดไฟ!', '#ff8844');
      }
      if (h.pushTo !== undefined) this.tweens.add({ targets: c, x: h.pushTo, duration: 350, ease: 'Cubic.out', onUpdate: () => c.sync() });
      this.onHit(c, h);
    }
    if (hits.some((h) => h.direct)) this.hud.banner('โดนเต็ม ๆ!', '#ffdd33');
    this.hud.refreshHp();
    this.onExplosion(at, radius, pb.shooter);
  }

  /** Hook: change damage before it lands (e.g. shields). Called while the shot is worked out. */
  protected modifyDamage(_target: Combatant, damage: number): number {
    return damage;
  }

  /** Hook: a hit is shown on screen */
  protected onHit(_target: Combatant, _hit: Hit) {}

  /** Hook: something else may react to a blast (e.g. question crates) */
  protected onExplosion(_at: Vec, _radius: number, _shooter: Combatant) {}

  // ---- Helpers --------------------------------------------------------------

  protected wait(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, () => resolve()));
  }

  /** Wait until nobody is falling */
  protected async waitSettled() {
    for (let i = 0; i < 40 && this.combatants.some((c) => c.alive && c.falling); i++) await this.wait(150);
  }

  protected newWind() {
    // Beginners get gentler wind; the HUD shows the real (reduced) value
    this.setWind(Math.round(this.rng.range(-MAX_WIND, MAX_WIND) * windFactor(this.assistLevel)));
  }

  protected setWind(wind: number) {
    this.wind = wind;
    this.hud.setWind(wind);
  }

  protected focusOn(c: Combatant) {
    this.cameras.main.stopFollow();
    this.camTarget = c;
  }

  protected floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, {
        fontFamily: FONT_FAMILY,
        fontSize: '40px',
        fontStyle: '700',
        color,
        stroke: TEXT_STROKE,
        strokeThickness: 7,
        padding: { top: 8 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.overlay);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 1300, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  /** Dimmed end-of-match panel with a title, a few lines and buttons */
  protected showResult(
    title: string,
    lines: string[],
    buttons: { label: string; onClick: () => void; color?: number }[],
    titleColor = '#ffcc33',
  ) {
    const objects: Phaser.GameObjects.GameObject[] = [];
    const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.5).setOrigin(0);
    // Swallow taps so the battlefield underneath can't be dragged
    shade.setInteractive();
    objects.push(shade);
    const titleText = this.add
      .text(GAME_WIDTH / 2, 170, title, {
        fontFamily: FONT_FAMILY,
        fontSize: '64px',
        fontStyle: '700',
        color: titleColor,
        stroke: TEXT_STROKE,
        strokeThickness: 10,
        padding: { top: 12 },
      })
      .setOrigin(0.5);
    objects.push(titleText);
    lines.forEach((line, i) => {
      objects.push(
        this.add
          .text(GAME_WIDTH / 2, 250 + i * 40, line, {
            fontFamily: FONT_FAMILY,
            fontSize: '28px',
            color: '#ffffff',
            stroke: TEXT_STROKE,
            strokeThickness: 5,
            padding: { top: 6 },
          })
          .setOrigin(0.5),
      );
    });
    // Buttons side by side, below the lines
    const top = 270 + lines.length * 40 + 30;
    const gap = 24;
    const bw = Math.min(300, (1100 - gap * (buttons.length - 1)) / buttons.length);
    buttons.forEach((b, i) => {
      const x = GAME_WIDTH / 2 + (i - (buttons.length - 1) / 2) * (bw + gap);
      objects.push(addTextButton(this, x, top, b.label, b.onClick, { color: b.color, width: bw }));
    });
    for (const o of objects) (o as unknown as Phaser.GameObjects.Components.ScrollFactor & Phaser.GameObjects.Components.Depth).setScrollFactor(0).setDepth(DEPTH.overlay);
    shade.setAlpha(0);
    titleText.setScale(0.5);
    this.tweens.add({ targets: shade, alpha: 1, duration: 400 });
    this.tweens.add({ targets: titleText, scale: 1, duration: 500, ease: 'Back.out' });
  }

  // ---- Per-frame ------------------------------------------------------------

  update(_time: number, deltaMs: number) {
    if (!this.terrainView) return;
    // Switching browser tabs pauses/resumes the game loop; never trust a weird frame time
    if (!Number.isFinite(deltaMs) || deltaMs < 0) return;
    const dt = Math.min(deltaMs, 50) / 1000;

    for (const c of this.combatants) {
      if (c.settle(this.terrain, dt)) {
        c.die();
        this.hud.refreshHp();
        this.hud.banner(`${c.name} ตกเหว!`, '#ff8866');
        if (c === this.human) this.finishHuman(null);
      }
    }

    if (this.phase === 'aiming' || this.phase === 'charging') this.updateHumanInput(dt);
    if ((this.phase === 'aiming' || this.phase === 'charging') && this.human) {
      const f = this.human;
      this.drawGuide(f);
      this.skillBar.fadeIfCovering(f.x - this.cameras.main.scrollX, f.y - f.height, f.y);
    }
    if (this.phase === 'flying' && this.playback) this.updatePlayback(dt);

    const cam = this.cameras.main;
    if (this.camTarget) {
      const goal = this.camTarget.x - GAME_WIDTH / 2;
      cam.scrollX += (goal - cam.scrollX) * Math.min(1, dt * 5);
    }
    const flying = this.playback?.sprites.find((s) => s.active && s.visible) ?? null;
    this.hud.updateMinimap(this.terrain.height, cam.scrollX, GAME_WIDTH, flying);
  }

  /** Hook: the human moved, turned or aimed (online games tell the other player) */
  protected onHumanMoved(_f: Fighter) {}

  private updateHumanInput(dt: number) {
    const f = this.human;
    if (!f) return;
    this.timeLeft -= dt;
    this.hud.setTimer(this.timeLeft);

    if (this.phase === 'charging') {
      this.power = Math.min(100, this.power + CHARGE_SPEED * dt);
      this.hud.setPower(this.power, f.lastPower);
      if (this.power >= 100 || this.timeLeft <= 0) this.finishHuman(this.power);
      return;
    }

    if (this.timeLeft <= 0) {
      this.hud.banner('หมดเวลา!', '#ff8866');
      this.finishHuman(null);
      return;
    }

    let moved = false;
    const move = this.controls.moveDir;
    if (move !== 0) {
      if (this.walkLeft > 0 && !f.falling) {
        const step = Math.min(WALK_SPEED * dt, this.walkLeft);
        if (f.walk(move, step, this.terrain)) this.walkLeft -= step;
        this.hud.setStamina(this.walkLeft / WALK_PER_TURN);
        moved = true;
      } else if (f.facing !== move) {
        f.facing = move; // can always turn around
        f.sync();
        moved = true;
      }
      if (!this.panning) this.camTarget = f;
    }

    const aim = this.controls.aimDir;
    if (aim !== 0) {
      f.angle = Phaser.Math.Clamp(f.angle + aim * AIM_SPEED * dt, 0, 90);
      f.sync();
      this.hud.setAngle(f.angle);
      moved = true;
    }
    if (moved) this.onHumanMoved(f);
  }

  /**
   * Dotted guide along the real path of the shot (wind included) from the barrel.
   * Uses the power being charged, or the previous shot's power while aiming.
   * Long for beginners, shrinking with level to a short aiming hint.
   */
  private drawGuide(f: Fighter) {
    const power = this.phase === 'charging' ? this.power : (f.lastPower ?? 50);
    const m = f.muzzle();
    const key = `${m.x | 0},${m.y | 0},${f.angle.toFixed(1)},${f.facing},${power | 0},${this.wind}`;
    if (key === this.guideKey) return;
    this.guideKey = key;

    // Armed skills change the flight (no wind, rocket, paper plane...); the Ultimate shows the whole path
    const mode = shotModeFor(this.skills.get(f)?.armed ?? null);
    const special = mode === 'special' ? weaponSpecial(f.weapon.id).kind : null;
    const input = { x: m.x, y: m.y, angleDeg: f.angle, facing: f.facing, power, wind: this.wind };
    const shot = fly(launchState(input), flightOptions(mode, special, this.wind), this.terrain, [], f.id);
    const length = mode === 'ultimate' ? 4000 : aimGuideLength(this.assistLevel);
    const path = pathPrefix(shot.path, length);
    const g = this.guide;
    g.clear();
    // One dot every GUIDE_DOT_GAP px along the curve, fading towards the end
    let next = GUIDE_DOT_GAP / 2;
    let walked = 0;
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      while (d > 0 && next <= walked + d) {
        const t = (next - walked) / d;
        const fade = 1 - next / length;
        g.fillStyle(0x1b1d3a, 0.5 * fade + 0.15).fillCircle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 6);
        g.fillStyle(0xffffff, 0.75 * fade + 0.25).fillCircle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 4);
        next += GUIDE_DOT_GAP;
      }
      walked += d;
    }
  }

  /** Drag on empty space to look around the map */
  private setupCameraDrag() {
    let lastX = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0 || this.phase === 'flying' || this.phase === 'quiz') return;
      this.panning = true;
      this.camTarget = null;
      lastX = p.x;
      this.cameras.main.stopFollow();
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.panning || !p.isDown) return;
      this.cameras.main.scrollX -= p.x - lastX;
      lastX = p.x;
    });
    this.input.on('pointerup', () => (this.panning = false));
  }
}
