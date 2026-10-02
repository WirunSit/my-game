// Player progress kept in the browser (localStorage) until accounts arrive in phase 6.
// Every read/write is wrapped: private windows or blocked storage must not break the game.
import { EMPTY_OUTFIT, sanitizeOutfit, type Character, type Outfit, type WeaponItem } from '@sciboom/shared';

export type { Character };

export interface AnswerRecord {
  /** Question id, e.g. "u1-004" */
  id: string;
  ok: boolean;
  /** Milliseconds taken to answer */
  ms: number;
  /** When (epoch ms) */
  at: number;
}

export interface SaveData {
  /** Name shown to other players (PvP) */
  nickname: string;
  character: Character;
  /** Best stars per cleared stage, e.g. { "1-1": 3 } */
  stars: Record<string, number>;
  crystals: number;
  coins: number;
  level: number;
  exp: number;
  weapons: WeaponItem[];
  /** uid of the weapon used in stages */
  equipped: string;
  /** Wardrobe: what the character wears (only items unlocked at the current level) */
  outfit: Outfit;
  /** Recent answers (sent to the teacher dashboard once accounts exist) */
  answers: AnswerRecord[];
}

const KEY = 'sciboom.save.v1';
const MAX_ANSWERS = 500;

const STARTER: WeaponItem = { uid: 'starter', id: 'starter_cannon', rarity: 1, level: 1 };

function fresh(): SaveData {
  return { nickname: '', character: 'boy', stars: {}, crystals: 0, coins: 0, level: 1, exp: 0, weapons: [{ ...STARTER }], equipped: STARTER.uid, outfit: { ...EMPTY_OUTFIT }, answers: [] };
}

/** Fix up saves from older versions or hand-edited storage */
function repair(d: SaveData): SaveData {
  if (!Array.isArray(d.weapons) || d.weapons.length === 0) d.weapons = [{ ...STARTER }];
  if (!d.weapons.some((w) => w.uid === d.equipped)) d.equipped = d.weapons[0].uid;
  d.outfit = sanitizeOutfit(d.outfit, d.level);
  return d;
}

export function newUid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function equippedWeapon(d: SaveData): WeaponItem {
  return d.weapons.find((w) => w.uid === d.equipped) ?? d.weapons[0];
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    return repair({ ...fresh(), ...(JSON.parse(raw) as Partial<SaveData>) });
  } catch {
    return fresh();
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable — progress just won't persist
  }
}

export function updateSave(change: (data: SaveData) => void): SaveData {
  const data = loadSave();
  change(data);
  if (data.answers.length > MAX_ANSWERS) data.answers = data.answers.slice(-MAX_ANSWERS);
  writeSave(data);
  return data;
}
