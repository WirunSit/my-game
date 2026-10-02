import { ENEMY_WEAPONS, WEAPON_CATALOG, type DropTable, type WeaponStats } from '@sciboom/shared';
import type { EnemyConfig } from './Enemy';

/**
 * Each boss has a trick tied to its world (GAME_DESIGN 3.1):
 * split = Mixtron separates (a second body appears at half health),
 * swell = Amoebox absorbs water by osmosis (heals and grows),
 * roots = Venomroot's roots burst up where the player stood (keep moving!),
 * lava  = Magmadon's lava rises and burns anyone standing low,
 * storm = Stormlord's strong wind that changes direction mid-turn.
 */
export type Gimmick = 'split' | 'swell' | 'roots' | 'lava' | 'storm';

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
  gimmick?: Gimmick;
  /** Mixtron's second body */
  splitInto?: EnemyConfig;
  /** Question crates on the map at the start */
  crates: number;
  /** Highest question difficulty used (1–3) */
  maxDifficulty: number;
  isBoss?: boolean;
  /** Weapon drop on victory */
  drops: DropTable;
}

export interface WorldConfig {
  id: number;
  title: string;
  unitTitle: string;
  boss: string;
  background: string;
  ground: string;
}

export const WORLDS: WorldConfig[] = [
  { id: 1, title: 'โลก 1', unitTitle: 'สารบริสุทธิ์', boss: 'bosses/mixtron', background: 'backgrounds/world1_lab', ground: 'terrain/lab_stone' },
  { id: 2, title: 'โลก 2', unitTitle: 'หน่วยพื้นฐานของสิ่งมีชีวิต', boss: 'bosses/amoebox', background: 'backgrounds/world2_cell', ground: 'terrain/cell_tissue' },
  { id: 3, title: 'โลก 3', unitTitle: 'การดำรงชีวิตของพืช', boss: 'bosses/venomroot', background: 'backgrounds/world3_forest', ground: 'terrain/soil_roots' },
  { id: 4, title: 'โลก 4', unitTitle: 'พลังงานความร้อน', boss: 'bosses/magmadon', background: 'backgrounds/world4_volcano', ground: 'terrain/lava_rock' },
  { id: 5, title: 'โลก 5', unitTitle: 'ลมฟ้าอากาศ', boss: 'bosses/stormlord', background: 'backgrounds/world5_sky', ground: 'terrain/cloud' },
];

/** A body on the battlefield: size sets the hit circle and where shots come out */
function body(texture: string, name: string, height: number, hp: number, weapon: WeaponStats, skill: number, boss = false): EnemyConfig {
  return {
    texture,
    name,
    height,
    hp,
    hitRadius: Math.round(height * 0.35),
    hitOffsetY: Math.round(height * 0.47),
    weapon,
    skill,
    muzzle: boss ? { x: -Math.round(height * 0.22), y: -Math.round(height * 0.8) } : { x: -10, y: -Math.round(height * 0.9) },
  };
}

interface WorldPlan {
  world: number;
  minion: string;
  minionNames: [string, string];
  boss: { texture: string; name: string; title: string; gimmick: Gimmick };
  weapons: [WeaponStats, WeaponStats, WeaponStats];
  ultimates: [{ weapon: WeaponStats; shots: number; name: string }, { weapon: WeaponStats; shots: number; name: string }];
  /** HP of minion 1, minion 2, boss */
  hp: [number, number, number];
}

const W = ENEMY_WEAPONS;
const PLANS: WorldPlan[] = [
  {
    world: 1,
    minion: 'minions/test_tube',
    minionNames: ['หลอดทดลองจอมป่วน', 'หลอดทดลองยักษ์'],
    boss: { texture: 'bosses/mixtron', name: 'Mixtron ราชาสารผสม', title: 'บอส Mixtron ราชาสารผสม', gimmick: 'split' },
    weapons: [W.slime_spit, W.big_slime, W.mixture_bomb],
    ultimates: [
      { weapon: W.big_slime, shots: 2, name: 'ฝนน้ำยาพิษ' },
      { weapon: W.atom_storm, shots: 3, name: 'พายุอะตอม' },
    ],
    hp: [600, 1100, 1150],
  },
  {
    world: 2,
    minion: 'minions/bacteria',
    minionNames: ['แบคทีเรียตัวจิ๋ว', 'แบคทีเรียแบ่งตัว'],
    boss: { texture: 'bosses/amoebox', name: 'Amoebox อะมีบายักษ์', title: 'บอส Amoebox อะมีบายักษ์', gimmick: 'swell' },
    weapons: [W.germ_spit, W.germ_burst, W.amoeba_blob],
    ultimates: [
      { weapon: W.germ_burst, shots: 2, name: 'แบ่งเซลล์' },
      { weapon: W.cell_flood, shots: 3, name: 'น้ำท่วมเซลล์' },
    ],
    hp: [750, 1200, 1400],
  },
  {
    world: 3,
    minion: 'minions/mushroom',
    minionNames: ['เห็ดพิษ', 'เห็ดพิษยักษ์'],
    boss: { texture: 'bosses/venomroot', name: 'Venomroot ต้นไม้กินคน', title: 'บอส Venomroot ต้นไม้กินคน', gimmick: 'roots' },
    weapons: [W.spore_shot, W.big_spore, W.thorn_seed],
    ultimates: [
      { weapon: W.big_spore, shots: 2, name: 'พายุสปอร์' },
      { weapon: W.thorn_rain, shots: 3, name: 'ฝนหนาม' },
    ],
    hp: [850, 1300, 1450],
  },
  {
    world: 4,
    minion: 'minions/fire_spirit',
    minionNames: ['วิญญาณไฟ', 'วิญญาณไฟยักษ์'],
    boss: { texture: 'bosses/magmadon', name: 'Magmadon มังกรลาวา', title: 'บอส Magmadon มังกรลาวา', gimmick: 'lava' },
    weapons: [W.ember, W.flame_ball, W.magma_bomb],
    ultimates: [
      { weapon: W.flame_ball, shots: 2, name: 'เปลวไฟคู่' },
      { weapon: W.meteor_rain, shots: 3, name: 'ฝนอุกกาบาตลาวา' },
    ],
    hp: [950, 1400, 1650],
  },
  {
    world: 5,
    minion: 'minions/storm_cloud',
    minionNames: ['เมฆพายุ', 'เมฆฟ้าคะนอง'],
    boss: { texture: 'bosses/stormlord', name: 'Stormlord เจ้าพายุ', title: 'บอส Stormlord เจ้าพายุ', gimmick: 'storm' },
    weapons: [W.hail, W.thunder_ball, W.storm_bolt],
    ultimates: [
      { weapon: W.thunder_ball, shots: 2, name: 'ฟ้าคะนอง' },
      { weapon: W.lightning_strike, shots: 3, name: 'สายฟ้าฟาด' },
    ],
    hp: [1050, 1500, 1750],
  },
];

function worldStages(p: WorldPlan): StageConfig[] {
  const w = WORLDS[p.world - 1];
  const weapons = WEAPON_CATALOG.filter((x) => x.world === p.world).map((x) => x.id);
  // A little sharper aim in later worlds
  const sharp = 0.03 * (p.world - 1);
  const common = { world: p.world, unit: p.world, background: w.background, ground: w.ground, crates: 2 };
  const late = p.world >= 4;
  return [
    {
      ...common,
      id: `${p.world}-1`,
      title: p.minionNames[0],
      enemy: body(p.minion, p.minionNames[0], 110, p.hp[0], p.weapons[0], 0.35 + sharp),
      ultimateEvery: 0,
      maxDifficulty: 1,
      drops: { weapons, chance: 0.5, rarityWeights: [75, 25, 0, 0, 0] },
    },
    {
      ...common,
      id: `${p.world}-2`,
      title: p.minionNames[1],
      enemy: body(p.minion, p.minionNames[1], 165, p.hp[1], p.weapons[1], 0.45 + sharp),
      ultimateEvery: 3,
      ultimate: p.ultimates[0],
      maxDifficulty: 2,
      drops: { weapons, chance: 0.6, rarityWeights: [50, 45, 5, 0, 0] },
    },
    {
      ...common,
      id: `${p.world}-3`,
      title: p.boss.title,
      enemy: body(p.boss.texture, p.boss.name, 270, p.hp[2], p.weapons[2], 0.4 + sharp, true),
      ultimateEvery: 3,
      ultimate: p.ultimates[1],
      gimmick: p.boss.gimmick,
      splitInto: p.boss.gimmick === 'split' ? body(p.boss.texture, `${p.boss.name} (ร่างแยก)`, 130, 500, p.weapons[0], 0.45) : undefined,
      maxDifficulty: 3,
      isBoss: true,
      drops: { weapons, chance: 1, rarityWeights: late ? [0, 30, 50, 17, 3] : [0, 50, 40, 9, 1] },
    },
  ];
}

export const STAGES: StageConfig[] = PLANS.flatMap(worldStages);

export function stageById(id: string): StageConfig | undefined {
  return STAGES.find((s) => s.id === id);
}

export function nextStage(id: string): StageConfig | undefined {
  const i = STAGES.findIndex((s) => s.id === id);
  return i >= 0 ? STAGES[i + 1] : undefined;
}

/** A stage is playable when it's the first one or the one before it was cleared (worlds open in order) */
export function isUnlocked(id: string, stars: Record<string, number>): boolean {
  const i = STAGES.findIndex((s) => s.id === id);
  return i === 0 || (i > 0 && (stars[STAGES[i - 1].id] ?? 0) > 0);
}
