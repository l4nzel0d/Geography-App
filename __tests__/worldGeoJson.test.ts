/**
 * The runtime join that puts `population` on each outline.
 *
 * The choropleth paint expression can only read properties carried on the feature, and
 * the build script trims them to `{ iso3, name }` - so this join is what makes the
 * whole feature possible, and it has to stay cheap.
 */
import rawGeoJson from '@/data/countries.geo.json';
import { allCountryFacts } from '@/data/countryFacts';
import type { CountryFeatureProperties } from '@/data/types';
import { withPopulation, worldGeoJson } from '@/data/worldGeoJson';

const raw = rawGeoJson as unknown as GeoJSON.FeatureCollection;
const propertiesOf = (feature: GeoJSON.Feature) =>
  feature.properties as unknown as CountryFeatureProperties;

describe('worldGeoJson', () => {
  it('keeps every outline', () => {
    expect(worldGeoJson.features).toHaveLength(raw.features.length);
    expect(worldGeoJson.type).toBe('FeatureCollection');
  });

  it('does not copy the geometry', () => {
    // The reason this join is affordable at all: 1.6 MB of coordinates is passed
    // through by reference and only the small properties object is rebuilt. If this
    // ever fails, the app is duplicating the entire dataset in memory at import.
    worldGeoJson.features.forEach((feature, i) => {
      expect(feature.geometry).toBe(raw.features[i].geometry);
    });
  });

  it('carries the population for every country the World Bank reports on', () => {
    const withFigure = worldGeoJson.features.filter((feature) => {
      const iso3 = propertiesOf(feature).iso3;
      return allCountryFacts[iso3]?.population != null;
    });

    // Sanity: this is the overwhelming majority of the map, not a handful.
    expect(withFigure.length).toBeGreaterThan(200);

    withFigure.forEach((feature) => {
      const { iso3, population } = propertiesOf(feature);
      expect(population).toBe(allCountryFacts[iso3].population);
    });
  });

  it('omits the key entirely where there is no figure, rather than carrying null', () => {
    // `['has', 'population']` is what routes these to the grey no-data colour, and
    // `has` is true for a null value. A null here would also reach log10 and poison
    // the expression. See choropleth.ts.
    const gaps = worldGeoJson.features.filter(
      (feature) => allCountryFacts[propertiesOf(feature).iso3]?.population == null,
    );

    expect(gaps.length).toBeGreaterThan(0);
    gaps.forEach((feature) => {
      expect(feature.properties).not.toHaveProperty('population');
    });
  });

  it('leaves Taiwan, Western Sahara and the Falklands without a figure', () => {
    // Spot-check of the World Bank gaps the choropleth renders grey.
    const byIso3 = new Map(
      worldGeoJson.features.map((feature) => [propertiesOf(feature).iso3, feature]),
    );

    ['TWN', 'ESH', 'FLK'].forEach((iso3) => {
      expect(byIso3.get(iso3)?.properties).not.toHaveProperty('population');
    });
  });

  it('preserves iso3 and name', () => {
    worldGeoJson.features.forEach((feature, i) => {
      const before = propertiesOf(raw.features[i]);
      const after = propertiesOf(feature);
      expect(after.iso3).toBe(before.iso3);
      expect(after.name).toBe(before.name);
    });
  });
});

describe('withPopulation', () => {
  const feature = (iso3: string): GeoJSON.Feature => ({
    type: 'Feature',
    properties: { iso3, name: iso3 },
    geometry: { type: 'Polygon', coordinates: [] },
  });

  const collection = (...features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({
    type: 'FeatureCollection',
    features,
  });

  it('reuses the original feature when there is nothing to add', () => {
    const untouched = feature('XXX');
    const result = withPopulation(collection(untouched), {});

    expect(result.features[0]).toBe(untouched);
  });

  it('tolerates a feature with no properties at all', () => {
    const orphan: GeoJSON.Feature = {
      type: 'Feature',
      properties: null,
      geometry: { type: 'Polygon', coordinates: [] },
    };

    expect(() => withPopulation(collection(orphan), {})).not.toThrow();
    expect(withPopulation(collection(orphan), {}).features[0]).toBe(orphan);
  });
});
