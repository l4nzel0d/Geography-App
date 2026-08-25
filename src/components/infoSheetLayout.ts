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
 * What the portrait sheet is assumed to be tall before it has ever been measured.
 *
 * The card is CONTENT height, capped at `PORTRAIT_MAX_HEIGHT_FRACTION` - and its content
 * is near enough constant, measured at 376-384 dp for a full set of facts. A *fraction*
 * therefore only describes it on a screen short enough for the cap to bind. On a 956 dp
 * phone, 55% reserves 526 dp for a card that is really ~376, and the camera frames the
 * country about 75 dp too high - which is exactly what "the country is not centred"
 * turned out to mean.
 *
 * So the reservation is the SMALLER of the cap and the card's actual extent, and this is
 * the stand-in until the card has reported one - which is the state a visitor's FIRST
 * search is in, since the card only measures itself as it opens.
 *
 * Set from the measurement rather than padded upward. An earlier 440 "to be safe" simply
 * reproduced the original bug in miniature: it over-reserved by 64 dp on a 956 dp phone
 * and put the first searched country ~32 dp too high. Being close beats being cautious,
 * because the error is symmetric - reserving too little tucks the country's lower edge
 * behind the card, reserving too much floats it up the screen.
 */
export const PORTRAIT_SHEET_HEIGHT_ESTIMATE = 380;

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

/**
 * Where the desktop tier starts.
 *
 * Stated as a measured margin rather than a round number: the widest phone in landscape
 * today is about 956 dp (iPhone 16 Pro Max), so 1024 leaves ~68 dp of headroom before a
 * phone could ever be mistaken for a desktop. It is also the conventional `lg`
 * breakpoint, so it is a number a reader recognises. A 1024x768 iPad lands exactly on it,
 * which is fine - at that size the desktop panel is 380 and leaves the map 644, a better
 * layout than a 360 strip either way.
 *
 * The tier is about ROOM, not input device. A desktop browser window dragged narrow
 * correctly drops back to the phone layout.
 */
export const DESKTOP_MIN_WIDTH = 1024;

/** Narrowest the desktop panel gets. Wide enough for the facts list to read as a column. */
export const DESKTOP_PANEL_MIN_WIDTH = 380;

/** Widest it gets, however large the monitor. */
export const DESKTOP_PANEL_MAX_WIDTH = 480;

/**
 * Preferred share of a desktop window. Lower than the phone's 0.42 because 42% of 1920 is
 * absurd - at this size the constraint is comfortable reading width, not fitting in.
 */
export const DESKTOP_PANEL_WIDTH_FRACTION = 0.28;

/**
 * Widest a text-first screen's content column gets on desktop.
 *
 * `/search` is a list of short rows; run edge to edge on a 1920 dp monitor it puts the
 * country name at the far left of an otherwise empty line. Roughly the width at which a
 * flag, a name and a subregion still read as one group.
 */
export const SEARCH_MAX_CONTENT_WIDTH = 720;

export type WindowSize = { width: number; height: number };

/**
 * How much room there is, in three steps rather than the original two.
 *
 * - `compact`  - portrait. The bottom sheet.
 * - `wide`     - landscape on a phone or small tablet. The 280-360 dp side panel.
 * - `desktop`  - a genuinely large window. A 380-480 dp side panel and roomier chrome.
 *
 * Deliberately expressed here rather than as a branch inside a component, so the whole
 * breakpoint story stays in one pure, unit-tested function - the same reason
 * `PORTRAIT_MAX_HEIGHT_FRACTION` is shared with `getMapFocusRect` instead of re-spelled.
 */
export type InfoSheetTier = 'compact' | 'wide' | 'desktop';

export type InfoSheetLayout = {
  /**
   * Unchanged in meaning and in value: `width > height`. Desktop is a KIND of landscape,
   * so this stays true there and every existing caller - `CountryInfoSheet`'s dock edge,
   * `quizPanelLayout`, `getMapFocusRect` - keeps working without knowing tiers exist.
   */
  landscape: boolean;
  /** Panel width in dp, or `null` in portrait where the sheet spans the screen. */
  panelWidth: number | null;
  tier: InfoSheetTier;
};

export function getInfoSheetLayout({ width, height }: WindowSize): InfoSheetLayout {
  if (width <= height) return { landscape: false, panelWidth: null, tier: 'compact' };

  const desktop = width >= DESKTOP_MIN_WIDTH;

  const [minWidth, maxWidth, fraction] = desktop
    ? [DESKTOP_PANEL_MIN_WIDTH, DESKTOP_PANEL_MAX_WIDTH, DESKTOP_PANEL_WIDTH_FRACTION]
    : [PANEL_MIN_WIDTH, PANEL_MAX_WIDTH, PANEL_WIDTH_FRACTION];

  const preferred = Math.max(minWidth, width * fraction);
  // The 60% cap still applies at every tier, so the map never drops below 40%.
  const panelWidth = Math.round(Math.min(maxWidth, preferred, width * PANEL_MAX_FRACTION));

  return { landscape: true, panelWidth, tier: desktop ? 'desktop' : 'wide' };
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
  /**
   * The portrait card's measured height, when it is known. Omit before it has ever been
   * laid out; see `PORTRAIT_SHEET_HEIGHT_ESTIMATE`.
   */
  sheetHeight?: number,
): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const { landscape, panelWidth } = getInfoSheetLayout({ width, height });

  // Where the map becomes visible: below the status bar and the chrome row.
  const top = topInset + MAP_CHROME_HEIGHT;

  // How much of the bottom the card really takes: never more than the cap, and no more
  // than the card itself needs. See PORTRAIT_SHEET_HEIGHT_ESTIMATE for why a fraction
  // alone gets this badly wrong on a tall screen.
  const occluded = Math.min(
    height * PORTRAIT_MAX_HEIGHT_FRACTION,
    sheetHeight ?? PORTRAIT_SHEET_HEIGHT_ESTIMATE,
  );

  // Where it stops being visible: the top of the sheet in portrait, the bottom of the
  // window in landscape, where the card takes the right edge instead.
  const bottom = landscape ? height : Math.round(height - occluded);

  return {
    x: 0,
    y: top,
    width: landscape ? Math.max(0, width - (panelWidth ?? 0)) : width,
    height: Math.max(0, bottom - top),
  };
}
