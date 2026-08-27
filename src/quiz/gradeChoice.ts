import type { FieldGrade, QuestionResult } from './gradeAnswer';
import type { FieldId } from './quizConfig';
import type { FieldOptions } from './quizOptions';

/**
 * Marking a multiple-choice round: you pressed one of four buttons.
 *
 * Its own module rather than a branch inside `gradeAnswer.ts`, and for the reason
 * `gradeLocation.ts` gives: everything there is about being forgiving with a STRING -
 * normalising accents, allowing a typo, refusing a confusable neighbour - and none of it
 * has anything to say about a canonical string the player picked off a button. There is
 * one right answer and comparing it is `===`.
 *
 * Keeping it out also keeps `CURRENCIES_REQUIRED` where it is. Feeding a pick back
 * through `gradeField` would mean relaxing that rule for choice rounds, since a country
 * with two currencies would otherwise need two picks to come out correct - a change
 * inside the grader that `grading.test.ts` and `gradingRu.test.ts` sweep 193x193.
 *
 * The result is shaped as a `QuestionResult` so the score screen, `summarize`,
 * `recordResult`, the review list and the retry builder all work unchanged.
 */
export function gradeChoice(
  question: {
    iso3: string;
    fields: FieldId[];
    options?: Partial<Record<FieldId, FieldOptions>>;
  },
  picks: Partial<Record<FieldId, string>>,
): QuestionResult {
  const grades = question.fields.flatMap((field): FieldGrade[] => {
    const offered = question.options?.[field];
    // A configured field with no options is not a question, so it is not a grade either.
    // Unreachable through `buildQuiz`, which builds options for every askable field.
    if (!offered) return [];

    const picked = picks[field];
    const correct = picked === offered.answer;

    return [
      {
        field,
        correct,
        // `blank` is a real outcome: pressing Check having picked nothing is the same
        // "no idea, show me" move that `locate` and a facts round with empty boxes allow.
        how: correct ? 'exact' : picked ? 'wrong' : 'blank',
        given: picked ?? '',
        expected: offered.answer,
      },
    ];
  });

  return {
    iso3: question.iso3,
    grades,
    allCorrect: grades.length > 0 && grades.every((grade) => grade.correct),
  };
}
