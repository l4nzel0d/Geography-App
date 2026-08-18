import type { QuestionResult } from './gradeAnswer';
import type { FieldId, QuizConfig } from './quizConfig';

/** One finished round, handed to the results screen. */
export type QuizRun = {
  config: QuizConfig;
  /** In the order they were asked. */
  results: QuestionResult[];
  /** How many questions the round contained, whether or not they were reached. */
  total: number;
  /** True when the player pressed End quiz rather than running out of countries. */
  endedEarly: boolean;
};

export type QuizSummary = {
  countriesAsked: number;
  countriesAllCorrect: number;
  fieldsAsked: number;
  fieldsCorrect: number;
  perField: Partial<Record<FieldId, { asked: number; correct: number }>>;
};

/**
 * Two different scores, because they answer different questions: "how many countries did
 * I fully know" is the headline, and "how many individual facts did I get" is the one
 * that stays encouraging on a long round where most countries missed one field.
 */
export function summarize(run: QuizRun): QuizSummary {
  const perField: QuizSummary['perField'] = {};
  let fieldsAsked = 0;
  let fieldsCorrect = 0;

  for (const result of run.results) {
    for (const grade of result.grades) {
      const bucket = perField[grade.field] ?? { asked: 0, correct: 0 };
      bucket.asked += 1;
      if (grade.correct) bucket.correct += 1;
      perField[grade.field] = bucket;

      fieldsAsked += 1;
      if (grade.correct) fieldsCorrect += 1;
    }
  }

  return {
    countriesAsked: run.results.length,
    countriesAllCorrect: run.results.filter((r) => r.allCorrect).length,
    fieldsAsked,
    fieldsCorrect,
    perField,
  };
}
