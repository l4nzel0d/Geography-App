import type { CountryFacts } from '@/data/types';
import { byLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/localeTypes';

import { looksAdjectival, normalizeText } from './normalizeText';
import { QUIZ_COUNTRIES_BY_LOCALE } from './quizCountries';

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

/** The alias list built from one language's own record, with nothing borrowed. */
function ownAliases(iso3: string, facts: CountryFacts): string[] {
  return [
    facts.name,
    ...(facts.official ? [facts.official] : []),
    ...facts.altSpellings,
    ...(EXTRA_NAME_ALIASES[iso3] ?? []),
  ];
}

/**
 * The English names, by ISO-3, built once.
 *
 * A map rather than a `find` per call: `grading.test.ts` sweeps all 193x193 country pairs
 * and does so once per locale, so a linear scan in here is a cubic walk.
 */
const ENGLISH_ALIASES: ReadonlyMap<string, string[]> = new Map(
  QUIZ_COUNTRIES_BY_LOCALE[DEFAULT_LOCALE].map((country) => [
    country.iso3,
    ownAliases(country.iso3, country.facts),
  ]),
);

/**
 * Every spelling accepted for one country, in one language.
 *
 * A Russian round accepts the **English** names too, and that is deliberate rather than an
 * oversight: a bilingual player typing "Russia" has not got the question wrong, and a
 * superset makes the confusable guard *stricter* rather than looser, because more strings
 * are claimed by some country. The locale's own name still leads the list, so
 * `matchesText` reports `exact` for it and `alias` for everything else.
 */
export function nameAliases(
  iso3: string,
  facts: CountryFacts,
  locale: Locale = DEFAULT_LOCALE,
): string[] {
  const base = ownAliases(iso3, facts);
  if (locale === DEFAULT_LOCALE) return base;

  return [...base, ...(ENGLISH_ALIASES.get(iso3) ?? [])];
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
export function headNounAliases(
  names: readonly string[],
  locale: Locale = DEFAULT_LOCALE,
): Map<string, string[]> {
  const candidates = names.map((name) => headCandidates(name, locale));

  return new Map(
    names.map((name, index) => {
      // A candidate counts only if no OTHER entry in this country's set offers it too.
      const usable = candidates[index].filter(
        (head) =>
          head.length > 2 &&
          candidates.filter((other) => other.includes(head)).length === 1,
      );
      return [name, [name, ...usable]];
    }),
  );
}

/**
 * Which word of a multi-word name might be the head noun, per language.
 *
 * **English puts the head last** - "South African rand", "Swiss German" - so the last word
 * is the only candidate, and that is what the rule has always been.
 *
 * **Russian puts it either side.** "российский рубль" is adjective-then-noun like the
 * English, but "фунт стерлингов" and "доллар США" are noun-then-qualifier, and taking the
 * last word there yields "стерлингов" and "сша" - neither of which anybody would type as
 * the currency's name. So Russian offers both ends and lets the ambiguity check above
 * discard whichever is not distinctive.
 *
 * Offering both ends in English too would be wrong, not merely redundant: "south" would
 * become an accepted answer for the South African rand.
 */
function headCandidates(name: string, locale: Locale): string[] {
  const original = name.split(' ').filter(Boolean);
  const words = normalizeText(name).split(' ').filter(Boolean);
  if (words.length === 0) return [];

  const last = words[words.length - 1];
  if (locale !== 'ru' || words.length === 1) return [last];

  /** "США", "ОАЭ", "КФА" - an abbreviation is never the head noun of a currency name. */
  const isAbbreviation = (index: number) =>
    original[index] != null &&
    original[index].length > 1 &&
    original[index] === original[index].toUpperCase();

  const candidates: string[] = [];
  // The last word first, because it is the head in "российский рубль" - the commonest
  // shape - and the ambiguity check downstream prefers whichever survives.
  if (!isAbbreviation(words.length - 1) && !looksAdjectival(last)) candidates.push(last);
  // ...and the first, for "фунт стерлингов" and "доллар США", where the head leads.
  if (words[0] !== last && !isAbbreviation(0) && !looksAdjectival(words[0])) {
    candidates.push(words[0]);
  }

  return candidates;
}

/**
 * Currency CODES are deliberately not accepted. The question asks for the name and the
 * label says so; "USD" is a different piece of knowledge from "United States dollar".
 */
export function currencyAliases(
  facts: CountryFacts,
  locale: Locale = DEFAULT_LOCALE,
): Map<string, string[]> {
  return headNounAliases(
    facts.currencies.map((c) => c.name),
    locale,
  );
}

/**
 * Every country name in the pool, normalized, mapped to its ISO-3.
 *
 * This is what stops fuzzy matching handing out points for a different country: see the
 * confusable guard in `gradeAnswer`. Built once at module load.
 */
export const NAME_INDEX_BY_LOCALE: Record<Locale, ReadonlyMap<string, string>> = byLocale(
  (locale) => {
    const index = new Map<string, string>();
    for (const country of QUIZ_COUNTRIES_BY_LOCALE[locale]) {
      for (const alias of nameAliases(country.iso3, country.facts, locale)) {
        const key = normalizeText(alias);
        // First writer wins, so a country's own common name outranks another country's
        // long-form official name if they ever collide.
        if (key && !index.has(key)) index.set(key, country.iso3);
      }
    }
    return index;
  },
);

/**
 * The English index, unchanged, so nothing that never asked about a language has to.
 *
 * **A Russian round MUST use the Russian index**, not this one. Edit distance alone
 * accepts "австрия" for Австралия - two edits on a nine-letter target, inside the budget -
 * exactly as it accepts "Gambia" for Zambia in English, and the guard is blind to any name
 * that is not in the index it was handed.
 */
export const NAME_INDEX: ReadonlyMap<string, string> = NAME_INDEX_BY_LOCALE[DEFAULT_LOCALE];
