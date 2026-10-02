import * as Phaser from 'phaser';
import {
  MAX_WIND,
  Rng,
  STEP,
  Terrain,
  WEAPONS,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  blastDamage,
  simulateShot,
  type ShotResult,
  type Vec,
} from '@sciboom/shared';
import { DEPTH, FONT_FAMILY, GAME_HEIGHT, GAME_WIDTH, TEXT_STROKE } from '../config';
import { drawSkyBackground } from '../game/background';
import { Fighter, LOOKS } from '../game/Fighter';
import { TerrainView } from '../game/TerrainView';
import { Controls } from '../ui/Controls';
import { Hud } from '../ui/Hud';
import { addTextButton } from '../ui/TextButton';

const TURN_SECONDS = 20;
const WALK_SPEED = 110; // px/s
const WALK_PER_TURN = 220; // px of walking allowed per turn
const AIM_SPEED = 40; // degrees/s while holding ↑/↓
const CHARGE_SPEED = 65; // power/s while holding fire (0→100 in ~1.5 s)

type Phase = 'aiming' | 'charging' | 'flying' | 'resolving' | 'over';

interface Flight {
  result: ShotResult;
  sprite: Phaser.GameObjects.Image;
  elapsed: number;
}

/** Two players taking turns on one device (phase 1). */
export class BattleScene extends Phaser.Scene {
  private terrainView!: TerrainView;
  private fighters: Fighter[] = [];
  private hud!: Hud;
  private controls!: Controls;
  private rng!: Rng;

  private phase: Phase = 'aiming';
  private turn = 0;
  private wind = 0;
  private timeLeft = TURN_SECONDS;
  private walkLeft = WALK_PER_TURN;
  private power = 0;
  private flight: Flight | null = null;
  private skyMarker!: Phaser.GameObjects.Triangle;
  private panning = false;
  /** Fighter the camera glides toward (null while dragging or following a shot) */
  private camTarget: Fighter | null = null;

  constructor() {
    super('Battle');
  }

  private get active(): Fighter {
    return this.fighters[this.turn % this.fighters.length];
  }

  create() {
    const seed = Math.floor(Math.random() * 1e9);
    this.rng = new Rng(seed);
    this.phase = 'aiming';
    this.turn = 0;
    this.flight = null;

    drawSkyBackground(this, WORLD_WIDTH, true);
    const terrain = Terrain.generate(seed);
    this.terrainView = new TerrainView(this, terrain);

    const spawn = (x: number) => terrain.groundBelow(x, 0) ?? WORLD_HEIGHT / 2;
    const x1 = 260 + this.rng.int(0, 120);
    const x2 = WORLD_WIDTH - 260 - this.rng.int(0, 120);
    this.fighters = [
      new Fighter(this, 'p1', 'ผู้เล่น 1', x1, spawn(x1), 1, LOOKS.boy, WEAPONS.starter_cannon, 0x3a8dde),
      new Fighter(this, 'p2', 'ผู้เล่น 2', x2, spawn(x2), -1, LOOKS.girl, WEAPONS.beaker_gun, 0xff5e8a),
    ];

    this.hud = new Hud(this, this.fighters, WORLD_WIDTH);
    this.hud.drawMinimap(terrain);
    this.controls = new Controls(this);
    this.controls.onFireDown = () => this.startCharge();
    this.controls.onFireUp = () => this.phase === 'charging' && this.fire();

    // Marker at the top edge when a shot flies above the screen
    this.skyMarker = this.add.triangle(0, 14, 0, 18, 18, 18, 9, 0, 0xffffff).setStrokeStyle(2, 0x1b1d3a).setDepth(DEPTH.fx).setVisible(false);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.setupCameraDrag();

    const back = this.add
      .text(GAME_WIDTH / 2 + 150, 30, '☰ เมนู', { fontFamily: FONT_FAMILY, fontSize: '20px', color: '#ffffff', stroke: TEXT_STROKE, strokeThickness: 4 })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.hud)
      .setInteractive({ useHandCursor: true });
    back.on('pointerup', () => this.scene.start('Menu'));

    this.startTurn();
  }

  // ---- Turn flow ------------------------------------------------------------

  private startTurn() {
    const f = this.active;
    this.phase = 'aiming';
    this.timeLeft = TURN_SECONDS;
    this.walkLeft = WALK_PER_TURN;
    this.power = 0;
    this.wind = Math.round(this.rng.range(-MAX_WIND, MAX_WIND));

    this.fighters.forEach((x) => x.setActive(x === f));
    this.hud.setActive(this.fighters.indexOf(f));
    this.hud.setWind(this.wind);
    this.hud.setAngle(f.angle);
    this.hud.setPower(0, f.lastPower);
    this.hud.setStamina(1);
    this.hud.banner(`ตาของ ${f.name}`);
    this.followFighter(f);
  }

  private startCharge() {
    if (this.phase !== 'aiming') return;
    this.phase = 'charging';
    this.power = 0;
  }

  private fire() {
    const f = this.active;
    f.lastPower = this.power;
    f.setActive(false);
    const m = f.muzzle();
    const targets = this.fighters.filter((x) => x.alive).map((x) => ({ id: x.id, x: x.x, y: x.y }));
    const result = simulateShot(
      { x: m.x, y: m.y, angleDeg: f.angle, facing: f.facing, power: this.power, wind: this.wind },
      this.terrainView.terrain,
      targets,
      f.id,
    );

    const sprite = this.add.image(m.x, m.y, `fx/${f.weapon.projectile}`).setOrigin(0.7, 0.5).setDepth(DEPTH.projectile);
    sprite.setScale(40 / sprite.height);
    this.flight = { result, sprite, elapsed: 0 };
    this.phase = 'flying';
    this.camTarget = null;
    this.cameras.main.startFollow(sprite, true, 0.15, 0.15);
  }

  /** Move the projectile along the pre-computed path */
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
    this.phase = 'resolving';

    const impact = fl.result.impact;
    if (impact) this.explode(impact, fl.result.directHitId);
    else this.hud.banner('พลาด!', '#cccccc');

    this.time.delayedCall(1500, () => this.endTurn());
  }

  private explode(at: Vec, directHitId: string | null) {
    const weapon = this.active.weapon;
    const boom = this.add.sprite(at.x, at.y, 'fx/explosion_0').setDepth(DEPTH.fx);
    boom.setScale((weapon.radius * 2.8) / 256);
    boom.play('explosion');
    this.cameras.main.shake(220, 0.008);

    this.terrainView.carve(at.x, at.y, weapon.radius);
    this.hud.drawMinimap(this.terrainView.terrain);

    for (const f of this.fighters) {
      if (!f.alive) continue;
      const dmg = blastDamage(at, f, weapon.radius, weapon.damage, f.id === directHitId);
      if (dmg <= 0) continue;
      f.takeDamage(dmg);
      this.floatText(f.x, f.y - 120, `-${dmg}`, f.id === directHitId ? '#ffdd33' : '#ff5544');
    }
    if (directHitId) this.hud.banner('โดนเต็ม ๆ!', '#ffdd33');
    this.hud.refreshHp();
  }

  private endTurn() {
    if (this.phase === 'over') return;
    // Wait for anyone still falling
    if (this.fighters.some((f) => f.alive && f.falling)) {
      this.time.delayedCall(200, () => this.endTurn());
      return;
    }
    const alive = this.fighters.filter((f) => f.alive);
    if (alive.length <= 1) {
      this.gameOver(alive[0] ?? null);
      return;
    }
    this.turn++;
    this.startTurn();
  }

  private gameOver(winner: Fighter | null) {
    this.phase = 'over';
    this.fighters.forEach((f) => f.setActive(false));
    winner?.celebrate();
    if (winner) this.followFighter(winner);

    const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.45).setOrigin(0).setScrollFactor(0).setDepth(DEPTH.overlay);
    const title = this.add
      .text(GAME_WIDTH / 2, 220, winner ? `${winner.name} ชนะ!` : 'เสมอ!', {
        fontFamily: FONT_FAMILY,
        fontSize: '64px',
        fontStyle: '700',
        color: '#ffcc33',
        stroke: TEXT_STROKE,
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(DEPTH.overlay);
    const again = addTextButton(this, GAME_WIDTH / 2, 360, 'เล่นอีกครั้ง', () => this.scene.restart());
    const menu = addTextButton(this, GAME_WIDTH / 2, 450, 'กลับเมนู', () => this.scene.start('Menu'), { color: 0x3a8dde });
    for (const o of [again, menu]) o.setScrollFactor(0).setDepth(DEPTH.overlay);
    shade.setAlpha(0);
    title.setScale(0.5);
    this.tweens.add({ targets: shade, alpha: 1, duration: 400 });
    this.tweens.add({ targets: title, scale: 1, duration: 500, ease: 'Back.out' });
  }

  // ---- Per-frame ------------------------------------------------------------

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000;
    const terrain = this.terrainView.terrain;

    for (const f of this.fighters) {
      if (f.settle(terrain, dt)) {
        f.die();
        this.hud.refreshHp();
        this.hud.banner(`${f.name} ตกเหว!`, '#ff8866');
        if (f === this.active && (this.phase === 'aiming' || this.phase === 'charging')) {
          this.phase = 'resolving';
          this.time.delayedCall(1000, () => this.endTurn());
        }
      }
    }

    if (this.phase === 'aiming' || this.phase === 'charging') this.updateTurnInput(dt);
    if (this.phase === 'flying') this.updateFlight(dt);

    const cam = this.cameras.main;
    if (this.camTarget) {
      const goal = this.camTarget.x - GAME_WIDTH / 2;
      cam.scrollX += (goal - cam.scrollX) * Math.min(1, dt * 5);
    }
    this.hud.updateMinimap(terrain.height, cam.scrollX, GAME_WIDTH, this.flight ? this.flight.sprite : null);
  }

  private updateTurnInput(dt: number) {
    const f = this.active;
    this.timeLeft -= dt;
    this.hud.setTimer(this.timeLeft);

    if (this.phase === 'charging') {
      this.power = Math.min(100, this.power + CHARGE_SPEED * dt);
      this.hud.setPower(this.power, f.lastPower);
      if (this.power >= 100 || this.timeLeft <= 0) this.fire();
      return;
    }

    if (this.timeLeft <= 0) {
      this.phase = 'resolving';
      f.setActive(false);
      this.hud.banner('หมดเวลา!', '#ff8866');
      this.time.delayedCall(900, () => this.endTurn());
      return;
    }

    const move = this.controls.moveDir;
    if (move !== 0) {
      if (this.walkLeft > 0 && !f.falling) {
        const step = Math.min(WALK_SPEED * dt, this.walkLeft);
        if (f.walk(move, step, this.terrainView.terrain)) this.walkLeft -= step;
        this.hud.setStamina(this.walkLeft / WALK_PER_TURN);
      } else if (f.facing !== move) {
        f.facing = move; // can always turn around
        f.sync();
      }
      if (!this.panning) this.followFighter(f);
    }

    const aim = this.controls.aimDir;
    if (aim !== 0) {
      f.angle = Phaser.Math.Clamp(f.angle + aim * AIM_SPEED * dt, 0, 90);
      f.sync();
      this.hud.setAngle(f.angle);
    }
  }

  // ---- Camera ---------------------------------------------------------------

  private followFighter(f: Fighter) {
    this.cameras.main.stopFollow();
    this.camTarget = f;
  }

  /** Drag on empty space to look around the map */
  private setupCameraDrag() {
    let lastX = 0;
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0 || this.phase === 'flying') return;
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

  private floatText(x: number, y: number, text: string, color: string) {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT_FAMILY, fontSize: '40px', fontStyle: '700', color, stroke: TEXT_STROKE, strokeThickness: 7 })
      .setOrigin(0.5)
      .setDepth(DEPTH.overlay);
    this.tweens.add({ targets: t, y: y - 70, alpha: 0, duration: 1300, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }
}
