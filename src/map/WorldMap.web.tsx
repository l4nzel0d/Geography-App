/**
 * `WorldMap`, drawn by MapLibre GL JS. The web half of the pair described in
 * `worldMapProps.ts`; Metro resolves this ahead of `WorldMap.tsx` for `platform=web`.
 *
 * ## Why this file exists at all
 *
 * `@maplibre/maplibre-react-native` is Android/iOS only. It is not merely unsupported on
 * web - it calls `codegenNativeComponent`, which `react-native-web` does not export, and
 * one such import poisons the ENTIRE web build, including the static-render pass, which
 * then fails every route rather than only the one holding a map. So the web bundle must
 * never resolve it, which is exactly what a `.web.tsx` sibling guarantees.
 *
 * ## What is shared, and what is not
 *
 * Everything above the renderer is shared and unmodified: `worldGeoJson`, `labelGeoJson`,
 * `CHOROPLETH_RAMPS`, `labelFilter`/`labelTextField`, `getWorldFitZoom`, `pickCountry`
 * and the whole of `quizCamera.ts`. Every paint, layout and filter value below is the
 * SAME object the native component hands to MapLibre Native - the style spec is the
 * portability layer, and that is the reason this port is small.
 *
 * What differs is only the shape of the API: declarative React children on native,
 * imperative `addLayer`/`setFilter`/`setPaintProperty` here.
 */
import { useFonts } from 'expo-font';
// Named imports only - maplibre-gl v6 is ESM-only and has NO default export.
import {
  type ExpressionSpecification,
  type FilterSpecification,
  Map as MapLibreMap,
  type MapGeoJSONFeature,
  setWorkerUrl,
  type StyleSpecification,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { labelGeoJson } from '@/data/labelGeoJson';
import type { CountryFeatureProperties } from '@/data/types';
import { worldGeoJson } from '@/data/worldGeoJson';

import { getWorldFitZoom } from './cameraFit';
import { CHOROPLETH_RAMPS } from './choropleth';
import { labelFilter, labelTextField, RANK_PROPERTY } from './mapLabels';
import { LABEL_FONT, mapColors, WEB_OFFLINE_STYLE } from './offlineStyle';
import { pickCountry } from './pickCountry';
import {
  DEFAULT_MAX_ZOOM,
  INITIAL_CENTER,
  PRESS_HITBOX_DP,
  type WorldMapProps,
} from './worldMapProps';

export {
  DEFAULT_MAX_ZOOM,
  type FillMode,
  INITIAL_CENTER,
  INITIAL_ZOOM,
  PRESS_HITBOX_DP,
  type WorldMapProps,
} from './worldMapProps';

/**
 * Where the MapLibre web worker lives, and why we have to say.
 *
 * maplibre-gl derives its worker URL from `import.meta.url`, and bails when that is not
 * an http URL - which is exactly what Metro serves. The default therefore resolves to
 * the empty string and the Worker constructor throws. maplibre cannot render a single
 * tile without its worker, so without this the map is simply blank, and the console
 * error points at a Worker constructor rather than at anything recognisable.
 *
 * `scripts/copy-web-assets.mjs` puts the worker AND the shared chunk it imports into
 * `public/maplibre/`. Both are required, side by side: the worker imports
 * `./maplibre-gl-shared.mjs`, resolved against its own URL.
 */
const WORKER_URL = '/maplibre/maplibre-gl-worker.mjs';

/** Layer ids in DRAW ORDER. Mirrors the native component's child order exactly. */
const COUNTRY_LAYERS = {
  fill: 'country-fill',
  selected: 'country-selected',
  border: 'country-border',
  casing: 'country-selected-casing',
  outline: 'country-selected-outline',
  label: 'country-label',
} as const;

const COUNTRIES_SOURCE = 'countries';
const LABELS_SOURCE = 'country-labels';

/**
 * The two renderers are typed by different majors of `@maplibre/maplibre-gl-style-spec`
 * (24.8.5 for maplibre-react-native, 26.4.0 bundled with maplibre-gl), so the shared
 * expression builders in `choropleth.ts` and `mapLabels.ts` are nominally - not
 * structurally - incompatible here. They are the same JSON either way. These casts are
 * the entire cost of that, deliberately kept in one place rather than sprinkled through
 * the call sites.
 */
const asExpression = (value: unknown) => value as ExpressionSpecification;
const asFilter = (value: unknown) => value as FilterSpecification;

/** The selection filter, matching nothing when the empty string is handed in. */
const selectionFilter = (iso3: string | null | false) =>
  asFilter(['==', ['get', 'iso3'], iso3 || '']);

export function WorldMap({
  selectedIso3,
  onSelect,
  fillMode = 'flat',
  selectionColor,
  camera,
  maxZoom = DEFAULT_MAX_ZOOM,
  labelField = 'none',
}: WorldMapProps) {
  const containerRef = useRef<View | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [ready, setReady] = useState(false);

  // Same derivation as native: landscape is wider than one world at zoom 0, so the floor
  // comes from the window rather than being pinned to INITIAL_ZOOM.
  const fitZoom = getWorldFitZoom(useWindowDimensions().width);

  /**
   * `expo-font`'s CONFIG PLUGIN is Android/iOS only, but its runtime hook works on web,
   * where it registers a real CSS font-face. The family it registers is `LABEL_FONT`,
   * which is the same name the label layer's `text-font` asks for - and with no `glyphs`
   * URL in the style, that name is what maplibre hands to canvas. See offlineStyle.ts.
   */
  const [fontLoaded] = useFonts({
    [LABEL_FONT]: require('../../assets/fonts/NotoSans-Regular.ttf'),
  });

  /**
   * Props reached from listeners that are registered exactly once.
   *
   * Written in an EFFECT rather than during render: `app.json` sets `reactCompiler: true`
   * and a ref written during render is not safe under it. Same reason, same shape, as the
   * `handleBackRef` in `quiz/play.tsx`.
   */
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });

  // --- create the map exactly once -----------------------------------------------
  useEffect(() => {
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node) return;

    setWorkerUrl(WORKER_URL);

    const map = new MapLibreMap({
      container: node,
      style: WEB_OFFLINE_STYLE as unknown as StyleSpecification,
      center: INITIAL_CENTER,
      zoom: fitZoom,
      minZoom: fitZoom,
      maxZoom,
      // maplibre-gl adds no controls unless asked, so this covers the native component's
      // attribution / logo / compass / scaleBar booleans in one line.
      attributionControl: false,
      // = touchRotate={false} / touchPitch={false} on native.
      dragRotate: false,
      pitchWithRotate: false,
      // Free on desktop, and absent from native by necessity: arrow-key pan, +/- zoom.
      keyboard: true,
    });
    map.touchZoomRotate.disableRotation();

    // = onDidFailLoadingMap.
    map.on('error', (event) => console.error('[WorldMap] map failed to load', event.error));

    /**
     * One click handler replaces the native component's THREE-part press chain, and the
     * simplification is structural rather than a shortcut:
     *
     * - native `GeoJSONSource.onPress` must call `event.stopPropagation()` or the source
     *   press bubbles to `Map.onPress` and the ocean handler clears the selection that
     *   was just made. On web there is no bubbling model - one `click` event, and nothing
     *   to stop. Do not "restore" stopPropagation here; there is nothing to stop.
     * - ocean-deselect is the SAME path, not a second handler: an empty candidate list
     *   makes `pickCountry` return `null`, which is exactly what deselect means.
     *
     * Only `country-fill` is queried. It covers every country, and adding the other
     * layers would return the same features several times over.
     */
    map.on('click', (event) => {
      const select = onSelectRef.current;
      // Absence of a handler still means a read-only map, which is what quiz mode wants.
      if (!select) return;
      // Layers are added on 'load', which is later than the first events can arrive.
      // queryRenderedFeatures THROWS on a layer that does not exist yet.
      if (!map.getLayer(COUNTRY_LAYERS.fill)) return;

      const { x, y } = event.point;
      const candidates = map
        .queryRenderedFeatures(
          [
            [x - PRESS_HITBOX_DP, y - PRESS_HITBOX_DP],
            [x + PRESS_HITBOX_DP, y + PRESS_HITBOX_DP],
          ],
          { layers: [COUNTRY_LAYERS.fill] },
        )
        .map(
          (f: MapGeoJSONFeature) => (f.properties as CountryFeatureProperties | undefined)?.iso3,
        );

      // maplibre hands back a LngLat OBJECT; pickCountry takes a tuple. This is the only
      // place the two platforms' press payloads genuinely differ.
      select(pickCountry([event.lngLat.lng, event.lngLat.lat], candidates));
    });

    // Desktop affordance with no native counterpart: the pointer says what is clickable.
    map.on('mousemove', (event) => {
      // Same guard as the click handler: a mouse can cross the map before 'load'.
      if (!map.getLayer(COUNTRY_LAYERS.fill)) return;
      const over = map.queryRenderedFeatures(event.point, { layers: [COUNTRY_LAYERS.fill] });
      map.getCanvas().style.cursor = over.length ? 'pointer' : '';
    });

    map.once('load', () => {
      map.addSource(COUNTRIES_SOURCE, { type: 'geojson', data: worldGeoJson as never });

      // Every addLayer names its source explicitly. The native <Layer> children inherit
      // it from the parent <GeoJSONSource> through context; there is no such context here.
      map.addLayer({
        id: COUNTRY_LAYERS.fill,
        type: 'fill',
        source: COUNTRIES_SOURCE,
        paint: { 'fill-color': mapColors.land, 'fill-opacity': 1 },
      });
      map.addLayer({
        id: COUNTRY_LAYERS.selected,
        type: 'fill',
        source: COUNTRIES_SOURCE,
        filter: selectionFilter(null),
        paint: { 'fill-color': mapColors.landSelected, 'fill-opacity': 1 },
      });
      map.addLayer({
        id: COUNTRY_LAYERS.border,
        type: 'line',
        source: COUNTRIES_SOURCE,
        paint: { 'line-color': mapColors.border, 'line-width': 0.5, 'line-opacity': 0.6 },
      });
      // After country-border, so the outline draws over it and the casing under the white
      // line. Two lines because the ramp spans near-white to deep maroon.
      map.addLayer({
        id: COUNTRY_LAYERS.casing,
        type: 'line',
        source: COUNTRIES_SOURCE,
        filter: selectionFilter(null),
        paint: { 'line-color': mapColors.selectionCasing, 'line-width': 5 },
      });
      map.addLayer({
        id: COUNTRY_LAYERS.outline,
        type: 'line',
        source: COUNTRIES_SOURCE,
        filter: selectionFilter(null),
        paint: { 'line-color': mapColors.selectionOutline, 'line-width': 2 },
      });

      // Labels live on their OWN point source, and carry no click handler, so presses
      // fall through to the outlines and pickCountry is unaffected. See labelGeoJson.ts
      // for why one point per country rather than a symbol layer on the polygons.
      map.addSource(LABELS_SOURCE, { type: 'geojson', data: labelGeoJson as never });

      setReady(true);
    });

    mapRef.current = map;
    return () => {
      // Not tidiness: a leaked WebGL context per mount eventually gets the OLDEST context
      // dropped by the browser, which looks exactly like the emulator's black-map bug.
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Created once. fitZoom/maxZoom changes are applied by the effects below instead, so
    // that a rotation or a resize never tears down the GL context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- the label layer waits for the font ----------------------------------------
  /**
   * Added only once the family is in `document.fonts`. maplibre rasterises each glyph
   * lazily on the symbol layer's first render and CACHES the bitmap, so a layer added
   * before the font resolves would draw in a fallback face and keep it forever.
   */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !fontLoaded || map.getLayer(COUNTRY_LAYERS.label)) return;

    map.addLayer({
      id: COUNTRY_LAYERS.label,
      type: 'symbol',
      source: LABELS_SOURCE,
      filter: asFilter(labelFilter(labelField)),
      layout: {
        'text-field': asExpression(labelTextField(labelField)),
        'text-font': [LABEL_FONT],
        'text-size': ['interpolate', ['linear'], ['zoom'], 0, 11, 6, 14],
        // Must match TEXT_MAX_WIDTH_EM in labelFit.ts.
        'text-max-width': 8,
        // The collision half of decluttering; MapLibre drops overlapping labels itself.
        'text-allow-overlap': false,
        'text-padding': 2,
        // Widest country wins a collision; negated in labelGeoJson.ts.
        'symbol-sort-key': ['get', RANK_PROPERTY],
      },
      paint: {
        'text-color': mapColors.labelText,
        'text-halo-color': mapColors.labelHalo,
        'text-halo-width': 1.2,
      },
    });
  }, [ready, fontLoaded, labelField]);

  // --- fill mode and selection ---------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;

    map.setPaintProperty(
      COUNTRY_LAYERS.fill,
      'fill-color',
      fillMode === 'flat' ? mapColors.land : asExpression(CHOROPLETH_RAMPS[fillMode].fillColor),
    );
    map.setPaintProperty(
      COUNTRY_LAYERS.selected,
      'fill-color',
      selectionColor ?? mapColors.landSelected,
    );

    // Flat mode marks selection with a solid fill; the choropleth marks it with an
    // outline, because filling it would hide the very value you clicked to inspect. Both
    // layers stay mounted and the mode is expressed by handing the iso3 to only one.
    map.setFilter(COUNTRY_LAYERS.selected, selectionFilter(fillMode === 'flat' && selectedIso3));
    const outline = selectionFilter(fillMode !== 'flat' && selectedIso3);
    map.setFilter(COUNTRY_LAYERS.casing, outline);
    map.setFilter(COUNTRY_LAYERS.outline, outline);
  }, [ready, fillMode, selectedIso3, selectionColor]);

  // --- label field ---------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer(COUNTRY_LAYERS.label)) return;
    map.setFilter(COUNTRY_LAYERS.label, asFilter(labelFilter(labelField)));
    map.setLayoutProperty(
      COUNTRY_LAYERS.label,
      'text-field',
      asExpression(labelTextField(labelField)),
    );
  }, [ready, labelField]);

  // --- zoom bounds ---------------------------------------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setMinZoom(fitZoom);
    if (map.getZoom() < fitZoom) map.setZoom(fitZoom);
  }, [fitZoom]);

  useEffect(() => {
    mapRef.current?.setMaxZoom(maxZoom);
  }, [maxZoom]);

  // --- the camera ----------------------------------------------------------------
  /**
   * Keyed on the stop's IDENTITY, which reproduces both invariants the native `Camera`
   * documents, rather than merely tolerating them:
   *
   * - referentially stable stops do not re-fire - and an equal-but-NEW object does, which
   *   is what `MapScreen`'s `focus.nonce` relies on to fly to the same country twice, and
   *   what a stop rebuilt on every keystroke would trip over.
   * - a withdrawn stop is a no-op rather than a prop change pushed at the renderer.
   *
   * The native reason for the second rule (prop diffing into a renderer Jest replaces
   * with a stub) does not apply on web - but do NOT relax `MapScreen`'s `useState` stop
   * into a `useMemo` on that basis. Android still needs it.
   */
  const lastStop = useRef<typeof camera>(undefined);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !camera || camera === lastStop.current) return;
    lastStop.current = camera;

    const { center, zoom, duration, easing } = camera;
    if (!duration) map.jumpTo({ center, zoom });
    else if (easing === 'fly') map.flyTo({ center, zoom, duration });
    else if (easing === 'linear') map.easeTo({ center, zoom, duration, easing: (t) => t });
    else map.easeTo({ center, zoom, duration });
  }, [camera]);

  // --- container resize ----------------------------------------------------------
  /**
   * maplibre only watches `window.resize`, which does not fire when the map's own box
   * changes without the window changing - quiz mode's flex-sibling panel, or a desktop
   * sidebar opening. On native this is RN's layout pass and needs no help.
   */
  useEffect(() => {
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => mapRef.current?.resize());
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <View testID="world-map" ref={containerRef} style={styles.map} />;
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
