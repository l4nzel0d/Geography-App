/**
 * ONE-OFF build script. Run it while online; commit its output.
 *
 *   node scripts/build-country-data.mjs
 *
 * Produces two bundled assets that the app imports directly:
 *   src/data/countries.geo.json  - country outlines, properties trimmed to { iso3, name }
 *   src/data/countryFacts.json   - population / currency / language facts, keyed by ISO-3
 *
 * The app itself NEVER makes these requests. See CLAUDE.md - offline is a hard requirement.
 *
 * Sources (all free, none requires an API key):
 *   geometry   Natural Earth 1:110m admin 0 countries (public domain)
 *   facts      `world-countries` npm package = the mledoze/countries dataset (ODbL)
 *   population World Bank indicator SP.POP.TOTL, most recent non-empty year
 *
 * Note: REST Countries was the original plan, but v3.1 is deprecated and v5 requires
 * an API key. `world-countries` is the same upstream dataset REST Countries serves,
 * minus population - hence the separate World Bank call.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import worldCountries from 'world-countries';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');

const GEOMETRY_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const POPULATION_URL =
  'https://api.worldbank.org/v2/country/all/indicator/SP.POP.TOTL?format=json&per_page=500&mrnev=1';

/**
 * Natural Earth ships `ISO_A3 = "-99"` for territories whose sovereignty is disputed
 * or which it treats as part of a parent state. Without this patch the affected
 * countries silently fail to join and render as blanks.
 *
 * Keyed by Natural Earth's ADM0_A3 (always populated), valued with the canonical
 * `world-countries` cca3 we key everything on.
 */
const NE_TO_ISO3 = {
  KOS: 'UNK', // Kosovo - mledoze uses the UNK placeholder, not XKX
  SDS: 'SSD', // South Sudan
};

/** The World Bank disagrees with mledoze on a few codes. */
const ISO3_TO_WORLD_BANK = {
  UNK: 'XKX', // Kosovo
};

/**
 * Countries we knowingly ship without a facts record, because the upstream dataset
 * has none. An explicit allowlist, never a silent skip - a NEW unmatched code fails
 * the build so we are forced to look at it.
 */
const FACTLESS_ALLOWLIST = new Set([
  'CYN', // Northern Cyprus - not a mledoze entry
  'SOL', // Somaliland - not a mledoze entry
]);

/**
 * Territories the World Bank does not publish population for. All of these are
 * genuinely non-reporting rather than join failures - the info box shows a dash.
 */
const POPULATIONLESS_ALLOWLIST = new Set([
  'TWN', // Taiwan - not a World Bank reporting economy
  'ESH', // Western Sahara - disputed, no reported series
  'FLK', // Falkland Islands
  'ATF', // French Southern and Antarctic Lands
  'ATA', // Antarctica - no permanent population
]);

/** Coordinate precision. 3dp is ~110 m, far finer than a 1:110m basemap needs. */
const COORD_PRECISION = 3;

async function fetchJson(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${res.statusText}`);
  const json = await res.json();
  console.log(`  fetched ${label}`);
  return json;
}

/** Recursively round every coordinate. Roughly halves the output file size. */
function roundCoords(node) {
  if (typeof node === 'number') return Number(node.toFixed(COORD_PRECISION));
  if (Array.isArray(node)) return node.map(roundCoords);
  return node;
}

function resolveIso3(props) {
  const mapped = NE_TO_ISO3[props.ADM0_A3];
  if (mapped) return mapped;
  for (const key of ['ISO_A3', 'ISO_A3_EH', 'ADM0_A3']) {
    const value = props[key];
    if (value && value !== '-99') return value;
  }
  return null;
}

async function main() {
  console.log('Building country data...');
  const [rawGeo, rawPop] = await Promise.all([
    fetchJson(GEOMETRY_URL, 'Natural Earth 1:110m outlines'),
    fetchJson(POPULATION_URL, 'World Bank population'),
  ]);
  console.log(`  loaded ${worldCountries.length} records from world-countries`);

  // ---- population --------------------------------------------------------
  const population = {};
  const populationYear = {};
  for (const row of rawPop[1] ?? []) {
    if (!row.countryiso3code || row.value == null) continue;
    population[row.countryiso3code] = row.value;
    populationYear[row.countryiso3code] = row.date;
  }

  // ---- facts -------------------------------------------------------------
  const facts = {};
  for (const c of worldCountries) {
    const wbCode = ISO3_TO_WORLD_BANK[c.cca3] ?? c.cca3;
    facts[c.cca3] = {
      name: c.name?.common ?? c.cca3,
      official: c.name?.official ?? null,
      population: population[wbCode] ?? null,
      populationYear: populationYear[wbCode] ?? null,
      capital: c.capital ?? [],
      area: c.area ?? null,
      flag: c.flag ?? null,
      currencies: Object.entries(c.currencies ?? {}).map(([code, v]) => ({
        code,
        name: v?.name ?? code,
        symbol: v?.symbol ?? null,
      })),
      languages: Object.values(c.languages ?? {}),
    };
  }

  // ---- geometry ----------------------------------------------------------
  const features = [];
  const unresolved = [];
  for (const f of rawGeo.features) {
    const iso3 = resolveIso3(f.properties);
    if (!iso3) {
      unresolved.push(f.properties.NAME ?? '<unnamed>');
      continue;
    }
    features.push({
      type: 'Feature',
      properties: { iso3, name: facts[iso3]?.name ?? f.properties.NAME },
      geometry: roundCoords(f.geometry),
    });
  }

  // ---- integrity checks --------------------------------------------------
  const problems = [];
  const geometryCodes = features.map((f) => f.properties.iso3);

  if (unresolved.length) {
    problems.push(`Features with no resolvable ISO-3: ${unresolved.join(', ')}`);
  }

  const dupes = [...new Set(geometryCodes.filter((c, i) => geometryCodes.indexOf(c) !== i))];
  if (dupes.length) problems.push(`Duplicate ISO-3 codes: ${dupes.join(', ')}`);

  const missingFacts = geometryCodes.filter((c) => !facts[c] && !FACTLESS_ALLOWLIST.has(c));
  if (missingFacts.length) {
    problems.push(
      `Geometry with no facts record (extend FACTLESS_ALLOWLIST only if genuinely ` +
        `absent upstream): ${missingFacts.join(', ')}`,
    );
  }

  const missingPop = geometryCodes.filter(
    (c) => facts[c] && facts[c].population == null && !POPULATIONLESS_ALLOWLIST.has(c),
  );
  if (missingPop.length) {
    problems.push(`Mapped countries with no population: ${missingPop.join(', ')}`);
  }

  if (problems.length) {
    console.error('\nIntegrity check FAILED:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  // ---- write -------------------------------------------------------------
  await mkdir(OUT_DIR, { recursive: true });
  const geoPath = resolve(OUT_DIR, 'countries.geo.json');
  const factsPath = resolve(OUT_DIR, 'countryFacts.json');
  await writeFile(geoPath, JSON.stringify({ type: 'FeatureCollection', features }));
  await writeFile(factsPath, JSON.stringify(facts));

  const geometrySet = new Set(geometryCodes);
  const factsWithoutGeometry = Object.keys(facts).filter((c) => !geometrySet.has(c));

  console.log(`\n  ${features.length} country outlines`);
  console.log(`  ${Object.keys(facts).length} fact records`);
  console.log(`  ${factsWithoutGeometry.length} facts without 110m geometry (expected: microstates)`);
  console.log(`  -> ${geoPath}`);
  console.log(`  -> ${factsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
