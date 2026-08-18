import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { StyleSheet, useWindowDimensions } from 'react-native';

import type { CountryFeatureProperties } from '@/data/types';
import { worldGeoJson } from '@/data/worldGeoJson';

import { getWorldFitZoom } from './cameraFit';
import { CHOROPLETH_RAMPS, type ChoroplethMode } from './choropleth';
import { mapColors, OFFLINE_STYLE } from './offlineStyle';
import { pickCountry } from './pickCountry';
import type { MapCameraStop } from './quizCamera';

/**
 * Fixed starting viewport.
 *
 * Deliberately a constant rather than a fit-to-content calculation - Maestro taps
 * the map by screen percentage, so the same percentage must land on the same
 * country on every run. Changing this invalidates the E2E flows.
 *
 * Not `bounds`: fitting [-180,-60,180,85] on a tall phone fills the screen height
 * with the latitude range and crops most of the longitude range, so half the world
 * is off-screen. An explicit centre and zoom is predictable on any screen shape.
 */
export const INITIAL_CENTER: [number, number] = [10, 20];

/**
 * Portrait baseline. The effective floor is `getWorldFitZoom(width)`, which is exactly
 * this in portrait and higher in landscape - see cameraFit.ts.
 */
export const INITIAL_ZOOM = 0;

/**
 * How the land is coloured: the flat basemap, or one of the choropleth ramps in
 * `choropleth.ts`. Adding a ramp there is all it takes to add a mode here.
 */
export type FillMode = 'flat' | ChoroplethMode;

/** Highest zoom the explore map allows. Quiz mode passes its own; see quiz/play.tsx. */
const DEFAULT_MAX_ZOOM = 8;

type WorldMapProps = {
  selectedIso3: string | null;
  /**
   * Omit to make the map read-only: no press handler is attached at all, which is what
   * quiz mode wants - tapping the answer out of the map would rather defeat it.
   */
  onSelect?: (iso3: string | null) => void;
  fillMode?: FillMode;
  /**
   * Overrides `mapColors.landSelected` on the highlight fill. Quiz mode swaps this from
   * yellow to green or red once an answer is graded.
   */
  selectionColor?: string;
  /**
   * A declarative camera stop. When absent the camera sits at `INITIAL_CENTER` and never
   * moves, which is what every Maestro percentage tap depends on - see CLAUDE.md.
   *
   * **Must be referentially stable.** `Camera` is memoised and rebuilds its stop from
   * these props, so a freshly-allocated object each render re-fires the animation on
   * every keystroke. Callers should `useMemo` it.
   */
  camera?: MapCameraStop;
  maxZoom?: number;
};

export function WorldMap({
  selectedIso3,
  onSelect,
  fillMode = 'flat',
  selectionColor,
  camera,
  maxZoom = DEFAULT_MAX_ZOOM,
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
        hitbox={{ top: 10, right: 10, bottom: 10, left: 10 }}
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
    </Map>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
