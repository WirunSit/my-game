// The battle rules in one place, used by the game (stages, 2 players on one
// device) and by the PvP server. A shot goes in; a timeline comes out: every
// projectile's path and every explosion, hit, burn, push, teleport and heal,
// stamped with the simulation step it happens on. The game plays the timeline
// back as animation; the server just keeps the result.
import { BODY_OFFSET_Y, BODY_RADIUS, blastDamage, type ShotInput, type ShotTarget, type Vec } from './physics';
import {
  BURN_DAMAGE,
  BURN_TURNS,
  DRAIN_SHARE,
  GAUGE_HIT,
  GAUGE_HURT,
  GAUGE_MAX,
  ITEM_SKILLS,
  PUSH_DISTANCE,
  SPECIAL_COOLDOWN,
  freshItemUses,
  planVolley,
  strikeBolt,
  type ItemSkill,
  type Projectile,
  type ShotMode,
  type SpecialKind,
} from './skills';
import { WORLD_WIDTH, type Terrain } from './terrain';

// ---- Fighter body ------------------------------------------------------------------

export const FIGHTER_HP = 1000;
export const TURN_SECONDS = 20;
/** px of walking allowed per turn */
export const WALK_PER_TURN = 220;
/** Highest step a fighter can walk up, px */
export const CLIMB = 20;
/** Hand position relative to the feet, for a fighter facing right */
export const HAND_X = 26;
export const HAND_Y = -56;
const MUZZLE_DISTANCE = 46;

/** Where a fighter's shot leaves the barrel */
export function fighterMuzzle(x: number, y: number, facing: 1 | -1, angleDeg: number): Vec {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: x + facing * (HAND_X + Math.cos(rad) * MUZZLE_DISTANCE), y: y + HAND_Y - Math.sin(rad) * MUZZLE_DISTANCE };
}

/** Anyone on the battlefield, as the rules see them */
export interface Unit {
  id: string;
  /** Feet position */
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  /** Hit circle */
  radius: number;
  offsetY: number;
  /** Turns of burning left */
  burn: number;
}

export function unitTarget(u: Unit): ShotTarget {
  return { id: u.id, x: u.x, y: u.y, radius: u.radius, offsetY: u.offsetY };
}

export function newFighterUnit(id: string, x: number, y: number): Unit {
  return { id, x, y, hp: FIGHTER_HP, maxHp: FIGHTER_HP, alive: true, radius: BODY_RADIUS, offsetY: BODY_OFFSET_Y, burn: 0 };
}

// ---- Shot timeline ------------------------------------------------------------------

export interface Hit {
  id: string;
  damage: number;
  direct: boolean;
  /** Damage was lowered by something (e.g. a shield) */
  reduced?: boolean;
  /** Set on fire (burn special) */
  burn?: boolean;
  /** Blown sideways to this x (push special) */
  pushTo?: number;
}

export interface FlightPlan {
  path: Vec[];
  /** Step it starts moving on */
  start: number;
  look: Projectile['look'];
  size: number;
}

export type TimelineEvent =
  | { t: number; kind: 'explode'; flight: number; at: Vec; radius: number; hits: Hit[] }
  | { t: number; kind: 'teleport'; flight: number; id: string; x: number; y: number }
  | { t: number; kind: 'miss'; flight: number }
  | { t: number; kind: 'heal'; id: string; amount: number };

export interface ShotTimeline {
  flights: FlightPlan[];
  /** In time order */
  events: TimelineEvent[];
  /** Last step of the whole shot */
  end: number;
}

export interface ShotRequest {
  shooterId: string;
  input: ShotInput;
  mode: ShotMode;
  /** The weapon's special (only used when mode is 'special') */
  special: SpecialKind | null;
  damage: number;
  radius: number;
  /** Quiz bonus etc. */
  damageMul: number;
}

export interface ShotHooks {
  /** Change damage before it lands (shields) */
  modifyDamage?: (targetId: string, damage: number) => number;
}

/** A lightning bolt starts this many steps after the shell it follows lands */
const BOLT_DELAY = 25;

/**
 * Work out everything a shot does. `units` are updated in place (hp, alive,
 * burn, position); the terrain is NOT touched — the craters are applied to a
 * copy, returned as `terrain`, and listed in the explode events.
 */
export function resolveShot(terrain: Terrain, units: Unit[], req: ShotRequest, hooks: ShotHooks = {}): ShotTimeline & { terrain: Terrain } {
  const sim = terrain.clone();
  const byId = new Map(units.map((u) => [u.id, u]));
  const shooter = byId.get(req.shooterId);
  const targets = () => units.filter((u) => u.alive).map(unitTarget);
  const flights: FlightPlan[] = [];
  const events: TimelineEvent[] = [];
  const queue: { proj: Projectile; index: number; landAt: number }[] = [];

  const add = (proj: Projectile, start: number) => {
    const index = flights.length;
    flights.push({ path: proj.result.path, start, look: proj.look, size: proj.size });
    queue.push({ proj, index, landAt: start + proj.result.path.length - 1 });
  };
  for (const p of planVolley(req.mode, req.special, req.input, sim, targets(), req.shooterId)) add(p, p.delay);
  const single = queue.length === 1;
  const allHits: Hit[] = [];

  while (queue.length > 0) {
    queue.sort((a, b) => a.landAt - b.landAt);
    const { proj, index, landAt: t } = queue.shift()!;
    const { impact, directHitId } = proj.result;

    if (proj.look === 'plane') {
      if (impact && shooter) {
        shooter.x = Math.max(0, Math.min(WORLD_WIDTH - 1, impact.x));
        shooter.y = impact.y - 2;
        events.push({ t, kind: 'teleport', flight: index, id: shooter.id, x: shooter.x, y: shooter.y });
      } else {
        events.push({ t, kind: 'miss', flight: index });
      }
      continue;
    }
    if (!proj.explodes) continue;
    if (!impact) {
      if (single) events.push({ t, kind: 'miss', flight: index });
      continue;
    }

    const damage = req.damage * proj.damageMul * req.damageMul;
    const radius = Math.round(req.radius * proj.radiusMul);
    const special = proj.look === 'bolt' ? null : req.special;
    sim.carve(impact.x, impact.y, radius);
    const hits: Hit[] = [];
    for (const u of units) {
      if (!u.alive) continue;
      const direct = u.id === directHitId;
      const raw = Math.round(blastDamage(impact, unitTarget(u), radius, damage, direct));
      if (raw <= 0) continue;
      const dmg = hooks.modifyDamage ? hooks.modifyDamage(u.id, raw) : raw;
      const hit: Hit = { id: u.id, damage: dmg, direct };
      if (dmg < raw) hit.reduced = true;
      u.hp = Math.max(0, u.hp - dmg);
      if (u.hp <= 0) u.alive = false;
      if (u.id !== req.shooterId && u.alive) {
        if (special === 'burn') {
          u.burn = BURN_TURNS;
          hit.burn = true;
        }
        if (special === 'push') {
          u.x = pushedX(sim, u, impact, radius);
          hit.pushTo = u.x;
        }
      }
      hits.push(hit);
    }
    allHits.push(...hits);
    events.push({ t, kind: 'explode', flight: index, at: impact, radius, hits });
    // Lightning special: a bolt follows onto the same spot
    if (req.special === 'strike' && proj.look !== 'bolt') add(strikeBolt(impact, sim, targets(), req.shooterId), t + BOLT_DELAY);
  }

  let end = Math.max(0, ...flights.map((f) => f.start + f.path.length - 1), ...events.map((e) => e.t));
  // Chlorophyll / osmosis: get back part of the damage dealt to others
  if (req.special === 'drain' && shooter?.alive) {
    const dealt = allHits.filter((h) => h.id !== req.shooterId).reduce((a, h) => a + h.damage, 0);
    const amount = Math.min(shooter.maxHp - shooter.hp, Math.round(dealt * DRAIN_SHARE));
    if (amount > 0) {
      shooter.hp += amount;
      end += 10;
      events.push({ t: end, kind: 'heal', id: shooter.id, amount });
    }
  }

  settleUnits(sim, units);
  return { flights, events, end, terrain: sim };
}

/** Tornado special: slide the target away from the blast until a hill stops it (big bosses move less) */
function pushedX(terrain: Terrain, u: Unit, from: Vec, radius: number): number {
  const dir = Math.sign(u.x - from.x) || 1;
  const near = Math.max(0.3, 1 - Math.abs(u.x - from.x) / (radius + u.radius));
  const dist = PUSH_DISTANCE * near * Math.min(1, BODY_RADIUS / u.radius);
  const goal = Math.max(0, Math.min(WORLD_WIDTH - 1, u.x + dir * dist));
  let x = u.x;
  while (Math.abs(goal - x) >= 4 && !terrain.isSolid(x + dir * 4, u.y - 24)) x += dir * 4;
  return x;
}

/** Drop everyone onto the ground; anyone with nothing below falls off the map */
export function settleUnits(terrain: Terrain, units: Unit[]) {
  for (const u of units) {
    if (!u.alive) continue;
    const ground = terrain.groundBelow(u.x, u.y - CLIMB);
    if (ground === null) {
      u.alive = false;
      u.hp = 0;
    } else {
      u.y = ground;
    }
  }
}

/** Start of a burning unit's turn: lose BURN_DAMAGE. Returns the damage taken (0 if not burning). */
export function tickBurn(u: Unit): number {
  if (u.burn <= 0 || !u.alive) return 0;
  u.burn--;
  const dmg = Math.min(u.hp, BURN_DAMAGE);
  u.hp -= dmg;
  if (u.hp <= 0) u.alive = false;
  return dmg;
}

/** Knowledge gauge changes from a shot: the shooter +GAUGE_HIT per hit on someone else, each target +GAUGE_HURT */
export function gaugeGains(timeline: ShotTimeline, shooterId: string): Map<string, number> {
  const gains = new Map<string, number>();
  const add = (id: string, n: number) => gains.set(id, (gains.get(id) ?? 0) + n);
  for (const e of timeline.events) {
    if (e.kind !== 'explode') continue;
    for (const h of e.hits) {
      if (h.id === shooterId) continue;
      add(shooterId, GAUGE_HIT);
      add(h.id, GAUGE_HURT);
    }
  }
  return gains;
}

// ---- Skills bookkeeping ----------------------------------------------------------------

export type SkillSlot = ItemSkill | 'special' | 'ultimate';
export const SKILL_SLOTS: SkillSlot[] = ['double', 'triple', 'heal', 'plane', 'stealth', 'special', 'ultimate'];

/** A fighter's skills for one match */
export interface SkillState {
  uses: Record<ItemSkill, number>;
  /** Weapon special allowed (★3+ in stages, everyone in 2-player and PvP) */
  specialUnlocked: boolean;
  /** Own turns until the special can be used again */
  specialCooldown: number;
  /** Knowledge gauge 0–GAUGE_MAX */
  gauge: number;
  usedThisTurn: boolean;
  /** Shot skill picked for this turn's shot */
  armed: SkillSlot | null;
}

export function newSkillState(specialUnlocked: boolean): SkillState {
  return { uses: freshItemUses(), specialUnlocked, specialCooldown: 0, gauge: 0, usedThisTurn: false, armed: null };
}

/** Why a skill can't be used right now, or null if it can */
export function skillBlocker(s: SkillState, slot: SkillSlot, hpFull: boolean): 'used' | 'empty' | 'locked' | 'cooldown' | 'gauge' | 'full' | null {
  if (slot === 'special') {
    if (!s.specialUnlocked) return 'locked';
    if (s.specialCooldown > 0) return 'cooldown';
  } else if (slot === 'ultimate') {
    if (s.gauge < GAUGE_MAX) return 'gauge';
  } else {
    if (s.uses[slot] <= 0) return 'empty';
    if (slot === 'heal' && hpFull) return 'full';
  }
  return s.usedThisTurn ? 'used' : null;
}

export function isInstantSkill(slot: SkillSlot): slot is 'heal' | 'stealth' {
  return slot !== 'special' && slot !== 'ultimate' && ITEM_SKILLS[slot].kind === 'instant';
}

/** The kind of shot an armed skill makes ('double' is two normal shots) */
export function shotModeFor(armed: SkillSlot | null): ShotMode {
  return armed === 'triple' || armed === 'plane' || armed === 'special' || armed === 'ultimate' ? armed : 'normal';
}

/** Pay for a skill (when an instant one is used, or when an armed shot is fired) */
export function spendSkill(s: SkillState, slot: SkillSlot) {
  s.usedThisTurn = true;
  s.armed = null;
  if (slot === 'special') s.specialCooldown = SPECIAL_COOLDOWN;
  else if (slot === 'ultimate') s.gauge = 0;
  else s.uses[slot]--;
}

/** Start of the fighter's own turn */
export function startSkillTurn(s: SkillState) {
  s.usedThisTurn = false;
  s.armed = null;
  if (s.specialCooldown > 0) s.specialCooldown--;
}

export function addGauge(s: SkillState, amount: number): boolean {
  const before = s.gauge;
  s.gauge = Math.max(0, Math.min(GAUGE_MAX, s.gauge + amount));
  return before < GAUGE_MAX && s.gauge >= GAUGE_MAX;
}
