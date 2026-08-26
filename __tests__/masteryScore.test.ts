import type { FieldGrade, QuestionResult } from '@/quiz/gradeAnswer';
import type { GradedField } from '@/quiz/quizConfig';
import {
  applyResult,
  type CountryRecord,
  MASTERY_FIELDS,
  MASTERY_PRIOR,
  type MasteryTable,
  masteryOf,
  masteryScores,
  practiceMasteryOf,
  practiceScores,
  RECENCY_WEIGHT,
} from '@/mastery/masteryScore';

const grade = (field: GradedField, correct: boolean): FieldGrade => ({
  field,
  correct,
  how: correct ? 'exact' : 'wrong',
  given: '',
  expected: '',
});

const result = (iso3: string, grades: FieldGrade[]): QuestionResult => ({
  iso3,
  grades,
  allCorrect: grades.every((g) => g.correct),
});

describe('masteryOf', () => {
  it('is null - never zero - for a country that has never been asked', () => {
    // The whole feature turns on this. A country you have never seen and one you always
    // get wrong are different things, and `['has','mastery']` is what tells them apart
    // on the map. A zero here would paint an unseen country as "known badly".
    expect(masteryOf(undefined)).toBeNull();
    expect(masteryOf({})).toBeNull();
    expect(masteryOf({ name: { asked: 0, correct: 0, lastCorrect: false } })).toBeNull();
  });

  it('scores one correct answer at a full 1, carrying no prior', () => {
    // The user-visible fix. This used to be 0.5 - a country you had answered correctly
    // painting mid-ramp yellow - because the prior was applied to the displayed score.
    // "We have not asked you much" is the grey band's job, not the number's.
    const record: CountryRecord = { name: { asked: 1, correct: 1, lastCorrect: true } };
    expect(masteryOf(record)).toBe(1);
  });

  it('reaches exactly 1, because the top of the ramp is meant to be reachable', () => {
    // Nine consecutive correct answers used to be the price of the green band, which
    // across 193 countries meant the map never got there at all.
    for (const asked of [1, 3, 9, 500]) {
      expect(masteryOf({ name: { asked, correct: asked, lastCorrect: true } })).toBe(1);
    }
  });

  it('scores a single wrong answer at 0', () => {
    expect(masteryOf({ name: { asked: 1, correct: 0, lastCorrect: false } })).toBe(0);
  });

  it('discounts proportionally to how many fields went wrong last time', () => {
    // Three fields, all answered right ten times, but the capital was missed last time.
    // The penalty is 0.4 * 1/3, not 0.4.
    const base = { asked: 10, correct: 10, lastCorrect: true };
    const record: CountryRecord = {
      name: { ...base },
      capital: { asked: 10, correct: 10, lastCorrect: false },
      currency: { ...base },
    };

    expect(masteryOf(record)).toBeCloseTo(1 - RECENCY_WEIGHT / 3, 10);
  });

  it('pools across fields rather than averaging per-field rates', () => {
    // 9/10 on one field and 0/1 on another is 9/11 pooled, which is NOT the mean of
    // 0.9 and 0. Pooling weights by how often you were actually asked.
    const record: CountryRecord = {
      name: { asked: 10, correct: 9, lastCorrect: true },
      capital: { asked: 1, correct: 0, lastCorrect: true },
    };
    expect(masteryOf(record)).toBeCloseTo(9 / 11, 10);
  });

  it('counts a location grade like any other field', () => {
    // A locate round teaches you where a country is; that is per-country knowledge.
    expect(masteryOf({ location: { asked: 2, correct: 2, lastCorrect: true } })).toBeGreaterThan(0);
  });

  it('always returns a finite score inside [0, 1]', () => {
    for (const field of MASTERY_FIELDS) {
      for (const [asked, correct] of [[1, 0], [1, 1], [7, 3], [200, 199]]) {
        const score = masteryOf({ [field]: { asked, correct, lastCorrect: correct > 0 } });
        expect(Number.isFinite(score)).toBe(true);
        expect(score as number).toBeGreaterThanOrEqual(0);
        expect(score as number).toBeLessThanOrEqual(1);
      }
    }
  });

  it('returns null rather than NaN when the counters are nonsense', () => {
    // A NaN reaching the feature would poison `interpolate` inside the native renderer,
    // where nothing surfaces the reason. The codec guards on the way in; this is belt
    // to those braces.
    expect(masteryOf({ name: { asked: NaN, correct: NaN, lastCorrect: true } })).toBeNull();
    expect(masteryOf({ name: { asked: Infinity, correct: 1, lastCorrect: true } })).toBeNull();
  });
});

describe('masteryScores', () => {
  it('omits never-asked countries entirely rather than scoring them zero', () => {
    const table: MasteryTable = {
      FRA: { name: { asked: 2, correct: 2, lastCorrect: true } },
      DEU: {},
    };

    const scores = masteryScores(table);
    expect(Object.keys(scores)).toEqual(['FRA']);
    expect(scores).not.toHaveProperty('DEU');
  });
});

describe('the practice score', () => {
  // The whole point of the split: these two are MEANT to disagree. The map reports what
  // the evidence says; the sampler additionally cares how much evidence there is.
  it('keeps the prior where the display score dropped it', () => {
    const thin: CountryRecord = { name: { asked: 1, correct: 1, lastCorrect: true } };

    expect(masteryOf(thin)).toBe(1);
    expect(practiceMasteryOf(thin)).toBeCloseTo(1 / (1 + MASTERY_PRIOR), 10);
  });

  it('converges on the display score as the record thickens', () => {
    const thick: CountryRecord = { name: { asked: 99, correct: 99, lastCorrect: true } };

    expect(masteryOf(thick)).toBe(1);
    expect(practiceMasteryOf(thick)).toBeGreaterThan(0.98);
    expect(practiceMasteryOf(thick)).toBeLessThan(1);
  });

  it('ranks a thin record below a thick one, which the display score cannot', () => {
    // This ordering is the entire reason the prior still exists.
    const once: CountryRecord = { name: { asked: 1, correct: 1, lastCorrect: true } };
    const nine: CountryRecord = { name: { asked: 9, correct: 9, lastCorrect: true } };

    expect(masteryOf(once)).toBe(masteryOf(nine));
    expect(practiceMasteryOf(once)).toBeLessThan(practiceMasteryOf(nine) as number);
  });

  it('agrees with the display score that a wrong answer is zero', () => {
    const wrong: CountryRecord = { name: { asked: 1, correct: 0, lastCorrect: false } };

    expect(masteryOf(wrong)).toBe(0);
    expect(practiceMasteryOf(wrong)).toBe(0);
  });

  it('is null for a never-asked country, like the display score', () => {
    expect(practiceMasteryOf(undefined)).toBeNull();
    expect(practiceMasteryOf({})).toBeNull();
  });
});

describe('practiceScores', () => {
  it('omits never-asked countries, so they weigh as maximally weak', () => {
    // `practiceWeight` reads an absent score as 0, which is what makes an unseen country
    // the likeliest thing a practice round shows you.
    const table: MasteryTable = {
      FRA: { name: { asked: 2, correct: 2, lastCorrect: true } },
      DEU: {},
    };

    expect(Object.keys(practiceScores(table))).toEqual(['FRA']);
  });

  it('covers the same countries as the display map, at different values', () => {
    const table: MasteryTable = {
      FRA: { name: { asked: 1, correct: 1, lastCorrect: true } },
      ITA: { name: { asked: 8, correct: 6, lastCorrect: true } },
    };

    const display = masteryScores(table);
    const practice = practiceScores(table);

    expect(Object.keys(practice).sort()).toEqual(Object.keys(display).sort());
    expect(practice.FRA).toBeLessThan(display.FRA);
    expect(practice.ITA).toBeLessThan(display.ITA);
  });
});

describe('applyResult', () => {
  it('returns a new table and carries other countries through by reference', () => {
    const deu: CountryRecord = { name: { asked: 1, correct: 1, lastCorrect: true } };
    const table: MasteryTable = { DEU: deu };

    const next = applyResult(table, result('FRA', [grade('name', true)]));

    expect(next).not.toBe(table);
    expect(next.DEU).toBe(deu);
    expect(table).not.toHaveProperty('FRA');
  });

  it('increments asked, adds to correct, and overwrites lastCorrect', () => {
    let table: MasteryTable = {};
    table = applyResult(table, result('FRA', [grade('name', true)]));
    table = applyResult(table, result('FRA', [grade('name', false)]));

    expect(table.FRA.name).toEqual({ asked: 2, correct: 1, lastCorrect: false });
  });

  it('records a blank answer as asked-and-wrong', () => {
    // `gradeAnswer` reports `how: 'blank'` with `correct: false`. It is genuine evidence
    // of weakness, and locate mode sanctions checking with nothing picked.
    const blank = { field: 'capital' as GradedField, correct: false, how: 'blank' as const, given: '', expected: 'Paris' };
    const table = applyResult({}, { iso3: 'FRA', grades: [blank], allCorrect: false });

    expect(table.FRA.capital).toEqual({ asked: 1, correct: 0, lastCorrect: false });
  });

  it('is a no-op for a question that graded nothing', () => {
    const table: MasteryTable = {};
    expect(applyResult(table, result('FRA', []))).toBe(table);
  });
});
