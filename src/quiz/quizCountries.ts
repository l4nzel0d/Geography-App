import { allCountryFacts } from '@/data/countryFacts';
import rawGeoJson from '@/data/countries.geo.json';
import type { CountryFacts } from '@/data/types';

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

/** How many countries a given selection covers. Empty selection means all of them. */
export function countriesIn(subregions: readonly string[]): QuizCountry[] {
  if (subregions.length === 0) return [...QUIZ_COUNTRIES];
  const wanted = new Set(subregions);
  return QUIZ_COUNTRIES.filter((country) => wanted.has(country.subregion));
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
      case 'languages':
        return facts.languages.length > 0;
      case 'population':
        return facts.population != null && facts.population > 0;
    }
  });
}
