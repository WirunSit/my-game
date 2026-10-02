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

export const WEAPONS: Record<string, WeaponStats> = {
  starter_cannon: { id: 'starter_cannon', name: 'ปืนใหญ่ฝึกหัด', damage: 260, radius: 55, projectile: 'proj_cannonball' },
  beaker_gun: { id: 'beaker_gun', name: 'ปืนบีกเกอร์', damage: 260, radius: 55, projectile: 'proj_beaker' },
};
