import type { QuizCountry } from './quizCountries';

/**
 * Choosing which countries a practice round asks about.
 *
 * Pure and seeded, like everything else in this folder: it takes the scores as a parameter
 * and never imports the store, so a round is reproducible from `(pool, scores, seed)` and
 * the weighting can be tested without a device.
 */

/**
 * How long a practice round is.
 *
 * There is no round-length control anywhere in the app - a normal round is the whole
 * filtered pool, which for the whole world is 193 questions - so this constant is also the
 * first bound the quiz has ever had. Ten is short enough to finish on a bus and long
 * enough for the weighting to visibly bite.
 */
export const PRACTICE_ROUND_SIZE = 10;

/**
 * The weight a perfectly-known country keeps.
 *
 * Nothing is ever excluded, which is what makes consecutive practice rounds differ rather
 * than serving the same ten countries until you improve. It also means a player who has
 * mastered everything still gets a full round instead of an empty one.
 */
export const PRACTICE_FLOOR = 0.15;

/** Sharpens the bias toward the weak end; 2 gives roughly a 7:1 spread. */
export const PRACTICE_EXPONENT = 2;

/**
 * How likely this country is to be picked.
 *
 * **A country that has never been asked weighs exactly as much as one always answered
 * wrong**, and that is the point: unseen is maximally weak, which is what makes practice
 * work on a fresh install with an empty table and lets it double as a way of working
 * through the whole world.
 *
 * **The score handed in must be `practiceScores`, not the map's `scores`.** They disagree
 * on purpose: the map paints honest accuracy, so a country answered right once reads 1.0
 * there and would land on `PRACTICE_FLOOR` here - retired from practice on the strength of
 * a single lucky guess. The practice score keeps `MASTERY_PRIOR` for exactly this, putting
 * that country at 0.5 and so around 0.40 weight, well above a nine-of-nine one at 0.16.
 */
export function practiceWeight(mastery: number | undefined): number {
  const known = typeof mastery === 'number' && Number.isFinite(mastery) ? mastery : 0;
  return PRACTICE_FLOOR + (1 - known) ** PRACTICE_EXPONENT;
}

/**
 * `count` countries drawn from `pool`, biased toward the ones the player knows worst.
 *
 * Weighted sampling **without replacement**: a roulette-wheel draw, then the pick is
 * removed and its weight subtracted, repeated. O(n x k) - about 2000 operations for 193
 * countries and 10 picks - and far easier to reason about than an alias table.
 *
 * Returns fewer than `count` only when the pool is smaller, which is what a two-country
 * subregion should do.
 */
export function pickWeakSpots(
  pool: readonly QuizCountry[],
  /** `practiceScores` from the mastery store - see `practiceWeight`, not the map's map. */
  scores: Readonly<Record<string, number>>,
  count: number,
  rng: () => number,
): QuizCountry[] {
  const remaining = [...pool];
  const weights = remaining.map((country) => practiceWeight(scores[country.iso3]));

  let total = weights.reduce((sum, weight) => sum + weight, 0);
  const wanted = Math.min(count, remaining.length);
  const picked: QuizCountry[] = [];

  for (let n = 0; n < wanted; n += 1) {
    let target = rng() * total;
    let index = remaining.length - 1;

    for (let i = 0; i < remaining.length; i += 1) {
      target -= weights[i];
      if (target <= 0) {
        index = i;
        break;
      }
    }

    picked.push(remaining[index]);
    total -= weights[index];

    // Swap-and-pop rather than splice: order in `remaining` is irrelevant, because
    // `buildQuiz` shuffles the result anyway.
    const lastIndex = remaining.length - 1;
    remaining[index] = remaining[lastIndex];
    weights[index] = weights[lastIndex];
    remaining.pop();
    weights.pop();
  }

  return picked;
}
