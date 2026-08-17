import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';

/**
 * The population choropleth ramp.
 *
 * Pure and data-only so the legend and the map paint expression are driven by the
 * same table - see `PopulationLegend.tsx`, which renders these swatches directly.
 */
export type PopulationStop = {
  /** Upper edge of the band, in people. */
  population: number;
  /** Compact axis label for the legend. */
  label: string;
  color: string;
};

/**
 * ColorBrewer *Reds*, white to deep red, one stop per decade of population.
 *
 * The decade spacing is the whole point: population runs from ~11k (Tuvalu) to
 * ~1.45B (India), five orders of magnitude, so a linear ramp renders the entire
 * world white except China and India. Each step here is a 10x step of people.
 */
export const POPULATION_STOPS: readonly PopulationStop[] = [
  { population: 1e4, label: '10k', color: '#ffffff' },
  { population: 1e5, label: '100k', color: '#fee0d2' },
  { population: 1e6, label: '1M', color: '#fcbba1' },
  { population: 1e7, label: '10M', color: '#fc9272' },
  { population: 1e8, label: '100M', color: '#ef3b2c' },
  { population: 1e9, label: '1B', color: '#a50f15' },
  { population: 1.5e9, label: '1.5B', color: '#67000d' },
];

/**
 * The 22 territories the World Bank does not report on (Taiwan, Western Sahara,
 * the Falklands, Vatican, Jersey, ...). Deliberately outside the red ramp so it
 * cannot be misread as "very low population".
 */
export const NO_DATA_COLOR = '#8a8f98';
export const NO_DATA_LABEL = 'no data';

/**
 * `fill-color` for the population choropleth.
 *
 * `interpolate` clamps outside its domain, so anything under 10k renders white and
 * anything over 1.5B renders the darkest stop without extra branches.
 *
 * `population` is *absent* rather than null on features the World Bank has no figure
 * for - see `worldGeoJson.ts` - which is what lets `has` split them off. It also keeps
 * `log10` away from null and 0, either of which would poison the expression
 * (`data-integrity.test.ts` asserts every recorded population is positive and finite).
 *
 * Built from POPULATION_STOPS rather than written out, so the legend and the map can
 * never drift apart. The cast is because `interpolate` is a fixed-arity tuple in the
 * style spec and cannot be spread into; `choropleth.test.ts` asserts the shape instead.
 */
export const POPULATION_FILL_COLOR = [
  'case',
  ['has', 'population'],
  [
    'interpolate',
    ['linear'],
    ['log10', ['get', 'population']],
    ...POPULATION_STOPS.flatMap((stop) => [Math.log10(stop.population), stop.color]),
  ],
  NO_DATA_COLOR,
] as unknown as ExpressionSpecification;

/**
 * The band a population falls into, for rendering the legend.
 *
 * This is a *bucket lookup, not a mirror of the map's colouring*: MapLibre blends
 * natively between stops, so only the values in POPULATION_STOPS are guaranteed to
 * match what the map draws. Values below the first stop clamp to it, matching
 * `interpolate`.
 */
export function populationBucket(population: number | null | undefined): PopulationStop | null {
  if (typeof population !== 'number' || !Number.isFinite(population)) return null;

  let bucket = POPULATION_STOPS[0];
  for (const stop of POPULATION_STOPS) {
    if (population >= stop.population) bucket = stop;
  }
  return bucket;
}
