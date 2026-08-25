/**
 * The portrait/landscape breakpoint for the info card. Pure, so it is tested here
 * rather than by faking `useWindowDimensions` in a render test.
 */
import {
  DESKTOP_MIN_WIDTH,
  DESKTOP_PANEL_MAX_WIDTH,
  DESKTOP_PANEL_MIN_WIDTH,
  getInfoSheetLayout,
  getMapFocusRect,
  MAP_CHROME_HEIGHT,
  PANEL_MAX_WIDTH,
  PORTRAIT_SHEET_HEIGHT_ESTIMATE,
  PANEL_MIN_WIDTH,
  PORTRAIT_MAX_HEIGHT_FRACTION,
} from '@/components/infoSheetLayout';

describe('getInfoSheetLayout', () => {
  it('keeps the bottom sheet in portrait', () => {
    // Pixel 6-ish, and the emulator's Medium_Phone.
    expect(getInfoSheetLayout({ width: 411, height: 891 })).toEqual({
      landscape: false,
      panelWidth: null,
      tier: 'compact',
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

  it('caps the phone panel at PANEL_MAX_WIDTH just below the desktop tier', () => {
    // 1023 is the widest 'wide' window there is; 1023 * 0.42 = 430, so the cap wins.
    const { panelWidth, tier } = getInfoSheetLayout({ width: DESKTOP_MIN_WIDTH - 1, height: 700 });

    expect(tier).toBe('wide');
    expect(panelWidth).toBe(PANEL_MAX_WIDTH);
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


describe('the desktop tier', () => {
  it('starts at DESKTOP_MIN_WIDTH and not a pixel earlier', () => {
    expect(getInfoSheetLayout({ width: DESKTOP_MIN_WIDTH - 1, height: 700 }).tier).toBe('wide');
    expect(getInfoSheetLayout({ width: DESKTOP_MIN_WIDTH, height: 700 }).tier).toBe('desktop');
  });

  it('is still landscape, so every existing caller keeps working', () => {
    // quizPanelLayout and CountryInfoSheet both branch on `landscape`, not on `tier`.
    expect(getInfoSheetLayout({ width: 1920, height: 1080 }).landscape).toBe(true);
  });

  it('gives the panel a real reading column rather than a phone strip', () => {
    const { panelWidth } = getInfoSheetLayout({ width: 1920, height: 1080 });

    // 1920 * 0.28 = 538, capped at 480.
    expect(panelWidth).toBe(DESKTOP_PANEL_MAX_WIDTH);
    expect(panelWidth!).toBeGreaterThan(PANEL_MAX_WIDTH);
  });

  it('holds the minimum on a window only just wide enough', () => {
    // 1024 * 0.28 = 287, below the 380 floor.
    expect(getInfoSheetLayout({ width: 1024, height: 768 }).panelWidth).toBe(
      DESKTOP_PANEL_MIN_WIDTH,
    );
  });

  it('never takes more than 40% of the window, at any monitor size', () => {
    for (const width of [1024, 1280, 1440, 1920, 2560, 3840]) {
      const { panelWidth } = getInfoSheetLayout({ width, height: 900 });

      expect(panelWidth! / width).toBeLessThanOrEqual(0.4);
    }
  });

  it('drops back to the phone layout when a desktop window is dragged narrow', () => {
    // The tier is about room, not input device.
    expect(getInfoSheetLayout({ width: 800, height: 700 }).tier).toBe('wide');
    expect(getInfoSheetLayout({ width: 600, height: 900 }).tier).toBe('compact');
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
    // Derived, not pinned: the card's assumed height is a tunable estimate, and a literal
    // here would just have to be chased every time it moves. The 55% cap does not bind on
    // a screen this tall - see the tall-screen case below.
    const height = 1000;
    const cardTop = height - PORTRAIT_SHEET_HEIGHT_ESTIMATE;
    const rect = getMapFocusRect({ width: 390, height });

    expect(rect).toEqual({
      x: 0,
      y: MAP_CHROME_HEIGHT,
      width: 390,
      height: cardTop - MAP_CHROME_HEIGHT,
    });
  });

  it('moves the band down by the safe-area inset', () => {
    // The chrome row is positioned below the status bar, so the rect has to be too - the
    // notch is 47 dp on the phone the tests model.
    const height = 1000;
    const cardTop = height - PORTRAIT_SHEET_HEIGHT_ESTIMATE;
    const rect = getMapFocusRect({ width: 390, height }, 47);

    expect(rect.y).toBe(47 + MAP_CHROME_HEIGHT);
    expect(rect.height).toBe(cardTop - 47 - MAP_CHROME_HEIGHT);
  });

  /**
   * The card is CONTENT height, so reserving a FRACTION of the screen only describes it
   * on a screen short enough for the cap to bind. Getting this wrong framed every
   * searched country far too high on a tall phone, and it was invisible on a short test
   * window because there the two happen to agree.
   */
  describe('how much of the bottom the card is assumed to take', () => {
    it('uses the measured height when the card has reported one', () => {
      const rect = getMapFocusRect({ width: 440, height: 956 }, 0, 376);

      // 956 - 376 = 580, less the 60 dp chrome row.
      expect(rect.height).toBe(580 - MAP_CHROME_HEIGHT);
    });

    it('does not reserve 55% of a tall screen for a card that does not need it', () => {
      const tall = { width: 440, height: 956 };
      const measured = getMapFocusRect(tall, 0, 376);
      const byFraction = Math.round(tall.height * (1 - PORTRAIT_MAX_HEIGHT_FRACTION));

      // The old behaviour put the band's bottom at 430 and the country ~75 dp too high.
      expect(byFraction).toBe(430);
      expect(measured.y + measured.height).toBeGreaterThan(byFraction);
    });

    it('still lets the cap win on a short screen, where the card really is 55%', () => {
      // 55% of 640 is 352, less than the card would like, so the cap binds and the card
      // scrolls internally.
      const rect = getMapFocusRect({ width: 360, height: 640 });

      expect(rect.height).toBe(Math.round(640 * (1 - PORTRAIT_MAX_HEIGHT_FRACTION)) - MAP_CHROME_HEIGHT);
    });

    it('never lets the band run past the top of the card', () => {
      for (const height of [640, 740, 844, 956, 1000, 1180]) {
        const measuredCardHeight = 380;
        const rect = getMapFocusRect({ width: 400, height }, 0, measuredCardHeight);
        const cardTop = height - Math.min(height * PORTRAIT_MAX_HEIGHT_FRACTION, measuredCardHeight);

        expect(rect.y + rect.height).toBeLessThanOrEqual(Math.round(cardTop));
      }
    });
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
