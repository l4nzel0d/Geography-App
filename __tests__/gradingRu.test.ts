import { getCountryFacts } from '@/data/countryFacts';
import { normalizeText, russianStem } from '@/quiz/normalizeText';
import { nameAliases, NAME_INDEX_BY_LOCALE } from '@/quiz/answerAliases';
import {
  gradeField,
  gradeQuestion,
  matchesText,
  parsePopulation,
} from '@/quiz/gradeAnswer';
import { QUIZ_COUNTRIES_BY_LOCALE } from '@/quiz/quizCountries';

/**
 * Marking a Russian round.
 *
 * The English suite is `grading.test.ts` and is untouched; this is its Russian sibling
 * rather than a `describe.each` over both, because the interesting cases are not the same
 * ones. English worries about Zambia/Gambia and Iran/Iraq; Russian has its own confusable
 * set, and it has inflection, which English does not.
 */

const ru = (iso3: string) => getCountryFacts(iso3, 'ru')!;

const gradeName = (iso3: string, input: string) =>
  gradeField(iso3, ru(iso3), 'name', { name: input }, 'ru');

describe('Russian country names', () => {
  it('accepts the country|s own Russian name', () => {
    expect(gradeName('FRA', 'Франция').correct).toBe(true);
    expect(gradeName('RUS', 'Россия').correct).toBe(true);
    expect(gradeName('DEU', 'Германия').correct).toBe(true);
    expect(gradeName('JPN', 'Япония').correct).toBe(true);
  });

  it('forgives ё written as е, which is how Russians actually type', () => {
    // Not a special case in the code: `normalizeText` decomposes and strips the diaeresis,
    // so this falls out of the same NFD pass that handles French accents.
    expect(normalizeText('Ёлка')).toBe('елка');
    expect(gradeName('AUT', 'Австрия').correct).toBe(true);
  });

  it('accepts the hand-written Russian aliases', () => {
    expect(gradeName('NLD', 'Голландия').correct).toBe(true);
    expect(gradeName('MMR', 'Бирма').correct).toBe(true);
    expect(gradeName('USA', 'США').correct).toBe(true);
    expect(gradeName('ARE', 'ОАЭ').correct).toBe(true);
    expect(gradeName('ZAF', 'ЮАР').correct).toBe(true);
    expect(gradeName('IRN', 'Персия').correct).toBe(true);
    expect(gradeName('SWZ', 'Эсватини').correct).toBe(true);
  });

  it('still accepts the English name in a Russian round', () => {
    // A bilingual player typing "France" has not got the question wrong, and the superset
    // makes the confusable guard stricter rather than looser.
    expect(gradeName('FRA', 'France').correct).toBe(true);
    expect(gradeName('NLD', 'Holland').correct).toBe(true);
  });

  it('forgives a small typo', () => {
    expect(gradeName('FRA', 'Франци').correct).toBe(true);
    expect(gradeName('DEU', 'Гермения').correct).toBe(true);
  });

  /**
   * The reason `NAME_INDEX` had to become per-locale.
   *
   * австрия -> австралия is two edits on a nine-letter target, which `allowedEdits` allows.
   * With only the English index loaded the guard never sees either string and the round
   * hands out Austria's point for Australia.
   */
  it('refuses a different country, however close the spelling', () => {
    expect(gradeName('AUS', 'Австрия').correct).toBe(false);
    expect(gradeName('AUT', 'Австралия').correct).toBe(false);
    expect(gradeName('NER', 'Нигерия').correct).toBe(false);
    expect(gradeName('NGA', 'Нигер').correct).toBe(false);
    expect(gradeName('IRN', 'Ирак').correct).toBe(false);
    expect(gradeName('IRQ', 'Иран').correct).toBe(false);
  });

  /**
   * The full sweep, mirroring `grading.test.ts`'s English one.
   *
   * Every country's own Russian name must pass for it, and must fail for all 192 others.
   */
  it('never accepts one country|s Russian name for another', () => {
    const countries = QUIZ_COUNTRIES_BY_LOCALE.ru;
    const wrong: string[] = [];

    for (const target of countries) {
      for (const other of countries) {
        if (target.iso3 === other.iso3) continue;
        if (gradeName(target.iso3, other.facts.name).correct) {
          wrong.push(`${other.facts.name} accepted for ${target.facts.name}`);
        }
      }
    }

    expect(wrong).toEqual([]);
  });

  it('accepts every country|s own Russian name and every Russian alias', () => {
    const failed: string[] = [];

    for (const country of QUIZ_COUNTRIES_BY_LOCALE.ru) {
      for (const alias of nameAliases(country.iso3, country.facts, 'ru')) {
        if (!gradeName(country.iso3, alias).correct) {
          failed.push(`${alias} rejected for ${country.iso3}`);
        }
      }
    }

    expect(failed).toEqual([]);
  });

  it('indexes every Russian name, or the guard above is blind', () => {
    for (const country of QUIZ_COUNTRIES_BY_LOCALE.ru) {
      expect(NAME_INDEX_BY_LOCALE.ru.get(normalizeText(country.facts.name))).toBe(country.iso3);
    }
  });
});

describe('Russian capitals', () => {
  const gradeCapital = (iso3: string, input: string) =>
    gradeField(iso3, ru(iso3), 'capital', { capital: input }, 'ru');

  it('accepts the Russian spelling', () => {
    expect(gradeCapital('FRA', 'Париж').correct).toBe(true);
    expect(gradeCapital('RUS', 'Москва').correct).toBe(true);
    expect(gradeCapital('JPN', 'Токио').correct).toBe(true);
    expect(gradeCapital('CHN', 'Пекин').correct).toBe(true);
  });

  it('accepts any of a country|s several capitals', () => {
    for (const city of ['Претория', 'Кейптаун', 'Блумфонтейн']) {
      expect(gradeCapital('ZAF', city).correct).toBe(true);
    }
  });

  it('rejects the wrong city', () => {
    expect(gradeCapital('FRA', 'Лион').correct).toBe(false);
  });
});

describe('Russian inflection', () => {
  it('folds a noun|s cases onto one stem', () => {
    for (const group of [
      ['рубль', 'рубля', 'рублей', 'рублём'],
      ['доллар', 'доллара', 'долларов'],
      ['иена', 'иены'],
      ['английский', 'английского', 'английские', 'английским'],
    ]) {
      expect(new Set(group.map(russianStem)).size).toBe(1);
    }
  });

  it('leaves a short word its ending rather than eating it whole', () => {
    expect(russianStem('ев')).toBe('ев');
  });

  const gradeCurrency = (iso3: string, chips: string[]) =>
    gradeField(iso3, ru(iso3), 'currency', { currency: chips }, 'ru');

  it('accepts a currency named in the wrong case', () => {
    // "рублей" is two edits from "рубль" on a five-letter target, so the typo budget
    // cannot reach it - this is what the stemmer is for.
    expect(gradeCurrency('RUS', ['рублей']).correct).toBe(true);
    expect(gradeCurrency('RUS', ['рубля']).correct).toBe(true);
    expect(gradeCurrency('USA', ['долларов']).correct).toBe(true);
  });

  it('accepts the head noun where it is unambiguous, at either end of the name', () => {
    // "российский рубль" is adjective-then-noun like the English; "доллар США" is not,
    // and taking only the last word would leave "сша" as the accepted answer.
    expect(gradeCurrency('RUS', ['рубль']).correct).toBe(true);
    expect(gradeCurrency('USA', ['доллар']).correct).toBe(true);
    expect(gradeCurrency('GBR', ['фунт']).correct).toBe(true);
  });

  it('does not stem country names, where a near miss is a different country', () => {
    // Without a stemmer this is a plain fuzzy hit - two edits on a nine-letter target...
    expect(matchesText('австрия', ['австралия'])).toBe('fuzzy');
    // ...which is exactly why `gradeField` hands the name field the confusable guard and
    // no stemmer. Loosening the comparison on the one field where a near miss means a
    // different country is the wrong trade.
    expect(
      matchesText('австрия', ['австралия'], NAME_INDEX_BY_LOCALE.ru, 'AUS'),
    ).toBeNull();
  });
});

describe('a whole Russian question', () => {
  it('marks a fully correct answer', () => {
    const result = gradeQuestion(
      { iso3: 'FRA', facts: ru('FRA'), fields: ['name', 'capital', 'population'] },
      { name: 'Франция', capital: 'Париж', population: '68 млн' },
      'ru',
    );
    expect(result.allCorrect).toBe(true);
    expect(result.grades).toHaveLength(3);
  });

  it('reveals the expected answer in Russian', () => {
    const result = gradeQuestion(
      { iso3: 'FRA', facts: ru('FRA'), fields: ['capital'] },
      { capital: 'Лион' },
      'ru',
    );
    expect(result.grades[0].expected).toBe('Париж');
  });
});

describe('a Russian population', () => {
  const ruPop = (input: string) => parsePopulation(input, 'ru');

  /**
   * The comma is the decimal point in Russian, and reading it the English way was the
   * bug: "1,4 млрд" became fourteen billion - ten times the answer, marked wrong, with
   * the panel echoing back a figure the player never typed.
   */
  it('reads a lone comma as the decimal point', () => {
    expect(ruPop('1,4 млрд')).toBe(1_400_000_000);
    expect(ruPop('1,4 миллиарда')).toBe(1_400_000_000);
    expect(ruPop('67,8 млн')).toBe(67_800_000);
    expect(ruPop('1,5м')).toBe(1_500_000);
  });

  /**
   * And several commas as grouping, because that shape cannot be a decimal - a decimal
   * has one point. It is what keeps an English-habit answer working in a Russian round
   * without costing the native one anything.
   */
  it('still reads several commas as thousands grouping', () => {
    expect(ruPop('68,000,000')).toBe(68_000_000);
    expect(ruPop('1,400,000')).toBe(1_400_000);
  });

  it('leaves the full stop a decimal point in both languages', () => {
    expect(ruPop('1.4 млрд')).toBe(1_400_000_000);
    expect(parsePopulation('1.4 млрд', 'en')).toBe(1_400_000_000);
  });

  // The one genuinely ambiguous shape, settled per language rather than guessed at per
  // number: three digits after a lone comma. Anyone meaning fourteen hundred writes
  // "1400" or "1 400", and both parse in either language.
  it('settles "1,400" by the round|s language, and says so both ways', () => {
    expect(ruPop('1,400')).toBe(1.4);
    expect(parsePopulation('1,400', 'en')).toBe(1_400);
    expect(ruPop('1 400')).toBe(1_400);
  });

  it('is unbothered by a trailing comma, which separates nothing', () => {
    expect(ruPop('1 400,')).toBe(1_400);
  });

  it('rejects a number carrying both separators rather than guessing', () => {
    // "1.000,5" is a third convention again. Refusing it costs a player nothing they
    // cannot rewrite, where a guess would silently mark a right answer wrong.
    expect(ruPop('1.000,5')).toBeNull();
  });

  it('grades a Russian round through the same locale it was asked in', () => {
    // The end-to-end shape: `gradeQuestion` threads its locale down to the parser, so a
    // player who writes 1.4 billion the Russian way is marked right.
    const result = gradeQuestion(
      { iso3: 'IND', facts: ru('IND'), fields: ['population'] },
      { population: '1,45 млрд' },
      'ru',
    );
    expect(result.grades[0].correct).toBe(true);
  });
});
