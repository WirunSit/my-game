import * as Phaser from 'phaser';
import type { Vec } from '@sciboom/shared';
import { DEPTH } from '../config';

const SIZE = 54;
/** A shell this close to the crate's centre goes through it */
const HIT_RADIUS = SIZE / 2 + 8;

/**
 * Mystery "?" crate floating in the air where shots fly. Shoot through it (the
 * shell keeps going) to collect it: after the shot, one question per crate,
 * and every right answer gives a power-up.
 */
export class Crate {
  opened = false;
  private readonly img: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Arc;

  constructor(
    private readonly scene: Phaser.Scene,
    public x: number,
    public y: number,
  ) {
    this.glow = scene.add.circle(x, y, SIZE * 0.75, 0xffe066, 0.22).setDepth(DEPTH.fighter - 2);
    this.img = scene.add.image(x, y, 'ui/crate').setDepth(DEPTH.fighter - 1);
    const scale = SIZE / this.img.height;
    // Pop in, then bob gently and pulse its glow
    this.img.setScale(0);
    scene.tweens.add({ targets: this.img, scale, duration: 400, ease: 'Back.out' });
    scene.tweens.add({ targets: [this.img, this.glow], y: y - 8, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.inOut', delay: Math.random() * 600 });
    scene.tweens.add({ targets: this.img, angle: { from: -5, to: 5 }, duration: 1600, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
    scene.tweens.add({ targets: this.glow, alpha: 0.08, scale: 1.2, duration: 900, yoyo: true, repeat: -1 });
  }

  /** Centre of the crate right now (it bobs) */
  get centerY(): number {
    return this.img.y;
  }

  /** Does a shell moving from a to b pass through this crate? */
  touchedBy(a: Vec, b: Vec): boolean {
    if (this.opened) return false;
    const cy = this.centerY;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((this.x - a.x) * dx + (cy - a.y) * dy) / len2)) : 0;
    return Math.hypot(a.x + dx * t - this.x, a.y + dy * t - cy) <= HIT_RADIUS;
  }

  /** Burst open with sparkles */
  open() {
    if (this.opened) return;
    this.opened = true;
    this.scene.tweens.killTweensOf([this.img, this.glow]);
    this.glow.destroy();
    const spark = this.scene.add.image(this.x, this.centerY, 'fx/fx_spark').setDepth(DEPTH.fx);
    spark.setScale(0.2);
    this.scene.tweens.add({ targets: spark, scale: 0.8, alpha: 0, angle: 90, duration: 600, onComplete: () => spark.destroy() });
    this.scene.tweens.add({
      targets: this.img,
      y: this.centerY - 50,
      scale: this.img.scale * 1.4,
      alpha: 0,
      angle: 40,
      duration: 500,
      ease: 'Quad.out',
      onComplete: () => this.img.destroy(),
    });
  }
}
