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

/**
 * How long a camera move should take, given how far it actually travels.
 *
 * A fixed duration is wrong in both directions at once, and lengthening it only trades
 * which half is wrong: 900 ms is a crawl between two neighbouring countries and a blur
 * across an ocean. What a move should be paced by is not geographic distance but how
 * many SCREENFULS of map go past - and that depends on the zoom at both ends as much as
 * on the gap between them.
 *
 * This is the van Wijk & Nuij (2003) "Smooth and efficient zooming and panning" path
 * length, which is the same thing `maplibre-gl` computes for a `flyTo` given no
 * duration, with its own defaults (`curve` 1.42). Reproducing it rather than delegating
 * is not a preference: **MapLibre Native Android cannot do it.** Its RN binding maps a
 * missing duration to `moveCamera` - an instant jump - and a negative one to a FIXED
 * `MapLibreConstants.ANIMATION_DURATION`, with a comment in `CameraUpdateItem.kt` saying
 * as much: "On iOS a duration of -1 means default or dynamic duration (based on
 * flight-path length). On Android we can fallback to MapLibre's default duration as
 * there is no such API. TODO". Computing it here is what makes the two platforms agree,
 * and it puts the number somewhere Jest can read it.
 *
 * Pairs with `easing: 'fly'` and only makes sense with it. `S` is the length of the
 * ARC - the flight that zooms out on the way and back in at the end - so spending it on
 * an `ease`, which interpolates the centre linearly at the starting scale, would be
 * timing one animation and playing another.
 */

/** van Wijk's rho: how much the flight zooms out relative to how far it pans. */
export const FLIGHT_CURVE = 1.42;

/**
 * Screenfuls per second, and **the one number to turn if the pacing feels off.**
 *
 * `maplibre-gl` defaults to 1.2, which is tuned for someone browsing a map: at that
 * speed France to Japan takes over three seconds, which across twenty questions is a
 * wait rather than an animation. 2 is the quiz's version of the same judgement.
 *
 * Measured against the committed geometry, on a 411x500 dp map box:
 *
 * | flight | ms |
 * |---|---|
 * | France - Germany, Brazil - Argentina | 450 (the floor) |
 * | world view - Australia, USA - China | ~620 |
 * | France - Turkey | 766 |
 * | France - Japan | 1588 |
 * | New Zealand - Iceland, world view - Monaco | 2000 (the ceiling) |
 *
 * Two of those look wrong until you remember the unit is screenfuls, not kilometres.
 * USA to China is 600 ms because both countries frame at around zoom 1, so almost the
 * whole world is already visible at each end and very little of it moves. Monaco to
 * Liechtenstein is 2 s despite being 500 km apart, because at zoom 10 that is hundreds
 * of screenfuls. Pacing by geographic distance would get both backwards.
 */
export const FLIGHT_SPEED = 2;

/**
 * Floor and ceiling, in ms.
 *
 * The floor keeps a very short hop from being a flicker that reads as a cut. The ceiling
 * matters more: the formula is happy to spend four seconds crossing the world from a
 * street-level zoom, and it is right that this is what "smooth" costs - but not twenty
 * times a round. Past the ceiling the move is simply faster than optimal, which is a
 * better failure than a player waiting on it.
 */
export const MIN_FLIGHT_MS = 450;
export const MAX_FLIGHT_MS = 2000;

/** Below this the two centres are the same point and the general formula divides by ~0. */
const PURE_ZOOM_EPSILON = 2e-6;

export type CameraPose = { center: [number, number]; zoom: number };

export function getFlightDuration({
  from,
  to,
  viewport,
}: {
  from: CameraPose;
  to: CameraPose;
  /** The MAP's box in dp. */
  viewport: { width: number; height: number };
}): number {
  // maplibre measures a screenful by the LARGER dimension, so a flight is paced the same
  // whichever way the device is held.
  const w0 = Math.max(viewport.width, viewport.height);
  if (!(w0 > 0)) return MIN_FLIGHT_MS;

  // The viewport, in the pixels of the starting zoom - so `w1 < w0` means zooming in.
  const w1 = w0 * 2 ** (from.zoom - to.zoom);

  // The gap between the two centres, also in starting-zoom pixels. Longitude goes the
  // short way round, so a flight across the antimeridian is a short one.
  const worldSize = WORLD_WIDTH_AT_ZOOM_0 * 2 ** from.zoom;
  const dx = (normalizeLongitude(to.center[0] - from.center[0]) / 360) * worldSize;
  const dy = (mercatorY(to.center[1]) - mercatorY(from.center[1])) * worldSize;
  const u1 = Math.hypot(dx, dy);

  const rho = FLIGHT_CURVE;
  const rho2 = rho * rho;

  /** The zoom-out factor at one end of the arc. `descent` is the far end. */
  const zoomOutFactor = (descent: boolean) => {
    const b =
      (w1 * w1 - w0 * w0 + (descent ? -1 : 1) * rho2 * rho2 * u1 * u1) /
      (2 * (descent ? w1 : w0) * rho2 * u1);
    return Math.log(Math.sqrt(b * b + 1) - b);
  };

  const r0 = zoomOutFactor(false);
  let pathLength = (zoomOutFactor(true) - r0) / rho;

  // Straight up or down: no panning at all, so the arc collapses to a zoom and the
  // general formula's `u1` in the denominator would take it to Infinity.
  if (u1 < PURE_ZOOM_EPSILON || !Number.isFinite(pathLength)) {
    pathLength = Math.abs(Math.log(w1 / w0)) / rho;
  }

  const duration = (1000 * pathLength) / FLIGHT_SPEED;
  // NaN survives every comparison, so test for a real number rather than clamping it.
  if (!Number.isFinite(duration)) return MIN_FLIGHT_MS;

  return Math.round(Math.max(MIN_FLIGHT_MS, Math.min(MAX_FLIGHT_MS, duration)));
}
