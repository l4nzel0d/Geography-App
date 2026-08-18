import { WORLD_WIDTH_AT_ZOOM_0 } from './cameraFit';
import type { Bbox } from './countryBounds';

/**
 * Where the camera should sit to frame one country.
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

  const usableWidth = viewport.width * (1 - 2 * margin);
  const usableHeight = viewport.height * (1 - 2 * margin);

  // Fraction of the whole world the country occupies on each axis.
  const xFraction = lngSpan / 360;
  const yFraction = Math.abs(ySouth - yNorth);

  // At zoom z the world is WORLD_WIDTH_AT_ZOOM_0 * 2^z dp across, so the largest zoom
  // that still fits the country is where its share of that equals the usable space.
  const zoomFor = (available: number, fraction: number) =>
    fraction > 0 ? Math.log2(available / (WORLD_WIDTH_AT_ZOOM_0 * fraction)) : Infinity;

  const fitted = Math.min(
    zoomFor(usableWidth, xFraction),
    zoomFor(usableHeight, yFraction),
  );

  // `fitted` is Infinity for a degenerate box and NaN for a zero-sized viewport, and
  // either one reaching the native camera blanks the map. countryBounds guarantees a
  // MIN_SPAN_DEG floor, so this is the second line of defence rather than the first.
  const zoom = Number.isFinite(fitted)
    ? Math.max(minZoom, Math.min(maxZoom, fitted))
    : maxZoom;

  return { center: [centerLng, centerLat], zoom };
}
