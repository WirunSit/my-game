import { Rng } from './rng';

export const WORLD_WIDTH = 2000;
export const WORLD_HEIGHT = 720;

/**
 * Destructible ground stored as a 1-byte-per-pixel mask (1 = solid).
 * Pure data — the client draws it, the server only needs the mask.
 */
export class Terrain {
  readonly width: number;
  readonly height: number;
  readonly mask: Uint8Array;

  constructor(width = WORLD_WIDTH, height = WORLD_HEIGHT) {
    this.width = width;
    this.height = height;
    this.mask = new Uint8Array(width * height);
  }

  /** Rolling hills with cliffs at both edges, shaped by the seed */
  static generate(seed: number, width = WORLD_WIDTH, height = WORLD_HEIGHT): Terrain {
    const t = new Terrain(width, height);
    const rng = new Rng(seed);
    const waves = Array.from({ length: 4 }, (_, i) => ({
      amp: rng.range(18, 55) / (i + 1),
      freq: rng.range(0.6, 1.4) * (i + 1) * 0.0035,
      phase: rng.range(0, Math.PI * 2),
    }));
    const base = height * 0.68;
    const edge = 70; // empty columns at each side: walk off and you fall
    for (let x = edge; x < width - edge; x++) {
      let y = base;
      for (const w of waves) y += Math.sin(x * w.freq + w.phase) * w.amp;
      // A raised hill in the middle so straight shots are blocked
      const mid = (x - width / 2) / (width * 0.12);
      y -= 110 * Math.exp(-mid * mid);
      const top = Math.max(120, Math.min(height - 60, Math.round(y)));
      for (let yy = top; yy < height; yy++) t.mask[yy * width + x] = 1;
    }
    return t;
  }

  /** Independent copy (battle rules simulate on a copy, the screen catches up later) */
  clone(): Terrain {
    const t = new Terrain(this.width, this.height);
    t.mask.set(this.mask);
    return t;
  }

  /**
   * Run-length encoding of the mask: alternating counts of empty and solid
   * pixels, row by row. A fresh map is ~3 KB of JSON; it lets the PvP server
   * send the exact same ground to both players.
   */
  encode(): number[] {
    const runs: number[] = [];
    let value = 0;
    let count = 0;
    for (let i = 0; i < this.mask.length; i++) {
      if (this.mask[i] === value) count++;
      else {
        runs.push(count);
        value = this.mask[i];
        count = 1;
      }
    }
    runs.push(count);
    return runs;
  }

  static decode(runs: number[], width = WORLD_WIDTH, height = WORLD_HEIGHT): Terrain {
    const t = new Terrain(width, height);
    let i = 0;
    runs.forEach((n, k) => {
      if (k % 2 === 1) t.mask.fill(1, i, i + n);
      i += n;
    });
    return t;
  }

  isSolid(x: number, y: number): boolean {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || xi >= this.width || yi < 0 || yi >= this.height) return false;
    return this.mask[yi * this.width + xi] === 1;
  }

  /** First solid pixel at or below fromY in column x, or null if it's a bottomless drop */
  groundBelow(x: number, fromY: number): number | null {
    const xi = Math.floor(x);
    if (xi < 0 || xi >= this.width) return null;
    for (let y = Math.max(0, Math.floor(fromY)); y < this.height; y++) {
      if (this.mask[y * this.width + xi]) return y;
    }
    return null;
  }

  /** Remove a circle of ground (an explosion crater) */
  carve(cx: number, cy: number, radius: number): void {
    const r2 = radius * radius;
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(this.width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(this.height - 1, Math.ceil(cy + radius));
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2) this.mask[y * this.width + x] = 0;
      }
    }
  }
}
