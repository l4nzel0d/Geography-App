import { allCountryFacts, factsFor } from '@/data/countryFacts';
import rawGeoJson from '@/data/countries.geo.json';
import type { CountryFacts } from '@/data/types';

import { getLocale } from '@/i18n/locale';
import { byLocale, type Locale } from '@/i18n/localeTypes';

import type { FieldId } from './quizConfig';

/**
 * Who can be asked, and how the setup menu groups them.
 *
 * Derived once at module load, like `worldGeoJson` - it is a walk over 250 small
 * records, not over geometry.
 */

/**
 * Vatican City. mledoze reports `unMember: true`; the UN reports a permanent observer
 * state, not a member. It also has no World Bank population, so leaving it in would
 * make "name the population" unanswerable for it.
 *
 * Explicit and named rather than filtered out by some incidental property, matching the
 * pipeline's rule: never a silent skip.
 */
export const NON_MEMBER_ISO3 = new Set(['VAT']);

export type QuizCountry = {
  iso3: string;
  facts: CountryFacts;
  region: string;
  subregion: string;
};

const mappedIso3 = new Set(
  (rawGeoJson as unknown as { features: { properties: { iso3: string } }[] }).features.map(
    (f) => f.properties.iso3,
  ),
);

/**
 * The 193 UN member states that have an outline to zoom to. A country with facts but no
 * polygon could never be shown, so it cannot be asked.
 */
export const QUIZ_COUNTRIES: readonly QuizCountry[] = Object.entries(allCountryFacts)
  .filter(([iso3, facts]) => facts.unMember && !NON_MEMBER_ISO3.has(iso3) && mappedIso3.has(iso3))
  .filter(([, facts]) => Boolean(facts.subregion))
  .map(([iso3, facts]) => ({ iso3, facts, region: facts.region, subregion: facts.subregion }))
  .sort((a, b) => a.facts.name.localeCompare(b.facts.name));

/**
 * The same pool in every language - and **in the same order**, which is not a detail.
 *
 * `buildQuiz` runs a seeded Fisher-Yates over this array, so the order decides WHICH
 * countries a seed picks. Re-sorting the Russian pool alphabetically in Russian would mean
 * `?seed=7` gave two different rounds in two languages, `quizBuilder.test.ts` would break,
 * and `.maestro/quiz.yaml`'s pinned-seed answer would change. A pool order is not a display
 * order; the setup screen sorts nothing, and the only place a country name is sorted for
 * reading is `countrySearch.ts`.
 *
 * `region` and `subregion` stay the English identifiers here too - they are the URL param
 * and the filter key. See `placeNames.ts`.
 */
export const QUIZ_COUNTRIES_BY_LOCALE: Record<Locale, readonly QuizCountry[]> = byLocale(
  (locale) =>
    QUIZ_COUNTRIES.map((country) => ({
      ...country,
      facts: factsFor(locale)[country.iso3] ?? country.facts,
    })),
);

export type SubregionBucket = { subregion: string; region: string; count: number };

/** The 24 subregions, each with how many countries it contributes. */
export const SUBREGIONS: readonly SubregionBucket[] = (() => {
  const buckets = new Map<string, SubregionBucket>();
  for (const country of QUIZ_COUNTRIES) {
    const existing = buckets.get(country.subregion);
    if (existing) existing.count += 1;
    else buckets.set(country.subregion, { subregion: country.subregion, region: country.region, count: 1 });
  }
  return [...buckets.values()].sort(
    (a, b) => a.region.localeCompare(b.region) || a.subregion.localeCompare(b.subregion),
  );
})();

/** The same buckets grouped under their region, which is how the menu renders them. */
export const REGIONS: readonly { region: string; subregions: SubregionBucket[]; count: number }[] =
  (() => {
    const grouped = new Map<string, SubregionBucket[]>();
    for (const bucket of SUBREGIONS) {
      const list = grouped.get(bucket.region) ?? [];
      list.push(bucket);
      grouped.set(bucket.region, list);
    }
    return [...grouped.entries()]
      .map(([region, subregions]) => ({
        region,
        subregions,
        count: subregions.reduce((total, b) => total + b.count, 0),
      }))
      .sort((a, b) => a.region.localeCompare(b.region));
  })();

/**
 * The subset of `list` that names a real subregion, in the order given.
 *
 * The counterpart to the rule `parseQuizParams` and `decodeSetupPrefs` both follow: neither
 * validates a subregion name, because this module owns the catalogue and importing it into a
 * string coercer would pull `countries.geo.json` in with it. So the check lives here, where
 * the catalogue already is.
 *
 * A stored or hand-typed name that no longer exists is worse than a merely empty selection -
 * it leaves every checkbox clear AND Start disabled, with nothing on screen saying why - so
 * the setup screen filters through this when it seeds itself. A round started from a URL does
 * not need it: an unknown name there simply matches nobody and lands on the `quiz.empty`
 * screen, which is a state the player can see and back out of.
 */
export function knownSubregions(list: readonly string[]): string[] {
  const known = new Set(SUBREGIONS.map((bucket) => bucket.subregion));
  return list.filter((name) => known.has(name));
}

/** How many countries a given selection covers. Empty selection means all of them. */
export function countriesIn(
  subregions: readonly string[],
  locale: Locale = getLocale(),
): QuizCountry[] {
  const pool = QUIZ_COUNTRIES_BY_LOCALE[locale] ?? QUIZ_COUNTRIES;
  if (subregions.length === 0) return [...pool];
  const wanted = new Set(subregions);
  return pool.filter((country) => wanted.has(country.subregion));
}

/**
 * The pool restricted to a set of ISO-3 codes - `QuizConfig.only`.
 *
 * Filters the pool rather than mapping over `codes`, and that is the load-bearing half:
 * it makes the round a pure function of the code SET, so the order the codes happen to be
 * listed in - for a retry, the order the player was asked - cannot change which questions
 * a seed produces. `QUIZ_COUNTRIES_BY_LOCALE` keeps both languages in one order for the
 * same reason.
 *
 * An unknown code contributes nothing, exactly as an unknown subregion does: this module
 * owns the catalogue, so `parseQuizParams` does not validate against it.
 */
export function countriesWithCodes(
  codes: readonly string[],
  locale: Locale = getLocale(),
): QuizCountry[] {
  const wanted = new Set(codes);
  const pool = QUIZ_COUNTRIES_BY_LOCALE[locale] ?? QUIZ_COUNTRIES;
  return pool.filter((country) => wanted.has(country.iso3));
}

/**
 * Which of the requested fields this country actually has an answer for.
 *
 * The pool is deliberately not filtered by data completeness - a country is still asked,
 * it just skips the field it has no answer for. Only one case exists today (Micronesia
 * has no currency in mledoze), and dropping the country entirely would be a bigger lie
 * than dropping the field.
 */
export function answerableFields(
  facts: CountryFacts,
  wanted: readonly FieldId[],
): FieldId[] {
  return wanted.filter((field) => {
    switch (field) {
      case 'name':
        return Boolean(facts.name);
      case 'capital':
        return facts.capital.length > 0;
      case 'currency':
        return facts.currencies.length > 0;
      case 'population':
        return facts.population != null && facts.population > 0;
    }
  });
}
