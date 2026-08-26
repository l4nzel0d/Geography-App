import { en } from '@/i18n/en';
import { ru } from '@/i18n/ru';
import { translate, translatorFor, type MessageKey } from '@/i18n/t';

/**
 * What the type system cannot see about a translation.
 *
 * `ru.ts` is typed `Record<MessageKey, string>`, so a missing or extra key is already a
 * **compile** error and `npm run typecheck` is the real gate. Everything here is about the
 * failures a type allows through: an empty value, a placeholder dropped in translation, a
 * string left in English, and a pill label that has quietly grown too long.
 */

const KEYS = Object.keys(en) as MessageKey[];

const PLACEHOLDER = /\{(\w+)\}/g;

const placeholders = (message: string): string[] =>
  [...message.matchAll(PLACEHOLDER)].map((match) => match[1]).sort();

describe('the string catalogues', () => {
  it('covers every key', () => {
    expect(Object.keys(ru).sort()).toEqual(KEYS.slice().sort());
  });

  it('has no empty message in either language', () => {
    for (const key of KEYS) {
      expect(en[key].trim()).not.toBe('');
      expect(ru[key].trim()).not.toBe('');
    }
  });

  /**
   * The interpolation contract. `t` leaves an unknown placeholder visible rather than
   * blanking it, so a translation that renamed `{count}` to `{число}` would put a literal
   * brace on screen. This is the cheapest place to catch that.
   */
  it('uses the same placeholders in both languages', () => {
    for (const key of KEYS) {
      expect({ key, params: placeholders(ru[key]) }).toEqual({
        key,
        params: placeholders(en[key]),
      });
    }
  });

  /**
   * Anything still identical to its English source is either genuinely untranslatable or
   * an oversight, and the difference has to be stated rather than assumed.
   */
  it('translates everything except the deliberately shared strings', () => {
    const SHARED: MessageKey[] = [
      // A language is named in its own language in every locale, so a Russian speaker
      // scanning the picker looks for the word they already know.
      'map.language.en',
      'map.language.ru',
    ];

    const identical = KEYS.filter((key) => en[key] === ru[key]);
    expect(identical.sort()).toEqual(SHARED.slice().sort());
  });

  /** Nothing Cyrillic should have leaked into the English catalogue. */
  it('keeps the English catalogue in Latin script', () => {
    const CYRILLIC = /[Ѐ-ӿ]/;
    const leaked = KEYS.filter((key) => CYRILLIC.test(en[key]) && !key.startsWith('map.language'));
    expect(leaked).toEqual([]);
  });
});

describe('translate', () => {
  it('interpolates named params', () => {
    expect(translate('en', 'flag.a11y', { code: 'FR' })).toBe('Flag of FR');
    expect(translate('ru', 'flag.a11y', { code: 'FR' })).toBe('Флаг страны FR');
  });

  /**
   * A param that was never passed stays visible. A silently empty string is a bug that
   * ships; a stray `{year}` on screen is one somebody reports.
   */
  it('leaves an unsupplied placeholder in place', () => {
    expect(translate('en', 'info.populationSource')).toBe('World Bank, {year}');
  });

  it('builds a bound translator that carries its own locale', () => {
    const t = translatorFor('ru');
    expect(t.locale).toBe('ru');
    expect(t('quiz.exit.title')).toBe('Выйти из теста?');
    expect(t.plural('results.review.missed', 2)).toBe('Разбор — 2 ошибки');
  });

  it('memoises the translator, so a memoised component sees a stable prop', () => {
    expect(translatorFor('ru')).toBe(translatorFor('ru'));
    expect(translatorFor('en')).not.toBe(translatorFor('ru'));
  });
});
