/**
 * The portrait/landscape breakpoint for the info card. Pure, so it is tested here
 * rather than by faking `useWindowDimensions` in a render test.
 */
import {
  getInfoSheetLayout,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
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
