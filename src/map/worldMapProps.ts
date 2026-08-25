/**
 * The `WorldMap` contract, shared by both implementations so they cannot diverge.
 *
 * There are two `WorldMap`s - `WorldMap.tsx` (MapLibre Native, via
 * `@maplibre/maplibre-react-native`) and `WorldMap.web.tsx` (MapLibre GL JS) - and Metro
 * picks between them by platform. Callers see one component either way.
 *
 * This file must stay free of any renderer import. The web bundle cannot resolve
 * `@maplibre/maplibre-react-native` at all: it calls `codegenNativeComponent`, which
 * `react-native-web` does not export, and a single such import poisons the whole web
 * build - including the static-render pass, which fails every route rather than just the
 * one holding the map.
 */
import type { ChoroplethMode } from './choropleth';
import type { LabelField } from './mapLabels';
import type { MapCameraStop } from './quizCamera';

/**
 * How the land is coloured: the flat basemap, or one of the choropleth ramps in
 * `choropleth.ts`. Adding a ramp there is all it takes to add a mode here.
 */
export type FillMode = 'flat' | ChoroplethMode;

/**
 * Fixed starting viewport.
 *
 * Deliberately a constant rather than a fit-to-content calculation - Maestro taps
 * the map by screen percentage, so the same percentage must land on the same
 * country on every run. Changing this invalidates the E2E flows.
 */
export const INITIAL_CENTER: [number, number] = [10, 20];

/**
 * Portrait baseline. The effective floor is `getWorldFitZoom(width)`, which is exactly
 * this in portrait and higher in landscape - see cameraFit.ts.
 */
export const INITIAL_ZOOM = 0;

/** Highest zoom the explore map allows. Quiz mode passes its own; see quiz/play.tsx. */
export const DEFAULT_MAX_ZOOM = 10;

/**
 * Half-width of the press hitbox, in dp.
 *
 * MapLibre Native's default is 44 dp, which at zoom 0 spans ~30 degrees of longitude and
 * drags half a continent into every press. 10 dp keeps enough slack for a fingertip
 * while letting `pickCountry` resolve by containment, and it means a press in open water
 * yields no candidates at all so the ocean handler can deselect. See pickCountry.ts.
 *
 * The same number serves the web, where a CSS pixel is a dp.
 */
export const PRESS_HITBOX_DP = 10;

export type WorldMapProps = {
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
   * A SECOND highlight, independent of the selection.
   *
   * It exists for one job: `locate` mode has to show where the answer actually was
   * alongside the country the player tapped, and those are two different countries
   * whenever the guess was wrong. One `selectedIso3` cannot say both.
   *
   * Same idiom as the selection - always-mounted layer, empty string matches nothing -
   * and like it, it only draws in `flat` fill mode, since filling a country solid would
   * hide the choropleth value underneath.
   */
  revealIso3?: string | null;
  /** Overrides `mapColors.quizCorrect` on the reveal fill. */
  revealColor?: string;
  /**
   * A declarative camera stop. When absent the camera sits at `INITIAL_CENTER` and never
   * moves, which is what every Maestro percentage tap depends on - see CLAUDE.md.
   *
   * **Must be referentially stable**, on BOTH platforms. Native `Camera` is memoised and
   * rebuilds its stop from these props; the web implementation compares the stop against
   * the last one by identity. Either way a freshly-allocated but equal object re-fires
   * the animation, which is what `MapScreen`'s `focus.nonce` deliberately exploits and
   * what a stop rebuilt on every keystroke would trip over. Callers should `useMemo` it.
   */
  camera?: MapCameraStop;
  maxZoom?: number;
  /**
   * Which fact to draw on top of every country. Defaults to `'none'`, so quiz mode and
   * every existing test render exactly as they did.
   */
  labelField?: LabelField;
};
