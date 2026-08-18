/**
 * The zoom at which one copy of the world covers the viewport width.
 *
 * MapLibre tiles the world horizontally when the viewport is wider than the world is
 * at the current zoom. On a tall phone that never happens - a 411 dp-wide window is
 * narrower than the 512 dp world at zoom 0, so MapLibre clamps the zoom upwards and
 * you see one world. Landscape is the opposite: a 914 dp-wide window at zoom 0 fits
 * ~1.8 worlds, and the map renders Africa twice with a seam through the Pacific.
 *
 * So the floor has to come from the window, not a constant. Pure and separate from
 * WorldMap so the arithmetic is testable without a native map.
 */

/** Width in dp of the whole world at zoom 0 - MapLibre's 512 px tile scheme. */
export const WORLD_WIDTH_AT_ZOOM_0 = 512;

/**
 * Lowest zoom that still fills `width` with a single world, never below 0 (zooming
 * out past 0 would shrink the world inside the viewport rather than fill it).
 *
 * Portrait returns exactly 0, which is what keeps the portrait Maestro tap points
 * valid - do not "simplify" this to always compute a value.
 */
export function getWorldFitZoom(width: number): number {
  if (!(width > 0)) return 0;

  return Math.max(0, Math.log2(width / WORLD_WIDTH_AT_ZOOM_0));
}

/**
 * Lowest zoom at which one world covers BOTH axes of a viewport.
 *
 * `getWorldFitZoom` only answers for the width, which is all the launch camera needs -
 * MapLibre's own constraint takes care of the height by clamping upward, and the explore
 * map is happy to be clamped.
 *
 * A stop fitted to PART of the screen is not. Framing Russia into the top 45% of a
 * portrait phone asks for zoom 0.36, where the Mercator square is 659 dp tall and the
 * viewport is 891: MapLibre overrides the zoom and re-centres, and the offset we so
 * carefully computed was measured against a scale the map never used. Asking for a zoom
 * that will actually be honoured keeps the arithmetic and the render in agreement.
 *
 * This is a floor for a computed STOP, not for the `Camera`'s `minZoom` prop - that one
 * is the pinch limit, and raising it would stop the user zooming back out to the world.
 */
export function getViewportFitZoom(width: number, height: number): number {
  const forHeight = height > 0 ? Math.log2(height / WORLD_WIDTH_AT_ZOOM_0) : 0;

  return Math.max(getWorldFitZoom(width), forHeight);
}
