import type { Currency } from '@/data/types';

/** Shown wherever a fact is genuinely unavailable upstream. */
export const NOT_AVAILABLE = '—';

export function formatPopulation(population: number | null | undefined): string {
  if (population == null) return NOT_AVAILABLE;
  return new Intl.NumberFormat('en-US').format(population);
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
  return currencies.map(formatCurrency).join('  ·  ');
}

export function formatLanguages(languages: string[] | null | undefined): string {
  if (!languages?.length) return NOT_AVAILABLE;
  return languages.join(', ');
}

/** Countries such as Nauru have no capital in the dataset. */
export function formatCapital(capital: string[] | null | undefined): string {
  if (!capital?.length) return NOT_AVAILABLE;
  return capital.join(', ');
}

export function formatArea(areaKm2: number | null | undefined): string {
  if (areaKm2 == null) return NOT_AVAILABLE;
  return `${new Intl.NumberFormat('en-US').format(Math.round(areaKm2))} km²`;
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
export function formatCompactNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return NOT_AVAILABLE;

  const negative = value < 0;
  const magnitude = Math.abs(value);
  if (magnitude < 1) return String(value);

  // Round to 2sf FIRST, then pick the unit. The other order prints 999,999,999 as
  // "1000m", because the unit is chosen while the value is still under a billion.
  const rounded = Number(magnitude.toPrecision(2));

  const units: readonly [number, string][] = [
    [1e9, 'b'],
    [1e6, 'm'],
    [1e3, 'k'],
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
 * Languages and currencies are lists and some of them are long - Zimbabwe records 15
 * languages - so a label has to truncate somewhere. Three is the agreed cut: enough to
 * say something real about a multilingual country, short enough to still fit inside one.
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
