/**
 * Building the round that re-asks what you got wrong.
 *
 * Pure, so everything here is a hand-built `QuizRun` and an assertion on the config that
 * comes back. What Jest cannot see is that the config survives a real `router.replace` -
 * `useLocalSearchParams` is mocked wholesale - which is why `.maestro/quiz.yaml` gained a
 * retry step.
 */
import type { FieldGrade, QuestionResult } from '@/quiz/gradeAnswer';
import { parseQuizParams, toQuizParams, type QuizConfig } from '@/quiz/quizConfig';
import type { QuizRun } from '@/quiz/quizScore';
import {
  buildRetryConfig,
  missedCountries,
  missedFields,
  missedTargets,
} from '@/quiz/retryRound';

const grade = (field: FieldGrade['field'], correct: boolean): FieldGrade => ({
  field,
  correct,
  how: correct ? 'exact' : 'wrong',
  given: correct ? 'right' : 'wrong',
  expected: 'right',
});

const question = (iso3: string, grades: FieldGrade[]): QuestionResult => ({
  iso3,
  grades,
  allCorrect: grades.every((g) => g.correct),
});

const config = (over: Partial<QuizConfig> = {}): QuizConfig => ({
  mode: 'facts',
  subregions: [],
  fields: ['name'],
  only: [],
  seed: 1,
  practice: false,
  choice: false,
  ...over,
});

const run = (results: QuestionResult[], over: Partial<QuizRun> = {}): QuizRun => ({
  config: config(),
  results,
  total: results.length,
  endedEarly: false,
  ...over,
});

describe('missedCountries', () => {
  it('is the countries that were not fully correct, in the order asked', () => {
    const finished = run([
      question('JPN', [grade('name', false)]),
      question('FRA', [grade('name', true)]),
      question('PER', [grade('name', true), grade('capital', false)]),
    ]);

    expect(missedCountries(finished)).toEqual(['JPN', 'PER']);
  });

  it('is empty when everything was right', () => {
    expect(missedCountries(run([question('FRA', [grade('name', true)])]))).toEqual([]);
  });

  it('counts a blank-but-checked answer as missed', () => {
    // Checking with every box empty is a legal move - the "no idea, show me" one - and it
    // earns a second look rather than being treated as a question never asked.
    const blank: FieldGrade = {
      field: 'name',
      correct: false,
      how: 'blank',
      given: '',
      expected: 'Japan',
    };
    expect(missedCountries(run([question('JPN', [blank])]))).toEqual(['JPN']);
  });

  it('ignores questions that were never reached', () => {
    // A round ended early hands `finish` only what was checked, so unreached countries are
    // not in `results` at all. `total` sits right there in `QuizRun` and is the obvious
    // wrong thing to reach for - this is the test that says so.
    const ended = run([question('JPN', [grade('name', false)])], { total: 10, endedEarly: true });

    expect(ended.total).toBe(10);
    expect(missedCountries(ended)).toEqual(['JPN']);
  });
});

describe('missedFields', () => {
  it('keeps the configured order, not the order they were missed in', () => {
    // It is the answer panel's row order, and `getQuizPanelLayout`'s input.
    const finished = run(
      [
        question('JPN', [grade('name', true), grade('capital', true), grade('currency', false)]),
        question('PER', [grade('name', false), grade('capital', true), grade('currency', true)]),
      ],
      { config: config({ fields: ['name', 'capital', 'currency'] }) },
    );

    expect(missedFields(finished)).toEqual(['name', 'currency']);
  });

  it('drops a field nobody got wrong', () => {
    const finished = run([question('JPN', [grade('name', true), grade('capital', false)])], {
      config: config({ fields: ['name', 'capital'] }),
    });

    expect(missedFields(finished)).toEqual(['capital']);
  });

  it('cannot return `location`, which is why locate mode needs no special case', () => {
    // `location` is graded but is not a `FieldId`, so it never appears in `config.fields`
    // and filtering that list can never surface it.
    const finished = run([question('JPN', [grade('location', false)])], {
      config: config({ mode: 'locate', fields: ['currency'] }),
    });

    expect(missedFields(finished)).toEqual([]);
  });
});

describe('buildRetryConfig', () => {
  it('is null when nothing was missed, which is what hides the button', () => {
    expect(buildRetryConfig(run([question('FRA', [grade('name', true)])]), 7)).toBeNull();
  });

  it('asks exactly the countries that were missed', () => {
    const finished = run([
      question('FRA', [grade('name', true)]),
      question('JPN', [grade('name', false)]),
    ]);

    expect(buildRetryConfig(finished, 7)?.only).toEqual([{ iso3: 'JPN', fields: ['name'] }]);
  });

  it('replays the round in the same answering style', () => {
    // A retry that made the player type what they had just answered by button would be a
    // different round, not the same one again.
    const finished = run([question('JPN', [grade('name', false)])], {
      config: config({ choice: true }),
    });

    expect(buildRetryConfig(finished, 7)?.choice).toBe(true);
    expect(buildRetryConfig(run([question('JPN', [grade('name', false)])]), 7)?.choice).toBe(false);
  });

  it('narrows the fields to the ones actually missed', () => {
    const finished = run(
      [question('JPN', [grade('name', true), grade('capital', false), grade('currency', false)])],
      { config: config({ fields: ['name', 'capital', 'currency'] }) },
    );

    expect(buildRetryConfig(finished, 7)?.fields).toEqual(['capital', 'currency']);
  });

  it('never narrows to an empty field list', () => {
    // Not aesthetics: `fields: []` round-trips through `parseQuizParams` into
    // `DEFAULT_FIELDS`, so emitting one would silently rewrite a locate round's carried
    // currency selection into a name round.
    const locate = run([question('JPN', [grade('location', false)])], {
      config: config({ mode: 'locate', fields: ['currency'] }),
    });

    expect(buildRetryConfig(locate, 7)?.fields).toEqual(['currency']);
  });

  it('is never a practice round, even when the round it came from was', () => {
    const finished = run([question('JPN', [grade('name', false)])], {
      config: config({ practice: true }),
    });

    expect(buildRetryConfig(finished, 7)?.practice).toBe(false);
  });

  it('carries mode and subregions untouched, including ones `only` does not belong to', () => {
    // `only` REPLACES the subregion filter rather than intersecting it, so a retry whose
    // countries sit outside the selection is still a real round - and the selection
    // survives for "Change settings" to pop back to.
    const finished = run([question('JPN', [grade('name', false)])], {
      config: config({ mode: 'flag', subregions: ['Eastern Africa'] }),
    });

    const retry = buildRetryConfig(finished, 7);
    expect(retry?.mode).toBe('flag');
    expect(retry?.subregions).toEqual(['Eastern Africa']);
    expect(retry?.only).toEqual([{ iso3: 'JPN', fields: ['name'] }]);
  });

  it('is pure: the same run and seed give the same config', () => {
    const finished = run([question('JPN', [grade('name', false)])]);
    expect(buildRetryConfig(finished, 7)).toEqual(buildRetryConfig(finished, 7));
  });

  it('takes its seed from the caller, so the module stays pure', () => {
    const finished = run([question('JPN', [grade('name', false)])]);
    expect(buildRetryConfig(finished, 12345)?.seed).toBe(12345);
  });

  it('survives the URL, which is the claim the whole feature rests on', () => {
    const finished = run(
      [
        question('JPN', [grade('name', false), grade('capital', true)]),
        question('PER', [grade('name', false), grade('capital', true)]),
      ],
      { config: config({ fields: ['name', 'capital'], subregions: ['Western Europe'] }) },
    );

    const retry = buildRetryConfig(finished, 7)!;
    expect(parseQuizParams({ ...toQuizParams(retry) })).toEqual(retry);
  });

  it('shrinks on both axes when a retry is itself retried', () => {
    const first = run(
      [
        question('JPN', [grade('name', false), grade('capital', false)]),
        question('PER', [grade('name', false), grade('capital', true)]),
      ],
      { config: config({ fields: ['name', 'capital'] }) },
    );
    const retry = buildRetryConfig(first, 7)!;
    // Japan missed both; Peru missed only its name. The round mounts rows for the union,
    // and each question shows only its own.
    expect(retry.only).toEqual([
      { iso3: 'JPN', fields: ['name', 'capital'] },
      { iso3: 'PER', fields: ['name'] },
    ]);
    expect(retry.fields).toEqual(['name', 'capital']);

    // Second time round, only Japan's capital is still wrong.
    const second = run(
      [
        question('JPN', [grade('name', true), grade('capital', false)]),
        question('PER', [grade('name', true), grade('capital', true)]),
      ],
      { config: retry },
    );
    const again = buildRetryConfig(second, 8)!;
    expect(again.only).toEqual([{ iso3: 'JPN', fields: ['capital'] }]);
    expect(again.fields).toEqual(['capital']);

    // And it terminates once that is right, rather than looping on a shrinking set.
    const third = run([question('JPN', [grade('capital', true)])], { config: again });
    expect(buildRetryConfig(third, 9)).toBeNull();
  });
});

describe('missedTargets', () => {
  it('gives each country only its own wrong fields', () => {
    // The whole point of the per-country encoding: France is re-asked its currency and
    // Japan its capital, and neither is made to retype what it already got right.
    const finished = run(
      [
        question('FRA', [grade('name', true), grade('capital', true), grade('currency', false)]),
        question('JPN', [grade('name', true), grade('capital', false), grade('currency', true)]),
      ],
      { config: config({ fields: ['name', 'capital', 'currency'] }) },
    );

    expect(missedTargets(finished)).toEqual([
      { iso3: 'FRA', fields: ['currency'] },
      { iso3: 'JPN', fields: ['capital'] },
    ]);
  });

  it('keeps the configured field order inside a target', () => {
    // It is the order `QuizPanel` draws its rows in.
    const finished = run(
      [question('JPN', [grade('currency', false), grade('name', false), grade('capital', true)])],
      { config: config({ fields: ['name', 'capital', 'currency'] }) },
    );

    expect(missedTargets(finished)[0].fields).toEqual(['name', 'currency']);
  });

  it('skips the countries that were fully correct', () => {
    const finished = run([
      question('FRA', [grade('name', true)]),
      question('JPN', [grade('name', false)]),
    ]);

    expect(missedTargets(finished).map((t) => t.iso3)).toEqual(['JPN']);
  });

  it('names no fields at all for a locate round', () => {
    // `location` is graded but is not a `FieldId`, so there is nothing to name - and
    // `buildQuiz` ignores fields entirely in locate mode anyway.
    const finished = run([question('JPN', [grade('location', false)])], {
      config: config({ mode: 'locate', fields: ['currency'] }),
    });

    expect(missedTargets(finished)).toEqual([{ iso3: 'JPN', fields: [] }]);
  });
});
