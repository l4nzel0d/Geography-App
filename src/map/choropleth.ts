import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';

/**
 * The choropleth ramps.
 *
 * Pure and data-only so the legend and the map paint expression are driven by the
 * same table - see `ChoroplethLegend.tsx`, which renders these swatches directly.
 */
export type ChoroplethStop = {
  /** Upper edge of the band, in the ramp's own unit. */
  value: number;
  /** Compact axis label for the legend. */
  label: string;
  color: string;
};

/** The two ways of colouring the land. `flat` is not a ramp, so it is not here. */
export type ChoroplethMode = 'population' | 'density';

export type ChoroplethRamp = {
  /**
   * Feature property the expression reads. A feature that omits it renders
   * `NO_DATA_COLOR` - see `worldGeoJson.ts`, which is what decides presence.
   */
  property: ChoroplethMode;
  /** Legend heading, and the unit the ramp is counted in. */
  title: string;
  stops: readonly ChoroplethStop[];
  fillColor: ExpressionSpecification;
};

/**
 * ColorBrewer *Reds*, white to deep red, one stop per decade of population.
 *
 * The decade spacing is the whole point: population runs from ~11k (Tuvalu) to
 * ~1.45B (India), five orders of magnitude, so a linear ramp renders the entire
 * world white except China and India. Each step here is a 10x step of people.
 */
export const POPULATION_STOPS: readonly ChoroplethStop[] = [
  { value: 1e4, label: '10k', color: '#ffffff' },
  { value: 1e5, label: '100k', color: '#fee0d2' },
  { value: 1e6, label: '1M', color: '#fcbba1' },
  { value: 1e7, label: '10M', color: '#fc9272' },
  { value: 1e8, label: '100M', color: '#ef3b2c' },
  { value: 1e9, label: '1B', color: '#a50f15' },
  { value: 1.5e9, label: '1.5B', color: '#67000d' },
];

/**
 * ColorBrewer *BuPu*, pale blue to deep purple, one stop per decade of people per
 * square kilometre.
 *
 * A different hue family from the population ramp on purpose: the two modes sit on
 * the same map in the same corner, and telling "a lot of people" from "densely
 * packed" at a glance is the entire reason density is a separate mode.
 *
 * Measured over the 215 countries that get a figure, the spread is as wide as
 * population's: Greenland is 0.026/km2 and Macau is 22,863/km2, so this is log10 for
 * the same reason. Real data sits mostly between the 10 and 1k stops (median ~98,
 * p10 ~17, p90 ~474), which is where the ramp has its strongest contrast.
 *
 * The last stop is a ceiling rather than a band anyone occupies - Macau, the densest
 * country on the map, sits just under it - mirroring population's 1.5B stop.
 */
export const DENSITY_STOPS: readonly ChoroplethStop[] = [
  { value: 0.1, label: '0.1', color: '#edf8fb' },
  { value: 1, label: '1', color: '#bfd3e6' },
  { value: 10, label: '10', color: '#9ebcda' },
  { value: 100, label: '100', color: '#8c96c6' },
  { value: 1e3, label: '1k', color: '#8c6bb1' },
  { value: 1e4, label: '10k', color: '#88419d' },
  { value: 2.5e4, label: '25k', color: '#6e016b' },
];

/**
 * The territories with no figure: 22 the World Bank does not report on for
 * population, and those plus Svalbard's unknown area for density. Deliberately
 * outside both ramps so it cannot be misread as "very low".
 */
export const NO_DATA_COLOR = '#8a8f98';
export const NO_DATA_LABEL = 'no data';

/**
 * `fill-color` for a log-scaled choropleth over `property`.
 *
 * `interpolate` clamps outside its domain, so anything under the first stop renders
 * the palest colour and anything over the last renders the darkest, without extra
 * branches.
 *
 * The value is *absent* rather than null on features that have no figure - see
 * `worldGeoJson.ts` - which is what lets `has` split them off. It also keeps `log10`
 * away from null, 0 and Infinity, any of which would poison the expression
 * (`data-integrity.test.ts` asserts every recorded population and area is usable).
 *
 * Built from the stop table rather than written out, so the legend and the map can
 * never drift apart. The cast is because `interpolate` is a fixed-arity tuple in the
 * style spec and cannot be spread into; `choropleth.test.ts` asserts the shape instead.
 */
function logRampFillColor(
  property: ChoroplethMode,
  stops: readonly ChoroplethStop[],
): ExpressionSpecification {
  return [
    'case',
    ['has', property],
    [
      'interpolate',
      ['linear'],
      ['log10', ['get', property]],
      ...stops.flatMap((stop) => [Math.log10(stop.value), stop.color]),
    ],
    NO_DATA_COLOR,
  ] as unknown as ExpressionSpecification;
}

export const POPULATION_RAMP: ChoroplethRamp = {
  property: 'population',
  title: 'People per country',
  stops: POPULATION_STOPS,
  fillColor: logRampFillColor('population', POPULATION_STOPS),
};

export const DENSITY_RAMP: ChoroplethRamp = {
  property: 'density',
  title: 'People per km²',
  stops: DENSITY_STOPS,
  fillColor: logRampFillColor('density', DENSITY_STOPS),
};

/**
 * Keyed by fill mode so `WorldMap` and `MapControls` can look the ramp up rather
 * than branching on the mode twice over.
 *
 * **Every ramp must carry the same number of stops.** The legend is a single
 * always-mounted view whose swatches are swapped by prop, and equal counts are what
 * let React update those views in place instead of inserting new ones over the
 * MapLibre surface - which is the one thing that reliably never paints. See
 * `MapControls.tsx` and CLAUDE.md; `choropleth.test.ts` pins it.
 */
export const CHOROPLETH_RAMPS: Record<ChoroplethMode, ChoroplethRamp> = {
  population: POPULATION_RAMP,
  density: DENSITY_RAMP,
};

/**
 * The band a value falls into, for rendering the legend.
 *
 * This is a *bucket lookup, not a mirror of the map's colouring*: MapLibre blends
 * natively between stops, so only the values in the stop table are guaranteed to
 * match what the map draws. Values below the first stop clamp to it, matching
 * `interpolate`.
 */
export function bucketFor(
  value: number | null | undefined,
  stops: readonly ChoroplethStop[],
): ChoroplethStop | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;

  let bucket = stops[0];
  for (const stop of stops) {
    if (value >= stop.value) bucket = stop;
  }
  return bucket;
}
