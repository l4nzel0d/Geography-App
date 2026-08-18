/**
 * OFFLINE re-derivation of src/data/countryFacts.json. Commit its output.
 *
 *   node scripts/enrich-country-facts.mjs        (npm run enrich:data)
 *
 * There is deliberately no `fetch` in this file.
 *
 * Why this exists rather than just re-running build-country-data.mjs: that script also
 * re-fetches Natural Earth `master` and rewrites countries.geo.json. The geometry
 * drifts - CLAUDE.md records a border moving between tiers and flipping a pickCountry
 * expectation - and every Maestro tap point is a screen percentage pinned to today's
 * outlines. Taking an unreviewable 1.6 MB coordinate diff to gain four fields that come
 * entirely from a pinned local devDependency is a bad trade.
 *
 * So this reads the committed facts, rebuilds each record from `world-countries` with
 * the SAME builder the online script uses, and carries the existing World Bank
 * population through untouched. It refuses to write if any population would change,
 * which is the proof that it never touched that join.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import worldCountries from 'world-countries';

import { buildFactRecord, quizIntegrityProblems } from './countryFactRecord.mjs';

const DATA_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data');
const FACTS_PATH = resolve(DATA_DIR, 'countryFacts.json');
const GEO_PATH = resolve(DATA_DIR, 'countries.geo.json');

async function main() {
  console.log('Enriching country facts (offline)...');

  const existing = JSON.parse(await readFile(FACTS_PATH, 'utf8'));
  const geo = JSON.parse(await readFile(GEO_PATH, 'utf8'));
  const geometryCodes = geo.features.map((f) => f.properties.iso3);
  console.log(`  ${Object.keys(existing).length} existing records, ${geometryCodes.length} outlines`);

  const facts = {};
  for (const c of worldCountries) {
    const prior = existing[c.cca3];
    facts[c.cca3] = buildFactRecord(c, {
      population: prior?.population ?? null,
      populationYear: prior?.populationYear ?? null,
    });
  }

  // ---- integrity ---------------------------------------------------------
  const problems = [];

  // The whole point of this script is that it does not touch the World Bank join.
  const changedPopulation = Object.keys(existing).filter(
    (iso3) =>
      facts[iso3] &&
      (facts[iso3].population !== existing[iso3].population ||
        facts[iso3].populationYear !== existing[iso3].populationYear),
  );
  if (changedPopulation.length) {
    problems.push(`Population changed for: ${changedPopulation.join(', ')} - this script must not do that`);
  }

  const dropped = Object.keys(existing).filter((iso3) => !facts[iso3]);
  if (dropped.length) problems.push(`Records that would be dropped: ${dropped.join(', ')}`);

  problems.push(...quizIntegrityProblems(facts, geometryCodes));

  if (problems.length) {
    console.error('\nIntegrity check FAILED:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  await writeFile(FACTS_PATH, JSON.stringify(facts));

  const members = Object.entries(facts).filter(([, f]) => f.unMember);
  const subregions = new Set(Object.values(facts).map((f) => f.subregion).filter(Boolean));
  console.log(`\n  ${Object.keys(facts).length} fact records`);
  console.log(`  ${members.length} flagged unMember (193 after excluding VAT)`);
  console.log(`  ${subregions.size} distinct subregions`);
  console.log(`  -> ${FACTS_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
