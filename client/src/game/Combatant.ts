import type { ShotTarget, Terrain, Vec, WeaponStats } from '@sciboom/shared';

/** Anything that stands on the battlefield, takes turns, shoots and gets hit */
export interface Combatant {
  readonly id: string;
  readonly name: string;
  /** Texture shown in the HUD panel */
  readonly portraitKey: string;
  /** Colour of the dot on the mini-map */
  readonly color: number;
  readonly maxHp: number;
  hp: number;
  alive: boolean;
  /** Camouflaged: hidden from the other side (and from the mini-map) */
  hidden: boolean;
  /** Feet position */
  x: number;
  y: number;
  /** Aim angle above the horizon, 0–90° */
  angle: number;
  facing: 1 | -1;
  /** Power of the previous shot (marker on the power bar) */
  lastPower: number | null;
  weapon: WeaponStats;
  /** How tall the sprite is (for placing damage numbers) */
  readonly height: number;
  readonly falling: boolean;

  toTarget(): ShotTarget;
  muzzle(): Vec;
  setActive(active: boolean): void;
  /** Apply gravity. Returns true if it fell off the map. */
  settle(terrain: Terrain, dt: number): boolean;
  takeDamage(amount: number): void;
  die(): void;
  celebrate(): void;
  /** Move sprites to match the current state */
  sync(): void;
}
