/**
 * The wrong answers a multiple-choice round offers.
 *
 * Two properties carry the whole feature, and both are easy to lose silently. Exactly
 * one button may be right - a distractor that happens to be one of the country's OTHER
 * capitals or currencies makes the question unmarkable, and nothing on screen would say
 * so. And the options have to be seeded, or a replayed round is a different round and
 * `.maestro/quiz.yaml` can assert on nothing.
 */
import { formatPopulation } from '@/components/formatters';
import { nameAliases } from '@/quiz/answerAliases';
import { normalizeText } from '@/quiz/normalizeText';
import { buildQuiz, makeRng } from '@/quiz/quizBuilder';
import {
  buildFieldOptions,
  CHOICE_OPTION_COUNT,
  CHOICE_SALT,
  CHOICE_TIER_QUOTA,
} from '@/quiz/quizOptions';
import { ANSWERABLE_FIELDS, type FieldId, type QuizConfig } from '@/quiz/quizConfig';
import { countriesWithCodes, QUIZ_COUNTRIES, type QuizCountry } from '@/quiz/quizCountries';

const config = (over: Partial<QuizConfig> = {}): QuizConfig => ({
  mode: 'facts',
  subregions: [],
  fields: [...ANSWERABLE_FIELDS],
  only: [],
  seed: 1,
  practice: false,
  choice: true,
  ...over,
});

const countryOf = (iso3: string) => QUIZ_COUNTRIES.find((country) => country.iso3 === iso3)!;

/** Everything the asked country could legitimately answer with, normalized. */
const ownValues = (iso3: string, field: FieldId): Set<string> => {
  const country = countryOf(iso3);
  const values =
    field === 'name'
      ? nameAliases(country.iso3, country.facts, 'en')
      : field === 'capital'
        ? country.facts.capital
        : field === 'currency'
          ? country.facts.currencies.map((currency) => currency.name)
          : [formatPopulation(country.facts.population, 'en')];
  return new Set(values.map(normalizeText));
};

describe('the option set', () => {
  const round = buildQuiz(config(), undefined, 'en');

  it('offers one right answer and three wrong ones, for every field of every country', () => {
    expect(round).toHaveLength(193);

    for (const question of round) {
      for (const field of question.fields) {
        const offered = question.options![field]!;
        expect(offered.options).toHaveLength(CHOICE_OPTION_COUNT);
        expect(offered.options.filter((option) => option === offered.answer)).toHaveLength(1);
      }
    }
  });

  it('never offers the same string twice', () => {
    // Two countries on the euro, two whose populations format identically, a shared
    // capital: each is a button the player cannot tell from another one.
    for (const question of round) {
      for (const field of question.fields) {
        expect(new Set(question.options![field]!.options).size).toBe(CHOICE_OPTION_COUNT);
      }
    }
  });

  it('never offers a wrong answer that is also true of the country', () => {
    // The sharp one. South Africa shows one of three capitals and a country with two
    // currencies shows one of them, so "not the displayed answer" is not enough - the
    // guard has to be over everything that country could answer with.
    for (const question of round) {
      for (const field of question.fields) {
        const offered = question.options![field]!;
        const own = ownValues(question.iso3, field);

        for (const option of offered.options) {
          if (option === offered.answer) continue;
          expect(own.has(normalizeText(option))).toBe(false);
        }
      }
    }
  });

  it('answers with the value the typed grader would have accepted', () => {
    const peru = round.find((question) => question.iso3 === 'PER')!;

    expect(peru.options!.name!.answer).toBe('Peru');
    expect(peru.options!.capital!.answer).toBe('Lima');
    // The bare currency name, not `formatCurrency`'s "Peruvian sol (PEN, S/.)": the code
    // is deliberately not the knowledge being tested, and would not fit a button.
    expect(peru.options!.currency!.answer).toBe('Peruvian sol');
  });
});

describe('where the wrong answers come from', () => {
  const byName = new Map(QUIZ_COUNTRIES.map((country) => [country.facts.name, country]));
  const byCapital = new Map(QUIZ_COUNTRIES.map((country) => [country.facts.capital[0], country]));

  /**
   * How many of a grid's options sit in each ring around the asked country.
   *
   * `home` counts the answer itself, which is trivially in its own subregion - so a grid
   * built to quota reads `{ home: 2, region: 1, world: 1 }`.
   */
  const tiersOf = (iso3: string, options: readonly string[], index: Map<string, QuizCountry>) => {
    const target = countryOf(iso3);
    const spread = { home: 0, region: 0, world: 0 };
    for (const option of options) {
      const country = index.get(option)!;
      if (country.subregion === target.subregion) spread.home += 1;
      else if (country.region === target.region) spread.region += 1;
      else spread.world += 1;
    }
    return spread;
  };

  /** What a grid built to quota looks like, counted in rings. */
  const TO_QUOTA = {
    home: 1 + CHOICE_TIER_QUOTA.subregion,
    region: CHOICE_TIER_QUOTA.region,
    world: CHOICE_TIER_QUOTA.world,
  };

  /** One country's name grid, drawn on its own rather than through a whole round. */
  const nameGrid = (iso3: string) =>
    buildFieldOptions(countryOf(iso3), ['name'], QUIZ_COUNTRIES, makeRng(1 ^ CHOICE_SALT), 'en')
      .name!;

  it('spends the whole grid, one wrong answer per ring', () => {
    // The guard against a future edit leaving the grid short or over-full. Nothing else
    // here would notice: the option count would still be four, filled by whatever the
    // top-up happened to reach.
    const { subregion, region, world } = CHOICE_TIER_QUOTA;

    expect(subregion + region + world).toBe(CHOICE_OPTION_COUNT - 1);
  });

  it('draws one neighbour, one from the wider continent, and one from nowhere near', () => {
    // Peru: another South American, another American from a different subregion, and one
    // from outside the Americas entirely. Three scales in one grid, which is what makes a
    // wrong answer teach rather than merely be wrong.
    expect(tiersOf('PER', nameGrid('PER').options, byName)).toEqual(TO_QUOTA);
  });

  it('finds a neighbour even for a two-country subregion', () => {
    // Australia and New Zealand is the tightest case in the pool, and the quota is
    // satisfiable there only because it asks for exactly ONE neighbour.
    expect(nameGrid('AUS').options).toContain('New Zealand');
  });

  it('holds that spread for every country, in both fields that name one', () => {
    // The sweep, over `name` and `capital` - the two fields whose options identify a
    // country unambiguously, and the two where the top-up never fires on today's data.
    // A currency or a population figure can belong to several countries, so an exact
    // distribution could not be read back out of them.
    const round = buildQuiz(config(), undefined, 'en');

    for (const question of round) {
      for (const [field, index] of [
        ['name', byName],
        ['capital', byCapital],
      ] as const) {
        const offered = question.options![field];
        if (!offered) continue;

        // The ISO-3 rides along so a failure names the country instead of just the counts.
        expect({ iso3: question.iso3, ...tiersOf(question.iso3, offered.options, index) }).toEqual({
          iso3: question.iso3,
          ...TO_QUOTA,
        });
      }
    }
  });

  it('draws from the whole catalogue, never the round pool', () => {
    // A retry round asks one country; it could not fill four buttons out of itself. Who
    // gets asked and what the wrong answers are is not the same question.
    const round = buildQuiz(
      config({ only: [{ iso3: 'FRA', fields: [] }], fields: ['capital'] }),
      countriesWithCodes(['FRA']),
      'en',
    );

    expect(round).toHaveLength(1);
    expect(round[0].options!.capital!.options).toHaveLength(CHOICE_OPTION_COUNT);
    expect(round[0].options!.capital!.answer).toBe('Paris');
  });

  it('fills four buttons even for a two-country subregion', () => {
    const round = buildQuiz(config({ subregions: ['Australia and New Zealand'] }), undefined, 'en');

    expect(round).toHaveLength(2);
    for (const question of round) {
      for (const field of question.fields) {
        expect(question.options![field]!.options).toHaveLength(CHOICE_OPTION_COUNT);
      }
    }
  });

  it('draws a different four per field, so one answer does not give away another', () => {
    // Reusing one ranking would make the capital list the capitals of exactly the
    // countries in the name list, and a two-field question answerable twice over from
    // one piece of knowledge.
    const peru = buildQuiz(config(), undefined, 'en').find((question) => question.iso3 === 'PER')!;
    const byName = new Map(QUIZ_COUNTRIES.map((country) => [country.facts.name, country.iso3]));
    const byCapital = new Map(
      QUIZ_COUNTRIES.map((country) => [country.facts.capital[0], country.iso3]),
    );

    const fromNames = new Set(peru.options!.name!.options.map((option) => byName.get(option)));
    const fromCapitals = new Set(
      peru.options!.capital!.options.map((option) => byCapital.get(option)),
    );

    expect(fromCapitals).not.toEqual(fromNames);
  });
});

describe('seeding', () => {
  it('replays button for button', () => {
    expect(buildQuiz(config({ seed: 7 }), undefined, 'en')).toEqual(
      buildQuiz(config({ seed: 7 }), undefined, 'en'),
    );
  });

  it('draws differently for a different seed', () => {
    const namesOf = (seed: number) =>
      buildQuiz(config({ seed }), undefined, 'en')
        .map((question) => question.options!.name!.options.join('|'))
        .sort();

    expect(namesOf(7)).not.toEqual(namesOf(8));
  });
});

describe('rounds that get no options at all', () => {
  it('leaves a typed round exactly as it was', () => {
    const round = buildQuiz(config({ choice: false }), undefined, 'en');

    expect(round.every((question) => question.options === undefined)).toBe(true);
  });

  it('leaves a locate round alone even when the flag is carried through it', () => {
    // `choice` rides along so the setup screen can show it still selected. There is
    // nothing to offer buttons for: the answer is the tap.
    const round = buildQuiz(config({ mode: 'locate' }), undefined, 'en');

    expect(round.every((question) => question.options === undefined)).toBe(true);
  });

  it('skips a field the country has no answer for', () => {
    // Micronesia has no currency, so it is asked the other fields and no button for that
    // one is ever built - the machinery that already hid the row.
    const fsm = buildQuiz(config(), undefined, 'en').find((question) => question.iso3 === 'FSM')!;

    expect(fsm.fields).not.toContain('currency');
    expect(fsm.options!.currency).toBeUndefined();
    expect(fsm.options!.name).toBeDefined();
  });
});
