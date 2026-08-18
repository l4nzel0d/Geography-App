/**
 * The single definition of a `countryFacts.json` record.
 *
 * Two scripts write that file and they must not drift:
 *   build-country-data.mjs   - the full online rebuild (geometry + World Bank + facts)
 *   enrich-country-facts.mjs - offline, facts only, population carried through
 *
 * Everything here comes from the `world-countries` devDependency except population,
 * which is the World Bank's and is passed in.
 */

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
    capital: country.capital ?? [],
    area: country.area ?? null,
    flag: country.flag ?? null,
    currencies: Object.entries(country.currencies ?? {}).map(([code, v]) => ({
      code,
      name: v?.name ?? code,
      symbol: v?.symbol ?? null,
    })),
    languages: Object.values(country.languages ?? {}),

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
  check('languages', (f) => f.languages.length > 0);
  check('currency', (f) => f.currencies.length > 0, CURRENCYLESS_UN_MEMBERS);

  return problems;
}
