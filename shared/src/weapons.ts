// Weapon stats. Phase 1 uses the base stats only; rarity/level bonuses come in phase 3.
export interface WeaponStats {
  id: string;
  /** Thai display name */
  name: string;
  /** Damage at the centre of the blast */
  damage: number;
  /** Crater + damage radius in px */
  radius: number;
  /** Texture key of the projectile sprite */
  projectile: string;
}

/** Enemy attacks (not collectable) */
export const ENEMY_WEAPONS: Record<string, WeaponStats> = {
  slime_spit: { id: 'slime_spit', name: 'น้ำยาพิษ', damage: 140, radius: 45, projectile: 'proj_slime' },
  big_slime: { id: 'big_slime', name: 'น้ำยาพิษใหญ่', damage: 170, radius: 52, projectile: 'proj_slime' },
  mixture_bomb: { id: 'mixture_bomb', name: 'ระเบิดสารผสม', damage: 160, radius: 60, projectile: 'proj_beaker' },
  /** Ultimate: fired 3 times in a spread */
  atom_storm: { id: 'atom_storm', name: 'พายุอะตอม', damage: 120, radius: 65, projectile: 'proj_atom' },
  // World 2: cells
  germ_spit: { id: 'germ_spit', name: 'ก้อนเชื้อโรค', damage: 145, radius: 46, projectile: 'proj_slime' },
  germ_burst: { id: 'germ_burst', name: 'เชื้อโรคแบ่งตัว', damage: 175, radius: 54, projectile: 'proj_slime' },
  amoeba_blob: { id: 'amoeba_blob', name: 'ไซโทพลาซึมเหนียว', damage: 165, radius: 62, projectile: 'proj_slime' },
  cell_flood: { id: 'cell_flood', name: 'น้ำท่วมเซลล์', damage: 120, radius: 66, projectile: 'proj_slime' },
  // World 3: plants
  spore_shot: { id: 'spore_shot', name: 'สปอร์พิษ', damage: 150, radius: 46, projectile: 'proj_pollen' },
  big_spore: { id: 'big_spore', name: 'สปอร์ยักษ์', damage: 180, radius: 55, projectile: 'proj_pollen' },
  thorn_seed: { id: 'thorn_seed', name: 'เมล็ดหนาม', damage: 170, radius: 60, projectile: 'proj_seed' },
  thorn_rain: { id: 'thorn_rain', name: 'ฝนหนาม', damage: 125, radius: 62, projectile: 'proj_seed' },
  // World 4: heat
  ember: { id: 'ember', name: 'ลูกไฟ', damage: 155, radius: 47, projectile: 'proj_fireball' },
  flame_ball: { id: 'flame_ball', name: 'ลูกไฟใหญ่', damage: 185, radius: 56, projectile: 'proj_fireball' },
  magma_bomb: { id: 'magma_bomb', name: 'ระเบิดแมกมา', damage: 175, radius: 64, projectile: 'proj_fireball' },
  meteor_rain: { id: 'meteor_rain', name: 'ฝนอุกกาบาตลาวา', damage: 125, radius: 66, projectile: 'proj_fireball' },
  // World 5: weather
  hail: { id: 'hail', name: 'ลูกเห็บ', damage: 160, radius: 46, projectile: 'proj_cannonball' },
  thunder_ball: { id: 'thunder_ball', name: 'ลูกบอลฟ้าร้อง', damage: 190, radius: 55, projectile: 'proj_lightning' },
  storm_bolt: { id: 'storm_bolt', name: 'สายฟ้าพายุ', damage: 180, radius: 62, projectile: 'proj_lightning' },
  lightning_strike: { id: 'lightning_strike', name: 'สายฟ้าฟาด', damage: 130, radius: 64, projectile: 'proj_lightning' },
};
