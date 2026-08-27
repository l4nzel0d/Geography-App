import type { CountryFacts } from '@/data/types';
import { getLocale } from '@/i18n/locale';
import type { Locale } from '@/i18n/localeTypes';

import { makeRng, shuffle } from './random';
import type { FieldId, QuizConfig } from './quizConfig';
import {
  answerableFields,
  countriesIn,
  QUIZ_COUNTRIES,
  QUIZ_COUNTRIES_BY_LOCALE,
  type QuizCountry,
} from './quizCountries';
import { buildFieldOptions, CHOICE_SALT, type FieldOptions } from './quizOptions';

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
  /**
   * The options each field offers, in the order they are drawn.
   *
   * **Absent unless the round is a choice round**, which is what keeps a typed round
   * identical to what it was before this existed. A field the country cannot be asked
   * has no entry, which is why `QuizPanel` decides input-versus-buttons from the round's
   * own flag rather than from whether this happens to be here.
   */
  options?: Partial<Record<FieldId, FieldOptions>>;
};

/**
 * Both live in `random.ts` now, and are re-exported here because that is where every
 * call site already imports them from. See that module for why they had to move.
 */
export { makeRng, shuffle } from './random';

export function buildQuiz(
  config: QuizConfig,
  pool: readonly QuizCountry[] = countriesIn(config.subregions),
  /**
   * Which language the options are written in. The facts already came in with the pool,
   * which `play.tsx` resolves with the ambient locale, so this defaults to the same
   * thing rather than being threaded from the call site.
   */
  locale: Locale = getLocale(),
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

  /**
   * Which fields each country is asked, when the config names them per country.
   *
   * This is the one thing `only` cannot delegate to the injected pool: the pool answers
   * WHO is asked, and per-question fields are computed here and nowhere else. A target
   * with an empty field list falls through to the round's own `config.fields`, which is
   * what a hand-typed `?only=FRA` means.
   *
   * `config.fields` is still the union of every target's, so `QuizPanel` mounts a row per
   * field once for the whole round and hides the ones this country is not being asked -
   * the machinery that already existed for a country missing a fact.
   */
  const askOnly = new Map(
    config.only.filter((target) => target.fields.length).map((target) => [target.iso3, target.fields]),
  );

  const questions = pool
    .map((country) => ({
      iso3: country.iso3,
      facts: country.facts,
      fields: locate
        ? []
        : answerableFields(country.facts, askOnly.get(country.iso3) ?? config.fields),
    }))
    // A country with nothing askable would be a question with no inputs. Only reachable
    // when the config asks for a single field that this country lacks - currency and
    // Micronesia is the one real case.
    .filter((question) => locate || question.fields.length > 0);

  const ordered = shuffle(questions, makeRng(config.seed));

  // Nothing to offer buttons for in a locate round: the answer is the tap.
  if (!config.choice || locate) return ordered;

  /**
   * Options are drawn from a SEPARATE mulberry32 stream, and that is load-bearing.
   *
   * Sharing the shuffle's stream would mean turning multiple choice on changed which
   * countries a seed asks and in what order - silently breaking `quizBuilder.test.ts`'s
   * pinned rounds and `.maestro/quiz.yaml`'s pinned-seed answer. Same discipline, and
   * the same reason, as `PRACTICE_SALT` in `play.tsx`.
   */
  const optionsRng = makeRng(config.seed ^ CHOICE_SALT);

  /**
   * Distractors come from the WHOLE catalogue, never the round's pool.
   *
   * A round restricted to *Australia and New Zealand* has two countries in it and a
   * retry round has one, and neither could fill four buttons. Who gets asked and what
   * the wrong answers are is not the same question; plausibility is the subregion
   * preference's job, not the pool's.
   */
  const catalogue = QUIZ_COUNTRIES_BY_LOCALE[locale] ?? QUIZ_COUNTRIES;
  const byIso = new Map(catalogue.map((country) => [country.iso3, country]));

  return ordered.map((question) => {
    // `region`/`subregion` are the English identifiers, which live on the pool entry and
    // not on the localized facts - so the tiering is read off the catalogue rather than
    // off `question.facts`.
    const target = byIso.get(question.iso3);
    if (!target) return question;
    return {
      ...question,
      options: buildFieldOptions(target, question.fields, catalogue, optionsRng, locale),
    };
  });
}
