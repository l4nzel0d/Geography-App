import type { Locale } from './localeTypes';

/**
 * Which grammatical form a count takes.
 *
 * **Hand-rolled rather than `Intl.PluralRules`, and that is the same call
 * `normalizeText.ts` already makes about `\p{Diacritic}`:** anything delegated to `Intl` on
 * Hermes goes to Android's ICU, which is a different implementation from the one Node runs
 * the tests against, and can differ by API level. These are five lines Jest can pin
 * exactly, on both runtimes, forever.
 *
 * English has two forms. **Russian has three**, and the third is the one everyone gets
 * wrong: 11 to 14 take the `many` form despite ending in 1, 2, 3 and 4.
 *
 *     1 страна        21 страна       101 страна        (one)
 *     2 страны         3 страны         4 страны        (few)
 *     5 стран         11 стран        14 стран    0 стран   (many)
 */
export type PluralCategory = 'one' | 'few' | 'many' | 'other';

/** Every form a message may supply. `other` is required so a lookup can always land. */
export type PluralForms = Partial<Record<PluralCategory, string>> & { other: string };

export function pluralCategory(locale: Locale, count: number): PluralCategory {
  // A non-integer count has no place in any of these messages ("2.5 countries"), but
  // guarding costs nothing and `NaN % 10` would otherwise fall through to `many`.
  const n = Math.abs(Math.trunc(count));

  if (locale === 'ru') {
    const mod100 = n % 100;
    // The 11-14 exception is checked FIRST. Doing it after the mod-10 tests would give
    // "11 страна", which is the classic bug.
    if (mod100 >= 11 && mod100 <= 14) return 'many';

    const mod10 = n % 10;
    if (mod10 === 1) return 'one';
    if (mod10 >= 2 && mod10 <= 4) return 'few';
    return 'many';
  }

  return n === 1 ? 'one' : 'other';
}

/** The form for this count, falling back through `many` to the required `other`. */
export function selectPluralForm(
  locale: Locale,
  forms: PluralForms,
  count: number,
): string {
  const category = pluralCategory(locale, count);
  return forms[category] ?? forms.many ?? forms.other;
}
