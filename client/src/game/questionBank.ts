import type { QuestionUnit } from '@sciboom/shared';
import unit1 from '../../../content/questions/unit1_pure_substances.json';
import unit2 from '../../../content/questions/unit2_cells.json';
import unit3 from '../../../content/questions/unit3_plants.json';
import unit4 from '../../../content/questions/unit4_heat.json';
import unit5 from '../../../content/questions/unit5_weather.json';
import { api } from '../net/api';

/**
 * Questions by unit. Starts with the copy built into the game and is replaced
 * by the server's bank (with the teacher's edits, disabled questions removed)
 * when the server can be reached.
 */
export const UNITS: Record<number, QuestionUnit> = {
  1: unit1 as QuestionUnit,
  2: unit2 as QuestionUnit,
  3: unit3 as QuestionUnit,
  4: unit4 as QuestionUnit,
  5: unit5 as QuestionUnit,
};

export async function loadServerQuestions(): Promise<boolean> {
  try {
    const res = await api<{ units: QuestionUnit[] }>('GET', 'questions', undefined, { timeoutMs: 5000 });
    // Never leave a unit with too few questions to play (e.g. the teacher disabled most of them)
    for (const u of res.units) if (u.questions.length >= 4) UNITS[u.unit] = u;
    return true;
  } catch {
    return false;
  }
}
