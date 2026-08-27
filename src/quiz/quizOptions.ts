import { formatPopulation } from '@/components/formatters';
import type { Locale } from '@/i18n/localeTypes';

import { nameAliases } from './answerAliases';
import { normalizeText } from './normalizeText';
import { shuffle } from './random';
import type { FieldId } from './quizConfig';
import type { QuizCountry } from './quizCountries';

/**
 * The wrong answers a multiple-choice round puts beside the right one.
 *
 * Pure and seeded, so a choice round replays button for button - the property every
 * other part of the quiz already has and the reason `.maestro/quiz.yaml` can assert on
 * an answer rather than on structure.
 */

/** One right answer and three wrong ones. */
export const CHOICE_OPTION_COUNT = 4;

/**
 * One wrong answer per tier, working outward. Sums to `CHOICE_OPTION_COUNT - 1`.
 *
 * So the grid a player sees is graded at three scales: the answer and one of its
 * neighbours, one more from the same continent, and one from nowhere near. Both earlier
 * shapes were worse in opposite directions - drawing everything nearest-first put all
 * four in one subregion, which is a coin flip with nothing to anchor it, and reserving
 * only one far slot left two neighbours crowding the answer.
 *
 * It IS an easier question than three neighbours: the tightest discrimination is now
 * between two rather than three. What it buys is a wrong answer that teaches - "that one
 * is not even on this continent" - rather than one that is merely hard, which is the
 * right trade for the mode that exists as the on-ramp to typing the answer.
 *
 * Satisfiable everywhere on today's pool: the three subregions with fewer than four UN
 * members (Australia and New Zealand 2, North America 3, Polynesia 3) each need exactly
 * one neighbour and have one, and every region has at least four subregions.
 */
export const CHOICE_TIER_QUOTA = { subregion: 1, region: 1, world: 1 } as const;

/** Keeps the option draw off the same RNG stream as the question shuffle. */
export const CHOICE_SALT = 0x1b873593;

export type FieldOptions = {
  /** Every option in the order they are drawn. Exactly one of them is `answer`. */
  options: string[];
  /** The correct one, verbatim as it appears in `options`. */
  answer: string;
};

/**
 * How each field turns a country into a button, and what a distractor may not be.
 *
 * `display` is always a string the typed grader would have accepted - the bare currency
 * NAME rather than `formatCurrency`'s "Brazilian real (BRL, R$)", because the code is
 * deliberately not the knowledge being tested and would not fit a button anyway. That
 * keeps the reveal line reading the same in both answering styles.
 *
 * `own` is everything the asked country could legitimately answer with, which is not the
 * same as `display`: South Africa has three capitals and shows one, and a country with
 * two currencies shows one. A distractor matching any of them would be a second correct
 * button, so the guard is over the whole list rather than over the shown value.
 *
 * A `Record<FieldId, ...>` rather than a switch, so a fifth field fails to compile until
 * someone has said what its options are.
 */
const FIELD_VALUES: Record<
  FieldId,
  {
    display: (country: QuizCountry, locale: Locale) => string | null;
    own: (country: QuizCountry, locale: Locale) => string[];
  }
> = {
  name: {
    display: (country) => country.facts.name || null,
    // Aliases and not just the name: "Congo" and "DR Congo" are two countries, and the
    // grader's own alias table is the only thing that knows which strings each claims.
    own: (country, locale) => nameAliases(country.iso3, country.facts, locale),
  },
  capital: {
    display: (country) => country.facts.capital[0] ?? null,
    own: (country) => country.facts.capital,
  },
  currency: {
    display: (country) => country.facts.currencies[0]?.name ?? null,
    own: (country) => country.facts.currencies.map((currency) => currency.name),
  },
  population: {
    display: (country, locale) =>
      country.facts.population == null ? null : formatPopulation(country.facts.population, locale),
    // A figure has no aliases, and the shown string is the only thing that could collide.
    // Duplicate display strings are already dropped below, which covers it.
    own: () => [],
  },
};

/**
 * Every other country, in three rings around the target.
 *
 * `subregion` is its immediate neighbours, `region` is the rest of its continent, and
 * `world` is everywhere else. One wrong answer is drawn from each, which is what makes
 * the grid a graded question rather than a flat one - see `CHOICE_TIER_QUOTA`.
 *
 * Called once per FIELD, not once per country, so the buttons for the capital are drawn
 * from different countries than the ones for the name. Reusing one ranking would make a
 * two-field question answerable twice over from one piece of knowledge.
 */
function rankedCandidates(
  target: QuizCountry,
  catalogue: readonly QuizCountry[],
  rng: () => number,
): { subregion: QuizCountry[]; region: QuizCountry[]; world: QuizCountry[] } {
  const sameSubregion: QuizCountry[] = [];
  const sameRegion: QuizCountry[] = [];
  const rest: QuizCountry[] = [];

  for (const country of catalogue) {
    if (country.iso3 === target.iso3) continue;
    if (country.subregion === target.subregion) sameSubregion.push(country);
    else if (country.region === target.region) sameRegion.push(country);
    else rest.push(country);
  }

  // All three are shuffled whether or not they are reached, so the number of draws taken
  // from `rng` depends only on the catalogue - never on how early a tier filled up. The
  // seed has to pin the buttons as tightly as it pins the question order.
  return {
    subregion: shuffle(sameSubregion, rng),
    region: shuffle(sameRegion, rng),
    world: shuffle(rest, rng),
  };
}

export function buildFieldOptions(
  country: QuizCountry,
  fields: readonly FieldId[],
  catalogue: readonly QuizCountry[],
  rng: () => number,
  locale: Locale,
): Partial<Record<FieldId, FieldOptions>> {
  const built: Partial<Record<FieldId, FieldOptions>> = {};

  for (const field of fields) {
    const spec = FIELD_VALUES[field];
    const answer = spec.display(country, locale);
    // `fields` has already been through `answerableFields`, so this is unreachable
    // through the app - but a hand-built question must not produce a button-less field.
    if (!answer) continue;

    const forbidden = new Set(spec.own(country, locale).map(normalizeText));
    /** Display strings already spoken for - the answer's included. */
    const taken = new Set([answer]);
    const distractors: string[] = [];

    const takeFrom = (source: readonly QuizCountry[], wanted: number) => {
      let left = wanted;
      for (const candidate of source) {
        if (left <= 0) return;
        const value = spec.display(candidate, locale);
        if (!value) continue;
        // Deduping on the DISPLAY string is what stops two "Euro" buttons, two countries
        // whose populations round to the same figure, or a shared capital. The
        // `forbidden` check is the sharper one: it guarantees exactly one button is right.
        if (taken.has(value) || forbidden.has(normalizeText(value))) continue;
        taken.add(value);
        distractors.push(value);
        left -= 1;
      }
    };

    const { subregion, region, world } = rankedCandidates(country, catalogue, rng);

    takeFrom(subregion, CHOICE_TIER_QUOTA.subregion);
    takeFrom(region, CHOICE_TIER_QUOTA.region);
    takeFrom(world, CHOICE_TIER_QUOTA.world);

    /**
     * Whichever tier came up short is topped up from the whole ranking, nearest first.
     *
     * Not dead code, and the reason is `currency` rather than the country counts: a tier
     * shrinks whenever its candidates are rejected for sharing a display string with the
     * answer, and every euro country in Western Europe leaves exactly one usable
     * same-subregion currency (the Swiss franc). `name` and `capital` never reach here on
     * today's data, which is why those two are the fields the tests pin exactly.
     *
     * Re-walking is safe: `taken` is what refuses a repeat, not the position in the list.
     */
    takeFrom([...subregion, ...region, ...world], CHOICE_OPTION_COUNT - 1 - distractors.length);

    // Short of a full set only if the catalogue could not supply one, which the app's
    // 193 always can. The question stays playable with however many there are.
    built[field] = { options: shuffle([answer, ...distractors], rng), answer };
  }

  return built;
}
