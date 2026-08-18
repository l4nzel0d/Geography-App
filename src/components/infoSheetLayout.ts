/**
 * Where the country info card sits for a given window size.
 *
 * Portrait keeps the bottom sheet. Landscape moves it to a right-hand side panel:
 * a bottom sheet in landscape would cover most of the little vertical space there
 * is, and the map is wider than it is tall, so the spare room is at the side.
 *
 * Pure and separate from the component so the breakpoint is unit-testable without
 * having to fake `useWindowDimensions`.
 */

/** Widest the side panel gets, however wide the screen is. */
export const PANEL_MAX_WIDTH = 360;

/** Narrowest it gets, unless the screen itself is narrower than this. */
export const PANEL_MIN_WIDTH = 280;

/** Preferred share of the window width, between those two bounds. */
export const PANEL_WIDTH_FRACTION = 0.42;

/** Never let the panel eat more than this share of a small landscape screen. */
const PANEL_MAX_FRACTION = 0.6;

/**
 * Tallest the portrait sheet is allowed to get, as a share of the window.
 *
 * `CountryInfoSheet` derives its `maxHeight` style from this, and `getMapFocusRect`
 * treats it as the occluded height, so the camera and the card cannot disagree about
 * where the bottom of the map is. Do not re-spell it as a literal in either place.
 */
export const PORTRAIT_MAX_HEIGHT_FRACTION = 0.55;

/**
 * Height of the chrome sitting over the top of the map, below the safe-area inset.
 *
 * The fill-mode toggle takes the top-left and the search and quiz pills take the
 * top-right, in one row in both orientations. A country framed into the middle of the
 * screen puts its northern edge straight under them - Liechtenstein's tip disappeared
 * behind the toggle - so the focus rect starts below the row rather than at the top of
 * the window.
 *
 * Mirrors `MapControls`: its 12 dp top gap, the toggle's 40 dp fallback height, and 8 dp
 * of breathing room. An estimate rather than a measurement, deliberately - threading the
 * measured height up would re-fire the camera when it settled. Being a few dp generous
 * costs a little zoom and nothing else.
 */
export const MAP_CHROME_HEIGHT = 60;

export type WindowSize = { width: number; height: number };

export type InfoSheetLayout = {
  landscape: boolean;
  /** Panel width in dp, or `null` in portrait where the sheet spans the screen. */
  panelWidth: number | null;
};

export function getInfoSheetLayout({ width, height }: WindowSize): InfoSheetLayout {
  if (width <= height) return { landscape: false, panelWidth: null };

  const preferred = Math.max(PANEL_MIN_WIDTH, width * PANEL_WIDTH_FRACTION);
  const panelWidth = Math.round(Math.min(PANEL_MAX_WIDTH, preferred, width * PANEL_MAX_FRACTION));

  return { landscape: true, panelWidth };
}

/**
 * The part of a full-screen map that is neither covered by the info sheet nor by the
 * chrome, in dp.
 *
 * Only the explore screen needs this. Quiz mode splits the screen instead, so its panel
 * takes real layout space and the map is genuinely the size it is told (see
 * `quizPanelLayout.ts`); here the card is an absolute overlay, so the map stays
 * full-screen and something has to say which part of it the user can see. That
 * something feeds `getFocusedCameraStop`.
 *
 * Portrait uses the sheet's MAXIMUM height rather than its real one. The card is
 * content-height and only knows its extent after an `onLayout` pass, so threading the
 * measured value through here would change the camera's inputs once per country and fire
 * the fly twice per search. Over-reserving frames the country slightly high when the
 * card is short, which nobody notices.
 */
export function getMapFocusRect(
  { width, height }: WindowSize,
  topInset = 0,
): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const { landscape, panelWidth } = getInfoSheetLayout({ width, height });

  // Where the map becomes visible: below the status bar and the chrome row.
  const top = topInset + MAP_CHROME_HEIGHT;

  // Where it stops being visible: the top of the sheet in portrait, the bottom of the
  // window in landscape, where the card takes the right edge instead.
  const bottom = landscape ? height : Math.round(height * (1 - PORTRAIT_MAX_HEIGHT_FRACTION));

  return {
    x: 0,
    y: top,
    width: landscape ? Math.max(0, width - (panelWidth ?? 0)) : width,
    height: Math.max(0, bottom - top),
  };
}
