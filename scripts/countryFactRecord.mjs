import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/**
 * The single definition of a `countryFacts.json` record.
 *
 * Two scripts write that file and they must not drift:
 *   build-country-data.mjs   - the full online rebuild (geometry + World Bank + facts)
 *   enrich-country-facts.mjs - offline, facts only, population carried through
 *
 * Everything here comes from the `world-countries` devDependency except population,
 * which is the World Bank's and is passed in.
 *
 * ## The Russian block
 *
 * Each record carries `translations.ru`. Country names come free from mledoze's
 * `translations.rus`, which is complete for all 250 records; capitals and currency names
 * are NOT translated upstream and come from the committed dictionaries in
 * `src/data/ru/`, keyed by the stable identifiers the data already carries - ISO-4217 for
 * currencies, and the English string for capitals and places.
 *
 * Keying on codes rather than on position is what makes a mis-join impossible: a currency
 * list that changed order upstream would silently relabel every entry if these were
 * zipped by index.
 *
 * A missing dictionary entry FAILS the build (see `russianIntegrityProblems`). The rule
 * throughout this pipeline is an explicit allowlist, never a silent skip, and a half-empty
 * Russian block is exactly the kind of thing that ships and is noticed by a user.
 */

import { overriddenCapital } from './countryOverrides.mjs';

const ruCapitals = require('../src/data/ru/capitals.json');
const ruCurrencies = require('../src/data/ru/currencies.json');
const ruPlaces = require('../src/data/ru/places.json');
const ruCountries = require('../src/data/ru/countries.json');

/**
 * Upstream ships five Russian official names with a stray space before a hyphen -
 * "Республика Кабо -Верде". Mechanical rather than an override table, so it self-heals if
 * mledoze fixes them, and it is a no-op on the other 245.
 */
function tidyRussian(name) {
  return typeof name === 'string' ? name.replace(/\s+-\s*/g, '-') : name;
}

/**
 * The Russian half of one record.
 *
 * Anything with no dictionary entry is left as `null`/absent rather than falling back to
 * the English word: a silent English capital inside a Russian info sheet is the failure
 * this whole block exists to prevent, and the integrity check below turns it into a build
 * error instead.
 */
function buildRussian(country) {
  const iso3 = country.cca3;
  const override = ruCountries[iso3] ?? {};
  const rus = country.translations?.rus ?? {};

  return {
    name: override.name ?? rus.common ?? null,
    official: override.official ?? tidyRussian(rus.official) ?? null,
    capital: overriddenCapital(country).map((city) => ruCapitals[city] ?? null),
    // Parallel to `currencies`, in the same order, so the two are zipped by INDEX at
    // runtime only after both were built from the same `Object.entries` walk.
    currencies: Object.keys(country.currencies ?? {}).map((code) => ruCurrencies[code] ?? null),
    region: ruPlaces.regions[country.region ?? ''] ?? null,
    subregion: ruPlaces.subregions[country.subregion ?? ''] ?? null,
    altSpellings: override.aliases ?? [],
  };
}

/**
 * Alternative names a player might type, from mledoze's `altSpellings`.
 *
 * The list is mostly useful ("Ivory Coast", "Holland", "Republic of Korea") but every
 * entry begins with the two-letter cca2, which must go: without this, "fr" would be
 * accepted for France and "in" for India.
 *
 * Filtering on the code itself rather than on length is deliberate. A length cutoff
 * would also throw away UK, USA, UAE, DRC, RSA and DPRK - which is precisely what
 * someone types instead of the full name.
 */
export function usableAltSpellings(country) {
  const cca2 = (country.cca2 ?? '').toUpperCase();
  return (country.altSpellings ?? []).filter((s) => s.toUpperCase() !== cca2);
}

/**
 * Build one facts record. `population`/`populationYear` are the World Bank's and are
 * supplied by the caller, because only the online build can fetch them.
 */
export function buildFactRecord(country, { population = null, populationYear = null } = {}) {
  return {
    name: country.name?.common ?? country.cca3,
    official: country.name?.official ?? null,
    population,
    populationYear,
    // Not `country.capital` directly: three capitals are deliberately corrected, and
    // this script is what would otherwise revert them. See countryOverrides.mjs.
    capital: overriddenCapital(country),
    area: country.area ?? null,
    flag: country.flag ?? null,
    currencies: Object.entries(country.currencies ?? {}).map(([code, v]) => ({
      code,
      name: v?.name ?? code,
      symbol: v?.symbol ?? null,
    })),

    // --- added for quiz mode -------------------------------------------------
    // Six values: Africa, Americas, Asia, Europe, Oceania, Antarctic.
    region: country.region ?? '',
    // 24 values. Empty only for the four Antarctic entries (SGS, ATF, HMD, ATA).
    subregion: country.subregion ?? '',
    // NOTE: mledoze sets this on VAT, which is a permanent observer rather than a
    // member, so this flag is 194 countries wide and the quiz pool is 193. The
    // exclusion is explicit in src/quiz/quizCountries.ts, never a silent skip.
    unMember: Boolean(country.unMember),
    altSpellings: usableAltSpellings(country),

    /**
     * Everything above, in Russian. A sibling block rather than a parallel file so one
     * lookup returns a whole country and the two can never be joined wrongly.
     */
    translations: { ru: buildRussian(country) },
  };
}

/**
 * Vatican City. mledoze reports `unMember: true`; the UN reports a permanent observer
 * state. Every check below that says "UN member" means "unMember and not this".
 */
export const OBSERVER_STATE_ISO3 = 'VAT';

/** Micronesia carries no currency in mledoze - checked upstream, genuinely absent. */
export const CURRENCYLESS_UN_MEMBERS = new Set(['FSM']);

/**
 * Invariants the quiz depends on, asserted at build time so a bad dataset fails loudly
 * instead of producing unanswerable questions. Mirrored in __tests__/data-integrity.test.ts.
 */
export function quizIntegrityProblems(facts, geometryCodes) {
  const problems = [];
  const mapped = new Set(geometryCodes);
  const members = Object.entries(facts).filter(
    ([iso3, f]) => f.unMember && iso3 !== OBSERVER_STATE_ISO3 && mapped.has(iso3),
  );

  if (members.length !== 193) {
    problems.push(`Expected 193 UN members with geometry, got ${members.length}`);
  }

  const check = (label, predicate, allowlist = new Set()) => {
    const bad = members.filter(([iso3, f]) => !predicate(f) && !allowlist.has(iso3)).map(([c]) => c);
    if (bad.length) problems.push(`UN members with no ${label}: ${bad.join(', ')}`);
  };

  check('subregion', (f) => Boolean(f.subregion));
  check('region', (f) => Boolean(f.region));
  check('population', (f) => f.population != null);
  check('capital', (f) => f.capital.length > 0);
  check('currency', (f) => f.currencies.length > 0, CURRENCYLESS_UN_MEMBERS);

  return problems;
}

/**
 * The Russian block is complete for every record that has an English one.
 *
 * Deliberately checked over ALL 250 records, not just the 193 quiz countries: the info
 * sheet and the map labels can reach any country with geometry, so a Russian session
 * would otherwise show a blank capital for Greenland or Puerto Rico while every test
 * passed. `quizIntegrityProblems` only ever inspected the English fields and would happily
 * let a half-empty translation through.
 *
 * A `null` inside a list is what a missing dictionary entry becomes, which is why the
 * checks look inside the arrays rather than only at their length.
 */
export function russianIntegrityProblems(facts) {
  const problems = [];
  const bad = (label, predicate) => {
    const codes = Object.entries(facts)
      .filter(([, f]) => !predicate(f))
      .map(([iso3]) => iso3);
    if (codes.length) problems.push(`No Russian ${label}: ${codes.join(', ')}`);
  };

  const complete = (list) => Array.isArray(list) && list.every((item) => Boolean(item));

  bad('block', (f) => Boolean(f.translations?.ru));
  bad('name', (f) => Boolean(f.translations?.ru?.name));
  bad('capital', (f) => f.capital.length === 0 || complete(f.translations?.ru?.capital));
  bad('currencies', (f) => f.currencies.length === 0 || complete(f.translations?.ru?.currencies));
  bad('region', (f) => !f.region || Boolean(f.translations?.ru?.region));
  bad('subregion', (f) => !f.subregion || Boolean(f.translations?.ru?.subregion));

  // The lists are zipped by index at runtime, so a length mismatch would silently pair a
  // currency with another currency's Russian name.
  bad(
    'list of the same length as the English one',
    (f) =>
      f.translations?.ru?.capital?.length === f.capital.length &&
      f.translations?.ru?.currencies?.length === f.currencies.length,
  );

  return problems;
}
