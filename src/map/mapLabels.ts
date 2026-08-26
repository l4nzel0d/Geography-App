import { DEFAULT_LOCALE, type Locale } from '@/i18n/localeTypes';
import type { MessageKey } from '@/i18n/t';

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
export type LabelFieldId = 'name' | 'capital' | 'currencies' | 'population';

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
  'currencies',
  'population',
];

/**
 * The picker's rows, in order. `none` leads because it is the default and the way out.
 *
 * Short labels: this list sits over the map on a phone, and each one is also a pill in the
 * top-left row, whose whole width budget is ~379 dp shared with the row opposite -
 * `chromeWidth.test.ts` is what holds that. The description is what a screen reader reads,
 * and what makes "People" (a fill mode) and "Population" (a label field) distinguishable
 * when they are both on screen at once.
 *
 * The rows carry message KEYS rather than words, so this table stays pure data and one
 * table can still drive both the picker and the map in either language.
 */
export const LABEL_FIELDS: readonly {
  field: LabelField;
  labelKey: MessageKey;
  descriptionKey: MessageKey;
}[] = [
  { field: 'none', labelKey: 'map.label.none.label', descriptionKey: 'map.label.none.description' },
  { field: 'name', labelKey: 'map.label.name.label', descriptionKey: 'map.label.name.description' },
  // Beside Name, because both answer the same question: which country is this.
  { field: 'flag', labelKey: 'map.label.flag.label', descriptionKey: 'map.label.flag.description' },
  {
    field: 'capital',
    labelKey: 'map.label.capital.label',
    descriptionKey: 'map.label.capital.description',
  },
  {
    field: 'currencies',
    labelKey: 'map.label.currencies.label',
    descriptionKey: 'map.label.currencies.description',
  },
  {
    field: 'population',
    labelKey: 'map.label.population.label',
    descriptionKey: 'map.label.population.description',
  },
];

/**
 * Feature property names, derived rather than written out so `labelGeoJson.ts` and the
 * layer cannot disagree about what a property is called. `name` -> `tName` / `zName`.
 *
 * The `t` prefix means "the thing drawn" rather than strictly "text": for `flag` it holds the
 * name of a map image, not a string to render.
 */
/**
 * The suffix a locale's properties carry. English is UNSUFFIXED.
 *
 * Keeping English bare means every existing property name, every test expectation and
 * every committed expression is byte-identical to what it was - the Russian pass is
 * strictly additive.
 */
function localeSuffix(locale: Locale): string {
  return locale === DEFAULT_LOCALE ? '' : `${locale[0].toUpperCase()}${locale.slice(1)}`;
}

/**
 * `tName` in English, `tNameRu` in Russian - **both carried on the same feature**.
 *
 * This is the whole reason a language switch is cheap. The alternative was one
 * `FeatureCollection` per locale and swapping `<GeoJSONSource data>`, which CLAUDE.md names
 * the riskiest unproven operation in the app: nothing here had ever replaced a live map's
 * source until mastery did, and doing it on every language change would put that on the
 * critical path of a settings toggle.
 *
 * Baking both languages onto one source instead means switching locale changes only the
 * layer's `text-field` and `filter` - a layout-property change, the identical code path the
 * label-field picker already uses, with no re-upload at all. The cost is ~10 extra small
 * properties per feature on 240 features.
 */
export function textPropertyFor(
  field: Exclude<LabelField, 'none'>,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return `t${field[0].toUpperCase()}${field.slice(1)}${localeSuffix(locale)}`;
}

/**
 * The fit threshold, which is **genuinely per-locale** rather than merely suffixed.
 *
 * "Соединённые Штаты Америки" is twice the width of "United States", so a Russian label
 * needs a higher zoom before it fits over the same country. Sharing one threshold would
 * either overhang badly in Russian or hide labels unnecessarily in English.
 */
export function zoomPropertyFor(
  field: Exclude<LabelField, 'none'>,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return `z${field[0].toUpperCase()}${field.slice(1)}${localeSuffix(locale)}`;
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
export function labelFilter(
  field: LabelField,
  locale: Locale = DEFAULT_LOCALE,
): ExpressionSpecification {
  // `flag` joins `none` here: it is drawn by the icon layer below, so the TEXT layer must be
  // off. Exactly one of the two filters ever matches anything.
  if (field === 'none' || field === 'flag') return NOTHING;

  return [
    'all',
    ['has', textPropertyFor(field, locale)],
    ['<=', ['get', zoomPropertyFor(field, locale)], ['zoom']],
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
export function labelTextField(
  field: LabelField,
  locale: Locale = DEFAULT_LOCALE,
): ExpressionSpecification | string {
  if (field === 'none' || field === 'flag') return '';
  return ['get', textPropertyFor(field, locale)] as unknown as ExpressionSpecification;
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
