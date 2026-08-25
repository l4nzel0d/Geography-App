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
import { StyleSheet, View } from 'react-native';

import { labelGeoJson } from '@/data/labelGeoJson';
import type { CountryFeatureProperties } from '@/data/types';
import { worldGeoJson } from '@/data/worldGeoJson';

import { useWindowSize } from '@/components/useWindowSize';

import { getWorldFitZoom } from './cameraFit';
import { CHOROPLETH_RAMPS } from './choropleth';
import { labelFilter, labelTextField, RANK_PROPERTY } from './mapLabels';
import { LABEL_FONT, mapColors, WEB_OFFLINE_STYLE } from './offlineStyle';
import { pickCountry } from './pickCountry';
import type { MapCameraStop } from './quizCamera';
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

/**
 * Move the camera to a stop, animating only when asked to.
 *
 * `animate: false` is not a preference - see the visibility handling in the component.
 */
function applyStop(map: MapLibreMap, stop: MapCameraStop, animate: boolean) {
  const { center, zoom, duration, easing } = stop;

  if (!animate || !duration) {
    map.jumpTo({ center, zoom });
    return;
  }

  if (easing === 'fly') map.flyTo({ center, zoom, duration });
  else if (easing === 'linear') map.easeTo({ center, zoom, duration, easing: (t) => t });
  else map.easeTo({ center, zoom, duration });
}

/**
 * How long after an animation should have ended before we place the camera outright.
 *
 * Long enough not to cut short an ease that is merely running a few frames behind, short
 * enough that a starved one is corrected before it reads as broken.
 */
const ARRIVAL_GRACE_MS = 250;

/**
 * Make MapLibre's transform agree with the element it draws into.
 *
 * Everything the camera does is expressed in viewport pixels, so a transform that
 * disagrees with the container silently invalidates every stop. Returns false when the
 * container has no size yet, which callers treat as "not safe to place the camera".
 */
function syncMapSize(map: MapLibreMap, node: HTMLElement | null): boolean {
  if (!node) return false;

  const { clientWidth: width, clientHeight: height } = node;
  // A zero-sized container is a transient - a screen mid-transition, or one the navigator
  // has collapsed. MapLibre does not treat it as one: it substitutes a 400x300 default
  // and keeps going, so passing it on is worse than ignoring it.
  if (width === 0 || height === 0) return false;

  const canvas = map.getCanvas();
  if (canvas.clientWidth !== width || canvas.clientHeight !== height) map.resize();

  return true;
}

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

  /**
   * Whether the container has been laid out yet.
   *
   * **The map must not be created before this is true.** Given a zero-sized container
   * maplibre does not wait and does not complain - it falls back to a 400x300 canvas and
   * carries on. Everything downstream is then computed against a viewport that does not
   * exist: `getWorldFitZoom(0)` gives a zoom floor of 0, and a camera stop meant to place
   * a country in a 704 dp-wide band gets applied to a 400 dp phantom, landing it far off
   * screen. It looks exactly like a framing bug and is not one.
   *
   * It also explains why resizing the window "fixed" it - that triggers `map.resize()`,
   * which finally gives the transform the real size - and why Android never showed it,
   * since a native view always has a size by the time it is handed over.
   */
  const [containerMeasured, setContainerMeasured] = useState(false);

  // Same derivation as native: landscape is wider than one world at zoom 0, so the floor
  // comes from the window rather than being pinned to INITIAL_ZOOM.
  const fitZoom = getWorldFitZoom(useWindowSize().width);

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

  // --- wait for the container to have a size ---------------------------------------
  useEffect(() => {
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node) return;

    const measure = () => {
      if (node.clientWidth > 0 && node.clientHeight > 0) setContainerMeasured(true);
    };

    // Usually already true: effects run after layout. Not always - a route that mounts
    // while its screen is still being animated in can measure zero on this pass.
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // --- create the map exactly once, once there is somewhere to put it ---------------
  useEffect(() => {
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node || !containerMeasured) return;

    setWorkerUrl(WORKER_URL);

    /**
     * Measured from the container rather than taken from `fitZoom`.
     *
     * `useWindowSize` reports the server's 0x0 on the first render so hydration matches,
     * and this effect closes over that first value - so creating the map with it would
     * start at zoom 0, draw the world tiled, and snap once the real size arrived. The
     * element is already laid out by the time effects run, so ask it.
     */
    const initialFitZoom = getWorldFitZoom(node.clientWidth || 0);

    const map = new MapLibreMap({
      container: node,
      style: WEB_OFFLINE_STYLE as unknown as StyleSpecification,
      center: INITIAL_CENTER,
      zoom: initialFitZoom,
      minZoom: initialFitZoom,
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

    /**
     * Opt-in diagnostic: load any route with `?debug` to get the live map on
     * `window.__geoMap`.
     *
     * Camera framing bugs are close to impossible to reason about from a screenshot -
     * "off centre" can mean a stale viewport, a starved animation, or a focus rect that
     * disagrees with the panel - and they are exactly the kind of thing that reproduces
     * on someone else's machine and not on yours. A read-only handle turns that into
     * numbers. Off unless asked for, so it costs nothing in normal use.
     */
    if (globalThis.location?.search.includes('debug')) {
      (globalThis as Record<string, unknown>).__geoMap = map;
    }
    return () => {
      // Not tidiness: a leaked WebGL context per mount eventually gets the OLDEST context
      // dropped by the browser, which looks exactly like the emulator's black-map bug.
      map.remove();
      mapRef.current = null;
      setReady(false);
    };
    // Created once, as soon as the container has a size. fitZoom/maxZoom changes are
    // applied by the effects below instead, so a rotation or resize never tears down the
    // GL context.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerMeasured]);

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

  /**
   * The stop we have asked for but not yet arrived at. Cleared by `moveend`, so it is
   * non-null exactly while a camera animation is outstanding. See the visibility effect.
   */
  const pendingStop = useRef<typeof camera>(undefined);

  useEffect(() => {
    if (!camera || camera === lastStop.current) return;
    lastStop.current = camera;
    pendingStop.current = camera;

    /**
     * The map may not exist yet, and the stop must NOT be dropped when it does not.
     *
     * Quiz mode hands over its first stop as the screen mounts - before the container has
     * been measured and therefore before the map has been built - so a plain early return
     * threw the opening question's framing away. The round then began at the world view
     * and only jumped to the country when something else produced a fresh stop, which is
     * why resizing the window "fixed" it: that rebuilds `mapViewport`, and a new stop
     * object re-enters here with a map to apply it to.
     *
     * Recorded above as `pendingStop`, so whichever of the two effects below gets there
     * first - the map being created, or the container gaining a size - places it.
     */
    const map = mapRef.current;
    if (!map) return;

    /**
     * **Animate only when there are frames to animate in, and guarantee arrival either
     * way.**
     *
     * `easeTo` and `flyTo` are driven by `requestAnimationFrame`, which the browser
     * suspends or throttles for a tab that is hidden, occluded, backgrounded, or simply
     * on a busy machine. A starved animation strands the camera between the launch view
     * and the target: measured here, the map sat at the launch camera with
     * `isMoving() === true` a full two seconds into a 900 ms ease. What that looks like
     * is a country framed off-centre that mysteriously corrects itself later, when
     * frames resume and maplibre finally finishes.
     *
     * `visibilityState` catches the obvious case, but it is NOT sufficient - a tab can
     * report `visible` and still be throttled, which is precisely the case that kept
     * this bug alive. So the animation is also given a deadline: if the map has not
     * arrived shortly after the ease should have finished, it is put there outright.
     * That covers every cause of starvation without having to enumerate them.
     */
    /**
     * Make the viewport true BEFORE placing the camera.
     *
     * A stop says "put this country 240 dp left of centre", which is only meaningful
     * against the size MapLibre thinks it has. Search issues its stop during the
     * navigation back from `/search`, exactly when that size is least trustworthy - so
     * this is the difference between a country landing where it was asked to and landing
     * off the edge of the screen until something else forces a resize.
     */
    const sized = syncMapSize(map, containerRef.current as unknown as HTMLElement | null);

    /**
     * If the container has no size yet there is nothing meaningful to place the camera
     * against, so the stop WAITS. `pendingStop` still holds it, and the resize observer
     * below applies it the moment the element has real dimensions. Placing it now would
     * aim at MapLibre's 400x300 stand-in and put the country off screen.
     */
    if (!sized) return;

    applyStop(map, camera, document.visibilityState === 'visible');

    /**
     * The deadline. `pendingStop` is cleared by `moveend`, so a normally-completed ease
     * makes this a no-op - and a user who grabs the map mid-flight also ends the move,
     * which is what stops this from yanking the camera out from under them.
     */
    if (!camera.duration) return;

    const deadline = setTimeout(() => {
      const current = mapRef.current;
      if (!current || pendingStop.current !== camera) return;
      syncMapSize(current, containerRef.current as unknown as HTMLElement | null);
      applyStop(current, camera, false);
      pendingStop.current = undefined;
    }, camera.duration + ARRIVAL_GRACE_MS);

    return () => clearTimeout(deadline);
  }, [camera]);

  /**
   * Place whatever was owed as soon as there is a map to place it on.
   *
   * Pairs with the early return above: a stop that arrived before the map existed is
   * held rather than dropped, and this is where it lands.
   */
  useEffect(() => {
    const map = mapRef.current;
    const owed = pendingStop.current;
    if (!ready || !map || !owed) return;
    if (!syncMapSize(map, containerRef.current as unknown as HTMLElement | null)) return;

    // No animation: this is the opening view of a screen, not a journey from one country
    // to another, and there is nothing on screen yet for a fly to give context to.
    applyStop(map, owed, false);
    pendingStop.current = undefined;
  }, [ready]);

  // Arriving clears the debt; anything still outstanding was starved.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const done = () => {
      pendingStop.current = undefined;
    };
    map.on('moveend', done);
    return () => {
      map.off('moveend', done);
    };
  }, [ready]);

  /**
   * Coming back to a tab that was hidden mid-flight.
   *
   * maplibre would eventually finish the starved animation itself once frames resume,
   * but only after a visible lurch from wherever it froze. Landing immediately is both
   * calmer and correct, and `resize` covers a window that changed shape while away.
   */
  useEffect(() => {
    const onVisibility = () => {
      const map = mapRef.current;
      const stop = pendingStop.current;
      if (document.visibilityState !== 'visible' || !map || !stop) return;

      syncMapSize(map, containerRef.current as unknown as HTMLElement | null);
      applyStop(map, stop, false);
      pendingStop.current = undefined;
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // --- container resize ----------------------------------------------------------
  /**
   * maplibre only watches `window.resize`, which does not fire when the map's own box
   * changes without the window changing - quiz mode's flex-sibling panel, or a desktop
   * sidebar opening. On native this is RN's layout pass and needs no help.
   */
  useEffect(() => {
    const node = containerRef.current as unknown as HTMLElement | null;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const map = mapRef.current;
      if (!map) return;

      // Deliberately NOT a bare `map.resize()`. `/search` is pushed OVER this screen, and
      // a navigator that collapses the screen underneath reports a zero-sized container -
      // which MapLibre would happily adopt as a 400x300 viewport, wrecking any camera
      // stop issued before the screen comes back.
      if (!syncMapSize(map, containerRef.current as unknown as HTMLElement | null)) return;

      // The screen has just regained a size. Anything still owed gets placed now, against
      // the viewport it was always meant for.
      const owed = pendingStop.current;
      if (owed) {
        applyStop(map, owed, false);
        pendingStop.current = undefined;
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <View testID="world-map" ref={containerRef} style={styles.map} />;
}

const styles = StyleSheet.create({
  map: { flex: 1 },
});
