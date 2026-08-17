/**
 * The runtime join that puts `population` and `density` on each outline.
 *
 * The choropleth paint expressions can only read properties carried on the feature, and
 * the build script trims them to `{ iso3, name }` - so this join is what makes the
 * whole feature possible, and it has to stay cheap.
 */
import rawGeoJson from '@/data/countries.geo.json';
import { allCountryFacts } from '@/data/countryFacts';
import type { CountryFacts, CountryFeatureProperties } from '@/data/types';
import { densityOf, withChoroplethValues, worldGeoJson } from '@/data/worldGeoJson';

const raw = rawGeoJson as unknown as GeoJSON.FeatureCollection;
const propertiesOf = (feature: GeoJSON.Feature) =>
  feature.properties as unknown as CountryFeatureProperties;

const byIso3 = new Map(worldGeoJson.features.map((f) => [propertiesOf(f).iso3, f]));

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

describe('worldGeoJson density', () => {
  it('carries a density for the bulk of the map', () => {
    const withDensity = worldGeoJson.features.filter((f) => propertiesOf(f).density != null);

    // 215 of 240 outlines at the time of writing; the rest have no population.
    expect(withDensity.length).toBeGreaterThan(200);
  });

  it('derives it as population over area', () => {
    worldGeoJson.features.forEach((feature) => {
      const { iso3, density } = propertiesOf(feature);
      if (density == null) return;

      const facts = allCountryFacts[iso3];
      expect(density).toBeCloseTo(facts.population! / facts.area!, 3);
    });
  });

  it('matches hand-checked figures at both ends of the ramp', () => {
    // Greenland is the emptiest country on the map and Macau the densest; between
    // them they are the whole domain the ramp has to cover.
    expect(propertiesOf(byIso3.get('GRL')!).density).toBeCloseTo(0.026, 3);
    expect(propertiesOf(byIso3.get('MCO')!).density).toBeGreaterThan(18_000);
  });

  it('omits the key wherever it cannot be computed', () => {
    // Same idiom as population: absent, never null, or `['has','density']` routes it
    // into log10 anyway.
    const gaps = worldGeoJson.features.filter((feature) => {
      const facts = allCountryFacts[propertiesOf(feature).iso3];
      return !facts || facts.population == null || !facts.area || facts.area <= 0;
    });

    expect(gaps.length).toBeGreaterThan(0);
    gaps.forEach((feature) => {
      expect(feature.properties).not.toHaveProperty('density');
    });
  });

  it('never carries a zero, negative or non-finite density', () => {
    // Any of these reaches log10 and evaluates to -Infinity or NaN, which breaks the
    // paint for the entire layer inside the native renderer - where no test can see it.
    worldGeoJson.features.forEach((feature) => {
      const { density } = propertiesOf(feature);
      if (density == null) return;
      expect(Number.isFinite(density)).toBe(true);
      expect(density).toBeGreaterThan(0);
    });
  });
});

describe('densityOf', () => {
  const facts = (over: Partial<CountryFacts>): CountryFacts => ({
    name: 'Test',
    official: null,
    population: 1000,
    populationYear: '2025',
    capital: [],
    area: 10,
    flag: null,
    currencies: [],
    languages: [],
    ...over,
  });

  it('divides population by area', () => {
    expect(densityOf(facts({ population: 1000, area: 10 }))).toBe(100);
  });

  it('rounds to 3dp, because the ramp is logarithmic', () => {
    expect(densityOf(facts({ population: 1, area: 3 }))).toBe(0.333);
  });

  it('has no answer without both numbers', () => {
    expect(densityOf(undefined)).toBeNull();
    expect(densityOf(facts({ population: null }))).toBeNull();
    expect(densityOf(facts({ area: null }))).toBeNull();
  });

  it('rejects the -1 mledoze ships for an unknown area', () => {
    // Svalbard and Jan Mayen carries area: -1. Dividing by it yields a negative
    // density, and log10 of that is NaN.
    expect(densityOf(facts({ area: -1 }))).toBeNull();
    expect(densityOf(facts({ area: 0 }))).toBeNull();
  });

  it('rejects a density that rounds away to zero', () => {
    // log10(0) is -Infinity. Nothing real is this sparse, but the guard is free.
    expect(densityOf(facts({ population: 1, area: 1e9 }))).toBeNull();
  });
});

describe('withChoroplethValues', () => {
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
    const result = withChoroplethValues(collection(untouched), {});

    expect(result.features[0]).toBe(untouched);
  });

  it('tolerates a feature with no properties at all', () => {
    const orphan: GeoJSON.Feature = {
      type: 'Feature',
      properties: null,
      geometry: { type: 'Polygon', coordinates: [] },
    };

    expect(() => withChoroplethValues(collection(orphan), {})).not.toThrow();
    expect(withChoroplethValues(collection(orphan), {}).features[0]).toBe(orphan);
  });

  it('adds population without density when the area is unusable', () => {
    // The two properties are independent: a country the World Bank reports on but
    // whose area is unknown still belongs on the population ramp.
    const result = withChoroplethValues(collection(feature('XXX')), {
      XXX: {
        name: 'X',
        official: null,
        population: 500,
        populationYear: '2025',
        capital: [],
        area: -1,
        flag: null,
        currencies: [],
        languages: [],
      },
    });

    expect(result.features[0].properties).toHaveProperty('population', 500);
    expect(result.features[0].properties).not.toHaveProperty('density');
  });
});
