import type { QuestionUnit } from '@sciboom/shared';
import unit1 from '../../../content/questions/unit1_pure_substances.json';
import unit2 from '../../../content/questions/unit2_cells.json';
import unit3 from '../../../content/questions/unit3_plants.json';
import unit4 from '../../../content/questions/unit4_heat.json';
import unit5 from '../../../content/questions/unit5_weather.json';

// Bundled question bank (moves to the server + teacher editor in phase 6)
export const UNITS: Record<number, QuestionUnit> = {
  1: unit1 as QuestionUnit,
  2: unit2 as QuestionUnit,
  3: unit3 as QuestionUnit,
  4: unit4 as QuestionUnit,
  5: unit5 as QuestionUnit,
};
