// The bundled question bank (content/questions/*.json), used to seed the database
// and by PvP Quiz Duel when no database is set up.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { QuestionUnit } from '@sciboom/shared';

export const ROOT = join(import.meta.dirname, '..', '..');

export function loadQuestionUnits(): QuestionUnit[] {
  const dir = join(ROOT, 'content', 'questions');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as QuestionUnit);
}
