import { BODY_OFFSET_Y, simulateShot, type ShotTarget, type Vec } from './physics';
import type { Rng } from './rng';
import type { Terrain } from './terrain';

export interface AimPlan {
  angle: number;
  power: number;
}

/**
 * Computer aiming: try many angle/power pairs, keep the one that lands closest to
 * the target, then add a human-like error. `skill` 0 = sloppy, 1 = near-perfect.
 * The muzzle is treated as fixed (enemies shoot from their mouth/hands).
 */
export function planShot(
  muzzle: Vec,
  facing: 1 | -1,
  target: ShotTarget,
  wind: number,
  terrain: Terrain,
  targets: ShotTarget[],
  shooterId: string,
  skill: number,
  rng: Rng,
): AimPlan {
  const ty = target.y - (target.offsetY ?? BODY_OFFSET_Y);
  let best: AimPlan = { angle: 45, power: 60 };
  let bestScore = Infinity;
  for (let angle = 20; angle <= 80; angle += 4) {
    for (let power = 20; power <= 100; power += 2) {
      const r = simulateShot({ x: muzzle.x, y: muzzle.y, angleDeg: angle, facing, power, wind }, terrain, targets, shooterId);
      let score: number;
      if (r.directHitId === target.id) score = 0;
      else if (r.impact) score = Math.hypot(r.impact.x - target.x, r.impact.y - ty);
      else score = 5000;
      // Prefer higher arcs a little: they look more like a lob from a monster
      score += (80 - angle) * 0.2;
      if (score < bestScore) {
        bestScore = score;
        best = { angle, power };
      }
    }
  }
  const s = Math.max(0, Math.min(1, skill));
  const powerError = (1 - s) * 9;
  const angleError = (1 - s) * 6;
  return {
    angle: Math.max(10, Math.min(85, best.angle + rng.range(-angleError, angleError))),
    power: Math.max(10, Math.min(100, best.power + rng.range(-powerError, powerError))),
  };
}

/** How computer enemies sharpen their aim during a fight (like players do), and the limit */
export const ENEMY_AIM = {
  /** Better after each miss */
  missStep: 0.12,
  /** A little worse again after a hit (never below the stage's starting skill) */
  hitStep: 0.1,
  max: 0.85,
};

export function nextEnemySkill(current: number, base: number, hit: boolean): number {
  return hit ? Math.max(base, current - ENEMY_AIM.hitStep) : Math.min(ENEMY_AIM.max, current + ENEMY_AIM.missStep);
}
