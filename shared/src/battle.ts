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
  GAUGE_SHOT,
  ITEM_SKILLS,
  POWER_BONUS,
  PUSH_DISTANCE,
  SPECIAL_COOLDOWN,
  SPECIAL_COST,
  STAMINA_MAX,
  VOLLEY_DAMAGE,
  WALK_PX_PER_STAMINA,
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

/**
 * Gauge changes from one turn's shots (all rounds together): the shooter gets
 * GAUGE_SHOT for firing plus GAUGE_HIT if they hit anyone, and everyone hit
 * gets GAUGE_HURT once, however many shells landed on them.
 */
export function gaugeGains(timelines: ShotTimeline[], shooterId: string): Map<string, number> {
  const gains = new Map<string, number>([[shooterId, GAUGE_SHOT]]);
  const hurt = new Set<string>();
  for (const tl of timelines) {
    for (const e of tl.events) {
      if (e.kind !== 'explode') continue;
      for (const h of e.hits) if (h.id !== shooterId) hurt.add(h.id);
    }
  }
  if (hurt.size > 0) gains.set(shooterId, GAUGE_SHOT + GAUGE_HIT);
  for (const id of hurt) gains.set(id, GAUGE_HURT);
  return gains;
}

// ---- Skills bookkeeping ----------------------------------------------------------------

export type SkillSlot = ItemSkill | 'special' | 'ultimate';
/** Order on the skill bar (keys 1–9, 0) */
export const SKILL_SLOTS: SkillSlot[] = ['plus1', 'plus2', 'triple', 'power', 'special', 'ultimate', 'plane', 'shield', 'heal', 'stealth'];

/** A fighter's skills for one match */
export interface SkillState {
  /** Uses left this match, for skills that have a limit (heal, stealth) */
  uses: Partial<Record<ItemSkill, number>>;
  /** Weapon special allowed (★3+ in stages, everyone in 2-player and PvP) */
  specialUnlocked: boolean;
  /** Own turns until the special can be used again */
  specialCooldown: number;
  /** Power gauge 0–GAUGE_MAX */
  gauge: number;
  /** Stamina left this turn: walking and skills both use it */
  stamina: number;
  /** Instant skills already used this turn */
  used: SkillSlot[];
  /** Shot skills picked for this turn's shot (their stamina is already taken; unpick to get it back) */
  armed: SkillSlot[];
}

export function newSkillState(specialUnlocked: boolean): SkillState {
  return { uses: freshItemUses(), specialUnlocked, specialCooldown: 0, gauge: 0, stamina: STAMINA_MAX, used: [], armed: [] };
}

export type InstantSkill = 'heal' | 'stealth' | 'shield';

export function isInstantSkill(slot: SkillSlot): slot is InstantSkill {
  return slot !== 'special' && slot !== 'ultimate' && ITEM_SKILLS[slot].kind === 'instant';
}

export function isSkillSlot(x: unknown): x is SkillSlot {
  return typeof x === 'string' && (SKILL_SLOTS as string[]).includes(x);
}

export function skillCost(slot: SkillSlot): number {
  if (slot === 'special') return SPECIAL_COST;
  if (slot === 'ultimate') return 0;
  return ITEM_SKILLS[slot].cost;
}

/** Skills that decide what flies out of the barrel: only one of these per shot */
const SHOT_SHAPES: SkillSlot[] = ['triple', 'plane', 'special', 'ultimate'];

/** Two shot skills that can't go together in one turn */
export function skillsClash(a: SkillSlot, b: SkillSlot): boolean {
  if (a === b || isInstantSkill(a) || isInstantSkill(b)) return false;
  // The paper plane carries you instead of hurting anyone: nothing goes with it
  if (a === 'plane' || b === 'plane') return true;
  if (SHOT_SHAPES.includes(a) && SHOT_SHAPES.includes(b)) return true;
  // The Ultimate is one big shell: no extra rounds
  const pair = (x: SkillSlot, y: SkillSlot) => (a === x && b === y) || (a === y && b === x);
  return pair('ultimate', 'plus1') || pair('ultimate', 'plus2');
}

export type SkillBlocker = 'used' | 'empty' | 'locked' | 'cooldown' | 'gauge' | 'full' | 'clash' | 'stamina';

/** Why a skill can't be picked right now, or null if it can */
export function skillBlocker(s: SkillState, slot: SkillSlot, hpFull: boolean): SkillBlocker | null {
  if (slot === 'special') {
    if (!s.specialUnlocked) return 'locked';
    if (s.specialCooldown > 0) return 'cooldown';
  } else if (slot === 'ultimate') {
    if (s.gauge < GAUGE_MAX) return 'gauge';
  } else {
    if ((s.uses[slot] ?? 1) <= 0) return 'empty';
    if (slot === 'heal' && hpFull) return 'full';
  }
  if (s.used.includes(slot) || s.armed.includes(slot)) return 'used';
  if (s.armed.some((a) => skillsClash(a, slot))) return 'clash';
  if (s.stamina < skillCost(slot)) return 'stamina';
  return null;
}

/** Take a skill (check skillBlocker first): pay its stamina; an instant one also uses up a use now */
export function pickSkill(s: SkillState, slot: SkillSlot) {
  s.stamina -= skillCost(slot);
  if (isInstantSkill(slot)) {
    s.used.push(slot);
    if (s.uses[slot] !== undefined) s.uses[slot]!--;
  } else {
    s.armed.push(slot);
  }
}

/** Put back a shot skill picked this turn, and get its stamina back */
export function unpickSkill(s: SkillState, slot: SkillSlot) {
  const i = s.armed.indexOf(slot);
  if (i < 0) return;
  s.armed.splice(i, 1);
  s.stamina += skillCost(slot);
}

/** px the fighter can still walk this turn */
export function walkAllowance(s: SkillState): number {
  return Math.max(0, s.stamina) * WALK_PX_PER_STAMINA;
}

export function spendWalk(s: SkillState, px: number) {
  s.stamina = Math.max(0, s.stamina - px / WALK_PX_PER_STAMINA);
}

/** What a set of shot skills makes this turn */
export interface Loadout {
  mode: ShotMode;
  /** Rounds fired one after another with the same aim (+1 and +2 add rounds) */
  rounds: number;
  /** Damage multiplier for every round */
  damageMul: number;
}

export function loadoutOf(armed: readonly SkillSlot[]): Loadout {
  const has = (k: SkillSlot) => armed.includes(k);
  const mode: ShotMode = has('ultimate') ? 'ultimate' : has('plane') ? 'plane' : has('special') ? 'special' : has('triple') ? 'triple' : 'normal';
  const rounds = 1 + (has('plus1') ? 1 : 0) + (has('plus2') ? 2 : 0);
  const damageMul = VOLLEY_DAMAGE[rounds - 1] * (has('power') ? POWER_BONUS : 1);
  return { mode, rounds, damageMul };
}

/** The shot is fired: the special rests, the Ultimate empties the gauge. Returns what to fire. */
export function fireSkills(s: SkillState): Loadout {
  const loadout = loadoutOf(s.armed);
  for (const slot of s.armed) {
    if (slot === 'special') s.specialCooldown = SPECIAL_COOLDOWN;
    else if (slot === 'ultimate') s.gauge = 0;
    else if (s.uses[slot] !== undefined) s.uses[slot]!--;
  }
  s.armed = [];
  return loadout;
}

/** Start of the fighter's own turn: a full stamina bar */
export function startSkillTurn(s: SkillState) {
  s.stamina = STAMINA_MAX;
  s.used = [];
  s.armed = [];
  if (s.specialCooldown > 0) s.specialCooldown--;
}

export function addGauge(s: SkillState, amount: number): boolean {
  const before = s.gauge;
  s.gauge = Math.max(0, Math.min(GAUGE_MAX, s.gauge + amount));
  return before < GAUGE_MAX && s.gauge >= GAUGE_MAX;
}
