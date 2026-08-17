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
