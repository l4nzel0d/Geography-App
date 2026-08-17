import rawGeoJson from './countries.geo.json';
import { allCountryFacts } from './countryFacts';
import type { CountryFacts, CountryFeatureProperties } from './types';

/**
 * People per square kilometre, or null where it cannot honestly be computed.
 *
 * Three ways it can be missing, and all three must produce *absence* rather than a
 * number, because the value goes straight into `log10` inside a paint expression:
 *
 * - no population (the 22 territories the World Bank does not report on),
 * - no area, or the `-1` sentinel mledoze ships for an unknown one (Svalbard),
 * - a figure that rounds away to 0, which would evaluate to -Infinity and take the
 *   whole layer with it. Nothing real is that sparse - Greenland, the emptiest
 *   country on the map, is 0.026 - but the guard costs nothing.
 *
 * Rounded to 3dp: the ramp is logarithmic and the legend's finest band is a factor
 * of ten, so more precision is only payload.
 */
export function densityOf(facts: CountryFacts | undefined): number | null {
  if (!facts) return null;

  const { population, area } = facts;
  if (population == null || area == null || area <= 0) return null;

  const density = Number((population / area).toFixed(3));
  return density > 0 ? density : null;
}

/**
 * Folds `population` and `density` from the facts table onto each country outline.
 *
 * A data-driven paint expression can only read properties carried on the feature,
 * and the build script trims outline properties to `{ iso3, name }`. Deriving the
 * join here rather than emitting these into `countries.geo.json` keeps
 * `countryFacts.json` the single source of truth - two committed copies of the same
 * number would be free to drift, and regenerating the geometry needs the network.
 * Density is derived rather than stored for the same reason: it is population over
 * area, both of which are already here.
 *
 * Features with no figure keep their **original object identity** and never gain the
 * key at all, which is what lets the choropleth expressions split them off with
 * `['has', ...]`. See `choropleth.ts`.
 */
export function withChoroplethValues(
  collection: GeoJSON.FeatureCollection,
  facts: Record<string, CountryFacts>,
): GeoJSON.FeatureCollection {
  return {
    ...collection,
    features: collection.features.map((feature) => {
      const properties = feature.properties as CountryFeatureProperties | null;
      if (!properties) return feature;

      const countryFacts = facts[properties.iso3];
      const population = countryFacts?.population ?? null;
      const density = densityOf(countryFacts);
      if (population == null && density == null) return feature;

      // `geometry` is passed through by reference. Only the small properties object is
      // rebuilt, so this costs ~240 tiny allocations rather than a copy of 1.6 MB of
      // coordinates.
      return {
        ...feature,
        properties: {
          ...properties,
          ...(population != null && { population }),
          ...(density != null && { density }),
        },
      };
    }),
  };
}

/**
 * The outlines the map actually renders. Computed once at module scope so the object
 * identity handed to `<GeoJSONSource data>` is stable and MapLibre never re-uploads
 * the geometry.
 */
export const worldGeoJson = withChoroplethValues(
  rawGeoJson as unknown as GeoJSON.FeatureCollection,
  allCountryFacts,
);
