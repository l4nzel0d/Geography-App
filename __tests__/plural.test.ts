import { pluralCategory, selectPluralForm } from '@/i18n/plural';
import { enPlurals } from '@/i18n/en.plurals';
import { ruPlurals } from '@/i18n/ru.plurals';
import { translatePlural } from '@/i18n/t';

/**
 * Russian plural agreement, hand-rolled rather than delegated to `Intl.PluralRules`.
 *
 * The rules are pinned here rather than trusted because `Intl` on Hermes is Android's ICU,
 * a different implementation from the one Node runs these tests against - the same reason
 * `normalizeText.ts` spells out its combining-mark range instead of writing
 * `\p{Diacritic}`.
 */
describe('pluralCategory', () => {
  it('is two-way in English', () => {
    expect(pluralCategory('en', 1)).toBe('one');
    for (const n of [0, 2, 5, 11, 21, 100]) expect(pluralCategory('en', n)).toBe('other');
  });

  describe('Russian', () => {
    const cases: [number, string][] = [
      [1, 'one'],
      [21, 'one'],
      [101, 'one'],
      [1001, 'one'],
      [2, 'few'],
      [3, 'few'],
      [4, 'few'],
      [22, 'few'],
      [104, 'few'],
      [0, 'many'],
      [5, 'many'],
      [10, 'many'],
      [20, 'many'],
      [25, 'many'],
      [100, 'many'],
    ];

    it.each(cases)('%i takes the %s form', (n, category) => {
      expect(pluralCategory('ru', n)).toBe(category);
    });

    /**
     * The exception everyone gets wrong. 11-14 end in 1, 2, 3 and 4 but take `many`, so a
     * naive mod-10 rule gives "11 страна". It is checked before the mod-10 tests, and this
     * is what keeps it that way.
     */
    it.each([11, 12, 13, 14, 111, 112, 1013])('%i is many despite its last digit', (n) => {
      expect(pluralCategory('ru', n)).toBe('many');
    });

    it('ignores sign and fraction', () => {
      expect(pluralCategory('ru', -21)).toBe('one');
      expect(pluralCategory('ru', 2.7)).toBe('few');
      expect(pluralCategory('ru', Number.NaN)).toBe('many');
    });
  });
});

describe('the plural catalogues', () => {
  /**
   * The type already requires all three of Russian's forms. This catches the other half:
   * an entry where someone filled all three in with the same string, which is how "11
   * страна" gets in despite the type.
   */
  it('gives every Russian message three distinct forms where the noun changes', () => {
    for (const key of Object.keys(enPlurals) as (keyof typeof enPlurals)[]) {
      const forms = ruPlurals[key];
      expect(forms.one).toBeTruthy();
      expect(forms.few).toBeTruthy();
      expect(forms.many).toBeTruthy();
      // `one` must never equal `few` - those are the two that a mod-10-only rule confuses.
      expect(forms.one).not.toBe(forms.few);
    }
  });

  it('has the same keys in both languages', () => {
    expect(Object.keys(ruPlurals).sort()).toEqual(Object.keys(enPlurals).sort());
  });
});

describe('translatePlural', () => {
  it('injects the count without it being passed as a param', () => {
    expect(translatePlural('en', 'quiz.setup.start', 1)).toBe('Start — 1 country');
    expect(translatePlural('en', 'quiz.setup.start', 193)).toBe('Start — 193 countries');
  });

  it('agrees the Russian noun with the count', () => {
    expect(translatePlural('ru', 'quiz.setup.start', 1)).toBe('Начать — 1 страна');
    expect(translatePlural('ru', 'quiz.setup.start', 3)).toBe('Начать — 3 страны');
    expect(translatePlural('ru', 'quiz.setup.start', 11)).toBe('Начать — 11 стран');
    expect(translatePlural('ru', 'quiz.setup.start', 193)).toBe('Начать — 193 страны');
  });

  it('interpolates other params alongside the count', () => {
    expect(
      translatePlural('en', 'quiz.subregion.count', 2, { subregion: 'Melanesia' }),
    ).toBe('Melanesia, 2 countries');
  });

  it('falls back through many to other for a category a message does not define', () => {
    expect(selectPluralForm('ru', { other: 'x' }, 5)).toBe('x');
    expect(selectPluralForm('en', { one: 'a', other: 'b' }, 1)).toBe('a');
  });
});
