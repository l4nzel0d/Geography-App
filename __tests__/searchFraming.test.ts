/**
 * Where a searched country actually ends up on screen.
 *
 * ## Why this exists, and why it is shaped like this
 *
 * `infoSheetLayout.test.ts` checks the focus rect and `focusedCamera.test.ts` checks the
 * camera arithmetic, but each takes the other's output on trust. So a focus rect that
 * described the wrong band passed both suites for months: the camera centred the country
 * perfectly inside a rectangle that did not match what the user could see.
 *
 * The trap is subtle enough to be worth naming. Any check that asks "did the country land
 * at the centre of `getMapFocusRect(...)`" is circular - it agrees with `getMapFocusRect`
 * no matter how wrong that function is. Several manual browser probes made exactly that
 * mistake and reported everything as fine while a phone was visibly mis-framing.
 *
 * So this file builds the visible band from **independently measured facts about the UI**
 * and never from the code under test:
 *
 *   - `CARD_HEIGHT_PORTRAIT` was measured in a real browser across five countries.
 *     It is a CONTENT height and barely moves; it is NOT a share of the screen.
 *   - the chrome row's height is a fixed dp constant the map controls are laid out with.
 *   - the landscape panel's width IS `getInfoSheetLayout`'s, because the component
 *     applies that value verbatim as its `width` - there it is the source of truth
 *     rather than a guess about it.
 *
 * Then it projects the country's bounding box through the camera stop the app would
 * actually issue, and asks the only question that matters: is it centred in, and does it
 * fit inside, the part of the map a person can see?
 */
import {
  getInfoSheetLayout,
  getMapFocusRect,
  MAP_CHROME_HEIGHT,
  PORTRAIT_MAX_HEIGHT_FRACTION,
} from '@/components/infoSheetLayout';
import { getViewportFitZoom, WORLD_WIDTH_AT_ZOOM_0 } from '@/map/cameraFit';
import { getCountryBounds } from '@/map/countryBounds';
import { getFocusedCameraStop, type MapCameraStop } from '@/map/quizCamera';

/** Matches `EXPLORE_MAX_ZOOM` in `src/app/index.tsx`. */
const EXPLORE_MAX_ZOOM = 10;

/**
 * The portrait card's real height, measured in Chrome at 322x698 for Germany,
 * Switzerland, Monaco (376) and South Africa, Zimbabwe (384, and only because the 55% cap
 * bound at that screen height).
 *
 * The number that matters is that it is a CONSTANT, not a fraction: on a 956 dp phone the
 * card is still ~376, which is 39% of the screen, not 55%.
 */
const CARD_HEIGHT_PORTRAIT = 376;

/**
 * What the card really measures on a given screen: its content, but never more than the
 * cap, past which it scrolls internally instead of growing.
 *
 * This is the whole shape of the bug in one line - the height is `min(content, cap)`, and
 * the old code used only the `cap` half.
 */
const renderedCardHeight = (viewport: Viewport) =>
  Math.min(CARD_HEIGHT_PORTRAIT, Math.round(viewport.height * PORTRAIT_MAX_HEIGHT_FRACTION));

type Viewport = { width: number; height: number };
type Band = { left: number; top: number; right: number; bottom: number };

/**
 * The part of the map a person can actually see, derived from the UI rather than from the
 * layout code. This is the reference the whole file is judged against.
 */
function visibleBand(viewport: Viewport, insetTop: number, cardHeight: number): Band {
  const landscape = viewport.width > viewport.height;
  const top = insetTop + MAP_CHROME_HEIGHT;

  if (landscape) {
    // The card docks to the right edge, full height. `panelWidth` is applied verbatim by
    // CountryInfoSheet, so it is a fact about the rendered UI.
    const { panelWidth } = getInfoSheetLayout(viewport);
    return { left: 0, top, right: viewport.width - (panelWidth ?? 0), bottom: viewport.height };
  }

  // Portrait: a bottom sheet as tall as its content.
  return { left: 0, top, right: viewport.width, bottom: viewport.height - cardHeight };
}

const centreOf = (band: Band) => ({
  x: (band.left + band.right) / 2,
  y: (band.top + band.bottom) / 2,
});

const mercatorY = (lat: number) => {
  const sin = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
};

/** Where a coordinate lands on screen under a given camera stop. */
function project(
  lng: number,
  lat: number,
  stop: MapCameraStop,
  viewport: Viewport,
): { x: number; y: number } {
  const worldPx = WORLD_WIDTH_AT_ZOOM_0 * Math.pow(2, stop.zoom);

  let dLng = lng - stop.center[0];
  while (dLng > 180) dLng -= 360;
  while (dLng < -180) dLng += 360;

  return {
    x: viewport.width / 2 + (dLng / 360) * worldPx,
    y: viewport.height / 2 + (mercatorY(lat) - mercatorY(stop.center[1])) * worldPx,
  };
}

/**
 * Exactly what `MapScreen` issues for a searched country, plus where its outline lands.
 *
 * `centre` is the middle of the country's box **as drawn**, taken from the projected
 * corners rather than from a midpoint in degrees. That distinction matters twice, and
 * getting it wrong made this file's first draft accuse the app of two bugs it does not
 * have:
 *
 *   - **Latitude is not linear on screen.** Mercator stretches towards the poles, so the
 *     latitude midpoint of a tall country is not its visual middle. Chile spans 38
 *     degrees and the two differ by ~50 dp on a desktop. The app centres the country as
 *     drawn, which is right; only a naive test disagrees.
 *   - **New Zealand crosses the antimeridian**, so its bbox reads `[165.9, ..., -176.1]`
 *     and a plain `(west + east) / 2` lands at -5, in the Atlantic. Projecting each
 *     corner and taking the midpoint of the RESULT sidesteps that entirely.
 */
function frame(iso3: string, viewport: Viewport, insetTop: number, knownCardHeight?: number) {
  const bounds = getCountryBounds(iso3);
  if (!bounds) throw new Error(`no bounds for ${iso3}`);

  const stop = getFocusedCameraStop({
    bbox: bounds.bbox,
    viewport,
    focus: getMapFocusRect(viewport, insetTop, knownCardHeight),
    minZoom: getViewportFitZoom(viewport.width, viewport.height),
    maxZoom: EXPLORE_MAX_ZOOM,
  });

  const [west, south, east, north] = bounds.bbox;
  const topLeft = project(west, north, stop, viewport);
  const bottomRight = project(east, south, stop, viewport);

  return {
    stop,
    topLeft,
    bottomRight,
    centre: { x: (topLeft.x + bottomRight.x) / 2, y: (topLeft.y + bottomRight.y) / 2 },
  };
}

/**
 * Real devices, chosen so the failure mode is visible: the bug scaled with screen height
 * and was invisible on anything short.
 */
const PHONES: [string, Viewport][] = [
  ['iPhone SE portrait', { width: 375, height: 667 }],
  ['Pixel 5 portrait', { width: 393, height: 851 }],
  ['iPhone 15 Pro portrait', { width: 393, height: 852 }],
  ['the reported phone', { width: 440, height: 956 }],
  ['Pixel 9 Pro XL portrait', { width: 448, height: 998 }],
];

const DESKTOPS: [string, Viewport][] = [
  ['laptop', { width: 1440, height: 900 }],
  ['desktop', { width: 1920, height: 1080 }],
  ['the measured window', { width: 1536, height: 791 }],
];

/** Countries with very different shapes, so a bug cannot hide behind one bbox. */
const COUNTRIES = ['DEU', 'JPN', 'CHL', 'NZL', 'MCO'];

/**
 * How far off centre is acceptable, in dp.
 *
 * Tight on purpose. Measuring the country as DRAWN removes the Mercator and antimeridian
 * effects that would otherwise force a loose bound, so what is left is rounding. The bug
 * this file exists to catch was ~75 dp; anything above a few dp is a real defect.
 */
const CENTRING_TOLERANCE = 4;

describe('a searched country lands in the middle of the visible map', () => {
  describe.each(PHONES)('%s', (_label, viewport) => {
    const card = renderedCardHeight(viewport);

    it.each(COUNTRIES)('centres %s once the card has been measured', (iso3) => {
      const band = visibleBand(viewport, 0, card);
      const want = centreOf(band);
      const { centre } = frame(iso3, viewport, 0, card);

      expect(Math.abs(centre.x - want.x)).toBeLessThanOrEqual(CENTRING_TOLERANCE);
      expect(Math.abs(centre.y - want.y)).toBeLessThanOrEqual(CENTRING_TOLERANCE);
    });

    it('fits the country inside the visible band', () => {
      const band = visibleBand(viewport, 0, card);
      const { topLeft, bottomRight } = frame('DEU', viewport, 0, card);

      expect(topLeft.y).toBeGreaterThanOrEqual(band.top);
      expect(bottomRight.y).toBeLessThanOrEqual(band.bottom);
      expect(topLeft.x).toBeGreaterThanOrEqual(band.left);
      expect(bottomRight.x).toBeLessThanOrEqual(band.right);
    });

    it('still centres it on the FIRST search, before the card has ever been measured', () => {
      // The card reports its height as it opens, so the very first search has nothing to
      // go on and falls back to an estimate. That path is what a new visitor sees.
      const band = visibleBand(viewport, 0, card);
      const want = centreOf(band);
      const { centre } = frame('DEU', viewport, 0, undefined);

      expect(Math.abs(centre.y - want.y)).toBeLessThanOrEqual(CENTRING_TOLERANCE);
    });

    it('accounts for a notch', () => {
      const inset = 59;
      const band = visibleBand(viewport, inset, card);
      const want = centreOf(band);
      const { centre } = frame('DEU', viewport, inset, card);

      expect(Math.abs(centre.y - want.y)).toBeLessThanOrEqual(CENTRING_TOLERANCE);
    });
  });

  describe.each(DESKTOPS)('%s', (_label, viewport) => {
    it.each(COUNTRIES)('centres %s beside the side panel', (iso3) => {
      // Landscape docks the card to the right edge, so the card's HEIGHT is irrelevant.
      const band = visibleBand(viewport, 0, 0);
      const want = centreOf(band);
      const { centre } = frame(iso3, viewport, 0, CARD_HEIGHT_PORTRAIT);

      expect(Math.abs(centre.x - want.x)).toBeLessThanOrEqual(CENTRING_TOLERANCE);
      expect(Math.abs(centre.y - want.y)).toBeLessThanOrEqual(CENTRING_TOLERANCE);
    });
  });
});
