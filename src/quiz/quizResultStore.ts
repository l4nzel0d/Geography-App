import type { QuizRun } from './quizScore';

/**
 * A one-slot handover between the quiz screen and the results screen.
 *
 * The config travels between routes as URL params, but a finished round is up to 193
 * countries times five graded fields - far too much for a query string. It also has to
 * survive the play screen unmounting: results are reached with `router.replace`, which
 * is deliberate, because that is what tears down the second MapLibre surface.
 *
 * A module singleton rather than a context, because a context would have to live in
 * `_layout.tsx` - above the whole app - to outlive that unmount, and this is the pattern
 * the codebase already uses for `allCountryFacts`, `worldGeoJson` and `pickCountry`'s
 * feature index.
 */
let pending: QuizRun | null = null;

export function setQuizResult(run: QuizRun): void {
  pending = run;
}

/**
 * Read the run and clear it.
 *
 * Clearing on read is what stops a stale round reappearing when the results route is
 * opened again later - by a back gesture, or by a dev reload straight onto the URL. The
 * screen reads this once, into a `useState` initialiser.
 */
export function takeQuizResult(): QuizRun | null {
  const run = pending;
  pending = null;
  return run;
}
