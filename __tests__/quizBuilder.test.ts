/**
 * Who gets asked, and in what order.
 *
 * The pool size is pinned rather than bounded: it is the dataset's answer to "which
 * places are countries", and that should never change quietly.
 */
import { buildQuiz, makeRng, shuffle } from '@/quiz/quizBuilder';
import type { QuizConfig } from '@/quiz/quizConfig';
import {
  answerableFields,
  countriesIn,
  countriesWithCodes,
  NON_MEMBER_ISO3,
  QUIZ_COUNTRIES,
  REGIONS,
  SUBREGIONS,
} from '@/quiz/quizCountries';

const config = (over: Partial<QuizConfig> = {}): QuizConfig => ({
  mode: 'facts',
  subregions: [],
  fields: ['name'],
  only: [],
  seed: 1,
  practice: false,
  ...over,
});

describe('the country pool', () => {
  it('is the 193 UN member states', () => {
    expect(QUIZ_COUNTRIES).toHaveLength(193);
  });

  it('excludes Vatican City, which mledoze wrongly flags as a member', () => {
    // A permanent observer state, and the only UN-flagged record with no population -
    // so leaving it in would also make the population question unanswerable for it.
    expect(NON_MEMBER_ISO3.has('VAT')).toBe(true);
    expect(QUIZ_COUNTRIES.map((c) => c.iso3)).not.toContain('VAT');
  });

  it('excludes territories and non-members that have outlines of their own', () => {
    const codes = QUIZ_COUNTRIES.map((c) => c.iso3);
    for (const iso3 of ['GRL', 'PRI', 'TWN', 'PSE', 'UNK', 'HKG', 'ESH', 'NCL']) {
      expect(codes).not.toContain(iso3);
    }
  });

  it('includes the microstates that only exist at 1:50m', () => {
    const codes = QUIZ_COUNTRIES.map((c) => c.iso3);
    for (const iso3 of ['LIE', 'MCO', 'SMR', 'AND', 'MLT', 'SGP', 'TUV', 'NRU']) {
      expect(codes).toContain(iso3);
    }
  });

  it('gives every country a region and a subregion', () => {
    expect(QUIZ_COUNTRIES.filter((c) => !c.region || !c.subregion)).toEqual([]);
  });
});

describe('the subregion catalogue', () => {
  it('has 24 buckets covering the whole pool exactly once', () => {
    expect(SUBREGIONS).toHaveLength(24);
    expect(SUBREGIONS.reduce((total, b) => total + b.count, 0)).toBe(193);
  });

  it('has no empty bucket', () => {
    expect(SUBREGIONS.filter((b) => b.count === 0)).toEqual([]);
  });

  it('groups into 5 inhabited regions that also cover the pool exactly once', () => {
    // mledoze has six regions, but Antarctic contributes no UN members, so the setup
    // menu only ever shows five headers.
    expect(REGIONS).toHaveLength(5);
    expect(REGIONS.map((r) => r.region)).toEqual([
      'Africa',
      'Americas',
      'Asia',
      'Europe',
      'Oceania',
    ]);
    expect(REGIONS.reduce((total, r) => total + r.count, 0)).toBe(193);
    expect(REGIONS.flatMap((r) => r.subregions)).toHaveLength(24);
  });
});

describe('countriesIn', () => {
  it('treats an empty selection as the whole world', () => {
    expect(countriesIn([])).toHaveLength(193);
  });

  it('filters to the chosen subregions', () => {
    const selection = countriesIn(['Western Europe']);
    expect(selection.length).toBeGreaterThan(0);
    expect(selection.every((c) => c.subregion === 'Western Europe')).toBe(true);
    expect(selection.map((c) => c.iso3)).toContain('FRA');
  });

  it('adds up when several subregions are chosen', () => {
    const a = countriesIn(['Western Europe']).length;
    const b = countriesIn(['Northern Europe']).length;
    expect(countriesIn(['Western Europe', 'Northern Europe'])).toHaveLength(a + b);
  });

  it('returns nothing for a subregion that does not exist', () => {
    expect(countriesIn(['Atlantis'])).toEqual([]);
  });
});

describe('answerableFields', () => {
  const factsFor = (iso3: string) => QUIZ_COUNTRIES.find((c) => c.iso3 === iso3)!.facts;

  it('keeps every field for a country with complete data', () => {
    expect(
      answerableFields(factsFor('FRA'), ['name', 'capital', 'currency', 'population']),
    ).toEqual(['name', 'capital', 'currency', 'population']);
  });

  it('drops currency for Micronesia, the one country upstream has none for', () => {
    expect(answerableFields(factsFor('FSM'), ['name', 'currency'])).toEqual(['name']);
  });

  it('preserves the caller\'s field order', () => {
    expect(answerableFields(factsFor('JPN'), ['population', 'name'])).toEqual([
      'population',
      'name',
    ]);
  });
});

describe('buildQuiz', () => {
  it('asks every country in the selection once', () => {
    const questions = buildQuiz(config({ subregions: ['Southern Europe'] }));
    const codes = questions.map((q) => q.iso3);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toHaveLength(countriesIn(['Southern Europe']).length);
  });

  it('runs the whole pool when no subregion is chosen', () => {
    expect(buildQuiz(config())).toHaveLength(193);
  });

  it('replays identically for the same seed', () => {
    const a = buildQuiz(config({ seed: 4242 })).map((q) => q.iso3);
    const b = buildQuiz(config({ seed: 4242 })).map((q) => q.iso3);
    expect(a).toEqual(b);
  });

  it('orders differently for a different seed', () => {
    const a = buildQuiz(config({ seed: 1 })).map((q) => q.iso3);
    const b = buildQuiz(config({ seed: 2 })).map((q) => q.iso3);
    expect(a).not.toEqual(b);
    expect([...a].sort()).toEqual([...b].sort());
  });

  it('actually shuffles rather than returning the source order', () => {
    const source = countriesIn([]).map((c) => c.iso3);
    expect(buildQuiz(config({ seed: 7 })).map((q) => q.iso3)).not.toEqual(source);
  });

  it('drops a country left with no askable field', () => {
    // Currency-only over Micronesia: FSM has nothing to ask, so it would otherwise be a
    // question with no inputs and no way to answer it.
    const micronesia = buildQuiz(config({ subregions: ['Micronesia'], fields: ['currency'] }));
    expect(micronesia.map((q) => q.iso3)).not.toContain('FSM');
    expect(micronesia.length).toBe(countriesIn(['Micronesia']).length - 1);
  });

  it('keeps that country when some other field is also asked', () => {
    const micronesia = buildQuiz(
      config({ subregions: ['Micronesia'], fields: ['name', 'currency'] }),
    );
    const fsm = micronesia.find((q) => q.iso3 === 'FSM');
    expect(fsm).toBeDefined();
    expect(fsm!.fields).toEqual(['name']);
  });
});

describe('buildQuiz in flag mode', () => {
  /**
   * A flag round asks the same typed facts as a facts round, so it must take the same
   * branch - fields populated, completeness filter applied. Only `locate` is special.
   */
  const flag = (over: Partial<QuizConfig> = {}) => buildQuiz(config({ mode: 'flag', ...over }));

  it('populates the fields exactly as a facts round does', () => {
    const asFlag = flag({ subregions: ['Western Europe'], fields: ['name', 'capital'] });
    const asFacts = buildQuiz(
      config({ subregions: ['Western Europe'], fields: ['name', 'capital'] }),
    );
    expect(asFlag).toEqual(asFacts);
  });

  it('still drops a country left with no askable field', () => {
    // Micronesia has no currency upstream, so a currency-only round has nothing to ask
    // it - which is as true of a flag round as of a facts one.
    expect(flag({ subregions: ['Micronesia'], fields: ['currency'] }).map((q) => q.iso3)).not.toContain(
      'FSM',
    );
  });
});

describe('buildQuiz in locate mode', () => {
  const locate = (over: Partial<QuizConfig> = {}) => buildQuiz(config({ mode: 'locate', ...over }));

  it('asks for no typed field at all', () => {
    expect(locate({ subregions: ['Western Europe'] }).every((q) => q.fields.length === 0)).toBe(
      true,
    );
  });

  it('still asks every country in the selection once', () => {
    const questions = locate({ subregions: ['Western Europe'] });
    expect(questions.map((q) => q.iso3).sort()).toEqual(
      countriesIn(['Western Europe'])
        .map((c) => c.iso3)
        .sort(),
    );
  });

  it('keeps a country the configured fields would have dropped', () => {
    // The completeness filter exists to avoid a question with no inputs. A locate round
    // has no inputs by design and asks something every country can answer, so carrying
    // `fields: ['currency']` over from a previous facts round must not drop Micronesia.
    expect(
      locate({ subregions: ['Micronesia'], fields: ['currency'] }).map((q) => q.iso3),
    ).toContain('FSM');
  });

  it('replays identically for the same seed', () => {
    expect(locate({ seed: 7 }).map((q) => q.iso3)).toEqual(locate({ seed: 7 }).map((q) => q.iso3));
  });
});

describe('makeRng', () => {
  it('is deterministic for a seed', () => {
    const draw = (seed: number) => Array.from({ length: 5 }, makeRng(seed));
    expect(draw(99)).toEqual(draw(99));
    expect(draw(99)).not.toEqual(draw(100));
  });

  it('stays inside [0, 1)', () => {
    const rng = makeRng(12345);
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('shuffle', () => {
  it('does not mutate its input', () => {
    const source = [1, 2, 3, 4, 5];
    shuffle(source, makeRng(1));
    expect(source).toEqual([1, 2, 3, 4, 5]);
  });

  it('is a permutation', () => {
    const source = Array.from({ length: 50 }, (_, i) => i);
    expect([...shuffle(source, makeRng(3))].sort((a, b) => a - b)).toEqual(source);
  });

  it('handles empty and single-item lists', () => {
    expect(shuffle([], makeRng(1))).toEqual([]);
    expect(shuffle(['x'], makeRng(1))).toEqual(['x']);
  });
});

describe('countriesWithCodes', () => {
  it('is the named countries and nothing else', () => {
    expect(countriesWithCodes(['JPN', 'FRA']).map((c) => c.iso3).sort()).toEqual(['FRA', 'JPN']);
  });

  it('ignores the order the codes were given in', () => {
    // This is what makes a seeded retry replayable: `buildQuiz` shuffles the pool, so if
    // the pool order tracked the order the player happened to be asked, the same seed
    // would give two different rounds.
    expect(countriesWithCodes(['JPN', 'FRA'])).toEqual(countriesWithCodes(['FRA', 'JPN']));
  });

  it('drops a code that matches no country', () => {
    expect(countriesWithCodes(['XXX'])).toEqual([]);
    expect(countriesWithCodes(['FRA', 'XXX']).map((c) => c.iso3)).toEqual(['FRA']);
  });

  it('is empty for an empty list, which is why `only` is checked before it is used', () => {
    // An empty `only` means "no restriction", so `play.tsx` must not reach this function
    // at all in that case - it would ask nobody.
    expect(countriesWithCodes([])).toEqual([]);
  });

  it('replaces the subregion filter rather than intersecting it', () => {
    // Two individually sensible params - a subregion and a country outside it - must not
    // combine into an empty round. `play.tsx` draws from the whole pool when `only` is set.
    const questions = buildQuiz(
      config({
        subregions: ['Eastern Africa'],
        only: [
          { iso3: 'FRA', fields: [] },
          { iso3: 'JPN', fields: [] },
        ],
      }),
      countriesWithCodes(['FRA', 'JPN']),
    );

    expect(questions.map((q) => q.iso3).sort()).toEqual(['FRA', 'JPN']);
  });

  it('keeps a locate round asking a country that cannot answer the configured field', () => {
    // Micronesia has no currency, and `buildQuiz` skips its completeness filter in locate
    // mode - a retry carrying a currency selection must not silently drop it.
    const questions = buildQuiz(
      config({ mode: 'locate', fields: ['currency'], only: [{ iso3: 'FSM', fields: [] }] }),
      countriesWithCodes(['FSM']),
    );

    expect(questions.map((q) => q.iso3)).toEqual(['FSM']);
  });
});

describe('per-country fields', () => {
  it('asks each country only the fields its target names', () => {
    const questions = buildQuiz(
      config({
        fields: ['name', 'capital'],
        only: [
          { iso3: 'FRA', fields: ['capital'] },
          { iso3: 'JPN', fields: ['name'] },
        ],
      }),
      countriesWithCodes(['FRA', 'JPN']),
    );

    const asked = Object.fromEntries(questions.map((q) => [q.iso3, q.fields]));
    expect(asked.FRA).toEqual(['capital']);
    expect(asked.JPN).toEqual(['name']);
  });

  it('falls back to the round fields for a target that names none', () => {
    // Which is what a hand-typed `?only=FRA` says, and what a locate retry emits.
    const questions = buildQuiz(
      config({ fields: ['name', 'capital'], only: [{ iso3: 'FRA', fields: [] }] }),
      countriesWithCodes(['FRA']),
    );

    expect(questions[0].fields).toEqual(['name', 'capital']);
  });

  it('still drops a field the country has no answer for', () => {
    // Micronesia has no currency in mledoze. A target naming it is narrowed away rather
    // than producing a question with an unanswerable row.
    const questions = buildQuiz(
      config({ fields: ['name', 'currency'], only: [{ iso3: 'FSM', fields: ['name', 'currency'] }] }),
      countriesWithCodes(['FSM']),
    );

    expect(questions[0].fields).toEqual(['name']);
  });
});
