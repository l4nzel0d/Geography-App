import type { MultiPolygon, Polygon } from 'geojson';

import { getCountryFeature } from './pickCountry';

/**
 * `[west, south, east, north]`, matching MapLibre's `LngLatBounds`.
 *
 * `west` may be GREATER than `east` for a country that straddles the antimeridian
 * (Fiji, Kiribati, and the USA once Alaska's Aleutians are included). Consumers must
 * unwrap rather than assume `east - west` is positive - `lngSpan` below already does.
 */
export type Bbox = [west: number, south: number, east: number, north: number];

export type CountryBounds = {
  bbox: Bbox;
  /** Always positive, antimeridian-aware. */
  lngSpan: number;
  latSpan: number;
  /** How many of the country's polygons the frame covers - useful in tests. */
  kept: number;
  total: number;
};

/**
 * A country smaller than this is widened to it. Monaco is 0.02 degrees across and
 * Tuvalu's single polygon rounds to a point at 3dp, and a zero span would send
 * `log2(0)` = -Infinity into the camera.
 */
export const MIN_SPAN_DEG = 0.05;

/**
 * Polygons closer than this to the main cluster are always absorbed.
 *
 * 5.5 rather than something smaller because of Malaysia: its two halves sit 5.2 degrees
 * apart across the South China Sea, and the larger of them is Borneo - so a tighter
 * floor seeds the cluster on Borneo and drops the peninsula, which is where the capital
 * and most of the population are.
 *
 * Measured margins at this value, against the committed geometry: Spain rejects the
 * Canaries by 2.5 degrees, Portugal the Azores by 2.8, Ecuador the Galapagos by 2.8,
 * South Africa the Prince Edward Islands by 5.7 and France its overseas departments by
 * 53. Raising it much further starts pulling the Canaries in.
 */
export const GAP_MIN_DEG = 5.5;

/**
 * ...and beyond that, the tolerance scales with how big the cluster already is. A
 * country the size of Indonesia reaches much further for its next island than Malta
 * does, and a single fixed radius cannot serve both.
 */
export const GAP_DIAGONAL_FRACTION = 0.35;

type Ring = number[][];

type PolygonSummary = {
  bbox: Bbox;
  /** Shoelace area in square degrees, weighted by cos(latitude) so it is comparable. */
  area: number;
};

function ringsOf(geometry: Polygon | MultiPolygon): Ring[] {
  // Outer rings only. Holes cannot extend a country's extent, and skipping them keeps
  // this cheap over the 100+ polygon countries (Canada has 141).
  return geometry.type === 'Polygon'
    ? [geometry.coordinates[0] as Ring]
    : (geometry.coordinates as number[][][][]).map((polygon) => polygon[0] as Ring);
}

/** `shift` moves negative longitudes into [180, 360) so a wrapping country is contiguous. */
function summarize(ring: Ring, shift: boolean): PolygonSummary {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  let twiceArea = 0;
  let latSum = 0;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [rawX, y] = ring[i];
    const x = shift && rawX < 0 ? rawX + 360 : rawX;
    const [rawPx, py] = ring[j];
    const px = shift && rawPx < 0 ? rawPx + 360 : rawPx;

    if (x < west) west = x;
    if (x > east) east = x;
    if (y < south) south = y;
    if (y > north) north = y;

    twiceArea += px * y - x * py;
    latSum += y;
  }

  const meanLat = ring.length ? latSum / ring.length : 0;
  return {
    bbox: [west, south, east, north],
    area: Math.abs(twiceArea / 2) * Math.cos((meanLat * Math.PI) / 180),
  };
}

function merge(a: Bbox, b: Bbox): Bbox {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[2], b[2]),
    Math.max(a[3], b[3]),
  ];
}

/** Shortest distance between two boxes; 0 when they touch or overlap. */
function gapBetween(a: Bbox, b: Bbox): number {
  const dx = Math.max(0, b[0] - a[2], a[0] - b[2]);
  const dy = Math.max(0, b[1] - a[3], a[1] - b[3]);
  return Math.hypot(dx, dy);
}

function diagonalOf(box: Bbox): number {
  return Math.hypot(box[2] - box[0], box[3] - box[1]);
}

/**
 * Grow a frame outward from the largest polygon, absorbing whatever is near it.
 *
 * This is the whole reason the quiz does not just take a plain bounding box. France's
 * full extent spans 63 degrees because Natural Earth draws French Guiana as part of
 * FRA, so a naive fit frames the Atlantic Ocean with a speck of Europe in the corner.
 * The Guiana polygon is ~13% of France's area, so no area threshold separates it from
 * Sicily either - only distance does.
 *
 * Measured on the committed geometry: this drops Guiana and the Caribbean departments
 * from France, the Canaries from Spain, the Azores from Portugal, the Galapagos from
 * Ecuador and Easter Island from Chile, while keeping every island of Indonesia, the
 * Philippines, Japan and Greece, and both halves of Malaysia.
 */
function clusterFrom(summaries: PolygonSummary[]): { bbox: Bbox; kept: number } {
  const sorted = [...summaries].sort((a, b) => b.area - a.area);
  const absorbed = new Array<boolean>(sorted.length).fill(false);

  let box = sorted[0].bbox;
  absorbed[0] = true;
  let kept = 1;

  // Repeat to fixpoint: absorbing an island moves the frame, which can bring another
  // island within reach. One pass would stop half way along an archipelago.
  for (let changed = true; changed; ) {
    changed = false;
    const tolerance = Math.max(GAP_MIN_DEG, GAP_DIAGONAL_FRACTION * diagonalOf(box));

    for (let i = 1; i < sorted.length; i++) {
      if (absorbed[i]) continue;
      if (gapBetween(box, sorted[i].bbox) > tolerance) continue;
      box = merge(box, sorted[i].bbox);
      absorbed[i] = true;
      kept++;
      changed = true;
    }
  }

  return { bbox: box, kept };
}

/**
 * Grow an interval about its midpoint until it spans at least `MIN_SPAN_DEG`.
 *
 * The overshoot is not paranoia. `mid ± MIN_SPAN_DEG / 2` around Monaco's latitude
 * lands at 0.04999999999999716 - a hair UNDER the floor it was supposed to establish -
 * and correcting by that 2.8e-15 shortfall does nothing at all, because one ulp near
 * latitude 44 is ~7e-15 and the adjustment rounds straight back off. So widen by a
 * relative epsilon instead, which is far larger than an ulp and still only ~5e-11
 * degrees: a few microns on the ground, and invisible at any zoom.
 */
const SPAN_SLACK = 1 + 1e-9;

function widen(lo: number, hi: number): [number, number] {
  if (hi - lo >= MIN_SPAN_DEG) return [lo, hi];

  const mid = (lo + hi) / 2;
  const half = (MIN_SPAN_DEG * SPAN_SLACK) / 2;
  return [mid - half, mid + half];
}

/** Bring a possibly-shifted longitude back into [-180, 180]. */
function unshift(lng: number): number {
  if (lng > 180) return lng - 360;
  if (lng < -180) return lng + 360;
  return lng;
}

export function computeCountryBounds(geometry: Polygon | MultiPolygon): CountryBounds {
  const rings = ringsOf(geometry);

  // Choose the longitude frame FIRST, from the country's total extent, and cluster
  // inside it. Deciding per polygon instead silently produces "Kiribati is one atoll"
  // and "the United Kingdom is Great Britain only", because neighbouring islands end
  // up described in two different coordinate frames and read as 300 degrees apart.
  const plain = rings.map((ring) => summarize(ring, false));
  const shifted = rings.map((ring) => summarize(ring, true));
  const totalSpan = (list: PolygonSummary[]) =>
    Math.max(...list.map((s) => s.bbox[2])) - Math.min(...list.map((s) => s.bbox[0]));

  // Ties go to the unshifted frame, which keeps the common case readable.
  const useShifted = totalSpan(shifted) < totalSpan(plain);
  const { bbox: clustered, kept } = clusterFrom(useShifted ? shifted : plain);

  // A country narrower than MIN_SPAN_DEG would ask the camera for an infinite zoom.
  const [west, east] = widen(clustered[0], clustered[2]);
  const [south, north] = widen(clustered[1], clustered[3]);

  const lngSpan = east - west;
  return {
    bbox: [unshift(west), south, unshift(east), north],
    lngSpan,
    latSpan: north - south,
    kept,
    total: rings.length,
  };
}

const cache = new Map<string, CountryBounds | null>();

/**
 * Memoised per ISO-3. Called once per quiz question rather than for all 193 up front,
 * because the big countries walk a lot of coordinates (Canada has 141 polygons) and
 * most of a round's countries are never reached.
 */
export function getCountryBounds(iso3: string): CountryBounds | null {
  const hit = cache.get(iso3);
  if (hit !== undefined) return hit;

  const feature = getCountryFeature(iso3);
  const bounds = feature ? computeCountryBounds(feature.geometry) : null;
  cache.set(iso3, bounds);
  return bounds;
}
