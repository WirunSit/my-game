import { ENEMY_WEAPONS, type DropTable, type WeaponStats } from '@sciboom/shared';
import type { EnemyConfig } from './Enemy';

export interface StageConfig {
  id: string;
  world: number;
  /** Question unit (content/questions/unitN_*.json) */
  unit: number;
  title: string;
  background: string;
  ground: string;
  enemy: EnemyConfig;
  /** Every Nth enemy turn the enemy charges an ultimate and a question appears (0 = never) */
  ultimateEvery: number;
  ultimate?: { weapon: WeaponStats; shots: number; name: string };
  /** Question crates on the map at the start */
  crates: number;
  /** Highest question difficulty used (1–3) */
  maxDifficulty: number;
  isBoss?: boolean;
  /** Weapon drop on victory */
  drops: DropTable;
}

const WORLD1_WEAPONS = ['beaker_gun', 'atom_launcher', 'distill_gun'];

export interface WorldConfig {
  id: number;
  title: string;
  unitTitle: string;
  boss: string;
  background: string;
  ready: boolean;
}

export const WORLDS: WorldConfig[] = [
  { id: 1, title: 'โลก 1', unitTitle: 'สารบริสุทธิ์', boss: 'bosses/mixtron', background: 'backgrounds/world1_lab', ready: true },
  { id: 2, title: 'โลก 2', unitTitle: 'หน่วยพื้นฐานของสิ่งมีชีวิต', boss: 'bosses/amoebox', background: 'backgrounds/world2_cell', ready: false },
  { id: 3, title: 'โลก 3', unitTitle: 'การดำรงชีวิตของพืช', boss: 'bosses/venomroot', background: 'backgrounds/world3_forest', ready: false },
  { id: 4, title: 'โลก 4', unitTitle: 'พลังงานความร้อน', boss: 'bosses/magmadon', background: 'backgrounds/world4_volcano', ready: false },
  { id: 5, title: 'โลก 5', unitTitle: 'ลมฟ้าอากาศ', boss: 'bosses/stormlord', background: 'backgrounds/world5_sky', ready: false },
];

export const STAGES: StageConfig[] = [
  {
    id: '1-1',
    world: 1,
    unit: 1,
    title: 'หลอดทดลองจอมป่วน',
    background: 'backgrounds/world1_lab',
    ground: 'terrain/lab_stone',
    enemy: {
      texture: 'minions/test_tube',
      name: 'หลอดทดลองจอมป่วน',
      height: 110,
      hp: 600,
      hitRadius: 38,
      hitOffsetY: 52,
      weapon: ENEMY_WEAPONS.slime_spit,
      skill: 0.35,
      muzzle: { x: -10, y: -100 },
    },
    ultimateEvery: 0,
    crates: 2,
    maxDifficulty: 1,
    drops: { weapons: WORLD1_WEAPONS, chance: 0.5, rarityWeights: [75, 25, 0, 0, 0] },
  },
  {
    id: '1-2',
    world: 1,
    unit: 1,
    title: 'หลอดทดลองยักษ์',
    background: 'backgrounds/world1_lab',
    ground: 'terrain/lab_stone',
    enemy: {
      texture: 'minions/test_tube',
      name: 'หลอดทดลองยักษ์',
      height: 165,
      hp: 1100,
      hitRadius: 55,
      hitOffsetY: 78,
      weapon: ENEMY_WEAPONS.big_slime,
      skill: 0.5,
      muzzle: { x: -15, y: -150 },
    },
    ultimateEvery: 3,
    ultimate: { weapon: ENEMY_WEAPONS.big_slime, shots: 2, name: 'ฝนน้ำยาพิษ' },
    crates: 2,
    maxDifficulty: 2,
    drops: { weapons: WORLD1_WEAPONS, chance: 0.6, rarityWeights: [50, 45, 5, 0, 0] },
  },
  {
    id: '1-3',
    world: 1,
    unit: 1,
    title: 'บอส Mixtron ราชาสารผสม',
    background: 'backgrounds/world1_lab',
    ground: 'terrain/lab_stone',
    enemy: {
      texture: 'bosses/mixtron',
      name: 'Mixtron ราชาสารผสม',
      height: 270,
      hp: 2400,
      hitRadius: 95,
      hitOffsetY: 125,
      weapon: ENEMY_WEAPONS.mixture_bomb,
      skill: 0.6,
      muzzle: { x: -60, y: -220 },
    },
    ultimateEvery: 2,
    ultimate: { weapon: ENEMY_WEAPONS.atom_storm, shots: 3, name: 'พายุอะตอม' },
    crates: 2,
    maxDifficulty: 3,
    isBoss: true,
    drops: { weapons: WORLD1_WEAPONS, chance: 1, rarityWeights: [0, 50, 40, 9, 1] },
  },
];

export function stageById(id: string): StageConfig | undefined {
  return STAGES.find((s) => s.id === id);
}

export function nextStage(id: string): StageConfig | undefined {
  const i = STAGES.findIndex((s) => s.id === id);
  return i >= 0 ? STAGES[i + 1] : undefined;
}

/** A stage is playable when it's the first one or the one before it was cleared */
export function isUnlocked(id: string, stars: Record<string, number>): boolean {
  const i = STAGES.findIndex((s) => s.id === id);
  return i === 0 || (i > 0 && (stars[STAGES[i - 1].id] ?? 0) > 0);
}
