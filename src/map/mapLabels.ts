import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';

import { MAP_FLAG_INTRINSIC_DP } from './labelFit';

/**
 * The fact drawn on top of every country, and the expressions that draw it.
 *
 * Pure and data-only, for the same reason `choropleth.ts` is: the picker, the feature
 * builder in `data/labelGeoJson.ts` and the symbol layer in `WorldMap.tsx` all derive
 * from this one table, so a field cannot exist in the menu but not on the map.
 *
 * Independent of `FillMode`. A density choropleth with capital labels over it is a legal
 * and useful combination, so labels get their own state rather than becoming a fourth
 * fill mode.
 */

/**
 * The fields that put TEXT on a feature.
 *
 * Written out as the literal union and `LabelField` derived from it, rather than the other
 * way round, because `flag` is a label field that is not one of these - see below.
 */
export type LabelFieldId = 'name' | 'capital' | 'languages' | 'currencies' | 'population';

/**
 * What the map is labelled with. `none` is a real state - the default - not the absence of one.
 *
 * **`flag` is deliberately not a `LabelFieldId`**, the same way `location` is a `GradedField`
 * but not a `FieldId` in `quiz/quizConfig.ts`. Everything that iterates `LABEL_FIELD_IDS` -
 * `labelTextFor`'s exhaustive switch, the text layer's `text-field` - is about a string drawn
 * through the bundled font, and a flag is not one: it is a raster image drawn by a second
 * symbol layer through `icon-image`. Keeping it out of that union means none of them needs a
 * case for it, and the compiler will not let one be added by accident.
 */
export type LabelField = 'none' | LabelFieldId | 'flag';

export const LABEL_FIELD_IDS: readonly LabelFieldId[] = [
  'name',
  'capital',
  'languages',
  'currencies',
  'population',
];

/**
 * The picker's rows, in order. `none` leads because it is the default and the way out.
 *
 * Short labels: this list sits over the map on a phone. The description is what a screen
 * reader reads, and what makes "People" (a fill mode) and "Population" (a label field)
 * distinguishable when they are both on screen at once.
 */
export const LABEL_FIELDS: readonly {
  field: LabelField;
  label: string;
  description: string;
}[] = [
  { field: 'none', label: 'None', description: 'No labels on the map' },
  { field: 'name', label: 'Name', description: 'Show each country name on the map' },
  // Beside Name, because both answer the same question: which country is this.
  { field: 'flag', label: 'Flag', description: 'Show each country flag on the map' },
  { field: 'capital', label: 'Capital', description: 'Show each capital city on the map' },
  {
    field: 'languages',
    label: 'Languages',
    description: 'Show up to three official languages on each country',
  },
  {
    field: 'currencies',
    label: 'Currencies',
    description: 'Show up to three currencies on each country',
  },
  {
    field: 'population',
    label: 'Population',
    description: 'Show each population on the map, rounded',
  },
];

/**
 * Feature property names, derived rather than written out so `labelGeoJson.ts` and the
 * layer cannot disagree about what a property is called. `name` -> `tName` / `zName`.
 *
 * The `t` prefix means "the thing drawn" rather than strictly "text": for `flag` it holds the
 * name of a map image, not a string to render.
 */
export function textPropertyFor(field: Exclude<LabelField, 'none'>): string {
  return `t${field[0].toUpperCase()}${field.slice(1)}`;
}

export function zoomPropertyFor(field: Exclude<LabelField, 'none'>): string {
  return `z${field[0].toUpperCase()}${field.slice(1)}`;
}

/** Sort key property: `symbol-sort-key`, lower placed first. See `labelGeoJson.ts`. */
export const RANK_PROPERTY = 'rank';

/**
 * The empty-string-matches-nothing filter the selection layers already use.
 *
 * Named once because there are now two layers that need it, and they need it in opposite
 * modes: the text layer is off for `none` and `flag`, the icon layer is off for everything
 * else. That is what keeps both mounted in every mode with nothing added or removed at
 * runtime - the rule that puts the never-paints bug out of reach.
 */
const NOTHING = ['==', ['get', 'iso3'], ''] as unknown as ExpressionSpecification;

/**
 * Prefix on every flag map-image name, so `tFlag` holds `flag-br` rather than a bare `br`.
 *
 * A style's images share one namespace, so an unprefixed two-letter name is a collision
 * waiting for the first non-flag icon this app ever adds. `scripts/build-flag-assets.mjs`
 * generates `MAP_FLAG_ASSETS` with the same prefix, and `data-integrity.test.ts` asserts every
 * property the features carry names an image that exists.
 */
export const FLAG_IMAGE_PREFIX = 'flag-';

/** Holds the map-image name, e.g. `flag-br`. Not text - see `textPropertyFor`. */
export const FLAG_ICON_PROPERTY = textPropertyFor('flag');

/** The fit threshold, exactly as the text fields have one. See `labelFit.ts`. */
export const FLAG_ZOOM_PROPERTY = zoomPropertyFor('flag');

/**
 * `icon-image` for the flag layer.
 *
 * A constant rather than a builder: unlike `text-field` there is no mode in which this has to
 * say something different, because the layer's own filter matches nothing unless flags are on.
 * It is well-formed in every mode, which is what matters - a malformed layout property passes
 * every Jest test and then blanks the layer inside the native renderer.
 */
export const FLAG_ICON_IMAGE = ['get', FLAG_ICON_PROPERTY] as unknown as ExpressionSpecification;

/**
 * `icon-size` for the flag layer - how far the 24 px image is scaled at each zoom.
 *
 * The mirror of the text layer's `text-size` ramp, which runs 11 -> 14 about a nominal 12: this
 * runs **18 dp at world zoom to 24 dp from zoom 6**, about the nominal `MAP_FLAG_WIDTH_DP` of
 * 20 that the fit test uses. Growing a little with zoom is the same judgement in both cases -
 * small enough that a crowded world view still reads, roomier once there is space for it.
 *
 * Expressed as a fraction of `MAP_FLAG_INTRINSIC_DP` rather than as bare numbers, because that
 * is the one thing here that could be wrong on a device: if the image arrives at a different
 * pixel ratio than the rasteriser intended, every flag is scaled by the same wrong factor and
 * this is where it gets corrected. At zoom 6 the ratio is exactly 1, so the flag is drawn
 * texel-for-texel from the @3x raster on a 3x screen.
 */
export const FLAG_ICON_SIZE = [
  'interpolate',
  ['linear'],
  ['zoom'],
  0,
  18 / MAP_FLAG_INTRINSIC_DP,
  6,
  24 / MAP_FLAG_INTRINSIC_DP,
] as unknown as ExpressionSpecification;

/**
 * Which labels the symbol layer draws.
 *
 * Two conditions, and both are the decluttering rule:
 *
 * - `has` drops countries with no value for this field. Micronesia has no currency
 *   upstream, and the territories the World Bank does not report on have no population.
 *   The property is *absent* rather than null on those features - the same idiom
 *   `worldGeoJson.ts` uses for the choropleth - so `has` is all that is needed.
 * - the zoom comparison is the *fit* half of decluttering: a label only appears once its
 *   country is wide enough on screen to carry it. See `labelFit.ts`. The style spec
 *   permits `["zoom"]` inside a filter - "Zoom expressions in filters are only evaluated
 *   at integer zoom levels" - which is why this can be declarative instead of a camera
 *   subscription that re-renders on every pan.
 *
 * With no field selected this returns the **empty-string-matches-nothing** filter the
 * selection layers already use. The layer and its source stay mounted in every mode;
 * nothing is added to or removed from the map at runtime, which is the rule that keeps
 * the never-paints bug out of reach.
 */
export function labelFilter(field: LabelField): ExpressionSpecification {
  // `flag` joins `none` here: it is drawn by the icon layer below, so the TEXT layer must be
  // off. Exactly one of the two filters ever matches anything.
  if (field === 'none' || field === 'flag') return NOTHING;

  return [
    'all',
    ['has', textPropertyFor(field)],
    ['<=', ['get', zoomPropertyFor(field)], ['zoom']],
  ] as unknown as ExpressionSpecification;
}

/**
 * `text-field` for the selected field.
 *
 * `none` still has to return something well-formed: the layer stays mounted and its
 * filter matches nothing, but a `text-field` of `undefined` is a malformed layout
 * property, and a malformed expression is exactly the class of bug that passes every
 * Jest test and then blanks the layer inside the native renderer.
 */
export function labelTextField(field: LabelField): ExpressionSpecification | string {
  if (field === 'none' || field === 'flag') return '';
  return ['get', textPropertyFor(field)] as unknown as ExpressionSpecification;
}

/**
 * Which flags the icon layer draws - the mirror image of `labelFilter`.
 *
 * Same two conditions as the text layer, for the same two reasons: `has` drops the one record
 * with no flag upstream (BES), and the zoom comparison is the fit half of decluttering. What
 * differs is only where the threshold came from - a fixed icon width rather than a string's
 * estimated one. See `labelFit.ts`.
 */
export function flagIconFilter(field: LabelField): ExpressionSpecification {
  if (field !== 'flag') return NOTHING;

  return [
    'all',
    ['has', FLAG_ICON_PROPERTY],
    ['<=', ['get', FLAG_ZOOM_PROPERTY], ['zoom']],
  ] as unknown as ExpressionSpecification;
}
