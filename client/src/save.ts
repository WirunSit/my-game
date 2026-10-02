// Player progress kept in the browser (localStorage) until accounts arrive in phase 6.
// Every read/write is wrapped: private windows or blocked storage must not break the game.

export type Character = 'boy' | 'girl';

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
  character: Character;
  /** Best stars per cleared stage, e.g. { "1-1": 3 } */
  stars: Record<string, number>;
  crystals: number;
  /** Recent answers (sent to the teacher dashboard once accounts exist) */
  answers: AnswerRecord[];
}

const KEY = 'sciboom.save.v1';
const MAX_ANSWERS = 500;

function fresh(): SaveData {
  return { character: 'boy', stars: {}, crystals: 0, answers: [] };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    return { ...fresh(), ...(JSON.parse(raw) as Partial<SaveData>) };
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
