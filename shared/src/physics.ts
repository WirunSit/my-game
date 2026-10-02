import type { Terrain } from './terrain';

// ---- Tuning ----------------------------------------------------------------
/** Downward acceleration, px/s² */
export const GRAVITY = 500;
/** Launch speed per point of power (power 100 → 1000 px/s ≈ 2000 px range at 45°) */
export const POWER_TO_SPEED = 10;
/** Sideways acceleration per point of wind, px/s² */
export const WIND_TO_ACCEL = 6;
export const MAX_WIND = 10;
/** Simulation step: 60 steps per second */
export const STEP = 1 / 60;
/** Give up after this long (shot lost in the sky) */
const MAX_FLIGHT_SECONDS = 12;

/** Player body for hit tests: a circle centred this far above the feet */
export const BODY_OFFSET_Y = 38;
export const BODY_RADIUS = 30;

export interface Vec {
  x: number;
  y: number;
}

export interface ShotInput {
  /** Muzzle position */
  x: number;
  y: number;
  /** 0 = flat, 90 = straight up */
  angleDeg: number;
  /** 1 = facing right, -1 = facing left */
  facing: 1 | -1;
  /** 0–100 */
  power: number;
  /** -MAX_WIND..MAX_WIND, positive pushes right */
  wind: number;
}

export interface ShotTarget {
  id: string;
  /** Feet position */
  x: number;
  y: number;
  /** Hit circle size and height above the feet (default: a normal player) */
  radius?: number;
  offsetY?: number;
}

export interface ShotResult {
  /** Projectile position at every simulation step */
  path: Vec[];
  /** Where it exploded; null if it left the map */
  impact: Vec | null;
  /** Player hit directly, if any */
  directHitId: string | null;
}

/**
 * Fly a projectile step by step until it hits ground, a player, or leaves the map.
 * Deterministic: the same input always produces the same path.
 */
export function simulateShot(input: ShotInput, terrain: Terrain, targets: ShotTarget[], shooterId: string): ShotResult {
  const rad = (input.angleDeg * Math.PI) / 180;
  const speed = input.power * POWER_TO_SPEED;
  let x = input.x;
  let y = input.y;
  let vx = Math.cos(rad) * speed * input.facing;
  let vy = -Math.sin(rad) * speed;
  const ax = input.wind * WIND_TO_ACCEL;
  const path: Vec[] = [{ x, y }];
  const maxSteps = MAX_FLIGHT_SECONDS / STEP;

  for (let i = 0; i < maxSteps; i++) {
    const nx = x + vx * STEP;
    const ny = y + vy * STEP;
    vx += ax * STEP;
    vy += GRAVITY * STEP;

    // Check the segment in ~2px slices so fast shots can't tunnel through thin ground
    const slices = Math.max(1, Math.ceil(Math.hypot(nx - x, ny - y) / 2));
    for (let s = 1; s <= slices; s++) {
      const px = x + ((nx - x) * s) / slices;
      const py = y + ((ny - y) * s) / slices;
      // Ignore the shooter for the first moments so the shot can leave the barrel
      const ignoreShooter = i < 12;
      for (const t of targets) {
        if (ignoreShooter && t.id === shooterId) continue;
        const r = t.radius ?? BODY_RADIUS;
        const dx = px - t.x;
        const dy = py - (t.y - (t.offsetY ?? BODY_OFFSET_Y));
        if (dx * dx + dy * dy <= r * r) {
          path.push({ x: px, y: py });
          return { path, impact: { x: px, y: py }, directHitId: t.id };
        }
      }
      if (terrain.isSolid(px, py)) {
        path.push({ x: px, y: py });
        return { path, impact: { x: px, y: py }, directHitId: null };
      }
    }

    x = nx;
    y = ny;
    path.push({ x, y });
    // Fell below the map or flew far off the sides
    if (y > terrain.height + 50 || x < -400 || x > terrain.width + 400) {
      return { path, impact: null, directHitId: null };
    }
  }
  return { path, impact: null, directHitId: null };
}

/** Damage a player takes from an explosion: full at the centre, fading to 0 at the edge */
export function blastDamage(impact: Vec, target: ShotTarget, radius: number, damage: number, direct: boolean): number {
  const dx = impact.x - target.x;
  const dy = impact.y - (target.y - (target.offsetY ?? BODY_OFFSET_Y));
  const reach = radius + (target.radius ?? BODY_RADIUS);
  const dist = Math.hypot(dx, dy);
  if (dist >= reach) return 0;
  const falloff = 1 - dist / reach;
  // Full damage inside the inner ~25% of the blast, then a smooth fade to 0 at the edge
  const dmg = damage * Math.min(1, falloff * 1.3) * (direct ? 1.2 : 1);
  return Math.round(dmg);
}
