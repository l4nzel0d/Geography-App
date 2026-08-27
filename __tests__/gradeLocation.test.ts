/**
 * Marking a `locate` round.
 *
 * Short, because the rule is short: one right answer, compared with `===`. The tests
 * that matter are the ones pinning what the result LOOKS like, since the score screen,
 * `summarize` and the review list all read a locate round through the same
 * `QuestionResult` shape a facts round produces.
 */
import { getCountryFacts } from '@/data/countryFacts';
import { gradeLocation } from '@/quiz/gradeLocation';
import { summarize } from '@/quiz/quizScore';

const question = (iso3: string) => ({
  iso3,
  facts: getCountryFacts(iso3)!,
});

describe('gradeLocation', () => {
  it('marks the right country correct', () => {
    const result = gradeLocation(question('NPL'), 'NPL');

    expect(result.allCorrect).toBe(true);
    expect(result.grades).toHaveLength(1);
    expect(result.grades[0]).toMatchObject({
      field: 'location',
      correct: true,
      how: 'exact',
      given: 'Nepal',
      expected: 'Nepal',
    });
  });

  it('marks any other country wrong, however close it is', () => {
    // The whole opposite of `gradeAnswer`'s spelling tolerance: a neighbour is not a
    // near miss, it is a different country.
    const result = gradeLocation(question('NPL'), 'BTN');

    expect(result.allCorrect).toBe(false);
    expect(result.grades[0]).toMatchObject({
      correct: false,
      how: 'wrong',
      given: 'Bhutan',
      expected: 'Nepal',
    });
  });

  it('treats checking with nothing picked as blank', () => {
    // Pressing Check having tapped nothing is the "no idea, show me" move. It scores the
    // same as a wrong tap, and the review has to say so rather than naming a country.
    const result = gradeLocation(question('NPL'), null);

    expect(result.allCorrect).toBe(false);
    expect(result.grades[0]).toMatchObject({ correct: false, how: 'blank', given: '' });
  });

  it('reports the country under the ISO-3 the question was asked about', () => {
    // Not the picked one - the review groups by the question, and a wrong guess must not
    // file itself under the country the player happened to tap.
    expect(gradeLocation(question('NPL'), 'BTN').iso3).toBe('NPL');
  });

  it('falls back to the code for a pick with no facts record', () => {
    // Unreachable through the map, since `pickCountry` only returns codes the geometry
    // carries. Asserted so a future caller cannot render `undefined` at the player.
    expect(gradeLocation(question('NPL'), 'ZZZ').grades[0].given).toBe('ZZZ');
  });

  it('summarises into the score screen like any other field', () => {
    const summary = summarize({
      config: {
        mode: 'locate',
        subregions: [],
        fields: [],
        only: [],
        seed: 1,
        practice: false,
        choice: false,
      },
      results: [
        gradeLocation(question('NPL'), 'NPL'),
        gradeLocation(question('CHL'), 'ARG'),
        gradeLocation(question('MLI'), null),
      ],
      total: 3,
      endedEarly: false,
    });

    expect(summary.countriesAllCorrect).toBe(1);
    expect(summary.countriesAsked).toBe(3);
    expect(summary.perField.location).toEqual({ asked: 3, correct: 1 });
  });
});
