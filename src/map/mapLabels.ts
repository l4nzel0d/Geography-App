import type { ExpressionSpecification } from '@maplibre/maplibre-gl-style-spec';

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

/** `none` is a real state - the default - not the absence of one. */
export type LabelField =
  | 'none'
  | 'name'
  | 'capital'
  | 'languages'
  | 'currencies'
  | 'population';

/** Every field except `none`, i.e. the ones that actually have text on a feature. */
export type LabelFieldId = Exclude<LabelField, 'none'>;

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
 */
export function textPropertyFor(field: LabelFieldId): string {
  return `t${field[0].toUpperCase()}${field.slice(1)}`;
}

export function zoomPropertyFor(field: LabelFieldId): string {
  return `z${field[0].toUpperCase()}${field.slice(1)}`;
}

/** Sort key property: `symbol-sort-key`, lower placed first. See `labelGeoJson.ts`. */
export const RANK_PROPERTY = 'rank';

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
  if (field === 'none') return ['==', ['get', 'iso3'], ''];

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
  if (field === 'none') return '';
  return ['get', textPropertyFor(field)] as unknown as ExpressionSpecification;
}
