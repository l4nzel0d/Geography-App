/**
 * The portrait/landscape breakpoint for the info card. Pure, so it is tested here
 * rather than by faking `useWindowDimensions` in a render test.
 */
import {
  getInfoSheetLayout,
  getMapFocusRect,
  MAP_CHROME_HEIGHT,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  PORTRAIT_MAX_HEIGHT_FRACTION,
} from '@/components/infoSheetLayout';

describe('getInfoSheetLayout', () => {
  it('keeps the bottom sheet in portrait', () => {
    // Pixel 6-ish, and the emulator's Medium_Phone.
    expect(getInfoSheetLayout({ width: 411, height: 891 })).toEqual({
      landscape: false,
      panelWidth: null,
    });
  });

  it('treats an exactly square window as portrait', () => {
    expect(getInfoSheetLayout({ width: 600, height: 600 }).landscape).toBe(false);
  });

  it('switches to a side panel in landscape', () => {
    const { landscape, panelWidth } = getInfoSheetLayout({ width: 891, height: 411 });

    expect(landscape).toBe(true);
    expect(panelWidth).toBe(PANEL_MAX_WIDTH); // 891 * 0.42 = 374, capped
  });

  it('caps the panel at PANEL_MAX_WIDTH on a wide screen', () => {
    expect(getInfoSheetLayout({ width: 1600, height: 900 }).panelWidth).toBe(PANEL_MAX_WIDTH);
  });

  it('holds the panel at PANEL_MIN_WIDTH on a short-but-wide screen', () => {
    // 640 * 0.42 = 269, below the minimum, and 280 is still under the 60% cap.
    expect(getInfoSheetLayout({ width: 640, height: 400 }).panelWidth).toBe(PANEL_MIN_WIDTH);
  });

  it('never lets the panel take more than 60% of a small landscape screen', () => {
    // The 280 dp minimum would be 70% of a 400 dp-wide window; the cap wins.
    expect(getInfoSheetLayout({ width: 400, height: 320 }).panelWidth).toBe(240);
  });

  it('leaves the map at least 40% of the width at every landscape size', () => {
    for (const width of [400, 500, 640, 800, 891, 1024, 1600, 2400]) {
      const { panelWidth } = getInfoSheetLayout({ width, height: 360 });

      expect(panelWidth).not.toBeNull();
      expect(panelWidth! / width).toBeLessThanOrEqual(0.6);
    }
  });
});

/**
 * Which part of the map the card leaves visible - what search frames a country into.
 *
 * The rect and the card have to agree, and they only do because both are derived from
 * `PORTRAIT_MAX_HEIGHT_FRACTION`. If someone re-spells that as a literal in the
 * stylesheet, the camera will keep framing countries into a gap the card no longer
 * leaves, and nothing else in the suite will notice.
 */
describe('getMapFocusRect', () => {
  it('leaves the band between the chrome and the sheet in portrait', () => {
    // Top of the sheet is at 45% of 1000 = 450; the chrome reserves the first 60.
    const rect = getMapFocusRect({ width: 390, height: 1000 });

    expect(rect).toEqual({ x: 0, y: 60, width: 390, height: 390 });
    expect(PORTRAIT_MAX_HEIGHT_FRACTION).toBe(0.55);
  });

  it('moves the band down by the safe-area inset', () => {
    // The chrome row is positioned below the status bar, so the rect has to be too - the
    // notch is 47 dp on the phone the tests model.
    const rect = getMapFocusRect({ width: 390, height: 1000 }, 47);

    expect(rect.y).toBe(47 + MAP_CHROME_HEIGHT);
    expect(rect.height).toBe(450 - 47 - MAP_CHROME_HEIGHT);
  });

  it('leaves the left of the screen in landscape', () => {
    const window = { width: 914, height: 411 };
    const { panelWidth } = getInfoSheetLayout(window);

    // The card takes the right edge rather than the bottom, so the band runs to the
    // foot of the window - but it still starts below the toggle.
    expect(getMapFocusRect(window)).toEqual({
      x: 0,
      y: MAP_CHROME_HEIGHT,
      width: 914 - (panelWidth ?? 0),
      height: 411 - MAP_CHROME_HEIGHT,
    });
  });

  it('never returns a negative dimension', () => {
    // A zero-sized window is reachable for one frame before the first layout pass, and a
    // negative width would reach `log2` in the camera arithmetic.
    for (const window of [
      { width: 0, height: 0 },
      { width: 320, height: 480 },
      { width: 480, height: 320 },
      { width: 2000, height: 1200 },
    ]) {
      const rect = getMapFocusRect(window);

      expect(rect.width).toBeGreaterThanOrEqual(0);
      expect(rect.height).toBeGreaterThanOrEqual(0);
    }
  });
});
