/**
 * Where each country's map label is anchored, and how wide that country is there.
 *
 * Offline. There is deliberately no `fetch` in this file - it reads the committed
 * geometry and writes one small committed JSON file, in the same spirit as
 * `enrich-country-facts.mjs`.
 *
 * ## Why this exists at all
 *
 * MapLibre can place a symbol on a polygon by itself, and it places a good one - the pole
 * of inaccessibility. The problem is that it places **one per polygon, not one per
 * country**. France is a MultiPolygon of the mainland plus French Guiana, Guadeloupe,
 * Martinique, Réunion, Mayotte and Corsica, so "France" would be drawn six times, once in
 * South America; Kiribati would get one label per atoll. Collision detection does not help
 * because those anchors are nowhere near each other.
 *
 * So labels come from a dedicated point source, one point per country, built here.
 *
 * ## What it computes
 *
 * For each country: the largest polygon by latitude-weighted area, then `polylabel` on
 * that polygon. `polylabel` returns the point furthest from any edge, which is what keeps
 * the anchor off the coast on the shapes a centroid gets wrong - Norway, Chile, Croatia,
 * Vietnam and Indonesia all have centroids in the sea.
 *
 * `w` is that same polygon's longitude span, which `labelFit.ts` turns into the zoom at
 * which the label starts being drawn.
 *
 * ## Why not reuse countryBounds.ts
 *
 * It answers a different question - "what should the camera frame" - and its cluster
 * deliberately keeps Sicily while dropping French Guiana. Here we want the single landmass
 * the label sits in. Two honest numbers beat one shared one, and `countryBounds` is `.ts`
 * consumed by the app while this is a build script.
 *
 * Run: npm run labels:data
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import polylabel from 'polylabel';

const here = dirname(fileURLToPath(import.meta.url));
const GEOMETRY_PATH = resolve(here, '../src/data/countries.geo.json');
const OUTPUT_PATH = resolve(here, '../src/data/labelPoints.json');

/** Matches the geometry's own precision - 3dp is ~110m, far finer than a label needs. */
const PRECISION = 3;

/**
 * `polylabel`'s tolerance, as a fraction of the polygon's own size.
 *
 * It MUST be relative. A fixed tolerance in degrees has to be small enough for the
 * smallest country and that makes it needlessly slow for the largest: at a flat 0.01
 * degrees the Vatican - about 0.02 degrees across in total - came back with an anchor
 * *outside its own outline*, because the search grid was coarser than the country.
 * Scaling to the bounding box gives every country the same relative precision.
 */
const POLYLABEL_TOLERANCE_FRACTION = 1e-3;

/** Floor for the above, so a degenerate outline cannot ask for infinite precision. */
const MIN_POLYLABEL_TOLERANCE = 1e-7;

/** No real polygon spans this much longitude unless it wraps the antimeridian. */
const MAX_HONEST_SPAN_DEG = 180;

/**
 * Countries whose largest polygon really does span more than half the globe.
 *
 * Antarctica is the only one: Natural Earth draws it as a single ring around the pole,
 * so its longitude span is a genuine 360 degrees rather than the antimeridian artefact
 * the guard above is watching for. An explicit entry rather than a raised threshold,
 * because the threshold is the only thing standing between a wrapped polygon and a label
 * that claims to be world-wide - see the pipeline's "explicit allowlist, never a silent
 * skip" rule in CLAUDE.md.
 */
const POLAR_SPAN_ALLOWLIST = new Set(['ATA']);

const round = (n) => Number(n.toFixed(PRECISION));

/**
 * Latitude-weighted area of a ring, the same measure `countryBounds.ts` ranks by.
 *
 * The shoelace is in degrees, which over-weights polar polygons badly - Greenland's ring
 * is far larger in degrees than in reality. Scaling by cos(mean latitude) is the cheap
 * correction, and it only has to be good enough to order the polygons of one country.
 */
function ringArea(ring) {
  let twiceArea = 0;
  let latSum = 0;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [x, y] = ring[i];
    const [px, py] = ring[j];
    twiceArea += px * y - x * py;
    latSum += y;
  }

  const meanLat = ring.length ? latSum / ring.length : 0;
  return Math.abs(twiceArea / 2) * Math.cos((meanLat * Math.PI) / 180);
}

/** Every polygon of a Polygon/MultiPolygon, as arrays of rings (outer first). */
function polygonsOf(geometry) {
  if (geometry.type === 'Polygon') return [geometry.coordinates];
  if (geometry.type === 'MultiPolygon') return geometry.coordinates;
  return [];
}

function latSpanOf(ring) {
  let south = Infinity;
  let north = -Infinity;
  for (const [, lat] of ring) {
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }
  return north - south;
}

function lngSpanOf(ring) {
  let west = Infinity;
  let east = -Infinity;
  for (const [lng] of ring) {
    if (lng < west) west = lng;
    if (lng > east) east = lng;
  }
  return east - west;
}

function main() {
  const geo = JSON.parse(readFileSync(GEOMETRY_PATH, 'utf8'));
  const problems = [];
  const points = {};

  for (const feature of geo.features) {
    const iso3 = feature.properties?.iso3;
    if (!iso3) {
      problems.push('A feature has no iso3');
      continue;
    }

    const polygons = polygonsOf(feature.geometry);
    if (!polygons.length) {
      problems.push(`${iso3}: no polygons`);
      continue;
    }

    // Largest first, then anchor inside it.
    const largest = polygons
      .map((rings) => ({ rings, area: ringArea(rings[0]) }))
      .sort((a, b) => b.area - a.area)[0];

    const span = lngSpanOf(largest.rings[0]);
    const tolerance = Math.max(
      Math.min(span, latSpanOf(largest.rings[0])) * POLYLABEL_TOLERANCE_FRACTION,
      MIN_POLYLABEL_TOLERANCE,
    );
    const [lng, lat] = polylabel(largest.rings, tolerance);

    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      problems.push(`${iso3}: polylabel returned a non-finite point`);
      continue;
    }

    // Natural Earth splits polygons at the antimeridian, so a single polygon spanning
    // more than half the globe means it did not - and the span would be the complement
    // of the real one, which would let a huge label through at zoom 0. Fiji and Russia
    // are the cases this is watching for.
    if (span > MAX_HONEST_SPAN_DEG && !POLAR_SPAN_ALLOWLIST.has(iso3)) {
      problems.push(`${iso3}: largest polygon spans ${span.toFixed(1)} degrees - antimeridian wrap?`);
      continue;
    }

    points[iso3] = { at: [round(lng), round(lat)], w: round(span) };
  }

  if (problems.length) {
    console.error('Label point build failed:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const sorted = Object.fromEntries(Object.entries(points).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(sorted, null, 0)}\n`);

  const spans = Object.values(sorted).map((p) => p.w);
  console.log(`Wrote ${Object.keys(sorted).length} label points to ${OUTPUT_PATH}`);
  console.log(`  longitude spans: min ${Math.min(...spans)}, max ${Math.max(...spans)}`);
}

main();
