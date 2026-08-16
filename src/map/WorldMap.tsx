import { Camera, GeoJSONSource, Layer, Map } from '@maplibre/maplibre-react-native';
import { StyleSheet } from 'react-native';

import worldGeoJson from '@/data/countries.geo.json';
import type { CountryFeatureProperties } from '@/data/types';

import { mapColors, OFFLINE_STYLE } from './offlineStyle';

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
export const INITIAL_ZOOM = 0;

type WorldMapProps = {
  selectedIso3: string | null;
  onSelect: (iso3: string | null) => void;
};

export function WorldMap({ selectedIso3, onSelect }: WorldMapProps) {
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
      onPress={() => onSelect(null)}
      onDidFailLoadingMap={() => console.error('[WorldMap] map failed to load')}
    >
      <Camera
        initialViewState={{ center: INITIAL_CENTER, zoom: INITIAL_ZOOM }}
        minZoom={INITIAL_ZOOM}
        maxZoom={8}
      />

      <GeoJSONSource
        id="countries"
        data={worldGeoJson as GeoJSON.FeatureCollection}
        onPress={(event) => {
          // Source presses bubble up to Map.onPress. Without this the ocean handler
          // below fires immediately afterwards and clears the selection we just made,
          // so nothing ever appears to be selected.
          event.stopPropagation();

          const feature = event.nativeEvent.features[0];
          const props = feature?.properties as CountryFeatureProperties | undefined;
          onSelect(props?.iso3 ?? null);
        }}
      >
        <Layer
          id="country-fill"
          type="fill"
          paint={{ 'fill-color': mapColors.land, 'fill-opacity': 1 }}
        />

        {/*
          Selection highlight is a filtered layer rather than feature-state: it is
          simpler and reliably supported. An empty string matches nothing, which is
          how "no selection" is expressed.
        */}
        <Layer
          id="country-selected"
          type="fill"
          filter={['==', ['get', 'iso3'], selectedIso3 ?? '']}
          paint={{ 'fill-color': mapColors.landSelected, 'fill-opacity': 1 }}
        />

        <Layer
          id="country-border"
          type="line"
          paint={{ 'line-color': mapColors.border, 'line-width': 0.5, 'line-opacity': 0.6 }}
        />
      </GeoJSONSource>
    </Map>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
