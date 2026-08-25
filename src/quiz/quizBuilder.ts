import type { CountryFacts } from '@/data/types';

import type { FieldId, QuizConfig } from './quizConfig';
import { answerableFields, countriesIn, type QuizCountry } from './quizCountries';

/**
 * Turning a config into an ordered list of questions.
 *
 * The order is random but SEEDED. Two things depend on that: replaying a round, and the
 * Maestro flow, which deep-links a fixed seed so it can type an answer it knows is
 * right. `Math.random` would make the E2E flow able to assert on nothing but structure.
 */

export type QuizQuestion = {
  iso3: string;
  facts: CountryFacts;
  /**
   * Only the fields this country can actually be asked - see `answerableFields`.
   *
   * **Empty in `locate` mode**, where the only thing asked is where the country is and
   * nothing is typed at all. `gradeLocation` grades those rounds; `gradeQuestion` never
   * sees one.
   */
  fields: FieldId[];
};

/**
 * mulberry32: 32-bit, seedable, no dependency, and identical on every JS engine - which
 * matters because Jest runs on Node and the quiz runs on Hermes.
 */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, non-mutating, with every random draw coming from `rng`. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function buildQuiz(
  config: QuizConfig,
  pool: readonly QuizCountry[] = countriesIn(config.subregions),
): QuizQuestion[] {
  /**
   * Every country in the pool is askable in `locate` mode, and none of them needs a
   * field list: the question is where it is, and having an outline to point at is
   * already what `QUIZ_COUNTRIES` selects on. So the completeness filter below - which
   * exists purely to drop a country that cannot answer any of the CHOSEN facts - has
   * nothing to do here, and applying it would drop Micronesia from a currency-configured
   * locate round for a reason that round never asks about.
   */
  const locate = config.mode === 'locate';

  const questions = pool
    .map((country) => ({
      iso3: country.iso3,
      facts: country.facts,
      fields: locate ? [] : answerableFields(country.facts, config.fields),
    }))
    // A country with nothing askable would be a question with no inputs. Only reachable
    // when the config asks for a single field that this country lacks - currency and
    // Micronesia is the one real case.
    .filter((question) => locate || question.fields.length > 0);

  return shuffle(questions, makeRng(config.seed));
}
