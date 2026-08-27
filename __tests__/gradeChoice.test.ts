/**
 * Marking a multiple-choice round.
 *
 * Short, for the reason `gradeLocation.test.ts` is short: the rule is `===`. What the
 * tests are really pinning is the SHAPE, since the score screen, `summarize`,
 * `recordResult`, the review list and the retry builder all read a choice round through
 * the same `QuestionResult` a typed round produces.
 */
import { gradeChoice } from '@/quiz/gradeChoice';
import type { FieldOptions } from '@/quiz/quizOptions';
import type { FieldId } from '@/quiz/quizConfig';
import { summarize } from '@/quiz/quizScore';

const offered = (answer: string, ...wrong: string[]): FieldOptions => ({
  options: [...wrong.slice(0, 1), answer, ...wrong.slice(1)],
  answer,
});

const question = (options: Partial<Record<FieldId, FieldOptions>>) => ({
  iso3: 'PER',
  fields: Object.keys(options) as FieldId[],
  options,
});

const NAME = question({ name: offered('Peru', 'Chile', 'Bolivia', 'Ecuador') });

describe('gradeChoice', () => {
  it('marks the right button correct', () => {
    const result = gradeChoice(NAME, { name: 'Peru' });

    expect(result.allCorrect).toBe(true);
    expect(result.grades).toHaveLength(1);
    expect(result.grades[0]).toMatchObject({
      field: 'name',
      correct: true,
      how: 'exact',
      given: 'Peru',
      expected: 'Peru',
    });
  });

  it('marks a wrong button wrong, and says which one was pressed', () => {
    expect(gradeChoice(NAME, { name: 'Chile' }).grades[0]).toMatchObject({
      correct: false,
      how: 'wrong',
      given: 'Chile',
      expected: 'Peru',
    });
  });

  it('treats pressing nothing as blank, not as wrong', () => {
    // The "no idea, show me" move, which `locate` and a facts round with empty boxes
    // both allow. It scores the same as a wrong answer and reads differently.
    expect(gradeChoice(NAME, {}).grades[0]).toMatchObject({
      correct: false,
      how: 'blank',
      given: '',
      expected: 'Peru',
    });
  });

  it('needs every field right to call the country right', () => {
    const both = question({
      name: offered('Peru', 'Chile', 'Bolivia', 'Ecuador'),
      capital: offered('Lima', 'Quito', 'La Paz', 'Santiago'),
    });

    expect(gradeChoice(both, { name: 'Peru', capital: 'Lima' }).allCorrect).toBe(true);
    expect(gradeChoice(both, { name: 'Peru', capital: 'Quito' }).allCorrect).toBe(false);
    expect(gradeChoice(both, { name: 'Peru' }).grades).toHaveLength(2);
  });

  it('grades a field with no options rather than throwing on it', () => {
    // Unreachable through `buildQuiz`, which builds options for every askable field.
    // Asserted so a hand-built question degrades to one fewer grade, not to a red screen.
    const result = gradeChoice({ iso3: 'PER', fields: ['name', 'capital'], options: {} }, {});

    expect(result.grades).toHaveLength(0);
    expect(result.allCorrect).toBe(false);
  });

  it('summarises into the score screen like any other field', () => {
    const summary = summarize({
      config: {
        mode: 'facts',
        subregions: [],
        fields: ['name'],
        only: [],
        seed: 1,
        practice: false,
        choice: true,
      },
      results: [
        gradeChoice(NAME, { name: 'Peru' }),
        gradeChoice(NAME, { name: 'Chile' }),
        gradeChoice(NAME, {}),
      ],
      total: 3,
      endedEarly: false,
    });

    expect(summary.countriesAllCorrect).toBe(1);
    expect(summary.fieldsAsked).toBe(3);
    expect(summary.fieldsCorrect).toBe(1);
    // Keyed by the ordinary `FieldId`, so the per-field pills need no case for it.
    expect(summary.perField.name).toEqual({ asked: 3, correct: 1 });
  });
});
