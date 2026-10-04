import * as Phaser from 'phaser';
import {
  BURN_TURNS,
  GAUGE_HIT,
  GAUGE_HURT,
  GAUGE_MAX,
  GAUGE_SHOT,
  HEAL_AMOUNT,
  ITEM_SKILLS,
  MAX_WIND,
  Rng,
  SHIELD_FACTOR,
  SKILL_SLOTS,
  SPECIAL_KINDS,
  STAMINA_MAX,
  STEP,
  TURN_SECONDS,
  Terrain,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  addGauge,
  aimGuideLength,
  flightOptions,
  fireSkills,
  fly,
  isInstantSkill,
  launchState,
  loadoutOf,
  newSkillState,
  pathPrefix,
  pickSkill,
  resolveShot,
  skillBlocker,
  skillCost,
  spendWalk,
  startSkillTurn,
  unpickSkill,
  walkAllowance,
  tickBurn,
  weaponSpecial,
  windFactor,
  type Hit,
  type InstantSkill,
  type ShotMode,
  type SkillBlocker,
  type ShotTimeline,
  type SkillSlot,
  type SkillState,
  type Unit,
  type Vec,
  type WeaponStats,
} from '@sciboom/shared';
import { panFor, sfx, startAmbience, startMusic, stopAmbience, stopMusic, type Ambience, type Held, type Track } from '../audio/Sound';
import { DEPTH, FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';
import { drawArtBackground } from '../game/background';
import type { Combatant } from '../game/Combatant';
import type { Fighter } from '../game/Fighter';
import { TerrainView } from '../game/TerrainView';
import { Controls } from '../ui/Controls';
import { Hud } from '../ui/Hud';
import { SkillBar, type SlotState } from '../ui/SkillBar';
import { addSettingsButton } from '../ui/SettingsPanel';
import { addSoundToggle } from '../ui/SoundToggle';
import { aimMode, onAimModeChange } from '../settings';
import { addTextButton } from '../ui/TextButton';
import { loadSave } from '../save';

const WALK_SPEED = 110; // px/s
const AIM_SPEED = 40; // degrees/s while holding ↑/↓
// power/s while holding fire (0→100 in ~2.2 s, like DDTank); at 100 the bar runs back down, and so on until you let go
const CHARGE_SPEED = 45;
const GUIDE_DOT_GAP = 22; // px between dots of the aim guide
/** Slingshot: pulling back this far (px on screen) gives full power */
const DRAG_FULL = 200;
/**
 * Slingshot handle: behind the shooter (on the side away from where it
 * shoots), so the hand pulling it never covers the other side. Screen px.
 */
// High up near the screen edge: clear of the fighters standing on the ground, with room to pull down and outwards
const HANDLE_X = 210;
const HANDLE_Y = 300;
const HANDLE_R = 46;
/** Let go closer than this to where you started and the shot is called off */
const DRAG_CANCEL = 26;
/** Furthest the camera zooms out: the whole map width fits on screen */
const MIN_ZOOM = GAME_WIDTH / WORLD_WIDTH;
/** Space kept around the aim guide when zooming out to fit it (px on screen) */
const ZOOM_MARGIN_X = 110;
/** The top of the screen is covered by the HUD (health bars, timer, mini-map) */
const HUD_TOP = 130;
/** A camouflaged fighter, as seen by its own player (the other side sees nothing at all) */
const STEALTH_SELF_ALPHA = 0.22;

/** Why a skill button did nothing */
const BLOCKER_TEXT: Record<SkillBlocker, string> = {
  stamina: 'สตามินาไม่พอ',
  clash: 'ใช้คู่กับสกิลที่เลือกไว้ไม่ได้',
  used: 'ใช้สกิลนี้ไปแล้วในตานี้',
  empty: 'ใช้ครบจำนวนแล้วในเกมนี้',
  full: 'พลังชีวิตเต็มอยู่แล้ว',
  gauge: 'เกจไม้ตายยังไม่เต็ม',
  cooldown: 'ท่าพิเศษกำลังพัก',
  locked: 'ท่าพิเศษใช้ได้กับอาวุธ ★3 ขึ้นไป',
};

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
  /** Per flight: how far along its path has been reported to onProjectileMove */
  swept: number[];
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
  /** Shield skill: these take less damage until their next turn */
  protected shielded = new Set<Combatant>();
  /** Gauge already given this turn (it is given once per turn, however many shells land) */
  private gaugeHitGiven = false;
  private gaugeHurtGiven = new Set<Combatant>();
  /** The fighter whose input is being read right now */
  protected human: Fighter | null = null;

  /** Index in `combatants` of whoever acts next (combatants may be added mid-match, e.g. a boss splitting) */
  private cursor = 0;
  private timeLeft = 0;
  private power = 0;
  private resolveHuman: ((power: number | null) => void) | null = null;
  private playback: Playback | null = null;
  private skillBar!: SkillBar;
  private skyMarker!: Phaser.GameObjects.Triangle;
  private guide!: Phaser.GameObjects.Graphics;
  private guideKey = '';
  private panning = false;
  private camTarget: Combatant | null = null;
  /**
   * Three cameras, drawn in this order: the background art (never zooms), the
   * battlefield (the main camera: zooms out to fit long shots) and the HUD
   * (never zooms). Every object is sorted onto one of them before each frame.
   */
  private bgCam!: Phaser.Cameras.Scene2D.Camera;
  private uiCam!: Phaser.Cameras.Scene2D.Camera;
  private camSorted = new WeakSet<Phaser.GameObjects.GameObject>();
  /** Slingshot aiming: where the finger/mouse went down, and the band drawn from there */
  private dragAim: { x: number; y: number; dist: number } | null = null;
  /** The button to grab for the slingshot */
  private dragHandle!: Phaser.GameObjects.Container;
  private dragView!: Phaser.GameObjects.Graphics;
  private dragLabel!: Phaser.GameObjects.Text;
  private zoomGoal = 1;
  /** Where the aim guide reaches (world), to zoom out until it all fits */
  private guideBox: { minX: number; maxX: number; minY: number } | null = null;
  /** Sounds that follow the game while they play */
  private chargeHum: Held | null = null;
  private flightSound: Held | null = null;
  private flightPrev: Vec | null = null;
  private stepTimer = 0;
  private lastTick = 0;
  /** Power bar going up (1) or coming back down (-1) */
  private chargeDir = 1;
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
    this.cursor = 0;
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
    this.setupCameras();
    this.setupCameraDrag();
    return terrain;
  }

  /** HUD + controls. Call after this.combatants holds the two sides (left, right). */
  protected setupHud(menuScene = 'Menu') {
    // The HUD shows the two sides that exist now; extra enemies later don't get a panel
    this.hud = new Hud(this, [...this.combatants], WORLD_WIDTH);
    // A camouflaged fighter is not on the other side's mini-map either
    this.hud.showOnMap = (c) => !c.hidden || this.viewerOwns(c);
    this.hud.drawMinimap(this.terrain);
    this.controls = new Controls(this);
    this.controls.onFireDown = () => {
      if (this.phase !== 'aiming') return;
      this.phase = 'charging';
      this.power = 0;
      this.chargeDir = 1;
      this.chargeHum = sfx.chargePower();
    };
    this.controls.onFireUp = () => {
      if (this.phase === 'charging') this.finishHuman(this.power);
    };
    this.skillBar = new SkillBar(this);
    this.skillBar.onPick = (slot) => this.pickSkill(slot);
    // Buttons or slingshot (chosen in the settings; switching applies at once)
    this.controls.setAimButtons(aimMode() === 'buttons');
    const offAim = onAimModeChange((m) => this.controls.setAimButtons(m === 'buttons'));
    this.events.once('shutdown', offAim);
    this.dragView = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.hud + 5);
    this.dragLabel = this.add
      .text(0, 0, '', { fontFamily: FONT_FAMILY, fontSize: '22px', fontStyle: '700', color: '#ffffff', stroke: TEXT_STROKE, strokeThickness: 5, padding: { top: 6 } })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud + 5)
      .setVisible(false);
    this.dragAim = null;
    this.dragHandle = this.makeDragHandle();

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
    addSoundToggle(this, GAME_WIDTH / 2 + 245, 30, 32);
    addSettingsButton(this, GAME_WIDTH / 2 + 112, 30, 32);
    startMusic(this.musicTrack());
    const amb = this.ambienceKind();
    if (amb) startAmbience(amb);
    this.events.once('shutdown', () => {
      stopAmbience();
      this.chargeHum?.stop();
      this.flightSound?.stop();
    });
  }

  /** Hook: the song for this kind of match */
  protected musicTrack(): Track {
    return 'battle';
  }

  /** Hook: the sound of the place under the music */
  protected ambienceKind(): Ambience | null {
    return null;
  }

  /** Stereo position of a sound made at world x (left of the screen = left speaker) */
  protected panAt(x: number): number {
    const view = this.cameras.main.worldView;
    return panFor(x - view.x, view.width || GAME_WIDTH);
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
      const actor = this.combatants[this.cursor % this.combatants.length];
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
      const result = this.matchResult();
      if (result !== undefined) {
        this.endMatch(result);
        return;
      }
      this.turn++;
      this.cursor = (this.cursor + 1) % this.combatants.length;
    }
  }

  /** The winner (null = draw) once the match is over, or undefined while it goes on */
  protected matchResult(): Combatant | null | undefined {
    const alive = this.combatants.filter((c) => c.alive);
    return alive.length <= 1 ? (alive[0] ?? null) : undefined;
  }

  protected endMatch(winner: Combatant | null) {
    this.phase = 'over';
    // Quiet down so the win/lose tune stands out
    stopMusic();
    stopAmbience();
    this.combatants.forEach((c) => c.setActive(false));
    this.onMatchEnd(winner);
  }

  /** Play one turn for `actor` (player input, AI, quiz…) */
  protected abstract takeTurn(actor: Combatant): Promise<void>;
  protected abstract onMatchEnd(winner: Combatant | null): void;

  /** Things that happen before anyone acts: camouflage wears off, fire burns, cooldowns tick */
  protected async startOfTurn(actor: Combatant) {
    this.newGaugeTurn();
    this.turnActor = actor;
    // Camouflage lasts until its owner's next turn
    if (actor.hidden) (actor as Fighter).setStealth(false);
    this.refreshStealthView();
    this.endShield(actor);
    const unit = this.unitOf(actor);
    const dmg = tickBurn(unit);
    this.burns.set(actor, unit.burn);
    if (dmg > 0) await this.showBurn(actor, dmg);
  }

  protected async showBurn(actor: Combatant, dmg: number) {
    this.focusOn(actor);
    this.hud.banner(`${actor.name} โดนไฟไหม้!`, '#ff8844');
    sfx.burn(this.panAt(actor.x));
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
      this.beginSkillTurn(sk);
      this.skillBar.setIcons(f.weapon.id, f.portraitKey);
      this.skillBar.setVisible(true);
      this.refreshSkills();
    }
    this.phase = 'aiming';
    this.timeLeft = seconds;
    this.power = 0;
    f.setActive(true);
    sfx.turn();
    this.hud.showTimer(true);
    this.hud.setAngle(f.angle);
    this.hud.setPower(0, f.lastPower);
    this.staminaShown = -1;
    this.refreshStamina();
    this.focusOn(f);
    return new Promise((resolve) => (this.resolveHuman = resolve));
  }

  /** End the human's input: with a power to shoot, or null if the turn is lost */
  protected finishHuman(power: number | null) {
    this.endDragView();
    this.hud.clearCountdown();
    this.chargeHum?.stop();
    this.chargeHum = null;
    const resolve = this.resolveHuman;
    this.resolveHuman = null;
    this.human?.setActive(false);
    this.skillBar.setVisible(false);
    this.guide.clear();
    this.guideKey = '';
    this.guideBox = null;
    if (power !== null && this.human) this.human.lastPower = power;
    this.human = null;
    this.phase = 'idle';
    resolve?.(power);
  }

  // ---- Skills ---------------------------------------------------------------

  /** Hook: a fighter's turn starts (online games get the new state from the server instead) */
  protected beginSkillTurn(sk: SkillState) {
    startSkillTurn(sk);
  }

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
    const armed = sk.armed.includes(slot);
    const blocker = skillBlocker(sk, slot, f.hp >= f.maxHp);
    const enabled = blocker === null;
    const cost = skillCost(slot) || undefined;
    if (slot === 'special') {
      if (blocker === 'locked') return { enabled, armed, note: '★3' };
      if (blocker === 'cooldown') return { enabled, armed, cost, note: `อีก ${sk.specialCooldown}` };
      return { enabled, armed, cost };
    }
    if (slot === 'ultimate') return { enabled, armed, fill: sk.gauge / GAUGE_MAX };
    return { enabled, armed, cost, count: sk.uses[slot] };
  }

  private skillHint(sk: SkillState, f: Fighter): string {
    if (sk.armed.length === 0) return '';
    if (sk.armed.includes('ultimate')) {
      return sk.armed.includes('power') ? 'ไม้ตาย + เพิ่มพลัง: ลูกใหญ่ ดาเมจ x2.6 ไม่โดนลม' : 'ไม้ตาย: ลูกใหญ่ ดาเมจ x2 ไม่โดนลม และเห็นเส้นนำทางเต็มเส้น';
    }
    if (sk.armed.includes('plane')) return `${ITEM_SKILLS.plane.name}: ${ITEM_SKILLS.plane.desc}`;
    const { rounds, damageMul } = loadoutOf(sk.armed);
    const parts: string[] = [];
    if (sk.armed.includes('special')) {
      const sp = weaponSpecial(f.weapon.id);
      parts.push(`ท่าพิเศษ "${sp.name}" (${SPECIAL_KINDS[sp.kind]})`);
    }
    const shells = sk.armed.includes('triple') ? 3 : 1;
    if (rounds > 1) parts.push(`ยิง ${rounds} รอบ`);
    if (shells > 1) parts.push(rounds > 1 ? 'รอบละ 3 ลูก' : 'กระจาย 3 ลูก');
    const each = Math.round(damageMul * (shells > 1 ? 0.5 : 1) * 100);
    parts.push(shells > 1 || rounds > 1 ? `ดาเมจลูกละ ${each}%` : `ดาเมจ ${each}%`);
    return parts.join(' · ');
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

  /** Stamina bar of whoever is playing; the skill buttons follow what it can still pay for */
  protected refreshStamina() {
    const f = this.human;
    const sk = f && this.skills.get(f);
    const left = sk ? sk.stamina : STAMINA_MAX;
    this.hud.setStamina(left / STAMINA_MAX, left);
    // Walking slowly drains it: redraw the buttons only when the whole number changes
    const shown = Math.floor(left);
    if (shown !== this.staminaShown) {
      this.staminaShown = shown;
      this.refreshSkills();
    }
  }
  private staminaShown = -1;

  /** Tap on a skill: instant ones happen now; shot skills are picked (tap again to put back) */
  private pickSkill(slot: SkillSlot) {
    const f = this.human;
    const sk = f && this.skills.get(f);
    if (!f || !sk || this.phase !== 'aiming') return;
    if (sk.armed.includes(slot)) {
      unpickSkill(sk, slot);
      sfx.unpick();
      this.refreshStamina();
      this.refreshSkills();
      return;
    }
    const blocker = skillBlocker(sk, slot, f.hp >= f.maxHp);
    if (blocker !== null) {
      sfx.deny();
      this.hud.banner(BLOCKER_TEXT[blocker], '#cccccc');
      return;
    }
    if (isInstantSkill(slot)) this.useInstantSkill(f, slot);
    else {
      pickSkill(sk, slot);
      sfx.pick();
    }
    this.refreshStamina();
    this.refreshSkills();
  }

  /** Heal, shield or camouflage right now (online games also tell the server) */
  protected useInstantSkill(f: Fighter, slot: InstantSkill) {
    pickSkill(this.skills.get(f)!, slot);
    this.showInstantSkill(f, slot);
  }

  protected showInstantSkill(f: Fighter, slot: InstantSkill) {
    if (slot === 'heal') {
      sfx.heal();
      f.heal(HEAL_AMOUNT);
      this.floatText(f.x, f.y - f.height - 30, `+${HEAL_AMOUNT}`, '#7dff8a');
      this.hud.refreshHp();
    } else if (slot === 'shield') {
      sfx.shield();
      this.shielded.add(f);
      this.syncShield(f);
      this.hud.banner(`${f === this.human ? '' : `${f.name} `}ใช้โล่!`, '#7dd3ff');
    } else {
      sfx.stealth();
      f.setStealth(true, this.viewerOwns(f) ? STEALTH_SELF_ALPHA : 0);
      this.hud.banner(`${this.viewerOwns(f) ? '' : `${f.name} `}พรางตัว!`, '#bfe8ff');
    }
    if (f === this.human) this.refreshSkills();
  }

  /**
   * A whole human turn with skills: walk/aim/charge, then fire using the shot
   * skills picked (+1 and +2 fire more rounds with the same aim).
   */
  protected async humanShot(f: Fighter, opts: ShotOptions = {}): Promise<ShotOutcome[]> {
    const power = await this.humanTurn(f);
    if (power === null) return [];
    const sk = this.skills.get(f);
    const loadout = sk ? fireSkills(sk) : loadoutOf([]);
    if (sk) this.addGauge(f, GAUGE_SHOT);
    if (loadout.mode === 'ultimate') {
      this.hud.banner('ไม้ตาย!', '#ffcc33');
      sfx.ultimate();
      await this.wait(400);
    }
    const outcomes: ShotOutcome[] = [];
    for (let k = 0; k < loadout.rounds; k++) {
      if (k > 0) {
        if (!f.alive || !this.combatants.some((c) => c !== f && c.alive)) break;
        this.hud.banner(`รอบที่ ${k + 1}!`, '#ffdd33');
        await this.wait(450);
      }
      outcomes.push(await this.shoot(f, power, { ...opts, mode: loadout.mode, damageMul: (opts.damageMul ?? 1) * loadout.damageMul }));
    }
    return outcomes;
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
    const pan = this.panAt(shooter.x);
    if (timeline.flights[0]?.look === 'plane') sfx.plane(pan);
    else sfx.fire(Math.max(0.8, Math.min(1.6, shooter.weapon.radius / 50)), pan);
    this.flightSound?.stop();
    this.flightSound = sfx.flight();
    this.flightPrev = null;
    const sprites = timeline.flights.map((fl) => {
      const plane = this.textures.exists('fx/proj_paper_plane') ? 'fx/proj_paper_plane' : 'fx/paper_plane';
      const key = fl.look === 'plane' ? plane : fl.look === 'bolt' ? 'fx/proj_lightning' : `fx/${projectile}`;
      const img = this.add.image(fl.path[0].x, fl.path[0].y, key).setOrigin(0.7, 0.5).setDepth(DEPTH.projectile).setVisible(false);
      return img.setScale((40 * fl.size) / img.height);
    });
    return new Promise((resolve) => {
      this.playback = { timeline, shooter, projectile, sprites, swept: timeline.flights.map(() => 0), next: 0, elapsed: 0, outcome: { impact: null, hits: [] }, resolve };
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
      // Every bit of path flown since last frame (none skipped, even if frames drop)
      const upTo = Math.min(k, fl.path.length - 1);
      for (let j = pb.swept[i] + 1; j <= upTo; j++) this.onProjectileMove(pb.shooter, fl.path[j - 1], fl.path[j]);
      pb.swept[i] = Math.max(pb.swept[i], upTo);
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
    if (!live) this.skyMarker.setVisible(false);
    // The air rushing past gets louder and higher the faster the shell goes
    if (live) {
      if (this.flightPrev) this.flightSound?.set(Math.hypot(live.x - this.flightPrev.x, live.y - this.flightPrev.y) / (dt * 1400));
      this.flightPrev = { x: live.x, y: live.y };
    } else {
      this.flightSound?.stop();
    }
    if (live) {
      const cam = this.cameras.main;
      cam.scrollX += (live.x - GAME_WIDTH / 2 - cam.scrollX) * 0.15;
      // Above the top of the view: a little arrow shows where it is
      const view = cam.worldView;
      this.skyMarker.setVisible(live.y < view.y);
      this.skyMarker.setPosition(live.x, view.y + 14 / cam.zoom).setScale(1 / cam.zoom);
    }
    if (step >= pb.timeline.end && pb.next >= events.length) {
      pb.sprites.forEach((s) => s.destroy());
      this.flightSound?.stop();
      this.flightSound = null;
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
        sfx.teleport(this.panAt(e.x));
        this.hud.banner('บินไปแล้ว!', '#bfe8ff');
        break;
      case 'miss':
        this.hud.banner(pb.timeline.flights[e.flight].look === 'plane' ? 'จรวดกระดาษหลุดไป!' : 'พลาด!', '#cccccc');
        break;
      case 'heal': {
        const c = this.byId(e.id) as Fighter;
        c.heal(e.amount);
        sfx.heal();
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
    const pan = this.panAt(at.x);
    sfx.explode(radius, pan);
    const others = hits.filter((h) => h.id !== pb.shooter.id);
    if (others.length > 0) sfx.hit(others.some((h) => h.direct), pan);
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
        // Once per turn each, however many shells land
        if (!this.gaugeHitGiven) this.addGauge(pb.shooter, GAUGE_HIT);
        this.gaugeHitGiven = true;
        if (!this.gaugeHurtGiven.has(c)) this.addGauge(c, GAUGE_HURT);
        this.gaugeHurtGiven.add(c);
      }
      // A hit gives a camouflaged fighter away
      if (c !== pb.shooter && c.hidden && h.damage > 0) {
        (c as Fighter).setStealth(false);
        sfx.reveal();
        this.floatText(c.x, c.y - c.height - 110, 'เจอตัวแล้ว!', '#bfe8ff');
      }
      if (h.burn) {
        this.burns.set(c, BURN_TURNS);
        sfx.burn(pan);
        this.floatText(c.x, c.y - c.height - 80, 'ติดไฟ!', '#ff8844');
      }
      if (h.pushTo !== undefined) this.tweens.add({ targets: c, x: h.pushTo, duration: 350, ease: 'Cubic.out', onUpdate: () => c.sync() });
      this.onHit(c, h);
    }
    if (hits.some((h) => h.direct)) this.hud.banner('โดนเต็ม ๆ!', '#ffdd33');
    this.hud.refreshHp();
    this.onExplosion(at, radius, pb.shooter);
  }

  /**
   * Whether the person looking at the screen right now plays this fighter, so
   * may see it while camouflaged. Stages: the only human is the player. Other
   * modes decide for themselves (same device: whoever's turn it is; online: us).
   */
  protected viewerOwns(_c: Combatant): boolean {
    return true;
  }

  /** Whose turn it is (set at the start of each turn) */
  protected turnActor: Combatant | null = null;

  /** Camouflaged fighters: faint for their own player, invisible to everyone else */
  protected refreshStealthView() {
    for (const c of this.combatants) {
      if (c.hidden) (c as Fighter).setStealth(true, this.viewerOwns(c) ? STEALTH_SELF_ALPHA : 0);
    }
  }

  /** Hook: a projectile flew from a to b (stages collect the crates it passes through) */
  protected onProjectileMove(_shooter: Combatant, _a: Vec, _b: Vec) {}

  /** Hook: change damage before it lands (e.g. shields). Called while the shot is worked out. */
  protected modifyDamage(target: Combatant, damage: number): number {
    return this.shielded.has(target) ? Math.round(damage * SHIELD_FACTOR) : damage;
  }

  /** A new turn: the once-per-turn gauge gains can be earned again */
  protected newGaugeTurn() {
    this.gaugeHitGiven = false;
    this.gaugeHurtGiven.clear();
  }

  /** Whether to draw a shield bubble around a combatant (stages add their crate shield) */
  protected shieldShown(c: Combatant): boolean {
    return this.shielded.has(c);
  }

  protected syncShield(c: Combatant) {
    (c as Fighter).setShieldVisible?.(this.shieldShown(c));
  }

  /** The shield skill lasts until its owner's next turn */
  protected endShield(c: Combatant) {
    if (!this.shielded.delete(c)) return;
    this.syncShield(c);
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
      const cam = this.cameras.main;
      const view = cam.worldView;
      this.skillBar.fadeIfCovering((f.x - view.x) * cam.zoom, (f.y - f.height - view.y) * cam.zoom, (f.y - view.y) * cam.zoom);
    }
    if (this.phase === 'flying' && this.playback) this.updatePlayback(dt);
    this.updateDragHandle();

    const cam = this.cameras.main;
    const fit = this.fitGuide();
    // While charging the guide grows and shrinks with the power: only ever zoom further out then, never back in
    if (fit) this.zoomGoal = this.phase === 'charging' ? Math.min(this.zoomGoal, fit.zoom) : fit.zoom;
    else if (this.phase !== 'flying') this.zoomGoal = 1; // a shot keeps the zoom it was fired with
    cam.setZoom(cam.zoom + (this.zoomGoal - cam.zoom) * Math.min(1, dt * 3));
    if (Math.abs(cam.zoom - this.zoomGoal) < 0.002) cam.setZoom(this.zoomGoal);
    // The ground stays at the bottom of the screen; zooming out shows more sky
    cam.scrollY = WORLD_HEIGHT - GAME_HEIGHT / 2 - GAME_HEIGHT / (2 * cam.zoom);
    const centre = fit && !this.panning && this.camTarget === this.human ? fit.x : this.camTarget?.x;
    if (centre !== undefined) cam.scrollX += (centre - GAME_WIDTH / 2 - cam.scrollX) * Math.min(1, dt * 5);
    // The background art moves (and never zooms) with the middle of the view
    this.bgCam.scrollX = Phaser.Math.Clamp(cam.scrollX, 0, WORLD_WIDTH - GAME_WIDTH);
    const flying = this.playback?.sprites.find((s) => s.active && s.visible) ?? null;
    this.hud.updateMinimap(this.terrain.height, cam.worldView.x, cam.worldView.width || GAME_WIDTH, flying);
  }

  /**
   * While aiming: the zoom (and the middle of the view) that fits the shooter
   * and the whole aim guide on screen, below the HUD. Null when not aiming.
   */
  private fitGuide(): { zoom: number; x: number } | null {
    const f = this.human;
    const b = this.guideBox;
    if (!f || !b || (this.phase !== 'aiming' && this.phase !== 'charging')) return null;
    const minX = Math.max(0, Math.min(b.minX, f.x - 60));
    const maxX = Math.min(WORLD_WIDTH, Math.max(b.maxX, f.x + 60));
    const minY = Math.min(b.minY, f.y - f.height - 40);
    const zx = GAME_WIDTH / (maxX - minX + 2 * ZOOM_MARGIN_X);
    const zy = (GAME_HEIGHT - HUD_TOP) / Math.max(1, WORLD_HEIGHT - minY);
    const zoom = Phaser.Math.Clamp(Math.min(1, zx, zy), MIN_ZOOM, 1);
    return { zoom, x: zoom < 1 ? (minX + maxX) / 2 : f.x };
  }

  /** Background, battlefield and HUD cameras (see bgCam) */
  private setupCameras() {
    const main = this.cameras.main;
    // Room above the map for the sky when zoomed all the way out
    const viewH = GAME_HEIGHT / MIN_ZOOM;
    main.setBounds(0, WORLD_HEIGHT - viewH, WORLD_WIDTH, viewH);
    main.setZoom(1);
    main.scrollY = 0;
    this.zoomGoal = 1;
    this.guideBox = null;
    this.camSorted = new WeakSet();
    this.bgCam = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT, false, 'background');
    this.uiCam = this.cameras.add(0, 0, GAME_WIDTH, GAME_HEIGHT, false, 'hud');
    // Draw the background first
    const list = this.cameras.cameras;
    list.splice(list.indexOf(this.bgCam), 1);
    list.unshift(this.bgCam);
    const sort = () => this.sortForCameras();
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, sort);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.PRE_RENDER, sort));
  }

  /** Put each new object on its camera: background art, HUD (fixed to the screen), or the battlefield */
  private sortForCameras() {
    const main = this.cameras.main;
    for (const o of this.children.list) {
      if (this.camSorted.has(o)) continue;
      this.camSorted.add(o);
      const { depth = 0, scrollFactorX = 1 } = o as unknown as { depth?: number; scrollFactorX?: number };
      if (depth <= DEPTH.background) {
        main.ignore(o);
        this.uiCam.ignore(o);
      } else if (scrollFactorX === 0) {
        main.ignore(o);
        this.bgCam.ignore(o);
      } else {
        this.bgCam.ignore(o);
        this.uiCam.ignore(o);
      }
    }
  }

  /** Hook: the human moved, turned or aimed (online games tell the other player) */
  protected onHumanMoved(_f: Fighter) {}

  private updateHumanInput(dt: number) {
    const f = this.human;
    if (!f) return;
    this.timeLeft -= dt;
    this.hud.setTimer(this.timeLeft);
    // Clock ticks in the last 5 seconds
    const sec = Math.ceil(this.timeLeft);
    if (sec !== this.lastTick && sec <= 5 && sec > 0) {
      sfx.tick(sec <= 3);
      this.hud.countdown(sec);
    }
    this.lastTick = sec;

    if (this.phase === 'charging') {
      // Up to 100, back down to 0, up again… until released (or the time runs out).
      // With the slingshot the power is how far you pulled instead.
      if (!this.dragAim) {
        this.power += this.chargeDir * CHARGE_SPEED * dt;
        if (this.power >= 100) {
          this.power = 200 - this.power;
          this.chargeDir = -1;
        } else if (this.power <= 0) {
          this.power = -this.power;
          this.chargeDir = 1;
        }
      }
      this.chargeHum?.set(this.power / 100);
      this.hud.setPower(this.power, f.lastPower);
      if (this.timeLeft <= 0) this.finishHuman(this.power);
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
      const sk = this.skills.get(f);
      const allowance = sk ? walkAllowance(sk) : Infinity;
      if (allowance > 0 && !f.falling) {
        const step = Math.min(WALK_SPEED * dt, allowance);
        if (f.walk(move, step, this.terrain)) {
          // A footstep every so often
          this.stepTimer -= dt;
          if (this.stepTimer <= 0) {
            sfx.step();
            this.stepTimer = 0.28;
          }
          if (sk) {
            spendWalk(sk, step);
            this.refreshStamina();
          }
        }
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
    const mode = loadoutOf(this.skills.get(f)?.armed ?? []).mode;
    const special = mode === 'special' ? weaponSpecial(f.weapon.id).kind : null;
    const input = { x: m.x, y: m.y, angleDeg: f.angle, facing: f.facing, power, wind: this.wind };
    const shot = fly(launchState(input), flightOptions(mode, special, this.wind), this.terrain, [], f.id);
    const length = mode === 'ultimate' ? 4000 : aimGuideLength(this.assistLevel);
    const path = pathPrefix(shot.path, length);
    // Zoom out to show where this shot is heading: the whole flight, not just the dots shown
    // (stronger shot = longer flight = further out)
    this.guideBox = shot.path.reduce(
      (b, p) => ({ minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x), minY: Math.min(b.minY, p.y) }),
      { minX: m.x, maxX: m.x, minY: m.y },
    );
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
      if (this.dragAim) {
        this.moveDragAim(p);
        return;
      }
      if (!this.panning || !p.isDown) return;
      this.cameras.main.scrollX -= (p.x - lastX) / this.cameras.main.zoom;
      lastX = p.x;
    });
    const up = (p: Phaser.Input.Pointer) => {
      if (this.dragAim) this.releaseDragAim(p);
      this.panning = false;
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
  }

  // ---- Slingshot aiming ---------------------------------------------------------

  /** Round "ลากยิง" button; shown on your turn when aiming with the slingshot */
  private makeDragHandle(): Phaser.GameObjects.Container {
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.3).fillCircle(3, 5, HANDLE_R);
    g.fillStyle(0xff8a1f, 0.92).fillCircle(0, 0, HANDLE_R);
    g.fillStyle(0xffffff, 0.25).fillCircle(0, -HANDLE_R * 0.35, HANDLE_R * 0.6);
    g.lineStyle(4, 0xffffff, 1).strokeCircle(0, 0, HANDLE_R);
    g.lineStyle(3, 0x1b1d3a, 0.8).strokeCircle(0, 0, HANDLE_R + 3);
    const label = this.add
      .text(0, 2, 'ลากยิง', { fontFamily: FONT_FAMILY, fontSize: '22px', fontStyle: '700', color: '#ffffff', stroke: TEXT_STROKE, strokeThickness: 5, padding: { top: 6 } })
      .setOrigin(0.5);
    const c = this.add.container(HANDLE_X, HANDLE_Y, [g, label]).setScrollFactor(0).setDepth(DEPTH.hud).setSize(HANDLE_R * 2.4, HANDLE_R * 2.4);
    c.setInteractive({ useHandCursor: true });
    c.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this.phase === 'aiming' && this.human && aimMode() === 'drag') this.startDragAim(p);
    });
    this.tweens.add({ targets: c, scale: 1.08, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    c.setVisible(false);
    return c;
  }

  /** Show the handle on your slingshot turn, behind you (it swaps sides when you turn round) */
  private updateDragHandle() {
    const f = this.human;
    const on = !!f && aimMode() === 'drag' && (this.phase === 'aiming' || (this.phase === 'charging' && !!this.dragAim));
    this.dragHandle.setVisible(on);
    if (this.dragHandle.input) this.dragHandle.input.enabled = on;
    if (on && !this.dragAim) this.dragHandle.x = f.facing === 1 ? HANDLE_X : GAME_WIDTH - HANDLE_X;
  }

  private startDragAim(p: Phaser.Input.Pointer) {
    // Pull from the middle of the handle; the view follows the shooter again
    this.dragAim = { x: this.dragHandle.x, y: this.dragHandle.y, dist: 0 };
    this.panning = false;
    if (this.human) this.camTarget = this.human;
    this.phase = 'charging';
    this.power = 0;
    this.chargeHum = sfx.chargePower();
    this.moveDragAim(p);
  }

  /** Pull back: the shot goes the opposite way; the further you pull, the stronger */
  private moveDragAim(p: Phaser.Input.Pointer) {
    const d = this.dragAim;
    const f = this.human;
    if (!d || !f) return;
    const dx = d.x - p.x;
    const dy = d.y - p.y;
    d.dist = Math.hypot(dx, dy);
    const live = d.dist >= DRAG_CANCEL;
    if (live) {
      if (Math.abs(dx) > 6) f.facing = dx > 0 ? 1 : -1;
      f.angle = Phaser.Math.Clamp(Phaser.Math.RadToDeg(Math.atan2(-dy, Math.abs(dx))), 0, 90);
      f.sync();
      this.hud.setAngle(f.angle);
      this.power = Phaser.Math.Clamp((d.dist / DRAG_FULL) * 100, 0, 100);
      this.onHumanMoved(f);
    } else {
      this.power = 0;
    }
    this.hud.setPower(this.power, f.lastPower);
    this.chargeHum?.set(this.power / 100);
    this.drawDragView(p.x, p.y, live);
  }

  private releaseDragAim(p: Phaser.Input.Pointer) {
    this.moveDragAim(p);
    const d = this.dragAim!;
    if (d.dist < DRAG_CANCEL) {
      // Let go where it started: no shot, aim again
      this.endDragView();
      this.chargeHum?.stop();
      this.chargeHum = null;
      this.phase = 'aiming';
      this.power = 0;
      this.hud.setPower(0, this.human?.lastPower ?? null);
      return;
    }
    this.finishHuman(this.power);
  }

  /** The rubber band from where you touched to your finger, with the power and angle */
  private drawDragView(x: number, y: number, live: boolean) {
    const d = this.dragAim!;
    const g = this.dragView;
    g.clear();
    const strong = this.power / 100;
    const color = live ? Phaser.Display.Color.GetColor(255, Math.round(220 - 140 * strong), 60) : 0x9aa0b8;
    g.lineStyle(10, 0x1b1d3a, 0.55).lineBetween(d.x, d.y, x, y);
    g.lineStyle(6, color, 0.95).lineBetween(d.x, d.y, x, y);
    g.fillStyle(0x1b1d3a, 0.6).fillCircle(d.x, d.y, 16);
    g.lineStyle(3, 0xffffff, 0.9).strokeCircle(d.x, d.y, DRAG_CANCEL);
    g.fillStyle(color, 1).fillCircle(x, y, 12);
    g.lineStyle(3, 0x1b1d3a, 1).strokeCircle(x, y, 12);
    const f = this.human;
    this.dragLabel
      .setVisible(true)
      .setPosition(Phaser.Math.Clamp(x, 120, GAME_WIDTH - 120), Phaser.Math.Clamp(y - 44, 150, GAME_HEIGHT - 40))
      .setText(live && f ? `แรง ${Math.round(this.power)} · มุม ${Math.round(f.angle)}°` : 'ปล่อยตรงนี้ = ยกเลิก')
      .setColor(live ? '#ffffff' : '#cccccc');
  }

  private endDragView() {
    this.dragAim = null;
    this.dragView?.clear();
    this.dragLabel?.setVisible(false);
  }
}
