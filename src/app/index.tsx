import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CountryInfoSheet } from '@/components/CountryInfoSheet';
import { getMapFocusRect } from '@/components/infoSheetLayout';
import { useDismissKey } from '@/components/useDismissKey';
import { useWindowSize } from '@/components/useWindowSize';
import { MapControls } from '@/components/MapControls';
import { getViewportFitZoom } from '@/map/cameraFit';
import { getCountryBounds } from '@/map/countryBounds';
import type { LabelField } from '@/map/mapLabels';
import { mapColors } from '@/map/offlineStyle';
import { getFocusedCameraStop, type MapCameraStop } from '@/map/quizCamera';
import { type FillMode, WorldMap } from '@/map/WorldMap';
import { subscribeToCountrySelection } from '@/search/pendingCountry';

/** Matches `WorldMap`'s own ceiling, so the stop is never clamped by the native camera. */
const EXPLORE_MAX_ZOOM = 10;

/** Long enough to read as travel across the globe, short enough not to be a wait. */
const SEARCH_CAMERA_DURATION = 900;

export default function MapScreen() {
  const [selectedIso3, setSelectedIso3] = useState<string | null>(null);
  const [fillMode, setFillMode] = useState<FillMode>('flat');

  /**
   * Which fact is drawn on top of every country. Independent of `fillMode` on purpose:
   * a density choropleth with capital labels over it is a legal, useful combination.
   */
  const [labelField, setLabelField] = useState<LabelField>('none');

  /**
   * The country a SEARCH asked us to frame - never one the user tapped.
   *
   * The nonce is what makes searching the same country twice fly again. Without it the
   * recompute below produces an equal stop, and an equal stop is not a change.
   */
  const [focus, setFocus] = useState<{ iso3: string; nonce: number } | null>(null);

  /**
   * The stop itself lives in state rather than in a `useMemo`, for one reason: it must
   * never be WITHDRAWN. `WorldMap` spreads `{...(camera ?? {})}` onto the native camera,
   * so handing back `undefined` after a stop would take the native `stop` prop from
   * {center, zoom, duration, easing} to {} - a real prop change pushed into the renderer,
   * and exactly the class of thing that cannot be verified off-device. Clearing `focus`
   * therefore only stops the recompute; the last stop stays put, same object, so nothing
   * re-fires.
   */
  const [camera, setCamera] = useState<MapCameraStop | undefined>(undefined);

  /**
   * `useWindowSize`, not `useWindowDimensions`: this feeds the search camera, whose whole
   * job is to offset by a pixel distance measured against the box MapLibre draws into.
   * RN Web's window can lag the real layout, and framing against a stale height puts the
   * country off centre until something else forces a re-render. See the hook.
   */
  const window = useWindowSize();

  /**
   * How tall the info card actually is, once it has laid out.
   *
   * A REF, not state, and deliberately absent from the camera effect's dependencies: the
   * card measures itself as it opens, so making the camera react to that would recompute
   * the stop mid-flight and fire a second fly for every search. Each search reads
   * whatever the last measurement was, which is accurate because the card's content
   * barely varies between countries. Before the very first measurement the focus rect
   * falls back to `PORTRAIT_SHEET_HEIGHT_ESTIMATE`.
   */
  const sheetHeight = useRef<number | undefined>(undefined);
  // Only `top` is used, to keep the framed country clear of the chrome row.
  const insets = useSafeAreaInsets();

  useEffect(() => subscribeToCountrySelection((iso3) => {
    setSelectedIso3(iso3);
    setFocus((previous) => ({ iso3, nonce: (previous?.nonce ?? 0) + 1 }));
  }), []);

  useEffect(() => {
    if (!focus) return;

    const bounds = getCountryBounds(focus.iso3);
    // No outline to frame. The country is still selected and the sheet still opens; the
    // camera simply stays where it is. Unreachable via search - its index is built from
    // the geometry - which is why this is an early return rather than a `!`.
    if (!bounds) return;

    const viewport = { width: window.width, height: window.height };
    setCamera({
      ...getFocusedCameraStop({
        bbox: bounds.bbox,
        viewport,
        // Frame it into the band that is actually visible - below the toggle and the
        // pills, above the sheet - rather than into the middle of the window.
        focus: getMapFocusRect(viewport, insets.top, sheetHeight.current),
        minZoom: getViewportFitZoom(viewport.width, viewport.height),
        maxZoom: EXPLORE_MAX_ZOOM,
      }),
      duration: SEARCH_CAMERA_DURATION,
      // 'ease', not 'fly': fly arcs out to a great height and back, which reads as a far
      // longer journey than it is. Same reasoning as quiz/play.tsx.
      easing: 'ease',
    });
  }, [focus, window.width, window.height, insets.top]);

  /**
   * A press on the map hands the camera back to the user.
   *
   * Only the selection changes here. Dropping `focus` is what stops a later rotation -
   * which re-frames whatever is focused - from yanking the camera back to a country they
   * stopped looking at several gestures ago.
   */
  const select = useCallback((iso3: string | null) => {
    setSelectedIso3(iso3);
    setFocus(null);
  }, []);

  /**
   * Escape closes the card. A no-op on native, which has no Escape key and already has
   * the back gesture; on the web it is the convention a desktop user reaches for, and
   * the close button alone makes the app feel like a phone app on a monitor.
   */
  const clearSelection = useCallback(() => select(null), [select]);
  useDismissKey(clearSelection, selectedIso3 !== null);

  return (
    <View style={styles.container}>
      <WorldMap
        selectedIso3={selectedIso3}
        onSelect={select}
        fillMode={fillMode}
        camera={camera}
        maxZoom={EXPLORE_MAX_ZOOM}
        labelField={labelField}
      />
      <MapControls
        fillMode={fillMode}
        onFillModeChange={setFillMode}
        labelField={labelField}
        onLabelFieldChange={setLabelField}
      />
      <CountryInfoSheet
        iso3={selectedIso3}
        onClose={() => select(null)}
        onMeasured={(height) => {
          sheetHeight.current = height;
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: mapColors.ocean },
});
