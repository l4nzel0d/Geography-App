/**
 * The zoom floor that stops MapLibre tiling the world horizontally in landscape.
 * Pure arithmetic, so it is checked here rather than against the native map.
 */
import { getWorldFitZoom, WORLD_WIDTH_AT_ZOOM_0 } from '@/map/cameraFit';

/** Widths in dp, measured on the emulator (2400x1080 @ 420 dpi = 914x411 dp). */
const PORTRAIT_WIDTH = 411;
const LANDSCAPE_WIDTH = 914;

describe('getWorldFitZoom', () => {
  it('returns 0 in portrait, keeping the portrait Maestro tap points valid', () => {
    expect(getWorldFitZoom(PORTRAIT_WIDTH)).toBe(0);
  });

  it('returns a zoom that fits one world across a landscape window', () => {
    const zoom = getWorldFitZoom(LANDSCAPE_WIDTH);

    // log2(914 / 512) = 0.836
    expect(zoom).toBeCloseTo(0.836, 3);
    // The whole point: one world is now at least as wide as the window.
    expect(WORLD_WIDTH_AT_ZOOM_0 * 2 ** zoom).toBeGreaterThanOrEqual(LANDSCAPE_WIDTH);
  });

  it('is exactly 0 at the width where one world fills the screen', () => {
    expect(getWorldFitZoom(WORLD_WIDTH_AT_ZOOM_0)).toBe(0);
  });

  it('never returns a negative zoom, however narrow the window', () => {
    for (const width of [1, 100, 320, 411, 512]) {
      expect(getWorldFitZoom(width)).toBe(0);
    }
  });

  it('covers the viewport at every plausible width', () => {
    for (const width of [320, 411, 512, 640, 800, 914, 1280, 1600, 2400]) {
      const covered = WORLD_WIDTH_AT_ZOOM_0 * 2 ** getWorldFitZoom(width);

      expect(covered).toBeGreaterThanOrEqual(Math.min(width, WORLD_WIDTH_AT_ZOOM_0));
    }
  });

  it('degrades to 0 on a zero or bogus width rather than returning -Infinity', () => {
    // Math.log2(0) is -Infinity, which would be passed straight to the native camera.
    expect(getWorldFitZoom(0)).toBe(0);
    expect(getWorldFitZoom(-100)).toBe(0);
    expect(getWorldFitZoom(NaN)).toBe(0);
  });
});
