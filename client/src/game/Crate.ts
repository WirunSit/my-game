import * as Phaser from 'phaser';
import { WORLD_HEIGHT, type Terrain } from '@sciboom/shared';
import { DEPTH } from '../config';

const SIZE = 50;

/** "?" crate sitting on the ground. Blow it up to get a question (and maybe an item). */
export class Crate {
  opened = false;
  private vy = 0;
  private readonly img: Phaser.GameObjects.Image;

  constructor(
    private readonly scene: Phaser.Scene,
    public x: number,
    public y: number,
  ) {
    this.img = scene.add.image(x, y, 'ui/crate').setOrigin(0.5, 1).setDepth(DEPTH.fighter - 1);
    this.img.setScale(SIZE / this.img.height);
    // Pop in
    this.img.setScale(0);
    scene.tweens.add({ targets: this.img, scale: SIZE / this.img.height, duration: 400, ease: 'Back.out' });
  }

  /** Centre of the crate, for blast checks */
  get centerY(): number {
    return this.y - SIZE / 2;
  }

  /** Fall when the ground under it is blown away. Returns true if it fell off the map. */
  settle(terrain: Terrain, dt: number): boolean {
    if (this.opened) return false;
    const ground = terrain.groundBelow(this.x, this.y - 10);
    if (ground === null || ground > this.y + 1) {
      this.vy += 1400 * dt;
      this.y += this.vy * dt;
      if (ground !== null && this.y >= ground) {
        this.y = ground;
        this.vy = 0;
      }
    } else {
      this.y = ground;
      this.vy = 0;
    }
    this.img.y = this.y;
    if (this.y > WORLD_HEIGHT + 60) {
      this.opened = true;
      this.img.destroy();
      return true;
    }
    return false;
  }

  /** Burst open with sparkles */
  open() {
    if (this.opened) return;
    this.opened = true;
    const spark = this.scene.add.image(this.x, this.centerY, 'fx/fx_spark').setDepth(DEPTH.fx);
    spark.setScale(0.2);
    this.scene.tweens.add({ targets: spark, scale: 0.7, alpha: 0, angle: 90, duration: 600, onComplete: () => spark.destroy() });
    this.scene.tweens.add({
      targets: this.img,
      y: this.y - 60,
      alpha: 0,
      angle: 30,
      duration: 500,
      ease: 'Quad.out',
      onComplete: () => this.img.destroy(),
    });
  }
}
