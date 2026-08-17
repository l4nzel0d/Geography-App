/**
 * The choropleth ramps.
 *
 * Each paint expression is built from its stop table so the map and the legend cannot
 * drift apart; these tests pin the shape that build produces, because the expression is
 * handed to a native renderer that Jest cannot run - a malformed one fails silently
 * here and only shows up on a device.
 */
import {
  bucketFor,
  CHOROPLETH_RAMPS,
  type ChoroplethRamp,
  DENSITY_RAMP,
  DENSITY_STOPS,
  NO_DATA_COLOR,
  POPULATION_RAMP,
  POPULATION_STOPS,
} from '@/map/choropleth';

/** The expressions are fixed-arity tuples to TypeScript; tests poke at them as data. */
const asData = (ramp: ChoroplethRamp) => ramp.fillColor as unknown as unknown[];

const RAMPS: [string, ChoroplethRamp][] = [
  ['population', POPULATION_RAMP],
  ['density', DENSITY_RAMP],
];

describe.each(RAMPS)('%s ramp', (_name, ramp) => {
  it('ascends in value', () => {
    const values = ramp.stops.map((stop) => stop.value);
    expect(values).toEqual([...values].sort((a, b) => a - b));
    expect(new Set(values).size).toBe(values.length);
  });

  it('gives every band its own colour, none of them the no-data grey', () => {
    const colors = ramp.stops.map((stop) => stop.color);
    expect(new Set(colors).size).toBe(colors.length);
    expect(colors).not.toContain(NO_DATA_COLOR);
  });

  it('spaces the bands one decade apart, which is why the ramp reads at all', () => {
    // Linear over five or six orders of magnitude leaves all but the top two or three
    // countries at the palest colour. The last stop is a ceiling, not a decade.
    const logs = ramp.stops.map((stop) => Math.log10(stop.value));
    for (let i = 1; i < logs.length - 1; i += 1) {
      expect(logs[i] - logs[i - 1]).toBeCloseTo(1, 10);
    }
  });

  it('branches on the presence of its property, not its value', () => {
    // Features with no figure omit the key entirely rather than carrying null, so
    // `has` is what separates them - and it keeps log10 away from null, which would
    // poison the whole expression.
    const expression = asData(ramp);
    expect(expression[0]).toBe('case');
    expect(expression[1]).toEqual(['has', ramp.property]);
    expect(expression[3]).toBe(NO_DATA_COLOR);
  });

  it('interpolates linearly on log10 of its property', () => {
    const interpolate = asData(ramp)[2] as unknown[];

    expect(interpolate[0]).toBe('interpolate');
    expect(interpolate[1]).toEqual(['linear']);
    expect(interpolate[2]).toEqual(['log10', ['get', ramp.property]]);
  });

  it('carries exactly its own stops, in order', () => {
    const pairs = (asData(ramp)[2] as unknown[]).slice(3);

    expect(pairs).toHaveLength(ramp.stops.length * 2);

    ramp.stops.forEach((stop, i) => {
      expect(pairs[i * 2]).toBeCloseTo(Math.log10(stop.value), 10);
      expect(pairs[i * 2 + 1]).toBe(stop.color);
    });
  });

  it('keeps the interpolation domain strictly ascending', () => {
    // MapLibre rejects the whole expression otherwise, which blanks the map.
    const inputs = (asData(ramp)[2] as unknown[])
      .slice(3)
      .filter((_, i) => i % 2 === 0) as number[];

    for (let i = 1; i < inputs.length; i += 1) {
      expect(inputs[i]).toBeGreaterThan(inputs[i - 1]);
    }
  });

  it('has a finite domain, so no stop can be zero or negative', () => {
    // log10(0) is -Infinity and log10(-1) is NaN; either one takes the layer with it.
    const inputs = (asData(ramp)[2] as unknown[])
      .slice(3)
      .filter((_, i) => i % 2 === 0) as number[];

    inputs.forEach((input) => expect(Number.isFinite(input)).toBe(true));
  });
});

describe('the ramps together', () => {
  it('reads each mode from its own feature property', () => {
    expect(POPULATION_RAMP.property).toBe('population');
    expect(DENSITY_RAMP.property).toBe('density');
    expect(CHOROPLETH_RAMPS.population).toBe(POPULATION_RAMP);
    expect(CHOROPLETH_RAMPS.density).toBe(DENSITY_RAMP);
  });

  it('carries the same number of stops', () => {
    // Load-bearing, not cosmetic: the legend is one always-mounted view whose swatches
    // are swapped by prop. Equal counts let React update those views in place; a
    // different count inserts new ones over the MapLibre surface, which never paints.
    // See ChoroplethLegend.tsx and CLAUDE.md.
    expect(DENSITY_STOPS).toHaveLength(POPULATION_STOPS.length);
  });

  it('uses distinct hue families, so the two modes cannot be confused', () => {
    // They occupy the same corner of the same map. Reds for people, blue-purple for
    // density - the darkest stops must not be neighbours.
    expect(POPULATION_STOPS[POPULATION_STOPS.length - 1].color).toBe('#67000d');
    expect(DENSITY_STOPS[DENSITY_STOPS.length - 1].color).toBe('#6e016b');
    expect(POPULATION_STOPS.map((s) => s.color)).not.toContain(DENSITY_STOPS[0].color);
  });

  it('titles each legend with the unit it is counted in', () => {
    expect(POPULATION_RAMP.title).toBe('People per country');
    expect(DENSITY_RAMP.title).toBe('People per km²');
  });
});

describe('density ramp coverage', () => {
  it('spans the real range, from Greenland to Macau', () => {
    // Measured over countryFacts.json: 0.026/km2 (Greenland) to 22,863/km2 (Macau).
    // Greenland clamps onto the first stop; Macau must sit inside the ramp, not past
    // its ceiling, or the densest country on the map is indistinguishable from the
    // second densest.
    expect(DENSITY_STOPS[0].value).toBeLessThan(1);
    expect(DENSITY_STOPS[DENSITY_STOPS.length - 1].value).toBeGreaterThan(22_863);
  });

  it('puts the bulk of the world in the middle of the ramp', () => {
    // p10 ~17, median ~98, p90 ~474 people/km2. If the mass of the data sat against
    // either end the map would read as one flat colour.
    const median = bucketFor(97.5, DENSITY_STOPS);
    expect(DENSITY_STOPS.indexOf(median!)).toBeGreaterThan(0);
    expect(DENSITY_STOPS.indexOf(median!)).toBeLessThan(DENSITY_STOPS.length - 1);
  });
});

describe('bucketFor', () => {
  it('returns the band a value falls into', () => {
    expect(bucketFor(1e6, POPULATION_STOPS)?.color).toBe('#fcbba1');
    expect(bucketFor(5e6, POPULATION_STOPS)?.color).toBe('#fcbba1');
    expect(bucketFor(1e7, POPULATION_STOPS)?.color).toBe('#fc9272');
  });

  it('reads each ramp against its own stops', () => {
    // 100 is the palest band of the population ramp and a middle band of density's.
    expect(bucketFor(100, POPULATION_STOPS)).toBe(POPULATION_STOPS[0]);
    expect(bucketFor(100, DENSITY_STOPS)?.label).toBe('100');
  });

  it('clamps below the first stop, matching interpolate', () => {
    // Tuvalu, the smallest population the World Bank reports, is ~11k - just inside
    // the first band. Anything under the 10k floor still lands there rather than
    // falling off the ramp, and Greenland does the same on the density ramp.
    expect(bucketFor(11_000, POPULATION_STOPS)).toBe(POPULATION_STOPS[0]);
    expect(bucketFor(1, POPULATION_STOPS)).toBe(POPULATION_STOPS[0]);
    expect(bucketFor(0, POPULATION_STOPS)).toBe(POPULATION_STOPS[0]);
    expect(bucketFor(0.026, DENSITY_STOPS)).toBe(DENSITY_STOPS[0]);
  });

  it('puts the largest real values in the top two bands', () => {
    // India is ~1.45B, which is inside the 1B band - the 1.5B stop is the ramp's
    // ceiling, not a band anyone actually occupies.
    expect(bucketFor(1.45e9, POPULATION_STOPS)?.label).toBe('1B');
    expect(bucketFor(1.5e9, POPULATION_STOPS)).toBe(POPULATION_STOPS[POPULATION_STOPS.length - 1]);
    expect(bucketFor(22_863, DENSITY_STOPS)?.label).toBe('10k');
  });

  it('clamps above the last stop', () => {
    expect(bucketFor(9e12, POPULATION_STOPS)).toBe(POPULATION_STOPS[POPULATION_STOPS.length - 1]);
  });

  it('has no band for a missing or nonsense figure', () => {
    expect(bucketFor(null, POPULATION_STOPS)).toBeNull();
    expect(bucketFor(undefined, POPULATION_STOPS)).toBeNull();
    expect(bucketFor(NaN, POPULATION_STOPS)).toBeNull();
    expect(bucketFor(Infinity, POPULATION_STOPS)).toBeNull();
  });
});
