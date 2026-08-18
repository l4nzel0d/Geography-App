import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type { Feature, MultiPolygon, Polygon } from 'geojson';

import worldGeoJson from '@/data/countries.geo.json';
import type { CountryFeatureProperties } from '@/data/types';

export type CountryFeature = Feature<Polygon | MultiPolygon, CountryFeatureProperties>;

const byIso3 = new Map<string, CountryFeature>(
  (worldGeoJson as unknown as { features: CountryFeature[] }).features.map((f) => [
    f.properties.iso3,
    f,
  ]),
);

/**
 * The outline for one country, or null if there is none.
 *
 * Exported so `countryBounds.ts` can reuse this index rather than building a second
 * one: the source file is 1.6 MB and walking it twice at import is pure waste.
 */
export function getCountryFeature(iso3: string): CountryFeature | null {
  return byIso3.get(iso3) ?? null;
}

/** Squared planar distance from a lng/lat to the nearest vertex of a feature. */
function nearestVertexDistanceSq(feature: CountryFeature, [lng, lat]: [number, number]): number {
  let best = Infinity;
  const rings =
    feature.geometry.type === 'Polygon'
      ? feature.geometry.coordinates
      : feature.geometry.coordinates.flat();

  for (const ring of rings) {
    for (const [x, y] of ring) {
      const d = (x - lng) ** 2 + (y - lat) ** 2;
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * Decide which country a press actually landed on.
 *
 * MapLibre hit-tests with a 44dp hitbox, which at low zoom covers a large slice of the
 * world - a single press near the Sahara returns six countries. Taking `features[0]`
 * picks whichever one MapLibre happened to return first, which is why taps used to
 * select the country above or below the fingertip.
 *
 * So: prefer the country whose polygon genuinely contains the pressed coordinate, and
 * only fall back to the closest candidate when none does. The fallback keeps small
 * islands and thin coastal states reachable without having to zoom right in.
 */
export function pickCountry(
  lngLat: [number, number],
  candidateIso3: (string | undefined)[],
): string | null {
  const codes = [...new Set(candidateIso3.filter((c): c is string => Boolean(c)))];
  if (codes.length === 0) return null;
  if (codes.length === 1) return codes[0];

  for (const iso3 of codes) {
    const feature = byIso3.get(iso3);
    if (feature && booleanPointInPolygon(lngLat, feature.geometry)) return iso3;
  }

  let closest: string | null = null;
  let closestDistance = Infinity;
  for (const iso3 of codes) {
    const feature = byIso3.get(iso3);
    if (!feature) continue;
    const distance = nearestVertexDistanceSq(feature, lngLat);
    if (distance < closestDistance) {
      closestDistance = distance;
      closest = iso3;
    }
  }
  return closest ?? codes[0];
}
