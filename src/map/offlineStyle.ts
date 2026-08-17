import type { StyleSpecification } from '@maplibre/maplibre-react-native';

export const mapColors = {
  ocean: '#0d2b45',
  land: '#7d9b76',
  landSelected: '#f2a65a',
  border: '#0d2b45',
  /**
   * Selection marker for the choropleth, where filling the country solid would hide
   * the very value you tapped to inspect. An outline instead of a fill.
   *
   * Two colours because both ramps run from near-white to a very dark stop: a white
   * line vanishes on Mongolia and a dark one vanishes on China, so the white line is
   * drawn over a wider dark casing and reads against either end of either ramp.
   */
  selectionOutline: '#ffffff',
  selectionCasing: '#0d2b45',
} as const;

/**
 * A deliberately tile-free basemap.
 *
 * `sources` is empty and there is no `glyphs` or `sprite` entry, so MapLibre has
 * nothing to fetch and never touches the network. Country geometry is supplied at
 * runtime by a local `GeoJSONSource` in `WorldMap.tsx`.
 *
 * Adding a tile source, a `glyphs` URL, or any symbol layer here would break the
 * offline requirement. See CLAUDE.md.
 */
export const OFFLINE_STYLE: StyleSpecification = {
  version: 8,
  name: 'geography-app-offline',
  sources: {},
  layers: [
    {
      id: 'ocean',
      type: 'background',
      paint: { 'background-color': mapColors.ocean },
    },
  ],
};
