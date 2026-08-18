import { WORLD_WIDTH_AT_ZOOM_0 } from './cameraFit';
import type { Bbox } from './countryBounds';

/**
 * Where the camera should sit to frame one country.
 *
 * Two entry points. `getCountryCameraStop` frames a country in the whole viewport it is
 * given, which is all quiz mode needs because its answer panel is a flex sibling and the
 * map really is the size it is told. `getFocusedCameraStop` frames a country in a
 * sub-rectangle of the viewport, which is what the explore map's search needs: there the
 * info sheet is a genuine absolute overlay, so the map is full-screen while only part of
 * it is visible.
 *
 * This deliberately does the Web Mercator arithmetic itself rather than handing
 * MapLibre a `bounds` + `padding` camera stop. Two reasons, both about being able to
 * see what happened:
 *
 *   - the antimeridian. Fiji and Kiribati straddle 180 degrees, and MapLibre's
 *     behaviour for a `bounds` whose west exceeds its east is not something we can
 *     verify offline. Here it is four lines of arithmetic and a unit test.
 *   - a bad camera stop - an Infinity zoom, a centre in the wrong hemisphere - passes
 *     every unit test and then blanks the map inside the native renderer, which is
 *     exactly the class of bug CLAUDE.md records losing the most time to. Computing the
 *     numbers ourselves means Jest can assert on them.
 */

/** Web Mercator cannot represent the poles; this is the standard cutoff. */
const MAX_MERCATOR_LAT = 85.051129;

/**
 * Share of the map viewport left as breathing room on each side.
 *
 * Not merely cosmetic: a country framed edge to edge is much harder to recognise than
 * one with its neighbours and coastline visible around it, and recognising it is the
 * entire game.
 */
export const CONTEXT_MARGIN = 0.12;

export type MapCameraStop = {
  center: [number, number];
  zoom: number;
  duration?: number;
  easing?: 'linear' | 'ease' | 'fly';
};

function clampLat(lat: number): number {
  return Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, lat));
}

/** Latitude to a 0..1 Mercator Y, north at 0. */
function mercatorY(lat: number): number {
  const rad = (clampLat(lat) * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2;
}

function inverseMercatorY(y: number): number {
  const rad = Math.atan(Math.sinh(Math.PI * (1 - 2 * y)));
  return (rad * 180) / Math.PI;
}

/** Bring any longitude into [-180, 180]. */
export function normalizeLongitude(lng: number): number {
  const wrapped = ((lng + 180) % 360 + 360) % 360;
  return wrapped - 180;
}

/**
 * Width of a bbox in degrees, going the short way round.
 *
 * `east < west` means the box wraps the antimeridian, in which case the naive
 * subtraction is negative and the true span is what is left of the circle.
 */
export function longitudeSpan([west, , east]: Bbox): number {
  const span = east - west;
  return span >= 0 ? span : span + 360;
}

export function getCountryCameraStop({
  bbox,
  viewport,
  minZoom,
  maxZoom,
  margin = CONTEXT_MARGIN,
}: {
  bbox: Bbox;
  /** The MAP's own box in dp - NOT the window. The answer panel is a sibling, not an
   *  overlay, so the map really is this size and needs no inset arithmetic. */
  viewport: { width: number; height: number };
  minZoom: number;
  maxZoom: number;
  margin?: number;
}): { center: [number, number]; zoom: number } {
  const [west, south, , north] = bbox;

  const lngSpan = longitudeSpan(bbox);
  const centerLng = normalizeLongitude(west + lngSpan / 2);

  const yNorth = mercatorY(north);
  const ySouth = mercatorY(south);
  const centerLat = inverseMercatorY((yNorth + ySouth) / 2);

  const zoom = fitZoom({
    width: viewport.width,
    height: viewport.height,
    lngSpan,
    ySpan: Math.abs(ySouth - yNorth),
    minZoom,
    maxZoom,
    margin,
  });

  return { center: [centerLng, centerLat], zoom };
}

/**
 * The largest zoom at which a country still fits a box, clamped to the map's own limits.
 *
 * At zoom z the world is WORLD_WIDTH_AT_ZOOM_0 * 2^z dp across, so the answer is where
 * the country's share of that equals the usable space on the tighter of the two axes.
 *
 * The unfitted value is Infinity for a degenerate box and NaN for a zero-sized viewport,
 * and either one reaching the native camera blanks the map. `countryBounds` guarantees a
 * MIN_SPAN_DEG floor, so this is the second line of defence rather than the first.
 */
function fitZoom({
  width,
  height,
  lngSpan,
  ySpan,
  minZoom,
  maxZoom,
  margin,
}: {
  width: number;
  height: number;
  lngSpan: number;
  /** The country's height as a fraction of the whole Mercator world. */
  ySpan: number;
  minZoom: number;
  maxZoom: number;
  margin: number;
}): number {
  const usableWidth = width * (1 - 2 * margin);
  const usableHeight = height * (1 - 2 * margin);

  const zoomFor = (available: number, fraction: number) =>
    fraction > 0 ? Math.log2(available / (WORLD_WIDTH_AT_ZOOM_0 * fraction)) : Infinity;

  const fitted = Math.min(zoomFor(usableWidth, lngSpan / 360), zoomFor(usableHeight, ySpan));

  return Number.isFinite(fitted) ? Math.max(minZoom, Math.min(maxZoom, fitted)) : maxZoom;
}

/** A sub-rectangle of the map viewport, in dp, with the origin at the viewport's top-left. */
export type FocusRect = { x: number; y: number; width: number; height: number };

/**
 * Frame a country inside `focus` rather than inside the whole viewport.
 *
 * The camera always points at the centre of the viewport - that is not something we can
 * change - so putting the country somewhere else on screen means pointing the camera
 * *away* from it by exactly the offset between the two centres. Zoom is fitted to
 * `focus`, so the country is sized for the space it will actually occupy.
 *
 * Deliberately a separate function rather than `getCountryCameraStop` with a default
 * focus of the full viewport: the pole clamp below would then apply to quiz framing too,
 * and that is a behaviour change to a screen this feature has no business touching.
 */
export function getFocusedCameraStop({
  bbox,
  viewport,
  focus,
  minZoom,
  maxZoom,
  margin = CONTEXT_MARGIN,
}: {
  bbox: Bbox;
  /** The MAP's box in dp. On the explore screen that is the whole window. */
  viewport: { width: number; height: number };
  /** The part of `viewport` the info sheet does not cover. */
  focus: FocusRect;
  minZoom: number;
  maxZoom: number;
  margin?: number;
}): { center: [number, number]; zoom: number } {
  const [west, south, , north] = bbox;

  const lngSpan = longitudeSpan(bbox);
  const centerLng = normalizeLongitude(west + lngSpan / 2);

  const yNorth = mercatorY(north);
  const ySouth = mercatorY(south);
  const centerY = (yNorth + ySouth) / 2;

  // Fitted to the focus rect, not the viewport - the country has to fit the space that
  // is actually visible, which in portrait is a little under half the screen.
  const zoom = fitZoom({
    width: focus.width,
    height: focus.height,
    lngSpan,
    ySpan: Math.abs(ySouth - yNorth),
    minZoom,
    maxZoom,
    margin,
  });

  // Width of the whole world in dp at the zoom we are actually going to use, which is
  // what turns a dp offset into world units.
  const worldPx = WORLD_WIDTH_AT_ZOOM_0 * Math.pow(2, zoom);

  const dx = focus.x + focus.width / 2 - viewport.width / 2;
  const dy = focus.y + focus.height / 2 - viewport.height / 2;

  // `mercatorY` grows southward and screen y grows downward, so both axes shift with the
  // same sign: move the camera the opposite way from the focus rect, and the country
  // lands inside it.
  const centerX = normalizeLongitude(centerLng - (dx / worldPx) * 360);

  /**
   * Half the viewport, in world units. Pointing the camera closer to a pole than this
   * would show space beyond the top or bottom of the Mercator world.
   *
   * This clamp is not defensive tidying - without it, searching Russia in portrait puts
   * the camera at latitude -54 and Russia entirely off the top of the screen. Its fit
   * zoom is already at the floor, so the world is only 512 dp tall while the wanted
   * shift is 232 dp: 45% of the globe. When the world is shorter than the viewport
   * (`half >= 0.5`) no offset is possible at all, and the honest answer is the equator.
   */
  const half = viewport.height / 2 / worldPx;
  const wantedY = centerY - dy / worldPx;
  const cameraY = half >= 0.5 ? 0.5 : Math.max(half, Math.min(1 - half, wantedY));

  return { center: [centerX, inverseMercatorY(cameraY)], zoom };
}
