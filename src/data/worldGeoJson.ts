import rawGeoJson from './countries.geo.json';
import { allCountryFacts } from './countryFacts';
import type { CountryFacts, CountryFeatureProperties } from './types';

/**
 * Folds `population` from the facts table onto each country outline.
 *
 * A data-driven paint expression can only read properties carried on the feature,
 * and the build script trims outline properties to `{ iso3, name }`. Deriving the
 * join here rather than emitting population into `countries.geo.json` keeps
 * `countryFacts.json` the single source of truth - two committed copies of the same
 * number would be free to drift, and regenerating the geometry needs the network.
 *
 * Features whose population is null keep their **original object identity** and never
 * gain the key at all, which is what lets the choropleth expression split them off
 * with `['has', 'population']`. See `choropleth.ts`.
 */
export function withPopulation(
  collection: GeoJSON.FeatureCollection,
  facts: Record<string, CountryFacts>,
): GeoJSON.FeatureCollection {
  return {
    ...collection,
    features: collection.features.map((feature) => {
      const properties = feature.properties as CountryFeatureProperties | null;
      if (!properties) return feature;

      const population = facts[properties.iso3]?.population;
      if (population == null) return feature;

      // `geometry` is passed through by reference. Only the small properties object is
      // rebuilt, so this costs ~240 tiny allocations rather than a copy of 1.6 MB of
      // coordinates.
      return { ...feature, properties: { ...properties, population } };
    }),
  };
}

/**
 * The outlines the map actually renders. Computed once at module scope so the object
 * identity handed to `<GeoJSONSource data>` is stable and MapLibre never re-uploads
 * the geometry.
 */
export const worldGeoJson = withPopulation(
  rawGeoJson as unknown as GeoJSON.FeatureCollection,
  allCountryFacts,
);
