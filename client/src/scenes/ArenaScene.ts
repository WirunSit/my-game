import * as Phaser from 'phaser';
import {
  MAX_WIND,
  Rng,
  STEP,
  Terrain,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  blastDamage,
  simulateShot,
  type ShotResult,
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
import { addTextButton } from '../ui/TextButton';

const TURN_SECONDS = 20;
const WALK_SPEED = 110; // px/s
const WALK_PER_TURN = 220; // px of walking allowed per turn
const AIM_SPEED = 40; // degrees/s while holding ↑/↓
const CHARGE_SPEED = 65; // power/s while holding fire (0→100 in ~1.5 s)

export type Phase = 'idle' | 'aiming' | 'charging' | 'flying' | 'quiz' | 'over';

export interface ShotOptions {
  /** Use a different weapon than the shooter's own (e.g. a boss ultimate) */
  weapon?: WeaponStats;
  /** Override the shooter's aim angle */
  angle?: number;
  /** Damage multiplier (quiz bonus) */
  damageMul?: number;
}

export interface ShotOutcome {
  impact: Vec | null;
  hits: { target: Combatant; damage: number }[];
}

interface Flight {
  result: ShotResult;
  sprite: Phaser.GameObjects.Image;
  elapsed: number;
  shooter: Combatant;
  weapon: WeaponStats;
  damageMul: number;
  resolve: (o: ShotOutcome) => void;
}

/**
 * Everything every battle mode shares: map, camera, HUD, controls, the human
 * player's turn (walk/aim/charge), projectile flight and explosions.
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

  private timeLeft = 0;
  private walkLeft = 0;
  private power = 0;
  private human: Fighter | null = null;
  private resolveHuman: ((power: number | null) => void) | null = null;
  private flight: Flight | null = null;
  private skyMarker!: Phaser.GameObjects.Triangle;
  private panning = false;
  private camTarget: Combatant | null = null;
  /** Bumped when the scene shuts down so an old match loop stops */
  private matchToken = 0;

  protected get terrain(): Terrain {
    return this.terrainView.terrain;
  }

  // ---- Setup ----------------------------------------------------------------

  /** Build background, ground and camera. Call first in create(). */
  protected setupArena(seed: number, backgroundKey: string, groundKey: string): Terrain {
    // The same Scene object is reused on restart, so reset everything
    this.combatants = [];
    this.phase = 'idle';
    this.turn = 0;
    this.flight = null;
    this.human = null;
    this.resolveHuman = null;
    this.camTarget = null;
    this.panning = false;
    this.rng = new Rng(seed);
    this.events.once('shutdown', () => this.matchToken++);

    drawArtBackground(this, backgroundKey, WORLD_WIDTH);
    const terrain = Terrain.generate(seed);
    this.terrainView = new TerrainView(this, terrain, groundKey);

    this.skyMarker = this.add
      .triangle(0, 14, 0, 18, 18, 18, 9, 0, 0xffffff)
      .setStrokeStyle(2, 0x1b1d3a)
      .setDepth(DEPTH.fx)
      .setVisible(false);
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
    back.on('pointerup', () => this.scene.start(menuScene));
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
        await this.takeTurn(actor);
        if (token !== this.matchToken) return;
        await this.waitSettled();
        if (token !== this.matchToken) return;
      }
      const alive = this.combatants.filter((c) => c.alive);
      if (alive.length <= 1) {
        this.phase = 'over';
        this.combatants.forEach((c) => c.setActive(false));
        this.onMatchEnd(alive[0] ?? null);
        return;
      }
      this.turn++;
    }
  }

  /** Play one turn for `actor` (player input, AI, quiz…) */
  protected abstract takeTurn(actor: Combatant): Promise<void>;
  protected abstract onMatchEnd(winner: Combatant | null): void;

  /** Let a human walk, aim and charge. Resolves with the power, or null if the turn was lost. */
  protected humanTurn(f: Fighter): Promise<number | null> {
    this.human = f;
    this.phase = 'aiming';
    this.timeLeft = TURN_SECONDS;
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

  private finishHuman(power: number | null) {
    const resolve = this.resolveHuman;
    this.resolveHuman = null;
    this.human?.setActive(false);
    if (power !== null && this.human) this.human.lastPower = power;
    this.human = null;
    this.phase = 'idle';
    resolve?.(power);
  }

  // ---- Shooting -------------------------------------------------------------

  /** Fire a projectile from `shooter`; resolves after it lands and explodes */
  protected shoot(shooter: Combatant, power: number, opts: ShotOptions = {}): Promise<ShotOutcome> {
    const weapon = opts.weapon ?? shooter.weapon;
    if (opts.angle !== undefined) {
      shooter.angle = opts.angle;
      shooter.sync();
    }
    const m = shooter.muzzle();
    const targets = this.combatants.filter((c) => c.alive).map((c) => c.toTarget());
    const result = simulateShot(
      { x: m.x, y: m.y, angleDeg: shooter.angle, facing: shooter.facing, power, wind: this.wind },
      this.terrain,
      targets,
      shooter.id,
    );

    const sprite = this.add.image(m.x, m.y, `fx/${weapon.projectile}`).setOrigin(0.7, 0.5).setDepth(DEPTH.projectile);
    sprite.setScale(40 / sprite.height);
    this.phase = 'flying';
    this.camTarget = null;
    this.cameras.main.startFollow(sprite, true, 0.15, 0.15);
    return new Promise((resolve) => {
      this.flight = { result, sprite, elapsed: 0, shooter, weapon, damageMul: opts.damageMul ?? 1, resolve };
    });
  }

  private updateFlight(dt: number) {
    const fl = this.flight!;
    fl.elapsed += dt;
    const path = fl.result.path;
    const i = Math.min(path.length - 1, Math.floor(fl.elapsed / STEP));
    const p = path[i];
    const prev = path[Math.max(0, i - 1)];
    fl.sprite.setPosition(p.x, p.y);
    if (p.x !== prev.x || p.y !== prev.y) fl.sprite.rotation = Math.atan2(p.y - prev.y, p.x - prev.x);
    this.skyMarker.setVisible(p.y < 0);
    if (p.y < 0) this.skyMarker.x = p.x;
    if (i === path.length - 1) this.endFlight();
  }

  private endFlight() {
    const fl = this.flight!;
    this.flight = null;
    fl.sprite.destroy();
    this.skyMarker.setVisible(false);
    this.cameras.main.stopFollow();
    this.phase = 'idle';
    const impact = fl.result.impact;
    let outcome: ShotOutcome = { impact: null, hits: [] };
    if (impact) outcome = this.explode(impact, fl.result.directHitId, fl.weapon, fl.damageMul, fl.shooter);
    else this.hud.banner('พลาด!', '#cccccc');
    fl.resolve(outcome);
  }

  private explode(at: Vec, directHitId: string | null, weapon: WeaponStats, damageMul: number, shooter: Combatant): ShotOutcome {
    const boom = this.add.sprite(at.x, at.y, 'fx/explosion_0').setDepth(DEPTH.fx);
    boom.setScale((weapon.radius * 2.8) / 256);
    boom.play('explosion');
    this.cameras.main.shake(220, 0.008);

    this.terrainView.carve(at.x, at.y, weapon.radius);
    this.hud.drawMinimap(this.terrain);

    const hits: ShotOutcome['hits'] = [];
    for (const c of this.combatants) {
      if (!c.alive) continue;
      const direct = c.id === directHitId;
      let dmg = Math.round(blastDamage(at, c.toTarget(), weapon.radius, weapon.damage, direct) * damageMul);
      if (dmg <= 0) continue;
      dmg = this.modifyDamage(c, dmg);
      c.takeDamage(dmg);
      hits.push({ target: c, damage: dmg });
      this.floatText(c.x, c.y - c.height - 30, `-${dmg}`, direct ? '#ffdd33' : '#ff5544');
    }
    if (directHitId) this.hud.banner('โดนเต็ม ๆ!', '#ffdd33');
    this.hud.refreshHp();
    this.onExplosion(at, weapon.radius, shooter);
    return { impact: at, hits };
  }

  /** Hook: change damage before it's applied (e.g. shields) */
  protected modifyDamage(_target: Combatant, damage: number): number {
    return damage;
  }

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
    this.wind = Math.round(this.rng.range(-MAX_WIND, MAX_WIND));
    this.hud.setWind(this.wind);
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
    if (this.phase === 'flying' && this.flight) this.updateFlight(dt);

    const cam = this.cameras.main;
    if (this.camTarget) {
      const goal = this.camTarget.x - GAME_WIDTH / 2;
      cam.scrollX += (goal - cam.scrollX) * Math.min(1, dt * 5);
    }
    this.hud.updateMinimap(this.terrain.height, cam.scrollX, GAME_WIDTH, this.flight ? this.flight.sprite : null);
  }

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

    const move = this.controls.moveDir;
    if (move !== 0) {
      if (this.walkLeft > 0 && !f.falling) {
        const step = Math.min(WALK_SPEED * dt, this.walkLeft);
        if (f.walk(move, step, this.terrain)) this.walkLeft -= step;
        this.hud.setStamina(this.walkLeft / WALK_PER_TURN);
      } else if (f.facing !== move) {
        f.facing = move; // can always turn around
        f.sync();
      }
      if (!this.panning) this.camTarget = f;
    }

    const aim = this.controls.aimDir;
    if (aim !== 0) {
      f.angle = Phaser.Math.Clamp(f.angle + aim * AIM_SPEED * dt, 0, 90);
      f.sync();
      this.hud.setAngle(f.angle);
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
