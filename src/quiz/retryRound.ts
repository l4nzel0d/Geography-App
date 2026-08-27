import type { FieldId, GradedField, QuizConfig, RetryTarget } from './quizConfig';
import type { QuizRun } from './quizScore';

/**
 * The round that re-asks what you got wrong.
 *
 * Pure, and deliberately type-only in its imports: a retry is a decision about a finished
 * run, and every input it needs is already in that run. `exitPrompt.ts` and
 * `resetPrompt.ts` are the pattern - the one difference is that nothing here decides
 * wording, so no translator is threaded through.
 *
 * It narrows on BOTH axes, and the second one is the point: a five-field round where only
 * France's currency was missed re-asks France its currency, and does not make the player
 * retype the four facts they just proved they knew.
 */

/**
 * The countries that were not fully correct, in the order they were asked.
 *
 * **Reads `run.results` and never `run.total`**, which is what makes a round ended early
 * correct by construction: `finish` is handed only the questions actually checked, so a
 * country the player never reached is not in this list and cannot be retried. `total` sits
 * right there in `QuizRun` and is the obvious wrong thing to reach for.
 */
export function missedCountries(run: QuizRun): string[] {
  const missed = run.results.filter((result) => !result.allCorrect).map((result) => result.iso3);
  // A country appears once per round today; the dedupe costs nothing and makes this a set,
  // which is what `countriesWithCodes` treats it as.
  return [...new Set(missed)];
}

/**
 * Which fields ONE result got wrong, in the round's configured order.
 *
 * Written as a filter of `run.config.fields` rather than as a walk over the grades, and
 * that buys two things: `location` cannot survive it - a `locate` round grades `location`,
 * which is not a `FieldId` and so never appears in `config.fields`, which is why that mode
 * needs no special case anywhere here - and the order is the configured one, which is the
 * order `QuizPanel` draws its rows in.
 */
function wrongFieldsOf(run: QuizRun, index: number): FieldId[] {
  const wrong = new Set<GradedField>();
  for (const grade of run.results[index].grades) {
    if (!grade.correct) wrong.add(grade.field);
  }
  return run.config.fields.filter((field) => wrong.has(field));
}

/**
 * One target per missed country, each naming only that country's own wrong answers.
 *
 * This is the per-country precision, and it is why `QuizConfig.only` carries field lists
 * rather than being a bare list of codes. If France missed only its currency and Germany
 * only its capital, France is asked currency and Germany is asked capital - neither is
 * asked the other's.
 *
 * A `locate` round yields targets with empty field lists, because `location` is not a
 * `FieldId`. That is exactly right: `buildQuiz` ignores fields entirely in locate mode,
 * and an empty list falls through to the round's own `fields` anywhere else.
 */
export function missedTargets(run: QuizRun): RetryTarget[] {
  const targets: RetryTarget[] = [];

  run.results.forEach((result, index) => {
    if (result.allCorrect) return;
    targets.push({ iso3: result.iso3, fields: wrongFieldsOf(run, index) });
  });

  return targets;
}

/**
 * Every field missed anywhere in the round, in the configured order.
 *
 * The round's `fields` has to be the UNION of the targets', not any one target's:
 * `QuizPanel` mounts one row per configured field once for the whole round and hides the
 * ones the current country is not being asked. A `fields` narrower than some target's
 * would mount no row for that field, and the question would silently lose it.
 */
export function missedFields(run: QuizRun): FieldId[] {
  const wrong = new Set<GradedField>();
  for (const result of run.results) {
    for (const grade of result.grades) {
      if (!grade.correct) wrong.add(grade.field);
    }
  }
  return run.config.fields.filter((field) => wrong.has(field));
}

/**
 * The config for a retry round, or `null` when there is nothing to retry.
 *
 * `null` rather than an empty-`only` config, because an empty `only` means "no
 * restriction" - i.e. the whole world - which is the opposite of what an all-correct round
 * should produce. It is also the results screen's rule for whether to show the button.
 *
 * `seed` is a parameter rather than a `newSeed()` call inside, so this module stays pure
 * and a test can assert the whole config. That is the same split `results.tsx` already
 * makes for "Play again".
 */
export function buildRetryConfig(run: QuizRun, seed: number): QuizConfig | null {
  const only = missedTargets(run);
  if (only.length === 0) return null;

  const narrowed = missedFields(run);

  return {
    mode: run.config.mode,
    // Carried untouched, and not used to select anyone: `only` replaces the subregion
    // filter. It is here because "Change settings" pops back to a setup screen that still
    // shows these ticked.
    subregions: run.config.subregions,
    /**
     * The fallback is load-bearing, and not only for `locate`.
     *
     * `fields: []` round-trips through `parseQuizParams` into `DEFAULT_FIELDS`, so
     * emitting an empty list would silently rewrite the round: a locate round's carried
     * currency selection would come back as a name round. Anything that narrows to
     * nothing keeps what it started with.
     */
    fields: narrowed.length ? narrowed : run.config.fields,
    only,
    // Explicit, so a real config never says both. `only` would win at the call site
    // anyway; a config that claimed to be a practice round while naming its countries
    // would just be a lie waiting to be read by something else.
    practice: false,
    // Carried, not reset: a retry re-asks the same questions the same way. Answering by
    // button and then being made to type the same misses would be a different round.
    choice: run.config.choice,
    seed,
  };
}
