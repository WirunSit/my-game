// Skills, the DDTank / BoomZ way: every turn starts with a full stamina bar.
// Walking and skills both use it, so each turn you choose, e.g. +1 with +2,
// or three shells with +2. Each weapon has a special shot (★3 and up), and the
// Ultimate needs a full gauge. Everything that decides where shots go lives
// here so the PvP server can replay it exactly.
import { WIND_TO_ACCEL, fly, launchState, type FlightOptions, type ShotInput, type ShotResult, type ShotTarget, type Vec } from './physics';
import type { Terrain } from './terrain';

// ---- Stamina --------------------------------------------------------------------

/** Stamina at the start of each of your turns (what you don't use is lost) */
export const STAMINA_MAX = 100;
/** px of walking per point of stamina (a full bar walks 300 px) */
export const WALK_PX_PER_STAMINA = 3;

// ---- Item skills ----------------------------------------------------------------

export type ItemSkill = 'plus1' | 'plus2' | 'triple' | 'power' | 'shield' | 'heal' | 'plane' | 'stealth';

export interface ItemSkillDef {
  name: string;
  /** Stamina it uses */
  cost: number;
  /** Uses per match (no limit when missing) */
  uses?: number;
  /** 'shot' changes how you shoot this turn; 'instant' happens right away and you still shoot */
  kind: 'shot' | 'instant';
  desc: string;
}

export const ITEM_SKILLS: Record<ItemSkill, ItemSkillDef> = {
  plus1: { name: 'ยิงซ้ำ +1', cost: 40, kind: 'shot', desc: 'ยิงเพิ่มอีก 1 รอบ' },
  plus2: { name: 'ยิงซ้ำ +2', cost: 55, kind: 'shot', desc: 'ยิงเพิ่มอีก 2 รอบ' },
  triple: { name: 'สามลูก', cost: 45, kind: 'shot', desc: 'ยิงกระจายสามลูก ลูกละ 50%' },
  power: { name: 'เพิ่มพลัง', cost: 30, kind: 'shot', desc: 'ดาเมจตานี้ +30%' },
  shield: { name: 'โล่', cost: 35, kind: 'instant', desc: 'โดนยิงเจ็บแค่ครึ่งเดียว จนถึงตาถัดไปของเรา' },
  heal: { name: 'ฟื้นพลัง', cost: 60, uses: 2, kind: 'instant', desc: 'ฟื้นพลังชีวิต +300 (ใช้ได้ 2 ครั้งต่อเกม)' },
  plane: { name: 'จรวดกระดาษ', cost: 60, kind: 'shot', desc: 'ตกตรงไหนย้ายไปตรงนั้น ใช้คู่กับสกิลยิงอื่นไม่ได้ (โดนลมมาก)' },
  stealth: { name: 'พรางตัว', cost: 40, uses: 2, kind: 'instant', desc: 'หายตัวจนถึงตาถัดไปของเรา ศัตรูเล็งยาก (ใช้ได้ 2 ครั้งต่อเกม)' },
};

export const ITEM_SKILL_ORDER: ItemSkill[] = ['plus1', 'plus2', 'triple', 'power', 'shield', 'heal', 'plane', 'stealth'];

export const HEAL_AMOUNT = 300;
/** Shield skill: damage taken is multiplied by this until your next turn */
export const SHIELD_FACTOR = 0.5;
/** Power skill */
export const POWER_BONUS = 1.3;
/** Damage of each round when a turn fires 1, 2, 3 or 4 rounds (+1 and +2 together make 4) */
export const VOLLEY_DAMAGE = [1, 0.7, 0.5, 0.4];
const TRIPLE_SPREAD_DEG = 5;
const TRIPLE_DAMAGE = 0.5;
/** Paper is light: the wind pushes it more than a shell */
const PLANE_WIND = 1.5;

/** Uses left at the start of a match, for the skills that have a limit */
export function freshItemUses(): Partial<Record<ItemSkill, number>> {
  const uses: Partial<Record<ItemSkill, number>> = {};
  for (const k of ITEM_SKILL_ORDER) if (ITEM_SKILLS[k].uses !== undefined) uses[k] = ITEM_SKILLS[k].uses;
  return uses;
}

// ---- Weapon specials ----------------------------------------------------------------

export type SpecialKind = 'big' | 'burn' | 'split' | 'bounce' | 'nowind' | 'drain' | 'rocket' | 'strike' | 'push';

export const SPECIAL_KINDS: Record<SpecialKind, string> = {
  big: 'ระเบิดใหญ่ รัศมี x1.6',
  burn: 'ติดไฟ เสียพลัง 60 ต่อตา 2 ตา',
  split: 'แตกเป็นสามลูกตอนถึงจุดสูงสุด',
  bounce: 'กระดอนพื้นหนึ่งครั้งก่อนระเบิด',
  nowind: 'ไม่โดนลมเลย',
  drain: 'ดูดพลัง ได้คืนครึ่งหนึ่งของดาเมจ',
  rocket: 'พุ่งตรงไม่ตกช่วงแรก',
  strike: 'ฟ้าผ่าซ้ำลงจุดเดิม',
  push: 'ผลักศัตรูกระเด็น',
};

/** Each weapon's special, named after the science it is built on */
export const WEAPON_SPECIALS: Record<string, { kind: SpecialKind; name: string }> = {
  starter_cannon: { kind: 'big', name: 'ลูกปืนใหญ่ยักษ์' },
  beaker_gun: { kind: 'burn', name: 'กรดกัดกร่อน' },
  atom_launcher: { kind: 'split', name: 'อะตอมแตกตัว' },
  distill_gun: { kind: 'bounce', name: 'หยดน้ำกระดอน' },
  microscope_gun: { kind: 'nowind', name: 'เล็งด้วยกล้องจุลทรรศน์' },
  osmosis_bazooka: { kind: 'drain', name: 'ออสโมซิสดูดพลัง' },
  nucleus_blaster: { kind: 'big', name: 'นิวเคลียสระเบิดใหญ่' },
  chlorophyll_cannon: { kind: 'drain', name: 'สังเคราะห์แสงฟื้นพลัง' },
  seed_slingshot: { kind: 'bounce', name: 'เมล็ดกระดอน' },
  pollen_gun: { kind: 'split', name: 'ละอองเรณูกระจาย' },
  thermo_gun: { kind: 'burn', name: 'ความร้อนแผดเผา' },
  convection_rocket: { kind: 'rocket', name: 'จรวดพาความร้อน' },
  lava_blaster: { kind: 'burn', name: 'ลาวาไหม้' },
  barometer_gun: { kind: 'nowind', name: 'ความกดอากาศคงที่' },
  lightning_gun: { kind: 'strike', name: 'ฟ้าผ่าซ้ำ' },
  tornado_cannon: { kind: 'push', name: 'ทอร์นาโดผลัก' },
};

export function weaponSpecial(weaponId: string): { kind: SpecialKind; name: string } {
  return WEAPON_SPECIALS[weaponId] ?? WEAPON_SPECIALS.starter_cannon;
}

/** Specials unlock on ★3 weapons, use stamina, and rest for a turn after each use */
export const SPECIAL_MIN_RARITY = 3;
export const SPECIAL_COOLDOWN = 2;
export const SPECIAL_COST = 40;

export const BURN_DAMAGE = 60;
export const BURN_TURNS = 2;
export const DRAIN_SHARE = 0.5;
export const PUSH_DISTANCE = 120;

// ---- Ultimate ---------------------------------------------------------------------------

/** Power gauge (0–100), like DDTank's anger bar: fill it to unleash the Ultimate (no stamina needed) */
export const GAUGE_MAX = 100;
export const GAUGE_CORRECT_ANSWER = 35;
/** For firing a shot */
export const GAUGE_SHOT = 10;
/** Once per turn, for hitting someone */
export const GAUGE_HIT = 10;
/** Once per enemy turn, for getting hit (helps whoever is behind catch up) */
export const GAUGE_HURT = 15;

// ---- Shots --------------------------------------------------------------------------------

export type ShotMode = 'normal' | 'triple' | 'plane' | 'special' | 'ultimate';

/** One projectile of a volley */
export interface Projectile {
  result: ShotResult;
  /** Simulation steps to wait before it starts moving (split shells wait for the apex) */
  delay: number;
  damageMul: number;
  radiusMul: number;
  /** Drawing size multiplier */
  size: number;
  look: 'shell' | 'plane' | 'bolt';
  /** False for the paper plane (it carries you instead) and for a split shell's carrier */
  explodes: boolean;
}

/** How the first projectile flies for a mode (the aim guide uses this too) */
export function flightOptions(mode: ShotMode, special: SpecialKind | null, wind: number): FlightOptions {
  const windAccel = wind * WIND_TO_ACCEL;
  if (mode === 'ultimate') return { windAccel: 0 };
  if (mode === 'plane') return { windAccel: windAccel * PLANE_WIND };
  if (mode === 'special') {
    if (special === 'nowind') return { windAccel: 0 };
    if (special === 'bounce') return { windAccel, bounces: 1 };
    if (special === 'rocket') return { windAccel, straightSteps: 45 };
  }
  return { windAccel };
}

const shell = (result: ShotResult, damageMul = 1, radiusMul = 1, size = 1, delay = 0): Projectile => ({
  result,
  delay,
  damageMul,
  radiusMul,
  size,
  look: 'shell',
  explodes: true,
});

/** Every projectile a shot makes, in launch order. Deterministic. */
export function planVolley(
  mode: ShotMode,
  special: SpecialKind | null,
  input: ShotInput,
  terrain: Terrain,
  targets: ShotTarget[],
  shooterId: string,
): Projectile[] {
  const opts = flightOptions(mode, special, input.wind);
  const main = () => fly(launchState(input), opts, terrain, targets, shooterId);

  switch (mode) {
    case 'normal':
      return [shell(main())];
    case 'ultimate':
      return [shell(main(), 2, 1.5, 2)];
    case 'plane':
      return [{ ...shell(main()), look: 'plane', explodes: false }];
    case 'triple':
      return [-TRIPLE_SPREAD_DEG, 0, TRIPLE_SPREAD_DEG].map((d) =>
        shell(fly(launchState({ ...input, angleDeg: input.angleDeg + d }), opts, terrain, targets, shooterId), TRIPLE_DAMAGE, 0.85),
      );
  }

  // Weapon specials
  switch (special) {
    case 'big':
      return [shell(main(), 1.15, 1.6, 1.5)];
    case 'nowind':
    case 'bounce':
      return [shell(main(), 1.1)];
    case 'rocket':
      return [shell(main(), 1.15)];
    case 'split':
      return splitAtApex(input, opts, terrain, targets, shooterId);
    default:
      // burn, drain, strike, push: a normal flight, the effect happens on impact
      return [shell(main())];
  }
}

/** Fly to the top of the arc, then break into three smaller shells */
function splitAtApex(input: ShotInput, opts: FlightOptions, terrain: Terrain, targets: ShotTarget[], shooterId: string): Projectile[] {
  const whole = fly(launchState(input), opts, terrain, targets, shooterId);
  const p = whole.path;
  let apex = 0;
  for (let i = 1; i < p.length; i++) if (p[i].y < p[apex].y) apex = i;
  // Hit something on the way up, or apex is the end: no split
  if (apex < 2 || apex >= p.length - 2) return [shell(whole)];

  const first: ShotResult = { path: p.slice(0, apex + 1), impact: null, directHitId: null };
  const vx = (p[apex].x - p[apex - 1].x) * 60;
  const from = p[apex];
  const pieces = [-150, 0, 150].map((dvx) =>
    shell(fly({ x: from.x, y: from.y, vx: vx + dvx, vy: 0 }, { ...opts, ignoreShooterSteps: 0 }, terrain, targets, shooterId), 0.6, 0.8, 0.8, apex),
  );
  // The carrier shell just disappears at the apex
  return [{ ...shell(first), explodes: false }, ...pieces];
}

/** Lightning special: a bolt falls straight down onto the first impact */
export function strikeBolt(at: Vec, terrain: Terrain, targets: ShotTarget[], shooterId: string): Projectile {
  const result = fly({ x: at.x, y: -60, vx: 0, vy: 1400 }, { windAccel: 0, gravity: 0, ignoreShooterSteps: 0 }, terrain, targets, shooterId);
  return { result, delay: 0, damageMul: 0.6, radiusMul: 0.9, size: 1, look: 'bolt', explodes: true };
}
