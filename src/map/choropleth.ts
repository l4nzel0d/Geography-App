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

/** The three ways of colouring the land. `flat` is not a ramp, so it is not here. */
export type ChoroplethMode = 'population' | 'density' | 'mastery';

export type ChoroplethRamp = {
  /**
   * Feature property the expression reads. A feature that omits it renders
   * `NO_DATA_COLOR` - see `worldGeoJson.ts` and `masteryGeoJson.ts`, which decide presence.
   *
   * Typed as `ChoroplethMode` because every mode so far reads a property of its own name.
   * The day one reads a differently-named property is the day to introduce a separate
   * `ChoroplethProperty` type; until then this is what stops a typo naming a property no
   * feature carries.
   */
  property: ChoroplethMode;
  /** Legend heading, and the unit the ramp is counted in. */
  title: string;
  /**
   * What the legend calls the grey band. Defaults to `NO_DATA_LABEL`.
   *
   * Mastery overrides it: "not asked yet" is the single most useful thing that mode has
   * to say, because the grey countries are exactly the ones worth practising. It swaps
   * the text of a row that is already always mounted, so it adds no view.
   */
  noDataLabel?: string;
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
 * ColorBrewer *RdYlGn*, red to green, over the player's own mastery in percent.
 *
 * Diverging rather than sequential, and reusing the app's existing colour language: the
 * quiz already means red-wrong and green-right (`mapColors.quizWrong` / `quizCorrect`),
 * so "the red countries are the ones you keep missing" needs no explaining.
 *
 * **The spacing is deliberately uneven, biased to the weak end**, because that is what the
 * mode is for. The difference between 0% and 25% is the thing worth seeing; 90-100 is
 * "done". `ChoroplethLegend` prints the first, middle and last stops, so the axis reads
 * 0% / 50% / 100% and the intermediate labels only ever serve as React keys.
 *
 * Percent rather than the 0-1 score, so the legend's labels are free and the feature
 * carries a small integer instead of a float - see `toMasteryPercent`.
 *
 * **Known trade: RdYlGn is not colourblind-safe.** Lightness still varies across the ramp
 * and the legend states the order, but if that proves not to be enough the drop-in swap is
 * RdYlBu-7 (`#d73027 #fc8d59 #fee090 #ffffbf #e0f3f8 #91bfdb #4575b4`), at the cost of
 * "blue means you know it" reading oddly and edging toward density's BuPu.
 *
 * Unlike the other two ramps, the last stop is a band players are MEANT to reach: 100% means
 * everything you have been asked about that country, answered right. `masteryOf` carries no
 * prior precisely so it is reachable - the grey `not asked yet` band is where "we have not
 * asked you much" is expressed, so the number never has to hedge.
 */
export const MASTERY_STOPS: readonly ChoroplethStop[] = [
  { value: 0, label: '0%', color: '#d73027' },
  { value: 10, label: '10%', color: '#fc8d59' },
  { value: 25, label: '25%', color: '#fee08b' },
  { value: 50, label: '50%', color: '#ffffbf' },
  { value: 75, label: '75%', color: '#d9ef8b' },
  { value: 90, label: '90%', color: '#91cf60' },
  { value: 100, label: '100%', color: '#1a9850' },
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

/**
 * `fill-color` for a LINEARLY-scaled choropleth over `property`.
 *
 * The same `['has', property]` split and the same clamping as `logRampFillColor`; the only
 * difference is the missing logarithm, and that difference is the whole reason this
 * function exists.
 *
 * **A mastery score has a legitimate zero.** A player who has been asked a country once and
 * got it wrong scores exactly 0, and that is a real, common value rather than missing data.
 * Feeding it to `log10` would produce the -Infinity that `worldGeoJson.ts` spends four
 * paragraphs keeping away from the population ramp, and it would do it inside the native
 * renderer, where a malformed expression blanks the layer with no exception anywhere.
 *
 * The log ramps need their guard because their domains span five orders of magnitude. This
 * one spans 0-100 on a scale a person reads as percent, where linear is also simply the
 * honest rendering.
 */
function linearRampFillColor(
  property: ChoroplethMode,
  stops: readonly ChoroplethStop[],
): ExpressionSpecification {
  return [
    'case',
    ['has', property],
    [
      'interpolate',
      ['linear'],
      ['get', property],
      ...stops.flatMap((stop) => [stop.value, stop.color]),
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
export const MASTERY_RAMP: ChoroplethRamp = {
  property: 'mastery',
  title: 'Mastery from quizzes',
  noDataLabel: 'not asked yet',
  stops: MASTERY_STOPS,
  fillColor: linearRampFillColor('mastery', MASTERY_STOPS),
};

export const CHOROPLETH_RAMPS: Record<ChoroplethMode, ChoroplethRamp> = {
  population: POPULATION_RAMP,
  density: DENSITY_RAMP,
  mastery: MASTERY_RAMP,
};

/**
 * The four ways of colouring the land, in the order they escalate: no data, one number,
 * then that number against area - and then mastery, which sits last because it is a
 * different KIND of thing rather than the next rung. The first three are facts about the
 * country; this one is a fact about you, and it is the only one that changes while the app
 * is running.
 *
 * Lives here rather than in the component for the same reason the ramps do - the picker
 * and the map are driven by one table, so a mode cannot exist in the menu but not on the
 * map. Mirrors `LABEL_FIELDS` in `mapLabels.ts`, which is the other half of the same
 * chrome.
 *
 * Short labels because this sits over the map on a phone; the description is what a
 * screen reader reads, and what keeps "People" (a fill mode) distinguishable from
 * "Population" (a label field) when both menus exist.
 */
export const FILL_MODES: readonly {
  mode: 'flat' | ChoroplethMode;
  label: string;
  description: string;
}[] = [
  { mode: 'flat', label: 'Flat', description: 'Plain basemap, no colouring' },
  { mode: 'population', label: 'People', description: 'Colour countries by population' },
  {
    mode: 'density',
    label: 'Density',
    description: 'Colour countries by people per square kilometre',
  },
  {
    mode: 'mastery',
    label: 'Mastery',
    description: 'Colour countries by how well you answer them in quizzes',
  },
];

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
