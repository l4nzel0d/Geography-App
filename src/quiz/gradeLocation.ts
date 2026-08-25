import { getCountryFacts } from '@/data/countryFacts';

import type { QuestionResult } from './gradeAnswer';
import { LOCATION_FIELD } from './quizConfig';

/**
 * Marking a `locate` round: you were given a name and you tapped the map.
 *
 * Deliberately its own module rather than a sixth case in `gradeAnswer.ts`. Everything
 * there is about being forgiving with a STRING - normalising accents, allowing a typo,
 * refusing a confusable neighbour - and none of it applies to an ISO-3 code that came
 * out of `pickCountry`. There is exactly one right answer and comparing it is `===`.
 *
 * The result is shaped as a `QuestionResult` with a single grade so the score screen,
 * `summarize` and the review list all work on a locate round unchanged; `location` is a
 * `GradedField` but not a `FieldId` precisely so that nothing which iterates the typed
 * fields has to learn about it. See `quizConfig.ts`.
 */
export function gradeLocation(
  question: { iso3: string; facts: { name: string } },
  picked: string | null,
): QuestionResult {
  const correct = picked === question.iso3;

  // The player is shown names, not codes, so the review line has to carry one. A picked
  // code with no facts record cannot happen through the map - `pickCountry` only ever
  // returns an ISO-3 the geometry carries - but falling back to the code keeps a
  // hand-driven test or a future caller from rendering `undefined`.
  const pickedName = picked ? (getCountryFacts(picked)?.name ?? picked) : '';

  return {
    iso3: question.iso3,
    grades: [
      {
        field: LOCATION_FIELD,
        correct,
        // `blank` is a real outcome here: pressing Check having tapped nothing is the
        // "I have no idea, show me" move, and it scores the same as a wrong tap.
        how: correct ? 'exact' : picked ? 'wrong' : 'blank',
        given: pickedName,
        expected: question.facts.name,
      },
    ],
    allCorrect: correct,
  };
}
