/**
 * The *fit* half of label decluttering.
 *
 * MapLibre's collision detection is free and handles overlap, but it has no idea a
 * country is too small for its own name - it would happily draw "Luxembourg" at world
 * zoom over 1 dp of country. This module decides when a label is allowed to appear at
 * all, and these are the properties that matter.
 */
import { WORLD_WIDTH_AT_ZOOM_0 } from '@/map/cameraFit';
import {
  AVG_GLYPH_RATIO,
  estimateLabelWidthDp,
  FIT_TOLERANCE,
  getFitMinZoom,
  getFlagMinZoom,
  getLabelMinZoom,
  LABEL_FONT_SIZE,
  MAP_FLAG_HEIGHT_DP,
  MAP_FLAG_MAX_HEIGHT_DP,
  MAP_FLAG_MIN_HEIGHT_DP,
  MAP_FLAG_ZOOMED_HEIGHT_DP,
  MAX_LABEL_ZOOM,
  TEXT_MAX_WIDTH_EM,
} from '@/map/labelFit';

/** On-screen width of a country, in dp, at a given zoom. The definition under test. */
const countryWidthDp = (widthDeg: number, zoom: number) =>
  (widthDeg / 360) * WORLD_WIDTH_AT_ZOOM_0 * 2 ** zoom;

describe('estimateLabelWidthDp', () => {
  it('scales with the number of characters', () => {
    expect(estimateLabelWidthDp('Chad')).toBeLessThan(estimateLabelWidthDp('Switzerland'));
  });

  it('caps at the wrap width, because long labels wrap rather than widen', () => {
    // Must match the layer's `text-max-width`. Without the cap, Zimbabwe's three
    // currency lists are estimated at ~150dp and never fit at any zoom.
    const cap = TEXT_MAX_WIDTH_EM * LABEL_FONT_SIZE;
    expect(estimateLabelWidthDp('Botswana pula, British pound, Chinese yuan')).toBe(cap);
    expect(estimateLabelWidthDp('a'.repeat(200))).toBe(cap);
  });

  it('uses the documented glyph ratio below the cap', () => {
    expect(estimateLabelWidthDp('Chad')).toBeCloseTo(4 * AVG_GLYPH_RATIO * LABEL_FONT_SIZE, 6);
  });
});

describe('getLabelMinZoom', () => {
  it('lets a wide country carry its name from the very first frame', () => {
    // Russia's largest polygon spans ~153 degrees. If this ever stops being 0 the world
    // view has no labels on it at all.
    expect(getLabelMinZoom('Russia', 152.648)).toBe(0);
  });

  it('holds a microstate back until it is actually visible', () => {
    // Luxembourg's largest polygon is 0.769 degrees wide - about 1dp at zoom 0.
    const zoom = getLabelMinZoom('Luxembourg', 0.769);
    expect(zoom).toBeGreaterThan(4);
    expect(zoom).toBeLessThanOrEqual(MAX_LABEL_ZOOM);
  });

  it('returns a zoom at which the label genuinely fits, and one below at which it does not', () => {
    const text = 'Luxembourg';
    const width = 0.769;
    const zoom = getLabelMinZoom(text, width);
    const needed = estimateLabelWidthDp(text) * FIT_TOLERANCE;

    expect(countryWidthDp(width, zoom)).toBeGreaterThanOrEqual(needed * 0.99);
    expect(countryWidthDp(width, zoom - 1)).toBeLessThan(needed);
  });

  it('is monotonic: a longer label needs at least as much zoom', () => {
    const width = 5;
    expect(getLabelMinZoom('Mali', width)).toBeLessThanOrEqual(
      getLabelMinZoom('Mozambique', width),
    );
  });

  it('is monotonic: a wider country needs no more zoom', () => {
    expect(getLabelMinZoom('France', 12.903)).toBeLessThanOrEqual(
      getLabelMinZoom('France', 1.2),
    );
  });

  it('never returns a value outside the map’s own zoom range', () => {
    // Below 0 the filter would be dead weight; above the map's maxZoom the label could
    // never be reached at all.
    for (const width of [0.001, 0.011, 1, 45, 360]) {
      const zoom = getLabelMinZoom('Some Country Name', width);
      expect(zoom).toBeGreaterThanOrEqual(0);
      expect(zoom).toBeLessThanOrEqual(MAX_LABEL_ZOOM);
    }
  });

  it('returns a finite ceiling for degenerate input rather than an infinity', () => {
    // log2(0) is -Infinity, and an infinity reaching the native filter is exactly the
    // class of bug that cannot be seen off-device.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(getLabelMinZoom('Nauru', bad)).toBe(MAX_LABEL_ZOOM);
    }
    expect(getLabelMinZoom('', 10)).toBe(MAX_LABEL_ZOOM);
    expect(Number.isFinite(getLabelMinZoom('Nauru', 0.0001))).toBe(true);
  });
});

describe('the flag size constants', () => {
  /**
   * The fit nominal and the drawn size are four independent numbers in one file, and only
   * this says how they relate. `MAP_FLAG_HEIGHT_DP` is what decides WHICH countries get a
   * flag; the other three are what one is DRAWN at. Nothing else would notice if the nominal
   * drifted outside the range of sizes it is meant to stand for - the fit test would go on
   * agreeing with itself while judging flags against a width the map never uses.
   */
  it('keeps the fit nominal inside the ramp it stands for', () => {
    expect(MAP_FLAG_MIN_HEIGHT_DP).toBeLessThan(MAP_FLAG_MAX_HEIGHT_DP);
    expect(MAP_FLAG_MAX_HEIGHT_DP).toBeLessThan(MAP_FLAG_ZOOMED_HEIGHT_DP);

    expect(MAP_FLAG_HEIGHT_DP).toBeGreaterThanOrEqual(MAP_FLAG_MIN_HEIGHT_DP);
    expect(MAP_FLAG_HEIGHT_DP).toBeLessThanOrEqual(MAP_FLAG_ZOOMED_HEIGHT_DP);
  });

  /**
   * Deliberately near the LOW end, not the middle - see the comment on `MAP_FLAG_HEIGHT_DP`.
   * Over-estimating hides flags at low zoom that would have fitted; under-estimating costs
   * nothing high up, where a country big enough for a 30 dp flag has room for one. Pinned
   * because "put the nominal in the middle of the ramp" is the plausible-looking change that
   * would quietly unlabel small countries at world zoom.
   */
  it('calibrates the fit test against the small end of the ramp', () => {
    const midpoint = (MAP_FLAG_MIN_HEIGHT_DP + MAP_FLAG_ZOOMED_HEIGHT_DP) / 2;
    expect(MAP_FLAG_HEIGHT_DP).toBeLessThan(midpoint);
  });
});

describe('getFlagMinZoom', () => {
  /** The ratios in the shipped set that bracket everything else: Nepal, 4:3, 3:2, 2:1, Qatar. */
  const ASPECTS = [0.8203, 4 / 3, 1.4993, 2, 2.5473];

  /**
   * A flag's width is a function of the flag, not of a shared constant - which is the only
   * thing that differs from a text label, where it is a function of the string. Everything
   * else, `FIT_TOLERANCE` included, is shared through `getFitMinZoom` so the two cannot be
   * judged by different rules.
   */
  it('is the shared core, asked for this flag’s own drawn width', () => {
    for (const aspect of ASPECTS) {
      for (const widthDeg of [0.5, 5, 40, 152]) {
        expect(getFlagMinZoom(widthDeg, aspect)).toBe(
          getFitMinZoom(MAP_FLAG_HEIGHT_DP * aspect * FIT_TOLERANCE, widthDeg),
        );
      }
    }
  });

  /**
   * The property the whole raster migration buys, and the only place it is pinned.
   *
   * Height is what the icons hold fixed, so a 28:11 Qatar really is three times the width of
   * a pennant-shaped Nepal drawn beside it and needs correspondingly more country under it.
   * While every flag was 4:3 there was no way to say this, and every country was judged
   * against one made-up width.
   */
  it('makes a wider flag wait for a wider country', () => {
    for (const widthDeg of [1, 5, 20, 60]) {
      const zooms = ASPECTS.map((aspect) => getFlagMinZoom(widthDeg, aspect));
      for (let i = 1; i < zooms.length; i += 1) {
        expect(zooms[i]).toBeGreaterThanOrEqual(zooms[i - 1]);
      }
    }
  });

  /**
   * The 41 flags still rendered from `flag-icons` are 4:3, and they must land exactly where
   * the old width-anchored code put them - `MAP_FLAG_HEIGHT_DP * 4/3` is the 20 dp that used
   * to be written as `MAP_FLAG_WIDTH_DP`. If this drifts, the migration moved labels it had
   * no business moving.
   */
  it('leaves a 4:3 flag exactly where the width-anchored version had it', () => {
    for (const widthDeg of [0.5, 5, 40, 152]) {
      expect(getFlagMinZoom(widthDeg, 4 / 3)).toBe(getFitMinZoom(20 * FIT_TOLERANCE, widthDeg));
    }
  });

  it('lets a wider country carry its flag sooner', () => {
    const zooms = [0.5, 2, 10, 50, 150].map((widthDeg) => getFlagMinZoom(widthDeg, 1.4993));
    for (let i = 1; i < zooms.length; i += 1) expect(zooms[i]).toBeLessThanOrEqual(zooms[i - 1]);
  });

  it('stays inside the zoom range, degenerate widths included', () => {
    for (const widthDeg of [0.001, 0.5, 5, 152]) {
      expect(getFlagMinZoom(widthDeg, 1.4993)).toBeGreaterThanOrEqual(0);
      expect(getFlagMinZoom(widthDeg, 1.4993)).toBeLessThanOrEqual(MAX_LABEL_ZOOM);
    }
    // A zero span would reach log2(0); anything non-finite would poison the filter with a
    // value the native comparison cannot order.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(getFlagMinZoom(bad, 1.4993)).toBe(MAX_LABEL_ZOOM);
    }
  });

  it('appears before the name of the same country', () => {
    // Why a flag map is visibly denser than a name map. Asserted for the WIDEST flag in the
    // set, so the claim is honest for all 249 rather than for a comfortable middle: even
    // Qatar's 38 dp clears the fit test sooner than 66 dp of "Uzbekistan".
    for (const widthDeg of [1, 5, 20]) {
      expect(getFlagMinZoom(widthDeg, 2.5473)).toBeLessThan(
        getLabelMinZoom('Uzbekistan', widthDeg),
      );
    }
  });
});
