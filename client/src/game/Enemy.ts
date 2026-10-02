import * as Phaser from 'phaser';
import { WORLD_HEIGHT, type ShotTarget, type Terrain, type Vec, type WeaponStats } from '@sciboom/shared';
import { DEPTH, FONT_FAMILY, TEXT_STROKE } from '../config';
import type { Combatant } from './Combatant';

const FALL_GRAVITY = 1400;

export interface EnemyConfig {
  /** Texture key, e.g. 'bosses/mixtron' (art faces LEFT) */
  texture: string;
  name: string;
  /** On-screen height in px */
  height: number;
  hp: number;
  /** Hit circle: radius and how far above the feet its centre is */
  hitRadius: number;
  hitOffsetY: number;
  weapon: WeaponStats;
  /** Aiming skill 0–1 for the first shot (it improves after each miss) */
  skill: number;
  /** Where shots come out, relative to the feet (for a left-facing enemy) */
  muzzle: Vec;
}

/** Computer-controlled minion or boss */
export class Enemy implements Combatant {
  readonly color = 0xff4d4d;
  readonly maxHp: number;
  hp: number;
  alive = true;
  hidden = false;
  angle = 50;
  facing: 1 | -1 = -1;
  lastPower: number | null = null;
  weapon: WeaponStats;
  private vy = 0;

  private readonly root: Phaser.GameObjects.Container;
  private readonly body: Phaser.GameObjects.Image;
  private readonly nameTag: Phaser.GameObjects.Text;
  private readonly baseScale: number;
  private chargeFx?: Phaser.GameObjects.Image;
  private stunStars: Phaser.GameObjects.Image[] = [];
  private breathing: Phaser.Tweens.Tween;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly id: string,
    readonly config: EnemyConfig,
    public x: number,
    public y: number,
  ) {
    this.maxHp = config.hp;
    this.hp = config.hp;
    this.weapon = config.weapon;

    this.body = scene.add.image(0, 0, config.texture).setOrigin(0.5, 1);
    this.baseScale = config.height / this.body.height;
    this.body.setScale(this.baseScale);
    this.root = scene.add.container(x, y, [this.body]).setDepth(DEPTH.fighter);
    this.nameTag = scene.add
      .text(x, y - config.height - 10, config.name, {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        color: '#ffdddd',
        stroke: TEXT_STROKE,
        strokeThickness: 5,
        padding: { top: 6 },
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.fighter);

    // Gentle idle "breathing" so the monster feels alive
    this.breathing = scene.tweens.add({
      targets: this.body,
      scaleY: this.baseScale * 1.04,
      scaleX: this.baseScale * 0.98,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
  }

  get name(): string {
    return this.config.name;
  }

  get height(): number {
    return this.config.height;
  }

  get portraitKey(): string {
    return this.config.texture;
  }

  get falling(): boolean {
    return this.vy > 0;
  }

  toTarget(): ShotTarget {
    return { id: this.id, x: this.x, y: this.y, radius: this.config.hitRadius, offsetY: this.config.hitOffsetY };
  }

  muzzle(): Vec {
    return { x: this.x + this.config.muzzle.x * -this.facing, y: this.y + this.config.muzzle.y };
  }

  setActive(_active: boolean) {}

  settle(terrain: Terrain, dt: number): boolean {
    if (!this.alive) return false;
    const ground = terrain.groundBelow(this.x, this.y - 30);
    if (ground === null || ground > this.y + 1) {
      this.vy += FALL_GRAVITY * dt;
      this.y += this.vy * dt;
      if (ground !== null && this.y >= ground) {
        this.y = ground;
        this.vy = 0;
      }
    } else {
      this.y = ground;
      this.vy = 0;
    }
    this.sync();
    return this.y > WORLD_HEIGHT + 120;
  }

  sync() {
    this.root.setPosition(this.x, this.y);
    this.body.setFlipX(this.facing === 1);
    this.nameTag.setPosition(this.x, this.y - this.config.height - 6);
    this.stunStars.forEach((s, i) => s.setPosition(this.x + (i - 1) * 34, this.y - this.config.height - 40));
  }

  takeDamage(amount: number) {
    this.hp = Math.max(0, this.hp - amount);
    // Flash and shake
    this.scene.tweens.add({ targets: this.body, alpha: 0.35, duration: 70, yoyo: true, repeat: 3 });
    this.scene.tweens.add({ targets: this.root, x: this.x + 10, duration: 50, yoyo: true, repeat: 3, onComplete: () => this.sync() });
    if (this.hp <= 0) this.die();
  }

  die() {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.stopCharge();
    this.clearStun();
    this.breathing.stop();
    this.scene.tweens.add({ targets: this.root, angle: 85, alpha: 0, y: this.y + 40, duration: 1100, ease: 'Quad.in' });
    this.scene.tweens.add({ targets: this.nameTag, alpha: 0, duration: 600 });
  }

  celebrate() {
    this.stopCharge();
    this.scene.tweens.add({ targets: this.root, y: this.y - 30, duration: 300, yoyo: true, repeat: -1, ease: 'Quad.out' });
  }

  /** Glowing aura while charging an ultimate */
  startCharge() {
    if (this.chargeFx) return;
    this.chargeFx = this.scene.add.image(0, -this.config.height / 2, 'fx/fx_spark').setAlpha(0.8);
    this.chargeFx.setScale((this.config.height * 1.3) / this.chargeFx.height);
    this.root.addAt(this.chargeFx, 0);
    this.scene.tweens.add({ targets: this.chargeFx, angle: 360, duration: 1400, repeat: -1 });
    this.scene.tweens.add({ targets: this.chargeFx, alpha: 0.35, duration: 300, yoyo: true, repeat: -1 });
  }

  stopCharge() {
    if (!this.chargeFx) return;
    this.scene.tweens.killTweensOf(this.chargeFx);
    this.chargeFx.destroy();
    this.chargeFx = undefined;
  }

  /** Dizzy stars over the head (after a question interrupts the ultimate) */
  showStun() {
    this.clearStun();
    for (let i = 0; i < 3; i++) {
      const star = this.scene.add.image(0, 0, 'ui/star').setDepth(DEPTH.fx);
      star.setScale(30 / star.height);
      this.scene.tweens.add({ targets: star, angle: 360, duration: 900, repeat: -1 });
      this.stunStars.push(star);
    }
    this.sync();
  }

  clearStun() {
    this.stunStars.forEach((s) => s.destroy());
    this.stunStars = [];
  }

  /** Little lean-back before firing */
  windUp(): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.body,
        angle: 8 * -this.facing,
        duration: 220,
        yoyo: true,
        ease: 'Quad.out',
        onComplete: () => resolve(),
      });
    });
  }
}
