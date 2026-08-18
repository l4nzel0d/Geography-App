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
