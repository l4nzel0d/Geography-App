import type { CountryFacts } from '@/data/types';

import { normalizeText } from './normalizeText';
import { QUIZ_COUNTRIES } from './quizCountries';

/**
 * Every spelling of an answer that ought to count.
 *
 * Most of this comes from the dataset - `altSpellings` already carries "Ivory Coast",
 * "Holland", "UK", "DRC" and "Republic of Korea" - so the hand-written list stays short
 * and only covers what mledoze genuinely lacks.
 */

/**
 * Names in common use that the dataset does not list.
 *
 * Kept deliberately small. Anything that can come from `altSpellings` should, because a
 * hand-maintained list is a hand-maintained list.
 */
export const EXTRA_NAME_ALIASES: Record<string, string[]> = {
  COD: ['Congo Kinshasa', 'Democratic Republic of Congo', 'Zaire'],
  COG: ['Congo Brazzaville', 'Republic of Congo'],
  SWZ: ['Swaziland'], // renamed in 2018; plenty of atlases still say the old name
  TLS: ['East Timor'],
  MMR: ['Burma'],
  CZE: ['Czech Republic'],
  NLD: ['Netherlands'],
  MKD: ['Macedonia'],
  CIV: ['Ivory Coast'],
  CPV: ['Cape Verde'],
  TUR: ['Turkey'],
  USA: ['America'],
  GBR: ['Britain', 'Great Britain'],
  KOR: ['South Korea'],
  PRK: ['North Korea'],
  VAT: ['Vatican'],
  ARE: ['UAE'],
  CAF: ['Central African Republic'],
};

export function nameAliases(iso3: string, facts: CountryFacts): string[] {
  return [
    facts.name,
    ...(facts.official ? [facts.official] : []),
    ...facts.altSpellings,
    ...(EXTRA_NAME_ALIASES[iso3] ?? []),
  ];
}

/**
 * Accepted spellings for a set of multi-word names, keyed by the canonical name.
 *
 * The head noun counts - "rand" for "South African rand", "German" for "Swiss German" -
 * because that is the part someone actually knows; the qualifier is the dataset's
 * bookkeeping. But only when the head noun is unambiguous WITHIN this country's set:
 * Cuba has both a "Cuban peso" and a "Cuban convertible peso", and South Africa lists
 * both "Northern Sotho" and "Southern Sotho", so a bare "peso" or "Sotho" must not be
 * allowed to satisfy either of the pair.
 */
export function headNounAliases(names: readonly string[]): Map<string, string[]> {
  const heads = names.map((name) => normalizeText(name).split(' ').pop() ?? '');

  return new Map(
    names.map((name, index) => {
      const head = heads[index];
      const unambiguous = head.length > 2 && heads.filter((h) => h === head).length === 1;
      return [name, unambiguous ? [name, head] : [name]];
    }),
  );
}

/**
 * Currency CODES are deliberately not accepted. The question asks for the name and the
 * label says so; "USD" is a different piece of knowledge from "United States dollar".
 */
export function currencyAliases(facts: CountryFacts): Map<string, string[]> {
  return headNounAliases(facts.currencies.map((c) => c.name));
}

/** Same rule for languages: "German" should count for Switzerland's "Swiss German". */
export function languageAliases(facts: CountryFacts): Map<string, string[]> {
  return headNounAliases(facts.languages);
}

/**
 * Every country name in the pool, normalized, mapped to its ISO-3.
 *
 * This is what stops fuzzy matching handing out points for a different country: see the
 * confusable guard in `gradeAnswer`. Built once at module load.
 */
export const NAME_INDEX: ReadonlyMap<string, string> = (() => {
  const index = new Map<string, string>();
  for (const country of QUIZ_COUNTRIES) {
    for (const alias of nameAliases(country.iso3, country.facts)) {
      const key = normalizeText(alias);
      // First writer wins, so a country's own common name outranks another country's
      // long-form official name if they ever collide.
      if (key && !index.has(key)) index.set(key, country.iso3);
    }
  }
  return index;
})();
