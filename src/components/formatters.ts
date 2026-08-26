import { getLocale } from '@/i18n/locale';
import type { Locale } from '@/i18n/localeTypes';
import { translate } from '@/i18n/t';

import type { Currency } from '@/data/types';

/**
 * Every function here takes the locale as a trailing argument that **defaults to the
 * active one**, rather than requiring it at each of the ~20 call sites.
 *
 * The default is what makes the app correct without threading a locale through the info
 * sheet, the quiz panel and the label builder; the explicit parameter is what keeps these
 * testable as pure functions, and is what `labelGeoJson.ts` uses to build both languages'
 * label text in one pass regardless of which one is on screen.
 */

/** Shown wherever a fact is genuinely unavailable upstream. */
export const NOT_AVAILABLE = '—';

/** BCP-47 tags for `Intl`, which wants a region: `ru` alone groups digits differently. */
const NUMBER_LOCALE: Record<Locale, string> = { en: 'en-US', ru: 'ru-RU' };

export function formatPopulation(
  population: number | null | undefined,
  locale: Locale = getLocale(),
): string {
  if (population == null) return NOT_AVAILABLE;
  // Russian groups with a thin space rather than a comma - `Intl` knows, so this is one
  // of the few places the platform can be trusted to be right about a language.
  return new Intl.NumberFormat(NUMBER_LOCALE[locale]).format(population);
}

/**
 * One currency, e.g. "Brazilian real (BRL, R$)".
 *
 * Split out so quiz mode can label a single currency the same way the info sheet labels
 * a list of them - the two must not drift into different ideas of what a currency looks
 * like written down.
 */
export function formatCurrency({ code, name, symbol }: Currency): string {
  return symbol ? `${name} (${code}, ${symbol})` : `${name} (${code})`;
}

/** e.g. "Brazilian real (BRL, R$)", or several joined with "  ·  ". */
export function formatCurrencies(currencies: Currency[] | null | undefined): string {
  if (!currencies?.length) return NOT_AVAILABLE;
  // The joiners stay `, ` and `  ·  ` in both languages: they are punctuation, not words,
  // and Russian uses the same ones.
  return currencies.map(formatCurrency).join('  ·  ');
}

/** Countries such as Nauru have no capital in the dataset. */
export function formatCapital(capital: string[] | null | undefined): string {
  if (!capital?.length) return NOT_AVAILABLE;
  return capital.join(', ');
}

export function formatArea(
  areaKm2: number | null | undefined,
  locale: Locale = getLocale(),
): string {
  if (areaKm2 == null) return NOT_AVAILABLE;
  const number = new Intl.NumberFormat(NUMBER_LOCALE[locale]).format(Math.round(areaKm2));
  return `${number} ${translate(locale, 'units.km2')}`;
}

/**
 * Two significant figures with a k/m/b suffix, for drawing on the map.
 *
 * Deliberately NOT a replacement for `formatPopulation`, which stays as it is: the info
 * sheet has a whole row to itself and "68,000,000" is the honest, readable answer there.
 * A map label has the width of a country, so it gets "68m".
 *
 * Two significant figures is what keeps every label the same handful of characters wide,
 * which is what makes the fit test in `labelFit.ts` predictable: 1.5b, 340m, 68m, 11k are
 * all 2sf, and none is longer than four characters. Rounding happens before the suffix is
 * chosen so 999,999,999 becomes "1.0b" rather than "1000m".
 */
export function formatCompactNumber(
  value: number | null | undefined,
  locale: Locale = getLocale(),
): string {
  if (value == null || !Number.isFinite(value)) return NOT_AVAILABLE;

  const negative = value < 0;
  const magnitude = Math.abs(value);
  if (magnitude < 1) return String(value);

  // Round to 2sf FIRST, then pick the unit. The other order prints 999,999,999 as
  // "1000m", because the unit is chosen while the value is still under a billion.
  const rounded = Number(magnitude.toPrecision(2));

  /*
    Russian writes "47 млн" - a word, with a space - where English writes "47m". The space
    is a NO-BREAK one so a map label can never wrap between the number and its unit, and
    the suffixes are three to four characters wider than the Latin ones, which is why the
    label fit thresholds are computed per locale rather than shared. See `labelFit.ts`.
  */
  const units: readonly [number, string][] = [
    [1e9, translate(locale, 'format.compact.billion')],
    [1e6, translate(locale, 'format.compact.million')],
    [1e3, translate(locale, 'format.compact.thousand')],
  ];

  for (const [scale, suffix] of units) {
    if (rounded >= scale) {
      const scaled = rounded / scale;
      // "1.5b" but "340m" - a decimal place only where 2sf actually needs one.
      const text = scaled < 10 ? scaled.toFixed(1) : String(Math.round(scaled));
      return `${negative ? '-' : ''}${text}${suffix}`;
    }
  }

  return `${negative ? '-' : ''}${rounded}`;
}

/**
 * The first few entries of a list, joined for a map label.
 *
 * Capitals and currencies are lists and some of them are long - Zimbabwe records nine
 * currencies - so a label has to truncate somewhere. Three is the agreed cut: enough to
 * say something real about a country, short enough to still fit inside one.
 *
 * No "+12 more" suffix: the count is not the interesting part on a map, and the info
 * sheet already shows the full list for anything you tap.
 */
export function formatLabelList(
  items: readonly string[] | null | undefined,
  limit = 3,
): string | null {
  if (!items?.length) return null;
  return items.slice(0, limit).join(', ');
}
