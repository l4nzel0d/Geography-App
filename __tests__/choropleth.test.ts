/**
 * The choropleth ramps.
 *
 * Each paint expression is built from its stop table so the map and the legend cannot
 * drift apart; these tests pin the shape that build produces, because the expression is
 * handed to a native renderer that Jest cannot run - a malformed one fails silently
 * here and only shows up on a device.
 *
 * **Structured as shared invariants plus per-scale ones**, because mastery is the first
 * ramp that is not logarithmic. Everything true of all three - the `has` branch, the
 * ascending finite domain, the stop pairs - is asserted over every ramp; decade spacing
 * and the `log10` wrapper are asserted only over the two that have them.
 */
import { translate } from '@/i18n/t';
import {
  bucketFor,
  CHOROPLETH_RAMPS,
  type ChoroplethRamp,
  FILL_MODES,
  type ChoroplethStop,
  DENSITY_RAMP,
  DENSITY_STOPS,
  MASTERY_RAMP,
  MASTERY_STOPS,
  NO_DATA_COLOR,
  NO_DATA_LABEL_KEY,
  POPULATION_RAMP,
  POPULATION_STOPS,
} from '@/map/choropleth';

/** The expressions are fixed-arity tuples to TypeScript; tests poke at them as data. */
const asData = (ramp: ChoroplethRamp) => ramp.fillColor as unknown as unknown[];

const interpolateOf = (ramp: ChoroplethRamp) => asData(ramp)[2] as unknown[];

/** The `[input, colour, input, colour, ...]` tail of the interpolate. */
const pairsOf = (ramp: ChoroplethRamp) => interpolateOf(ramp).slice(3);

const domainOf = (ramp: ChoroplethRamp) =>
  pairsOf(ramp).filter((_, i) => i % 2 === 0) as number[];

/** What a stop's value becomes in the expression's domain, per scale. */
const LOG_RAMPS: [string, ChoroplethRamp][] = [
  ['population', POPULATION_RAMP],
  ['density', DENSITY_RAMP],
];

const ALL_RAMPS: [string, ChoroplethRamp][] = [...LOG_RAMPS, ['mastery', MASTERY_RAMP]];

const expectedDomain = (ramp: ChoroplethRamp, stop: ChoroplethStop) =>
  ramp === MASTERY_RAMP ? stop.value : Math.log10(stop.value);

describe.each(ALL_RAMPS)('%s ramp', (_name, ramp) => {
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

  it('gives every band its own label, which the legend uses as a React key', () => {
    const labels = ramp.stops.map((stop) => stop.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('branches on the presence of its property, not its value', () => {
    // Features with no figure omit the key entirely rather than carrying null, so
    // `has` is what separates them - and for the log ramps it keeps log10 away from
    // null, which would poison the whole expression.
    const expression = asData(ramp);
    expect(expression[0]).toBe('case');
    expect(expression[1]).toEqual(['has', ramp.property]);
    expect(expression[3]).toBe(NO_DATA_COLOR);
  });

  it('interpolates linearly', () => {
    const interpolate = interpolateOf(ramp);
    expect(interpolate[0]).toBe('interpolate');
    expect(interpolate[1]).toEqual(['linear']);
  });

  it('carries exactly its own stops, in order', () => {
    const pairs = pairsOf(ramp);
    expect(pairs).toHaveLength(ramp.stops.length * 2);

    ramp.stops.forEach((stop, i) => {
      expect(pairs[i * 2]).toBeCloseTo(expectedDomain(ramp, stop), 10);
      expect(pairs[i * 2 + 1]).toBe(stop.color);
    });
  });

  it('keeps the interpolation domain strictly ascending', () => {
    // MapLibre rejects the whole expression otherwise, which blanks the map.
    const inputs = domainOf(ramp);
    for (let i = 1; i < inputs.length; i += 1) {
      expect(inputs[i]).toBeGreaterThan(inputs[i - 1]);
    }
  });

  it('has a finite domain', () => {
    domainOf(ramp).forEach((input) => expect(Number.isFinite(input)).toBe(true));
  });
});

describe.each(LOG_RAMPS)('%s ramp, being logarithmic', (_name, ramp) => {
  it('spaces the bands one decade apart, which is why the ramp reads at all', () => {
    // Linear over five or six orders of magnitude leaves all but the top two or three
    // countries at the palest colour. The last stop is a ceiling, not a decade.
    const logs = ramp.stops.map((stop) => Math.log10(stop.value));
    for (let i = 1; i < logs.length - 1; i += 1) {
      expect(logs[i] - logs[i - 1]).toBeCloseTo(1, 10);
    }
  });

  it('wraps its property in log10', () => {
    expect(interpolateOf(ramp)[2]).toEqual(['log10', ['get', ramp.property]]);
  });

  it('has no stop at or below zero', () => {
    // log10(0) is -Infinity and log10(-1) is NaN; either one takes the layer with it.
    ramp.stops.forEach((stop) => expect(stop.value).toBeGreaterThan(0));
  });
});

describe('the mastery ramp, being linear', () => {
  it('reads its property directly, with no logarithm', () => {
    // A mastery score has a legitimate zero - one wrong answer and nothing else - and
    // log10(0) is the -Infinity the other two ramps are built to avoid.
    expect(interpolateOf(MASTERY_RAMP)).toContainEqual(['get', 'mastery']);
    expect(JSON.stringify(MASTERY_RAMP.fillColor)).not.toContain('log10');
  });

  it('starts at exactly zero, which no log ramp could', () => {
    expect(MASTERY_STOPS[0].value).toBe(0);
    expect(domainOf(MASTERY_RAMP)[0]).toBe(0);
  });

  it('runs 0 to 100, the percent the fold writes onto the feature', () => {
    expect(MASTERY_STOPS[MASTERY_STOPS.length - 1].value).toBe(100);
  });

  it('names its grey band for what it means here', () => {
    // "no data" would be wrong: those countries have not been asked, which is an
    // invitation to practise rather than a gap in the dataset.
    expect(MASTERY_RAMP.noDataLabelKey).toBe('map.legend.mastery.noData');
    expect(translate('en', 'map.legend.mastery.noData')).toBe('not asked yet');
    // The other ramps say nothing and fall back to the shared key.
    expect(POPULATION_RAMP.noDataLabelKey).toBeUndefined();
  });
});

describe('the ramps together', () => {
  it('reads each mode from its own feature property', () => {
    expect(POPULATION_RAMP.property).toBe('population');
    expect(DENSITY_RAMP.property).toBe('density');
    expect(MASTERY_RAMP.property).toBe('mastery');
    expect(CHOROPLETH_RAMPS.population).toBe(POPULATION_RAMP);
    expect(CHOROPLETH_RAMPS.density).toBe(DENSITY_RAMP);
    expect(CHOROPLETH_RAMPS.mastery).toBe(MASTERY_RAMP);
  });

  it('registers every mode, so the picker cannot offer one the map lacks', () => {
    const modes = FILL_MODES.map((option) => option.mode).filter((mode) => mode !== 'flat');
    expect(modes.sort()).toEqual(Object.keys(CHOROPLETH_RAMPS).sort());
  });

  it('carries the same number of stops in EVERY ramp', () => {
    // Load-bearing, not cosmetic: the legend is one always-mounted view whose swatches
    // are swapped by prop. Equal counts let React update those views in place; a
    // different count inserts new ones over the MapLibre surface, which never paints.
    // See ChoroplethLegend.tsx and CLAUDE.md.
    expect(DENSITY_STOPS).toHaveLength(POPULATION_STOPS.length);
    expect(MASTERY_STOPS).toHaveLength(POPULATION_STOPS.length);

    for (const ramp of Object.values(CHOROPLETH_RAMPS)) {
      expect(ramp.stops).toHaveLength(POPULATION_STOPS.length);
    }
  });

  it('uses distinct hue families, so the modes cannot be confused', () => {
    // They occupy the same corner of the same map. Reds for people, blue-purple for
    // density, red-to-green for mastery - the darkest stops must not be neighbours.
    expect(POPULATION_STOPS[POPULATION_STOPS.length - 1].color).toBe('#67000d');
    expect(DENSITY_STOPS[DENSITY_STOPS.length - 1].color).toBe('#6e016b');
    expect(MASTERY_STOPS[MASTERY_STOPS.length - 1].color).toBe('#1a9850');

    // No two ramps may share a swatch, or the same colour would mean two things.
    const all = Object.values(CHOROPLETH_RAMPS).flatMap((ramp) =>
      ramp.stops.map((stop) => stop.color),
    );
    expect(new Set(all).size).toBe(all.length);
  });

  /**
   * The ramps carry message KEYS, not words, so this asserts both halves: that each ramp
   * points at its own key, and that the key still resolves to the unit the legend means.
   * A ramp pointed at the wrong key would otherwise pass a spelling check.
   */
  it('titles each legend with the unit it is counted in', () => {
    expect(translate('en', POPULATION_RAMP.titleKey)).toBe('People per country');
    expect(translate('en', DENSITY_RAMP.titleKey)).toBe('People per km²');
    expect(translate('en', MASTERY_RAMP.titleKey)).toBe('Mastery from quizzes');

    const keys = [POPULATION_RAMP.titleKey, DENSITY_RAMP.titleKey, MASTERY_RAMP.titleKey];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('translates every ramp title and both no-data labels', () => {
    expect(translate('ru', POPULATION_RAMP.titleKey)).toBe('Людей в стране');
    expect(translate('ru', MASTERY_RAMP.titleKey)).toBe('Знание по тестам');
    expect(translate('ru', NO_DATA_LABEL_KEY)).toBe('нет данных');
    expect(translate('ru', 'map.legend.mastery.noData')).toBe('ещё не спрашивали');
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
