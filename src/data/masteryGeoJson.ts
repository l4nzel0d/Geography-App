import type { CountryFeatureProperties } from './types';

/**
 * Folds the player's mastery onto the country outlines.
 *
 * Mirrors `withChoroplethValues` in `worldGeoJson.ts` exactly, and for the same reason: a
 * data-driven paint expression can only read properties carried on the feature. The only
 * difference is that this one's input CHANGES while the app is running, which is why it
 * takes the scores as a parameter and never imports the store - it stays pure, and
 * `MapScreen` owns when it runs.
 */

/** The feature property name, identical to the fill mode's name. */
export const MASTERY_PROPERTY = 'mastery';

/** Percent, so the legend's labels are free and the feature carries a small integer. */
export function toMasteryPercent(score: number): number {
  return Math.round(score * 100);
}

/**
 * Add `mastery` to every country that has one.
 *
 * Three properties, each load-bearing:
 *
 * - **`geometry` is passed through by reference.** Only the small properties object is
 *   rebuilt, so this costs ~240 tiny allocations rather than a copy of 1.6 MB of
 *   coordinates. `masteryGeoJson.test.ts` asserts the identity, because losing it means
 *   duplicating the whole geometry on every publish.
 * - **A country with no score keeps its ORIGINAL object identity** and never gains the
 *   key, which is what lets `['has','mastery']` route it to `NO_DATA_COLOR`.
 * - **An empty score map returns the collection UNCHANGED**, same object. A fresh install
 *   therefore hands `<GeoJSONSource data>` the very same module constant it has always
 *   had, so nothing is re-uploaded until the player has actually played something.
 */
export function withMastery(
  collection: GeoJSON.FeatureCollection,
  scores: Readonly<Record<string, number>>,
): GeoJSON.FeatureCollection {
  if (Object.keys(scores).length === 0) return collection;

  return {
    ...collection,
    features: collection.features.map((feature) => {
      const properties = feature.properties as CountryFeatureProperties | null;
      if (!properties) return feature;

      const score = scores[properties.iso3];
      if (score == null || !Number.isFinite(score)) return feature;

      return {
        ...feature,
        properties: { ...properties, [MASTERY_PROPERTY]: toMasteryPercent(score) },
      };
    }),
  };
}
