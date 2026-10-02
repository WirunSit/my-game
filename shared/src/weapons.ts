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
  mixture_bomb: { id: 'mixture_bomb', name: 'ระเบิดสารผสม', damage: 190, radius: 60, projectile: 'proj_beaker' },
  /** Ultimate: fired 3 times in a spread */
  atom_storm: { id: 'atom_storm', name: 'พายุอะตอม', damage: 150, radius: 65, projectile: 'proj_atom' },
};
