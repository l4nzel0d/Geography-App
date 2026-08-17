/**
 * The population ramp.
 *
 * The paint expression is built from POPULATION_STOPS so the map and the legend cannot
 * drift apart; these tests pin the shape that build produces, because the expression is
 * handed to a native renderer that Jest cannot run - a malformed one fails silently
 * here and only shows up on a device.
 */
import {
  NO_DATA_COLOR,
  POPULATION_FILL_COLOR,
  POPULATION_STOPS,
  populationBucket,
} from '@/map/choropleth';

/** The expression is a fixed-arity tuple to TypeScript; tests poke at it as data. */
const expression = POPULATION_FILL_COLOR as unknown as unknown[];

describe('POPULATION_STOPS', () => {
  it('ascends in population', () => {
    const populations = POPULATION_STOPS.map((stop) => stop.population);
    expect(populations).toEqual([...populations].sort((a, b) => a - b));
    expect(new Set(populations).size).toBe(populations.length);
  });

  it('runs white to deep red', () => {
    expect(POPULATION_STOPS[0].color).toBe('#ffffff');
    expect(POPULATION_STOPS[POPULATION_STOPS.length - 1].color).toBe('#67000d');
  });

  it('gives every band its own colour', () => {
    const colors = POPULATION_STOPS.map((stop) => stop.color);
    expect(new Set(colors).size).toBe(colors.length);
    expect(colors).not.toContain(NO_DATA_COLOR);
  });

  it('spaces the bands one decade apart, which is why the ramp reads at all', () => {
    // A linear ramp over 11k..1.45B leaves everything but China and India white.
    const logs = POPULATION_STOPS.map((stop) => Math.log10(stop.population));
    for (let i = 1; i < logs.length - 1; i += 1) {
      expect(logs[i] - logs[i - 1]).toBeCloseTo(1, 10);
    }
  });
});

describe('POPULATION_FILL_COLOR', () => {
  it('branches on the presence of the property, not its value', () => {
    // Features with no World Bank figure omit `population` entirely rather than
    // carrying null, so `has` is what separates them - and it keeps log10 away from
    // null, which would poison the whole expression.
    expect(expression[0]).toBe('case');
    expect(expression[1]).toEqual(['has', 'population']);
    expect(expression[3]).toBe(NO_DATA_COLOR);
  });

  it('interpolates linearly on log10 of the population', () => {
    const interpolate = expression[2] as unknown[];

    expect(interpolate[0]).toBe('interpolate');
    expect(interpolate[1]).toEqual(['linear']);
    expect(interpolate[2]).toEqual(['log10', ['get', 'population']]);
  });

  it('carries exactly the stops from POPULATION_STOPS, in order', () => {
    const interpolate = expression[2] as unknown[];
    const pairs = interpolate.slice(3);

    expect(pairs).toHaveLength(POPULATION_STOPS.length * 2);

    POPULATION_STOPS.forEach((stop, i) => {
      expect(pairs[i * 2]).toBeCloseTo(Math.log10(stop.population), 10);
      expect(pairs[i * 2 + 1]).toBe(stop.color);
    });
  });

  it('keeps the interpolation domain strictly ascending', () => {
    // MapLibre rejects the whole expression otherwise, which blanks the map.
    const inputs = (expression[2] as unknown[])
      .slice(3)
      .filter((_, i) => i % 2 === 0) as number[];

    for (let i = 1; i < inputs.length; i += 1) {
      expect(inputs[i]).toBeGreaterThan(inputs[i - 1]);
    }
  });
});

describe('populationBucket', () => {
  it('returns the band a population falls into', () => {
    expect(populationBucket(1e6)?.color).toBe('#fcbba1');
    expect(populationBucket(5e6)?.color).toBe('#fcbba1');
    expect(populationBucket(1e7)?.color).toBe('#fc9272');
  });

  it('clamps below the first stop, matching interpolate', () => {
    // Tuvalu, the smallest population the World Bank reports, is ~11k - just inside
    // the first band. Anything under the 10k floor still lands there rather than
    // falling off the ramp.
    expect(populationBucket(11_000)).toBe(POPULATION_STOPS[0]);
    expect(populationBucket(1)).toBe(POPULATION_STOPS[0]);
    expect(populationBucket(0)).toBe(POPULATION_STOPS[0]);
  });

  it('puts the largest real populations in the top two bands', () => {
    // India is ~1.45B, which is inside the 1B band - the 1.5B stop is the ramp's
    // ceiling, not a band anyone actually occupies.
    expect(populationBucket(1.45e9)?.label).toBe('1B');
    expect(populationBucket(1.5e9)).toBe(POPULATION_STOPS[POPULATION_STOPS.length - 1]);
  });

  it('clamps above the last stop', () => {
    expect(populationBucket(9e12)).toBe(POPULATION_STOPS[POPULATION_STOPS.length - 1]);
  });

  it('has no band for a missing or nonsense figure', () => {
    expect(populationBucket(null)).toBeNull();
    expect(populationBucket(undefined)).toBeNull();
    expect(populationBucket(NaN)).toBeNull();
    expect(populationBucket(Infinity)).toBeNull();
  });
});
