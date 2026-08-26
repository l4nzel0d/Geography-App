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
  MAP_FLAG_WIDTH_DP,
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
    // languages are estimated at ~150dp and never fit at any zoom.
    const cap = TEXT_MAX_WIDTH_EM * LABEL_FONT_SIZE;
    expect(estimateLabelWidthDp('Shona, Ndebele, English')).toBe(cap);
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

describe('getFlagMinZoom', () => {
  /**
   * A flag's width is a constant, not a function of its content - which is the only thing that
   * differs from a text label. Everything else, `FIT_TOLERANCE` included, is shared through
   * `getFitMinZoom` so the two cannot be judged by different rules.
   */
  it('is the shared core, asked for a fixed width', () => {
    for (const widthDeg of [0.5, 5, 40, 152]) {
      expect(getFlagMinZoom(widthDeg)).toBe(
        getFitMinZoom(MAP_FLAG_WIDTH_DP * FIT_TOLERANCE, widthDeg),
      );
    }
  });

  it('lets a wider country carry its flag sooner', () => {
    const zooms = [0.5, 2, 10, 50, 150].map(getFlagMinZoom);
    for (let i = 1; i < zooms.length; i += 1) expect(zooms[i]).toBeLessThanOrEqual(zooms[i - 1]);
  });

  it('stays inside the zoom range, degenerate widths included', () => {
    for (const widthDeg of [0.001, 0.5, 5, 152]) {
      expect(getFlagMinZoom(widthDeg)).toBeGreaterThanOrEqual(0);
      expect(getFlagMinZoom(widthDeg)).toBeLessThanOrEqual(MAX_LABEL_ZOOM);
    }
    // A zero span would reach log2(0); anything non-finite would poison the filter with a
    // value the native comparison cannot order.
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(getFlagMinZoom(bad)).toBe(MAX_LABEL_ZOOM);
    }
  });

  it('appears before the name of the same country', () => {
    // Why a flag map is visibly denser than a name map: 20 dp of flag clears the fit test at a
    // lower zoom than 66 dp of "Uzbekistan". The property, not a pinned number.
    for (const widthDeg of [1, 5, 20]) {
      expect(getFlagMinZoom(widthDeg)).toBeLessThan(getLabelMinZoom('Uzbekistan', widthDeg));
    }
  });
});
