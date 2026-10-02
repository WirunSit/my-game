// Messages between the game and the PvP server (JSON over WebSocket at /ws).
import type { ShotTimeline, SkillSlot, SkillState } from './battle';
import type { Character, Outfit } from './cosmetics';
import type { QuizItem } from './questions';

/** Room codes: 5 characters, no look-alikes (0/O, 1/I) */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;
/** Quiz Duel: a right answer before your shot makes it this much stronger */
export const QUIZ_DUEL_BONUS = 1.15;

export interface PlayerInfo {
  id: string;
  name: string;
  character: Character;
  outfit: Outfit;
  level: number;
  weaponId: string;
  x: number;
  y: number;
  facing: 1 | -1;
}

export type ClientMessage =
  | { t: 'hello'; name: string; character: Character; outfit: Outfit; level: number; weaponId: string; token?: string }
  | { t: 'create'; quizDuel: boolean }
  | { t: 'join'; code: string }
  | { t: 'leave' }
  | { t: 'move'; x: number; y: number; facing: 1 | -1; angle: number }
  | { t: 'skill'; slot: 'heal' | 'stealth' }
  | { t: 'fire'; x: number; y: number; facing: 1 | -1; angle: number; power: number; armed: SkillSlot | null }
  | { t: 'pass' }
  | { t: 'answer'; chosen: number }
  | { t: 'rematch' };

export type ServerMessage =
  | { t: 'welcome'; id: string }
  | { t: 'created'; code: string; quizDuel: boolean }
  | { t: 'error'; message: string }
  | { t: 'start'; you: string; code: string; seed: number; map: number[]; players: PlayerInfo[]; quizDuel: boolean }
  | { t: 'turn'; actor: string; wind: number; seconds: number; burn: number; hp: Record<string, number>; skills: SkillState | null }
  | { t: 'quiz'; item: QuizItem; seconds: number }
  | { t: 'quizResult'; id: string; correct: boolean }
  | { t: 'moved'; id: string; x: number; y: number; facing: 1 | -1; angle: number }
  | { t: 'skillUsed'; id: string; slot: 'heal' | 'stealth'; hp: number; skills: SkillState | null }
  | {
      t: 'shot';
      id: string;
      x: number;
      y: number;
      facing: 1 | -1;
      angle: number;
      armed: SkillSlot | null;
      timelines: ShotTimeline[];
      /** Where everyone ended up, and their health, once everything settled */
      units: { id: string; x: number; y: number; hp: number; alive: boolean }[];
      skills: SkillState | null;
    }
  | { t: 'skipped'; id: string }
  | { t: 'over'; winner: string | null; reason: 'win' | 'left' }
  | { t: 'rematchWanted'; id: string };
