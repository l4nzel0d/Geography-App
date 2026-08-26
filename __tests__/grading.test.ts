/**
 * Marking a write-in answer.
 *
 * Two failure directions, and the second is the dangerous one:
 *   - too strict, and someone who knows the answer loses the point to an accent
 *   - too loose, and someone who typed a DIFFERENT COUNTRY gets the point
 *
 * The confusable block below is the whole reason `matchesText` takes a `reserved` map.
 */
import { getCountryFacts } from '@/data/countryFacts';
import { currencyAliases, NAME_INDEX, nameAliases } from '@/quiz/answerAliases';
import { allowedEdits, editDistance } from '@/quiz/editDistance';
import { formatCurrency } from '@/components/formatters';
import {
  CURRENCIES_REQUIRED,
  gradeField,
  gradeNumeric,
  gradeQuestion,
  gradeSet,
  gradeSingle,
  matchesText,
  parsePopulation,
  POPULATION_TOLERANCE,
  toAnswerInput,
} from '@/quiz/gradeAnswer';
import { normalizeText, stripLeadingArticle } from '@/quiz/normalizeText';
import { QUIZ_COUNTRIES } from '@/quiz/quizCountries';

const facts = (iso3: string) => getCountryFacts(iso3)!;
const gradeName = (iso3: string, input: string) =>
  gradeSingle('name', input, nameAliases(iso3, facts(iso3)), {
    reserved: NAME_INDEX,
    ownIso3: iso3,
  });

describe('normalizeText', () => {
  it.each([
    ['France', 'france'],
    ['  FRANCE  ', 'france'],
    ['Côte d’Ivoire', 'cote divoire'],
    ["Cote d'Ivoire", 'cote divoire'],
    ['The Gambia', 'gambia'],
    ['The Bahamas', 'bahamas'],
    ['Guinea-Bissau', 'guineabissau'],
    ['Trinidad & Tobago', 'trinidad and tobago'],
    ['St. Lucia', 'saint lucia'],
    ['Saint Lucia', 'saint lucia'],
    ['São Tomé and Príncipe', 'sao tome and principe'],
    ['United  States', 'united states'],
  ])('normalizes %p to %p', (input, expected) => {
    expect(normalizeText(input)).toBe(expected);
  });

  it('strips only a LEADING article', () => {
    expect(stripLeadingArticle('the gambia')).toBe('gambia');
    expect(normalizeText('Republic of the Congo')).toContain('the congo');
  });
});

describe('editDistance', () => {
  it.each([
    ['france', 'france', 0],
    ['fance', 'france', 1], // deletion
    ['frankce', 'france', 1], // insertion
    ['frence', 'france', 1], // substitution
    ['frnace', 'france', 1], // adjacent transposition - 2 under plain Levenshtein
    ['', 'france', 6],
  ])('%p to %p is %p', (a, b, expected) => {
    expect(editDistance(a, b)).toBe(expected);
  });

  it('counts a NON-adjacent swap as two edits', () => {
    // Only neighbouring transpositions are cheap. Otherwise the budget quietly doubles.
    expect(editDistance('fnarce', 'france')).toBe(2);
  });

  it('bails out above the budget rather than computing the true distance', () => {
    expect(editDistance('aaaaaaaaaa', 'zzzzzzzzzz', 2)).toBe(3);
  });

  it('forgives nothing on a short target', () => {
    // Iran/Iraq, Chad/Chile, Mali/Male all live at this length.
    expect(allowedEdits(4)).toBe(0);
    expect(allowedEdits(6)).toBe(1);
    expect(allowedEdits(12)).toBe(2);
  });
});

describe('country names - forgiving', () => {
  it.each([
    ['FRA', 'France'],
    ['FRA', 'france'],
    ['FRA', 'FRANCE'],
    ['FRA', 'Frnace'], // transposition
    ['CIV', "Cote d'Ivoire"], // unaccented
    ['CIV', 'Ivory Coast'], // altSpellings
    ['NLD', 'Holland'], // altSpellings
    ['NLD', 'The Netherlands'],
    ['GBR', 'UK'],
    ['GBR', 'United Kingdom'],
    ['USA', 'USA'],
    ['USA', 'United States of America'],
    ['KOR', 'South Korea'],
    ['KOR', 'Republic of Korea'],
    ['ARE', 'UAE'],
    ['COD', 'DRC'],
    ['SWZ', 'Swaziland'], // the pre-2018 name
    ['TLS', 'East Timor'],
    ['MMR', 'Burma'],
    ['CZE', 'Czech Republic'],
    ['GMB', 'The Gambia'],
    ['GMB', 'Gambia'],
    ['STP', 'Sao Tome and Principe'],
  ])('accepts %s answered as %p', (iso3, answer) => {
    expect(gradeName(iso3, answer).correct).toBe(true);
  });
});

describe('country names - the confusable guard', () => {
  // Every pair here is inside the raw edit-distance budget. Without the reserved-name
  // check they would all be marked correct, which is worse than being too strict.
  it.each([
    ['ZMB', 'Gambia'], // one edit on a six-letter target
    ['GMB', 'Zambia'],
    ['NER', 'Nigeria'],
    ['NGA', 'Niger'],
    ['SVK', 'Slovenia'],
    ['SVN', 'Slovakia'],
    ['IRN', 'Iraq'],
    ['IRQ', 'Iran'],
    ['AUT', 'Australia'],
    ['AUS', 'Austria'],
    ['GIN', 'Guyana'],
    ['GNB', 'Guinea'],
    ['IND', 'Indonesia'],
    ['CHL', 'China'],
    ['MLI', 'Malawi'],
  ])('rejects %s answered as %p', (iso3, answer) => {
    expect(gradeName(iso3, answer).correct).toBe(false);
  });

  it('still accepts a typo that is not another country', () => {
    // The guard must not become "exact match only" by the back door.
    expect(gradeName('ZMB', 'Zamba').correct).toBe(true);
    expect(gradeName('DEU', 'Germny').correct).toBe(true);
  });

  it('reports a blank separately from a wrong answer', () => {
    expect(gradeName('FRA', '').how).toBe('blank');
    expect(gradeName('FRA', 'Spain').how).toBe('wrong');
  });

  it('reveals the dataset name as the expected answer', () => {
    expect(gradeName('CIV', 'nonsense').expected).toBe('Ivory Coast');
  });
});

describe('matchesText', () => {
  it('reports how the match was made', () => {
    expect(matchesText('France', ['France', 'French Republic'])).toBe('exact');
    expect(matchesText('French Republic', ['France', 'French Republic'])).toBe('alias');
    expect(matchesText('Frnace', ['France'])).toBe('fuzzy');
    expect(matchesText('Spain', ['France'])).toBeNull();
  });

  it('returns null for an empty guess rather than matching everything', () => {
    expect(matchesText('', ['France'])).toBeNull();
    expect(matchesText('   ', ['France'])).toBeNull();
  });
});

describe('capitals', () => {
  const gradeCapital = (iso3: string, input: string) =>
    gradeSingle('capital', input, facts(iso3).capital);

  it('accepts the capital, spelled loosely', () => {
    expect(gradeCapital('FRA', 'paris').correct).toBe(true);
    expect(gradeCapital('GRL', 'Nuuk').correct).toBe(true);
    expect(gradeCapital('ISL', 'Reykjavik').correct).toBe(true);
  });

  it('accepts any one of South Africa\'s three capitals', () => {
    for (const city of facts('ZAF').capital) {
      expect(gradeCapital('ZAF', city).correct).toBe(true);
    }
    expect(facts('ZAF').capital.length).toBeGreaterThan(1);
  });

  it('rejects a different city', () => {
    expect(gradeCapital('FRA', 'Lyon').correct).toBe(false);
  });
});

describe('currencies - up to three', () => {
  const gradeCurrency = (iso3: string, chips: string[]) =>
    gradeSet(
      'currency',
      chips,
      facts(iso3).currencies.map((c) => c.name),
      CURRENCIES_REQUIRED,
      currencyAliases(facts(iso3)),
    );

  it('accepts the full name', () => {
    expect(gradeCurrency('JPN', ['Japanese yen']).correct).toBe(true);
  });

  it('accepts the head noun when it is unambiguous', () => {
    expect(gradeCurrency('ZAF', ['rand']).correct).toBe(true);
    expect(gradeCurrency('JPN', ['yen']).correct).toBe(true);
  });

  it('rejects the currency code, which is different knowledge', () => {
    expect(gradeCurrency('JPN', ['JPY']).correct).toBe(false);
    expect(gradeCurrency('USA', ['USD']).correct).toBe(false);
  });

  it('requires every currency when a country has three or fewer', () => {
    // Panama uses the balboa and the US dollar. 192 of the 193 sit at one or two, so
    // the cap is invisible to them and the whole set is still required.
    const both = facts('PAN').currencies.map((c) => c.name);
    expect(both.length).toBe(2);
    expect(gradeCurrency('PAN', [both[0]]).correct).toBe(false);
    expect(gradeCurrency('PAN', both).correct).toBe(true);
  });

  it('asks for only three of the nine Zimbabwe lists', () => {
    // The one country the cap exists for: naming all nine is a wall rather than a
    // question.
    const zimbabwe = facts('ZWE').currencies.map((c) => c.name);
    expect(zimbabwe.length).toBe(9);
    expect(CURRENCIES_REQUIRED).toBe(3);
    expect(gradeCurrency('ZWE', zimbabwe.slice(0, 3)).correct).toBe(true);
    expect(gradeCurrency('ZWE', zimbabwe.slice(0, 2)).correct).toBe(false);
  });

  it('does not let an ambiguous head noun satisfy two currencies at once', () => {
    // Cuba has a "Cuban peso" and a "Cuban convertible peso". If bare "peso" counted,
    // typing it twice would clear both.
    const cuban = currencyAliases(facts('CUB'));
    for (const aliases of cuban.values()) {
      expect(aliases).not.toContain('peso');
    }
  });

  it('lists what was missed, for the reveal line', () => {
    const grade = gradeCurrency('PAN', ['Panamanian balboa']);
    expect(grade.missed).toHaveLength(1);
    expect(grade.how).toBe('partial');
  });
});

describe('gradeSet - exact before fuzzy', () => {
  it('matches exactly before fuzzily, so a loose chip cannot steal a slot', () => {
    // Two expected entries one edit apart. A single greedy pass lets the first chip
    // consume the entry that a later chip matches exactly, marking a right answer wrong.
    // Nothing in today's data is this cruel; the property is what matters.
    const grade = gradeSet(
      'currency',
      ['Southern peso', 'Northern peso', 'krone'],
      ['Northern peso', 'Southern peso', 'krone', 'lira'],
      3,
    );
    expect(grade.correct).toBe(true);
    expect(grade.missed).toEqual(['lira']);
  });
});

describe('parsePopulation', () => {
  it.each([
    ['68000000', 68_000_000],
    ['68,000,000', 68_000_000],
    ['68 000 000', 68_000_000],
    ['68m', 68_000_000],
    ['68 million', 68_000_000],
    ['1.4b', 1_400_000_000],
    ['1.4bn', 1_400_000_000],
    ['1.4 billion', 1_400_000_000],
    ['500k', 500_000],
    ['1.2mil', 1_200_000],
  ])('reads %p as %p', (input, expected) => {
    expect(parsePopulation(input)).toBe(expected);
  });

  // English reads a comma as a thousands separator, and only English does. See the
  // Russian suite in `gradingRu.test.ts` for the other half of this decision.
  it.each([
    ['1,4', 14],
    ['1,4 billion', 14_000_000_000],
  ])('reads the comma as grouping, not as a decimal point: %p', (input, expected) => {
    expect(parsePopulation(input)).toBe(expected);
  });

  // The Russian shorthands, including the bare letters a number keypad makes easy.
  // Accepted in an English round too, for the same reason the alias lists are supersets.
  it.each([
    ['68 млн', 68_000_000],
    ['68м', 68_000_000],
    ['68 м', 68_000_000],
    ['1.4 млрд', 1_400_000_000],
    ['500т', 500_000],
    ['500 тыс', 500_000],
    ['500 тыс.', 500_000],
    // Every kind of space is stripped, so a figure copied out of the app's own Russian
    // formatting - which groups with a thin space - parses as typed.
    ['12 000 000', 12_000_000],
    ['12\u00a0000\u00a0000', 12_000_000],
    ['12\u2009000\u2009000', 12_000_000],
  ])('reads %p as %p', (input, expected) => {
    expect(parsePopulation(input)).toBe(expected);
  });

  it.each(['', '  ', 'lots', '12 people', '5%', 'abc', '12 человек', '12 к'])(
    'rejects %p',
    (input) => {
      expect(parsePopulation(input)).toBeNull();
    },
  );
});

describe('population - the tolerance band', () => {
  const grade = (input: string, expected = 100_000_000) =>
    gradeNumeric('population', input, expected);

  it('accepts a guess inside the band', () => {
    expect(grade('95m').correct).toBe(true);
    expect(grade('110m').correct).toBe(true);
  });

  it('is inclusive exactly at the edge', () => {
    expect(POPULATION_TOLERANCE).toBe(0.2);
    expect(grade('80m').correct).toBe(true);
    expect(grade('120m').correct).toBe(true);
  });

  it('rejects a guess just outside it', () => {
    expect(grade('79m').correct).toBe(false);
    expect(grade('121m').correct).toBe(false);
  });

  it('reports how far off, so the reveal can say so', () => {
    expect(grade('50m').percentOff).toBeCloseTo(-0.5, 6);
    expect(grade('150m').percentOff).toBeCloseTo(0.5, 6);
  });

  it('treats unreadable input as blank rather than a wild miss', () => {
    expect(grade('loads').how).toBe('blank');
    expect(grade('loads').correct).toBe(false);
  });
});

describe('gradeQuestion', () => {
  const question = {
    iso3: 'FRA',
    facts: facts('FRA'),
    fields: ['name', 'capital', 'population'] as const,
  };

  it('marks a fully correct answer', () => {
    const result = gradeQuestion({ ...question, fields: [...question.fields] }, {
      name: 'France',
      capital: 'Paris',
      population: '68m',
    });
    expect(result.allCorrect).toBe(true);
    expect(result.grades).toHaveLength(3);
  });

  it('is not allCorrect when a single field misses', () => {
    const result = gradeQuestion({ ...question, fields: [...question.fields] }, {
      name: 'France',
      capital: 'Lyon',
      population: '68m',
    });
    expect(result.allCorrect).toBe(false);
    expect(result.grades.filter((g) => g.correct)).toHaveLength(2);
  });

  it('grades only the fields the question asks', () => {
    const result = gradeQuestion({ iso3: 'FRA', facts: facts('FRA'), fields: ['name'] }, {
      name: 'France',
      capital: 'nonsense',
    });
    expect(result.grades.map((g) => g.field)).toEqual(['name']);
    expect(result.allCorrect).toBe(true);
  });

  it('marks an empty submission wrong rather than correct-by-default', () => {
    const result = gradeQuestion({ ...question, fields: [...question.fields] }, {});
    expect(result.allCorrect).toBe(false);
    expect(result.grades.every((g) => g.how === 'blank')).toBe(true);
  });
});

describe('no country is ever accepted as another - full sweep', () => {
  // The hand-picked pairs above are the ones I thought of. This is the property they
  // are examples of, checked across all 193 x 193 combinations: whatever the spelling
  // rules do, naming the wrong country must never score.
  it('rejects every other country\'s name for every country', () => {
    const wrong: string[] = [];

    for (const target of QUIZ_COUNTRIES) {
      const accepted = nameAliases(target.iso3, target.facts);
      for (const other of QUIZ_COUNTRIES) {
        if (other.iso3 === target.iso3) continue;
        const graded = gradeSingle('name', other.facts.name, accepted, {
          reserved: NAME_INDEX,
          ownIso3: target.iso3,
        });
        if (graded.correct) wrong.push(`${other.facts.name} accepted for ${target.facts.name}`);
      }
    }

    expect(wrong).toEqual([]);
  });

  it('still accepts every country\'s own name', () => {
    // The other half of the property: the guard must not have been achieved by
    // rejecting everything.
    const rejected = QUIZ_COUNTRIES.filter(
      (country) =>
        !gradeSingle('name', country.facts.name, nameAliases(country.iso3, country.facts), {
          reserved: NAME_INDEX,
          ownIso3: country.iso3,
        }).correct,
    ).map((c) => c.iso3);

    expect(rejected).toEqual([]);
  });

  it('accepts every alias the dataset ships for its own country', () => {
    const rejected: string[] = [];
    for (const country of QUIZ_COUNTRIES) {
      const accepted = nameAliases(country.iso3, country.facts);
      for (const alias of accepted) {
        // Non-Latin aliases normalize to something the grader cannot compare; skip them
        // rather than pretend they are supported.
        if (!/[a-z]/i.test(alias)) continue;
        const graded = gradeSingle('name', alias, accepted, {
          reserved: NAME_INDEX,
          ownIso3: country.iso3,
        });
        if (!graded.correct) rejected.push(`${country.iso3}: ${alias}`);
      }
    }
    expect(rejected).toEqual([]);
  });
});

describe('toAnswerInput - the uncommitted draft', () => {
  // The regression this exists for: a chip is committed by pressing return, and nobody
  // does that for the LAST word - they type "euro" and hit Check. That text lived in
  // ChipInput's local state, never reached the grader, and the round reported the whole
  // currency field as "left blank" however much had been typed into it.
  it('counts text left in a set field as one more chip', () => {
    expect(toAnswerInput({ text: { currency: 'euro' }, chips: {} })).toEqual({
      currency: ['euro'],
    });
  });

  it('appends the draft after the chips already committed', () => {
    expect(
      toAnswerInput({ text: { currency: 'euro' }, chips: { currency: ['US dollar', 'yen'] } }),
    ).toEqual({ currency: ['US dollar', 'yen', 'euro'] });
  });

  it('does not double-count a draft that is already a chip', () => {
    expect(toAnswerInput({ text: { currency: 'euro' }, chips: { currency: ['Euro'] } })).toEqual({
      currency: ['Euro'],
    });
  });

  it('ignores whitespace-only text', () => {
    expect(toAnswerInput({ text: { currency: '   ' }, chips: { currency: ['euro'] } })).toEqual({
      currency: ['euro'],
    });
    expect(toAnswerInput({ text: { currency: '   ' }, chips: {} })).toEqual({});
  });

  it('leaves the single-value fields as strings', () => {
    expect(toAnswerInput({ text: { name: 'France', population: '68m' }, chips: {} })).toEqual({
      name: 'France',
      population: '68m',
    });
  });

  it('omits a field with nothing in it at all', () => {
    expect(toAnswerInput({ text: {}, chips: {} })).toEqual({});
  });

  it('grades a typed-but-uncommitted currency as correct end to end', () => {
    const input = toAnswerInput({ text: { currency: 'Japanese yen' }, chips: {} });
    expect(input.currency).toEqual(['Japanese yen']);
    const grade = gradeSet(
      'currency',
      input.currency as string[],
      facts('JPN').currencies.map((c) => c.name),
      3,
      currencyAliases(facts('JPN')),
    );
    expect(grade.correct).toBe(true);
    expect(grade.how).not.toBe('blank');
    expect(grade.given).toBe('Japanese yen');
  });
});

describe('currency reveal - name, code and symbol', () => {
  const gradeCurrencyFor = (iso3: string, chips: string[]) =>
    gradeField(iso3, facts(iso3), 'currency', { currency: chips });

  it('reveals the full label, not just the name', () => {
    // "Correct" alone teaches nothing when the grader accepted "yuan", and the name
    // alone still leaves out the code and symbol the info sheet shows.
    expect(gradeCurrencyFor('CHN', ['yuan']).expected).toBe('Chinese yuan (CNY, ¥)');
    expect(gradeCurrencyFor('BRA', ['real']).expected).toBe('Brazilian real (BRL, R$)');
  });

  it('uses the same formatter as the info sheet', () => {
    expect(gradeCurrencyFor('JPN', []).expected).toBe(formatCurrency(facts('JPN').currencies[0]));
  });

  it('labels every currency when a country has several', () => {
    const panama = gradeCurrencyFor('PAN', []);
    expect(panama.expected).toContain('(PAB');
    expect(panama.expected).toContain('(USD');
  });

  it('writes the missed ones out the same way', () => {
    const grade = gradeCurrencyFor('PAN', ['Panamanian balboa']);
    expect(grade.missed).toEqual([formatCurrency(facts('PAN').currencies[1])]);
  });

  it('still matches on the bare name, not the label', () => {
    // The player types "Chinese yuan", never "Chinese yuan (CNY, ¥)".
    expect(gradeCurrencyFor('CHN', ['Chinese yuan']).correct).toBe(true);
    expect(gradeCurrencyFor('CHN', ['yuan']).correct).toBe(true);
    // ...and the code alone is still not an answer.
    expect(gradeCurrencyFor('CHN', ['CNY']).correct).toBe(false);
  });

  it('leaves a single-value field as a plain string', () => {
    // The code-and-symbol label treatment is a currency thing and must not leak.
    expect(gradeField('FRA', facts('FRA'), 'capital', { capital: '' }).expected).toBe('Paris');
  });
});
