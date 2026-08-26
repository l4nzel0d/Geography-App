import { getLocale } from '@/i18n/locale';
import { byLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/localeTypes';

import factsJson from './countryFacts.json';
import type { CountryFacts } from './types';

/**
 * Facts for every country, keyed by ISO 3166-1 alpha-3, in every language the app ships.
 *
 * Bundled at build time by `scripts/build-country-data.mjs` and inlined into the
 * JS bundle by Metro, so this is a synchronous in-memory lookup with no I/O and
 * no network. Do not convert this to a fetch.
 *
 * ## Both languages are built eagerly, at module load
 *
 * `COUNTRY_FACTS.ru` is materialised once here rather than on demand, and that is the
 * whole design. Every derived structure downstream - `labelGeoJson`, `NAME_INDEX`,
 * `SEARCH_INDEX`, `QUIZ_COUNTRIES` - is a module constant whose referential stability is
 * load-bearing (see `worldGeoJson.ts`, whose test asserts geometry is passed by
 * reference). Building a locale's view lazily would hand a *new* object out the first time
 * each locale was asked for, and a language switch would then look like a data change to
 * everything holding one.
 *
 * The cost is ~250 small objects. Nothing here touches geometry: `countries.geo.json` is
 * 1.6 MB and is not involved, because `worldGeoJson` reads only `population` and `area`,
 * neither of which is a word. That is why the map's outline source is locale-invariant and
 * stays a true module constant.
 */

const facts = factsJson as unknown as Record<string, CountryFacts>;

/**
 * One country, with its localized words swapped in.
 *
 * The invariant fields - population, area, flag, UN membership - are carried through
 * untouched, so this is a *view* of the same facts rather than a second dataset.
 *
 * `currencies` is rebuilt rather than replaced: the code and the symbol are not words, and
 * only the name changes. The Russian names are parallel **by index**, which the build
 * asserts (`russianIntegrityProblems` fails if the lengths ever disagree).
 */
function localize(base: CountryFacts, locale: Exclude<Locale, typeof DEFAULT_LOCALE>): CountryFacts {
  const translated = base.translations[locale];
  if (!translated) return base;

  return {
    ...base,
    name: translated.name,
    official: translated.official,
    capital: translated.capital,
    languages: translated.languages,
    currencies: base.currencies.map((currency, index) => ({
      ...currency,
      name: translated.currencies[index] ?? currency.name,
    })),
    region: translated.region,
    subregion: translated.subregion,
    altSpellings: translated.altSpellings,
  };
}

function tableFor(locale: Locale): Record<string, CountryFacts> {
  if (locale === DEFAULT_LOCALE) return facts;
  // Narrowed above: `DEFAULT_LOCALE` is the raw table, so anything here has a translation.
  const translatable = locale as Exclude<Locale, typeof DEFAULT_LOCALE>;

  const table: Record<string, CountryFacts> = {};
  for (const [iso3, base] of Object.entries(facts)) table[iso3] = localize(base, translatable);
  return table;
}

/**
 * Every locale's table, each one permanently identity-stable.
 *
 * Indexing this is the only way to get a localized table; there is deliberately no
 * function that builds one on demand.
 */
export const COUNTRY_FACTS: Record<Locale, Record<string, CountryFacts>> = byLocale(tableFor);

/** The English table, unchanged. Still the raw shape the build wrote. */
export const allCountryFacts = COUNTRY_FACTS[DEFAULT_LOCALE];

/** Every country in one language. Referentially stable for the life of the process. */
export function factsFor(locale: Locale): Record<string, CountryFacts> {
  return COUNTRY_FACTS[locale] ?? allCountryFacts;
}

/**
 * One country, in the language the app is currently in.
 *
 * The locale defaults to the active one so the ~15 call sites that just want "this
 * country, for the screen" need no change; the explicit parameter is what lets the label
 * builder walk both languages in one pass.
 */
export function getCountryFacts(
  iso3: string | null | undefined,
  locale: Locale = getLocale(),
): CountryFacts | null {
  if (!iso3) return null;
  return factsFor(locale)[iso3] ?? null;
}
