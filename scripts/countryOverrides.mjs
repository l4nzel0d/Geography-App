/**
 * Deliberate corrections to `world-countries`, applied by both writers of
 * countryFacts.json.
 *
 * ## Why this file exists
 *
 * `enrich-country-facts.mjs` rebuilds every record from the pinned `world-countries`
 * devDependency and carries only the World Bank population through untouched. That is
 * exactly what it is for - but it means **any hand-edit to countryFacts.json is silently
 * reverted the next time it runs**, with no error and no diff anybody reads, because the
 * script's output is a minified single-line JSON file.
 *
 * That had already happened to three capitals corrected in August: `git` showed them in
 * the committed file, and the script would have quietly put mledoze's values back. The
 * corrections survive now because they are stated here, in code, where the build asserts
 * them - the same discipline as `NE_TO_ISO3` and `ISO3_TO_WORLD_BANK` in the online build,
 * and the same reason those are patch tables rather than edits to the fetched data.
 *
 * An override that has become a no-op FAILS the build rather than rotting quietly, so a
 * fix upstream shows up as a build error telling you to delete a line.
 */

/**
 * Capitals where mledoze names a different city from the one the country's own government
 * calls its capital. All three are seat-of-government splits, not errors of fact.
 */
export const CAPITAL_OVERRIDES = {
  /** Seat of government since 2017; mledoze still lists Malabo, the former capital. */
  GNQ: ['Ciudad de la Paz'],
  /** The administrative capital. mledoze lists Colombo, which is the commercial one. */
  LKA: ['Sri Jayawardenepura Kotte'],
  /** The administrative capital. mledoze lists Lobamba, the royal and legislative seat. */
  SWZ: ['Mbabane'],
};

/** Apply every override for one country. Returns the value the record should carry. */
export function overriddenCapital(country) {
  return CAPITAL_OVERRIDES[country.cca3] ?? country.capital ?? [];
}

/**
 * Every override must still be doing something.
 *
 * A table like this is only trustworthy if a stale entry is loud. If mledoze corrects a
 * capital upstream, the override becomes a no-op and this turns that into a build failure
 * rather than a line nobody revisits.
 */
export function overrideProblems(worldCountries) {
  const problems = [];
  const byCca3 = new Map(worldCountries.map((c) => [c.cca3, c]));

  for (const [iso3, capital] of Object.entries(CAPITAL_OVERRIDES)) {
    const country = byCca3.get(iso3);
    if (!country) {
      problems.push(`Capital override for ${iso3}, which is not in world-countries`);
      continue;
    }

    const upstream = country.capital ?? [];
    if (upstream.length === capital.length && upstream.every((c, i) => c === capital[i])) {
      problems.push(`Capital override for ${iso3} now matches upstream - delete it`);
    }
  }

  return problems;
}
