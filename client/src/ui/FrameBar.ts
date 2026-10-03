import * as Phaser from 'phaser';

/**
 * Where the coloured part goes inside a bar frame picture, in the picture's own
 * pixels (measured from the art). The ends of the hole are half-ellipses.
 */
export interface BarFrameSpec {
  key: string;
  /** Width of each end piece that must not be stretched */
  cap: number;
  /** Hole: distance from the picture's left/right edge, top, height, and how far the round ends reach in */
  hole: { inset: number; top: number; height: number; rx: number };
}

export const BAR_FRAMES = {
  hp: { key: 'ui/bar_hp', cap: 60, hole: { inset: 22, top: 20, height: 58, rx: 22 } },
  power: { key: 'ui/bar_power', cap: 62, hole: { inset: 25, top: 21, height: 61, rx: 24 } },
} satisfies Record<string, BarFrameSpec>;

/** Steps used to draw each round end */
const ARC_STEPS = 14;

/**
 * A bar in a picture frame (HP, power…) of any width: the frame's round ends
 * keep their shape (only the middle stretches), and the coloured fill follows
 * the hole's round ends exactly, at every fill level.
 */
export class FrameBar {
  readonly objects: (Phaser.GameObjects.Image | Phaser.GameObjects.Graphics)[];
  /** The hole on screen (where the fill can go) */
  readonly holeX: number;
  readonly holeW: number;
  private readonly holeY: number;
  private readonly holeH: number;
  private readonly rx: number;
  private readonly fill: Phaser.GameObjects.Graphics;
  private readonly frameParts: Phaser.GameObjects.Image[];

  /** (x, y) is the centre; `height` sets the scale, `width` how long it is */
  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, spec: BarFrameSpec) {
    const tex = scene.textures.get(spec.key);
    // The whole picture (not tex.get(): its default frame changes once the pieces below are added)
    const src = tex.source[0];
    const W = src.width;
    const H = src.height;
    // Three pieces of the picture: left end, middle (stretched), right end
    if (!tex.has('left')) {
      tex.add('left', 0, 0, 0, spec.cap, H);
      tex.add('mid', 0, spec.cap, 0, W - 2 * spec.cap, H);
      tex.add('right', 0, W - spec.cap, 0, spec.cap, H);
    }
    const s = height / H;
    const capW = spec.cap * s;
    const left = x - width / 2;
    const midW = Math.max(1, width - 2 * capW);
    const l = scene.add.image(left, y, spec.key, 'left').setOrigin(0, 0.5).setScale(s);
    // The middle overlaps the ends by a pixel so no seam shows
    const m = scene.add.image(left + capW - 1, y, spec.key, 'mid').setOrigin(0, 0.5).setScale((midW + 2) / (W - 2 * spec.cap), s);
    const r = scene.add.image(left + width - capW, y, spec.key, 'right').setOrigin(0, 0.5).setScale(s);
    this.frameParts = [m, l, r];

    this.holeX = left + spec.hole.inset * s;
    this.holeW = width - 2 * spec.hole.inset * s;
    this.holeY = y - height / 2 + spec.hole.top * s;
    this.holeH = spec.hole.height * s;
    this.rx = spec.hole.rx * s;
    this.fill = scene.add.graphics();
    this.objects = [...this.frameParts, this.fill];
  }

  /** Fill 0–1 of the hole with a colour (with a glossy band on top, like the frame) */
  setFill(frac: number, color: number) {
    const g = this.fill;
    g.clear();
    const f = Math.max(0, Math.min(1, frac));
    if (f <= 0) return;
    const right = this.holeX + this.holeW * f;
    g.fillStyle(color, 1).fillPoints(this.shape(this.holeY, this.holeH, right), true);
    // Shine on the upper part, darker edge at the bottom
    g.fillStyle(0xffffff, 0.28).fillPoints(this.shape(this.holeY + this.holeH * 0.12, this.holeH * 0.3, right, 0.85), true);
    g.fillStyle(0x000000, 0.14).fillPoints(this.shape(this.holeY + this.holeH * 0.72, this.holeH * 0.28, right), true);
  }

  /**
   * Outline of the hole's shape between top and top+h (round ends follow the
   * hole's half-ellipses), cut off at x = right.
   */
  private shape(top: number, h: number, right: number, inset = 1): Phaser.Math.Vector2[] {
    const cy = this.holeY + this.holeH / 2;
    const ry = this.holeH / 2;
    const x0 = this.holeX;
    const x1 = this.holeX + this.holeW;
    // How far in the hole's edge is at height y
    const edge = (y: number) => {
      const d = Math.min(1, Math.abs(y - cy) / ry);
      return this.rx * (1 - Math.sqrt(1 - d * d)) * inset + this.rx * (1 - inset);
    };
    const pts: Phaser.Math.Vector2[] = [];
    // Down the left side, then up the right side, cut at `right` (never left of the left side)
    for (let i = 0; i <= ARC_STEPS; i++) {
      const y = top + (h * i) / ARC_STEPS;
      pts.push(new Phaser.Math.Vector2(x0 + edge(y), y));
    }
    for (let i = ARC_STEPS; i >= 0; i--) {
      const y = top + (h * i) / ARC_STEPS;
      pts.push(new Phaser.Math.Vector2(Math.max(x0 + edge(y), Math.min(right, x1 - edge(y))), y));
    }
    return pts;
  }
}
