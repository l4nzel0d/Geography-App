import factsJson from './countryFacts.json';
import type { CountryFacts } from './types';

/**
 * Facts for every country, keyed by ISO 3166-1 alpha-3.
 *
 * Bundled at build time by `scripts/build-country-data.mjs` and inlined into the
 * JS bundle by Metro, so this is a synchronous in-memory lookup with no I/O and
 * no network. Do not convert this to a fetch.
 */
const facts = factsJson as unknown as Record<string, CountryFacts>;

export function getCountryFacts(iso3: string | null | undefined): CountryFacts | null {
  if (!iso3) return null;
  return facts[iso3] ?? null;
}

export const allCountryFacts = facts;
