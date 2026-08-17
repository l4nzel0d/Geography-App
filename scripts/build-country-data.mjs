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
 *   geometry   Natural Earth 1:50m admin 0 countries (public domain)
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

/**
 * 1:50m, not 1:110m. The 110m tier has only 177 features and omits every microstate -
 * Liechtenstein, Dominica, Monaco, Malta, Singapore and ~25 others simply had no
 * polygon to tap. 50m carries all of them, at 1.6 MB against 110m's 0.24 MB.
 *
 * 10m was measured too and rejected: ~8 MB in the bundle, and it splits 13 disputed
 * slivers (Bir Tawil, the Spratlys, Cyprus's UN buffer zone, ...) into their own
 * features with no ISO code and no facts record - a lot of allowlist for detail no
 * one can see on a world map.
 */
const GEOMETRY_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_0_countries.geojson';
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
  'KAS', // Siachen Glacier - disputed, 50m-only, not a mledoze entry
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

  // Small territories that only appear at 1:50m. Every one was checked against
  // `GET /v2/country/<code>` and is not a World Bank economy at all - none of these
  // is a join failure. The info box shows a dash for population.
  'VAT', // Vatican City
  'SGS', // South Georgia and the South Sandwich Islands
  'IOT', // British Indian Ocean Territory
  'SHN', // Saint Helena, Ascension and Tristan da Cunha
  'PCN', // Pitcairn Islands
  'AIA', // Anguilla
  'MSR', // Montserrat
  'JEY', // Jersey    - the World Bank only reports Jersey and Guernsey combined, as
  'GGY', // Guernsey    "Channel Islands" (CHI); splitting that across both would
  //                    double-count the same people, so both stay blank
  'NIU', // Niue
  'COK', // Cook Islands
  'SPM', // Saint Pierre and Miquelon
  'WLF', // Wallis and Futuna
  'BLM', // Saint Barthelemy
  'ALA', // Aland Islands
  'HMD', // Heard Island and McDonald Islands - uninhabited
  'NFK', // Norfolk Island
]);

/** Coordinate precision. 3dp is ~110 m, far finer than a 1:50m basemap resolves. */
const COORD_PRECISION = 3;

async function fetchJson(url, label) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${label} failed: ${res.status} ${res.statusText}`);
  const json = await res.json();
  console.log(`  fetched ${label}`);
  return json;
}

/**
 * Round every coordinate in a geometry. Takes ~25% off the output size.
 *
 * Note it takes the geometry OBJECT and recurses into `.coordinates`: an earlier
 * version recursed on numbers and arrays only, so handing it a geometry object hit
 * the identity branch and rounded nothing at all - the 110m file shipped with full
 * 6dp precision despite the comment claiming otherwise.
 */
function roundGeometry(geometry) {
  const round = (node) => {
    if (typeof node === 'number') return Number(node.toFixed(COORD_PRECISION));
    if (Array.isArray(node)) return node.map(round);
    return node;
  };
  return { ...geometry, coordinates: round(geometry.coordinates) };
}

/**
 * Fold every feature sharing an ISO-3 into one MultiPolygon.
 *
 * 50m splits some countries across features: Australia ships as the mainland plus
 * `Indian Ocean Territories` and `Ashmore and Cartier Islands`, both of which are
 * Australian and resolve to AUS via ISO_A3_EH. They must be one feature, because the
 * highlight layer filters on `iso3` and a second AUS feature would be an untappable
 * duplicate that the integrity check rejects.
 */
function mergePolygons(geometries) {
  const polygons = [];
  for (const g of geometries) {
    if (g.type === 'Polygon') polygons.push(g.coordinates);
    else if (g.type === 'MultiPolygon') polygons.push(...g.coordinates);
    else throw new Error(`Unexpected geometry type: ${g.type}`);
  }
  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
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
    fetchJson(GEOMETRY_URL, 'Natural Earth 1:50m outlines'),
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
  const grouped = new Map();
  const unresolved = [];
  for (const f of rawGeo.features) {
    const iso3 = resolveIso3(f.properties);
    if (!iso3) {
      unresolved.push(f.properties.NAME ?? '<unnamed>');
      continue;
    }
    const entry = grouped.get(iso3) ?? { name: f.properties.NAME, geometries: [] };
    entry.geometries.push(roundGeometry(f.geometry));
    grouped.set(iso3, entry);
  }

  const merged = [...grouped.entries()].filter(([, e]) => e.geometries.length > 1);
  const features = [...grouped.entries()].map(([iso3, entry]) => ({
    type: 'Feature',
    properties: { iso3, name: facts[iso3]?.name ?? entry.name },
    geometry: mergePolygons(entry.geometries),
  }));

  // ---- integrity checks --------------------------------------------------
  const problems = [];
  const geometryCodes = features.map((f) => f.properties.iso3);

  if (unresolved.length) {
    problems.push(`Features with no resolvable ISO-3: ${unresolved.join(', ')}`);
  }

  // Grouping by ISO-3 makes duplicates structurally impossible; assert it anyway,
  // because a duplicate is exactly the failure the highlight filter cannot survive.
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
  for (const [iso3, e] of merged) {
    console.log(`    merged ${e.geometries.length} features into ${iso3}`);
  }
  console.log(`  ${Object.keys(facts).length} fact records`);
  console.log(`  ${factsWithoutGeometry.length} facts without 1:50m geometry`);
  console.log(`  -> ${geoPath}`);
  console.log(`  -> ${factsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
