// Beginner help that fades out as the player levels up (like Boom Z):
// a dotted guide showing the start of the shot's path, and gentler wind.
import type { Vec } from './physics';

/** Guide length at Lv1 and from GUIDE_LEVEL_END on (just a short aiming hint) */
const GUIDE_START = 900;
const GUIDE_END = 120;
const GUIDE_LEVEL_END = 20;

/** Wind strength multiplier at Lv1; full wind from WIND_LEVEL_END on */
const WIND_START = 0.3;
const WIND_LEVEL_END = 15;

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));

/** How much of the shot's path (px, measured along the curve) the dotted guide shows */
export function aimGuideLength(level: number): number {
  return Math.round(lerp(GUIDE_START, GUIDE_END, (level - 1) / (GUIDE_LEVEL_END - 1)));
}

/** Multiplier for the random wind each turn: 0.3 at Lv1 rising to 1 at Lv15 */
export function windFactor(level: number): number {
  return lerp(WIND_START, 1, (level - 1) / (WIND_LEVEL_END - 1));
}

/** The first `length` px of a path (cut part-way through the last segment) */
export function pathPrefix(path: Vec[], length: number): Vec[] {
  if (path.length === 0) return [];
  const out: Vec[] = [path[0]];
  let left = length;
  for (let i = 1; i < path.length && left > 0; i++) {
    const a = path[i - 1];
    const b = path[i];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    if (d <= left) {
      out.push(b);
      left -= d;
    } else {
      const t = left / d;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      left = 0;
    }
  }
  return out;
}
