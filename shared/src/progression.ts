import type { Rng } from './rng';
import type { WeaponStats } from './weapons';

// ---- Player level -----------------------------------------------------------

export const MAX_LEVEL = 30;

/** EXP needed to go from `level` to `level + 1` */
export function expToNext(level: number): number {
  return 100 + (level - 1) * 60;
}

export interface LevelState {
  level: number;
  exp: number;
}

/** Add EXP, levelling up as many times as it covers. */
export function addExp(state: LevelState, amount: number): LevelState & { levelsGained: number } {
  let { level, exp } = state;
  const start = level;
  exp += Math.max(0, Math.round(amount));
  while (level < MAX_LEVEL && exp >= expToNext(level)) {
    exp -= expToNext(level);
    level++;
  }
  if (level >= MAX_LEVEL) exp = 0;
  return { level, exp, levelsGained: level - start };
}

// ---- Weapons ------------------------------------------------------------------

/** Base weapon from the catalogue (the art in weapons/<id>.png) */
export interface WeaponDef {
  id: string;
  name: string;
  /** World it drops in (0 = starter) */
  world: number;
  damage: number;
  radius: number;
  projectile: string;
}

/** Big blast = less damage; small blast = more damage, so every weapon has a style */
export const WEAPON_CATALOG: WeaponDef[] = [
  { id: 'starter_cannon', name: 'ปืนใหญ่ฝึกหัด', world: 0, damage: 240, radius: 52, projectile: 'proj_cannonball' },
  { id: 'beaker_gun', name: 'ปืนบีกเกอร์', world: 1, damage: 255, radius: 55, projectile: 'proj_beaker' },
  { id: 'atom_launcher', name: 'เครื่องยิงอะตอม', world: 1, damage: 290, radius: 46, projectile: 'proj_atom' },
  { id: 'distill_gun', name: 'ปืนกลั่น', world: 1, damage: 230, radius: 66, projectile: 'proj_beaker' },
  { id: 'microscope_gun', name: 'ปืนกล้องจุลทรรศน์', world: 2, damage: 300, radius: 44, projectile: 'proj_atom' },
  { id: 'osmosis_bazooka', name: 'ระเบิดออสโมซิส', world: 2, damage: 240, radius: 68, projectile: 'proj_slime' },
  { id: 'nucleus_blaster', name: 'ปืนนิวเคลียส', world: 2, damage: 270, radius: 56, projectile: 'proj_atom' },
  { id: 'chlorophyll_cannon', name: 'ปืนใหญ่คลอโรฟิลล์', world: 3, damage: 265, radius: 58, projectile: 'proj_seed' },
  { id: 'seed_slingshot', name: 'หนังสติ๊กเมล็ดพันธุ์', world: 3, damage: 305, radius: 44, projectile: 'proj_seed' },
  { id: 'pollen_gun', name: 'ปืนละอองเรณู', world: 3, damage: 235, radius: 70, projectile: 'proj_pollen' },
  { id: 'thermo_gun', name: 'ปืนเทอร์โมมิเตอร์', world: 4, damage: 280, radius: 52, projectile: 'proj_fireball' },
  { id: 'convection_rocket', name: 'จรวดการพาความร้อน', world: 4, damage: 250, radius: 66, projectile: 'proj_fireball' },
  { id: 'lava_blaster', name: 'ปืนไฟลาวา', world: 4, damage: 310, radius: 48, projectile: 'proj_fireball' },
  { id: 'barometer_gun', name: 'ปืนบารอมิเตอร์', world: 5, damage: 270, radius: 58, projectile: 'proj_cannonball' },
  { id: 'lightning_gun', name: 'ปืนฟ้าผ่า', world: 5, damage: 320, radius: 46, projectile: 'proj_lightning' },
  { id: 'tornado_cannon', name: 'ปืนใหญ่ทอร์นาโด', world: 5, damage: 245, radius: 72, projectile: 'proj_lightning' },
];

export function weaponDef(id: string): WeaponDef {
  return WEAPON_CATALOG.find((w) => w.id === id) ?? WEAPON_CATALOG[0];
}

/** A weapon the player owns */
export interface WeaponItem {
  uid: string;
  id: string;
  /** 1–5 stars */
  rarity: number;
  level: number;
}

export const RARITY_NAMES = ['', 'ธรรมดา', 'หายาก', 'ยอดเยี่ยม', 'มหากาพย์', 'ตำนาน'];
const RARITY_BONUS = [0, 1, 1.08, 1.16, 1.25, 1.35];
const MAX_WEAPON_LEVEL = [0, 10, 15, 20, 25, 30];

export function maxWeaponLevel(rarity: number): number {
  return MAX_WEAPON_LEVEL[rarity] ?? 10;
}

/** Final stats of an owned weapon (rarity and level raise damage; radius stays the weapon's style) */
export function weaponStats(item: Pick<WeaponItem, 'id' | 'rarity' | 'level'>): WeaponStats {
  const def = weaponDef(item.id);
  const mul = (RARITY_BONUS[item.rarity] ?? 1) * (1 + 0.02 * (item.level - 1));
  return { id: def.id, name: def.name, damage: Math.round(def.damage * mul), radius: def.radius, projectile: def.projectile };
}

/** Base stats only (PvP: everyone is equal, levels don't matter) */
export function baseWeaponStats(id: string): WeaponStats {
  return weaponStats({ id, rarity: 1, level: 1 });
}

export interface Cost {
  coins: number;
  crystals: number;
}

/** Price to raise a weapon from `level` to `level + 1` (crystals come only from right answers) */
export function upgradeCost(rarity: number, level: number): Cost {
  return {
    coins: 40 * level + 30 * (rarity - 1) * level,
    crystals: 1 + Math.floor((level - 1) / 4) + (rarity - 1),
  };
}

export const FUSE_COUNT = 3;

/** Three copies of the same weapon and rarity merge into one copy a star higher */
export function canFuse(items: WeaponItem[], target: WeaponItem): boolean {
  if (target.rarity >= 5) return false;
  return items.filter((w) => w.id === target.id && w.rarity === target.rarity).length >= FUSE_COUNT;
}

// ---- Rewards ------------------------------------------------------------------

export interface DropTable {
  /** Weapons that can drop */
  weapons: string[];
  /** Chance (0–1) that any weapon drops */
  chance: number;
  /** Relative weight of ★1..★5 */
  rarityWeights: [number, number, number, number, number];
}

export function rollDrop(table: DropTable, rng: Rng): { id: string; rarity: number } | null {
  if (rng.next() >= table.chance || table.weapons.length === 0) return null;
  const id = table.weapons[rng.int(0, table.weapons.length - 1)];
  const total = table.rarityWeights.reduce((a, b) => a + b, 0);
  let roll = rng.range(0, total);
  let rarity = 1;
  for (let i = 0; i < 5; i++) {
    roll -= table.rarityWeights[i];
    if (roll < 0) {
      rarity = i + 1;
      break;
    }
  }
  return { id, rarity };
}

/** PvP: everyone learns something — the loser gets EXP too */
export function pvpRewards(won: boolean): { exp: number; coins: number } {
  return won ? { exp: 70, coins: 50 } : { exp: 30, coins: 20 };
}

/** EXP and coins for finishing a stage. Right answers are worth more than winning. */
export function stageRewards(opts: { won: boolean; stars: number; correct: number; isBoss: boolean }): { exp: number; coins: number } {
  const perAnswer = 20;
  if (!opts.won) return { exp: 15 + perAnswer * opts.correct, coins: 10 + 5 * opts.correct };
  const base = opts.isBoss ? 120 : 50;
  return {
    exp: base + 15 * opts.stars + perAnswer * opts.correct,
    coins: (opts.isBoss ? 120 : 50) + 15 * opts.stars + 5 * opts.correct,
  };
}
