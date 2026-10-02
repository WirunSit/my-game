// Player progress. Kept in the browser (localStorage) and, when a student is
// logged in, also on the server (so it follows them to any computer and the
// teacher sees their answers). Without an account it stays on this device.
// Every read/write is wrapped: private windows or blocked storage must not break the game.
import { EMPTY_OUTFIT, sanitizeOutfit, type Character, type Outfit, type WeaponItem } from '@sciboom/shared';
import { api } from './net/api';
import { isStudent, session } from './net/session';

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
  /** Name shown to other players (PvP) when playing without an account */
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
  /** Recent answers (the server files them for the teacher's statistics) */
  answers: AnswerRecord[];
}

const GUEST_KEY = 'sciboom.save.v1';
const MAX_ANSWERS = 500;
/** Wait this long after the last change before sending progress to the server */
const SYNC_DELAY_MS = 1500;

const STARTER: WeaponItem = { uid: 'starter', id: 'starter_cannon', rarity: 1, level: 1 };

function fresh(): SaveData {
  return { nickname: '', character: 'boy', stars: {}, crystals: 0, coins: 0, level: 1, exp: 0, weapons: [{ ...STARTER }], equipped: STARTER.uid, outfit: { ...EMPTY_OUTFIT }, answers: [] };
}

/** Fix up saves from older versions or hand-edited storage */
function repair(d: SaveData): SaveData {
  if (!Array.isArray(d.weapons) || d.weapons.length === 0) d.weapons = [{ ...STARTER }];
  if (!d.weapons.some((w) => w.uid === d.equipped)) d.equipped = d.weapons[0].uid;
  if (!Array.isArray(d.answers)) d.answers = [];
  d.outfit = sanitizeOutfit(d.outfit, d.level);
  return d;
}

/** Each student account has its own copy on the device, separate from the guest's */
function storageKey(): string {
  return isStudent() ? `sciboom.save.s.${session.profile!.id}` : GUEST_KEY;
}

/** Marks a student's copy as having changes the server hasn't got yet */
function dirtyKey(): string | null {
  return isStudent() ? `sciboom.dirty.${session.profile!.id}` : null;
}

export function newUid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function equippedWeapon(d: SaveData): WeaponItem {
  return d.weapons.find((w) => w.uid === d.equipped) ?? d.weapons[0];
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return fresh();
    return repair({ ...fresh(), ...(JSON.parse(raw) as Partial<SaveData>) });
  } catch {
    return fresh();
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(data));
  } catch {
    // Storage unavailable — progress just won't persist on this device
  }
}

export function updateSave(change: (data: SaveData) => void): SaveData {
  const data = loadSave();
  change(data);
  if (data.answers.length > MAX_ANSWERS) data.answers = data.answers.slice(-MAX_ANSWERS);
  writeSave(data);
  scheduleSync();
  return data;
}

// ---- Server copy (students only) ---------------------------------------------------------

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function setDirty(on: boolean) {
  const key = dirtyKey();
  if (!key) return;
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function isDirty(): boolean {
  const key = dirtyKey();
  try {
    return !!key && localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function scheduleSync() {
  if (!isStudent()) return;
  setDirty(true);
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => void syncSave(), SYNC_DELAY_MS);
}

/** Send progress to the server now (also used when the tab is closed). Never throws. */
export async function syncSave(keepalive = false): Promise<boolean> {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = null;
  if (!isStudent() || !isDirty()) return true;
  try {
    await api('PUT', 'student/save', { save: loadSave() }, { keepalive });
    setDirty(false);
    return true;
  } catch {
    // Offline: keep the dirty mark and try again on the next change or start-up
    return false;
  }
}

/**
 * After logging in (or on start-up): use the server's copy, unless this
 * device has changes the server hasn't seen yet — then send those instead.
 */
export async function reconcileSave(serverSave: unknown) {
  if (isDirty()) {
    await syncSave();
    return;
  }
  writeSave(serverSave && typeof serverSave === 'object' ? repair({ ...fresh(), ...(serverSave as Partial<SaveData>) }) : fresh());
}

// Leaving the page: last chance to upload progress
if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void syncSave(true);
  });
}
