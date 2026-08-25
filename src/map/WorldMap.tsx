import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { StyleSheet, useWindowDimensions } from 'react-native';

import type { CountryFeatureProperties } from '@/data/types';
import { labelGeoJson } from '@/data/labelGeoJson';
import { worldGeoJson } from '@/data/worldGeoJson';

import { getWorldFitZoom } from './cameraFit';
import { CHOROPLETH_RAMPS } from './choropleth';
import { labelFilter, labelTextField, RANK_PROPERTY } from './mapLabels';
import { LABEL_FONT, mapColors, OFFLINE_STYLE } from './offlineStyle';
import { pickCountry } from './pickCountry';
import {
  DEFAULT_MAX_ZOOM,
  INITIAL_CENTER,
  PRESS_HITBOX_DP,
  type WorldMapProps,
} from './worldMapProps';

/*
 * The props, the camera constants and the hitbox now live in `worldMapProps.ts`, shared
 * with `WorldMap.web.tsx` so the two implementations cannot drift. They are re-exported
 * here because callers and tests have always imported them from this module.
 */
export {
  DEFAULT_MAX_ZOOM,
  type FillMode,
  INITIAL_CENTER,
  INITIAL_ZOOM,
  PRESS_HITBOX_DP,
  type WorldMapProps,
} from './worldMapProps';

export function WorldMap({
  selectedIso3,
  onSelect,
  fillMode = 'flat',
  selectionColor,
  revealIso3,
  revealColor,
  camera,
  maxZoom = DEFAULT_MAX_ZOOM,
  labelField = 'none',
}: WorldMapProps) {
  // Landscape is wider than one world at zoom 0, so the floor is derived from the
  // window rather than pinned to INITIAL_ZOOM. Without this a cold launch into
  // landscape renders the world tiled ~1.8 times over.
  const fitZoom = getWorldFitZoom(useWindowDimensions().width);

  // The choropleth marks selection with an outline rather than a fill; both marker
  // layers share this filter, and it is empty - matching nothing - in flat mode.
  const outlineFilter: ['==', ['get', 'iso3'], string] = [
    '==',
    ['get', 'iso3'],
    (fillMode !== 'flat' && selectedIso3) || '',
  ];

  return (
    <Map
      testID="world-map"
      style={styles.map}
      mapStyle={OFFLINE_STYLE}
      attribution={false}
      logo={false}
      compass={false}
      scaleBar={false}
      touchRotate={false}
      touchPitch={false}
      // Fires only when the press did not hit a country - i.e. the ocean.
      onPress={onSelect ? () => onSelect(null) : undefined}
      onDidFailLoadingMap={() => console.error('[WorldMap] map failed to load')}
    >
      {/*
        Spreading `undefined` adds no keys, so with no `camera` prop this is exactly the
        three props it has always been and the camera never moves. `initialViewState`
        stays either way: it supplies frame one while the first stop is still animating,
        which also sidesteps the imperative CameraRef's throw when the native view is
        not ready yet.
      */}
      <Camera
        testID="map-camera"
        initialViewState={{ center: INITIAL_CENTER, zoom: fitZoom }}
        minZoom={fitZoom}
        maxZoom={maxZoom}
        {...(camera ?? {})}
      />

      <GeoJSONSource
        id="countries"
        data={worldGeoJson}
        // MapLibre's default is 44dp, which at zoom 0 spans ~30 degrees of longitude
        // and drags half a continent into every press. 10dp keeps enough slack for a
        // fingertip while letting `pickCountry` resolve by containment, and it means a
        // press in open water yields no candidates at all so the ocean handler can
        // deselect. See pickCountry.ts.
        hitbox={{
          top: PRESS_HITBOX_DP,
          right: PRESS_HITBOX_DP,
          bottom: PRESS_HITBOX_DP,
          left: PRESS_HITBOX_DP,
        }}
        onPress={(event) => {
          if (!onSelect) return;

          // Source presses bubble up to Map.onPress. Without this the ocean handler
          // below fires immediately afterwards and clears the selection we just made,
          // so nothing ever appears to be selected.
          event.stopPropagation();

          // The hitbox returns every country it touches, not just the one under the
          // finger, so the candidates have to be resolved against the pressed
          // coordinate. See pickCountry.ts.
          const candidates = event.nativeEvent.features.map(
            (f) => (f.properties as CountryFeatureProperties | undefined)?.iso3,
          );
          onSelect(pickCountry(event.nativeEvent.lngLat, candidates));
        }}
      >
        <Layer
          id="country-fill"
          type="fill"
          paint={{
            'fill-color':
              fillMode === 'flat' ? mapColors.land : CHOROPLETH_RAMPS[fillMode].fillColor,
            'fill-opacity': 1,
          }}
        />

        {/*
          Selection highlight is a filtered layer rather than feature-state: it is
          simpler and reliably supported. An empty string matches nothing, which is
          how "no selection" is expressed.

          There are two of these because a solid orange fill would hide the country's
          ramp colour - the thing you tapped to inspect - so the choropleth modes mark
          selection with an outline instead. Both layers stay mounted and the mode is
          expressed by handing the iso3 to only one of them, reusing the same
          "empty string matches nothing" idiom rather than adding and removing layers.
        */}
        <Layer
          id="country-selected"
          type="fill"
          filter={['==', ['get', 'iso3'], (fillMode === 'flat' && selectedIso3) || '']}
          paint={{
            'fill-color': selectionColor ?? mapColors.landSelected,
            'fill-opacity': 1,
          }}
        />

        {/*
          The answer, in `locate` mode. Drawn after the selection so that the one case
          where both name the same country - a correct guess - resolves to the reveal
          colour rather than depending on which layer happens to be on top.
        */}
        <Layer
          id="country-reveal"
          type="fill"
          filter={['==', ['get', 'iso3'], (fillMode === 'flat' && revealIso3) || '']}
          paint={{
            'fill-color': revealColor ?? mapColors.quizCorrect,
            'fill-opacity': 1,
          }}
        />

        <Layer
          id="country-border"
          type="line"
          paint={{ 'line-color': mapColors.border, 'line-width': 0.5, 'line-opacity': 0.6 }}
        />

        {/*
          Last, so the outline draws over country-border rather than under it, and the
          casing draws under the white line. Two lines because the ramp spans near-white
          to deep maroon - see mapColors.selectionCasing.
        */}
        <Layer
          id="country-selected-casing"
          type="line"
          filter={outlineFilter}
          paint={{ 'line-color': mapColors.selectionCasing, 'line-width': 5 }}
        />

        <Layer
          id="country-selected-outline"
          type="line"
          filter={outlineFilter}
          paint={{ 'line-color': mapColors.selectionOutline, 'line-width': 2 }}
        />

      </GeoJSONSource>

      {/*
        Labels live on their OWN point source, not on the outlines above.

        MapLibre labels a polygon at its pole of inaccessibility, which is a good anchor
        but is computed **per polygon**: France is a MultiPolygon of the mainland plus
        five overseas departments, so it would be labelled six times, once in South
        America. See `data/labelGeoJson.ts`.

        Mounted in every mode, including 'none', where `labelFilter` returns the same
        empty-string-matches-nothing filter the selection layers use. Nothing is added to
        or removed from the map at runtime.

        No `onPress`: the source is decoration, and presses must keep reaching the
        outlines below so `pickCountry` still resolves them.
      */}
      <GeoJSONSource id="country-labels" data={labelGeoJson}>
        <Layer
          id="country-label"
          type="symbol"
          filter={labelFilter(labelField)}
          layout={{
            'text-field': labelTextField(labelField),
            // Must name a key of the style's `font-faces`; see offlineStyle.ts.
            'text-font': [LABEL_FONT],
            // Grows a little with zoom: 11 is the floor at which the halo still reads at
            // world scale, and by zoom 6 there is room for something more comfortable.
            'text-size': ['interpolate', ['linear'], ['zoom'], 0, 11, 6, 14],
            // Must match TEXT_MAX_WIDTH_EM in labelFit.ts - the fit estimate caps the
            // label's width here, because past this point long text wraps rather than
            // growing wider.
            'text-max-width': 8,
            // The collision half of decluttering, and the reason this is a native symbol
            // layer rather than RN views: MapLibre drops overlapping labels itself, at
            // 60fps, with no projection maths on our side.
            'text-allow-overlap': false,
            'text-padding': 2,
            // Widest country wins a collision. Negated in labelGeoJson.ts because the
            // lowest sort key is placed first.
            'symbol-sort-key': ['get', RANK_PROPERTY],
          }}
          paint={{
            'text-color': mapColors.labelText,
            // Not decoration. The land underneath ranges from mid-green through
            // near-white to deep maroon depending on the fill mode, and no single text
            // colour reads against all three without a contrasting halo.
            'text-halo-color': mapColors.labelHalo,
            'text-halo-width': 1.2,
          }}
        />
      </GeoJSONSource>
    </Map>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
