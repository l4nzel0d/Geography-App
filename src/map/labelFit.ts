import { WORLD_WIDTH_AT_ZOOM_0 } from './cameraFit';

/**
 * The lowest zoom at which a country is wide enough on screen to carry its label.
 *
 * This is the *fit* half of the decluttering rule. MapLibre's own collision detection
 * (`text-allow-overlap: false`) is the other half and is free, but collision alone is not
 * enough: it happily draws "Luxembourg" at world zoom, 60 dp of text over a country 1 dp
 * wide, simply because nothing else happens to be there. The result reads as a label
 * floating over France. So each label also carries a minimum zoom, precomputed per
 * country and per field, and the layer filters on it.
 *
 * The filter is `['<=', ['get', zoomProp], ['zoom']]`, which the style spec permits -
 * "Zoom expressions in filters are only evaluated at integer zoom levels". Integer
 * granularity is why this does not need to be exact: labels appear as you cross a whole
 * zoom level, and half a level of slack in the estimate is invisible.
 */

/**
 * Nominal size the width estimate is calibrated against.
 *
 * The layer interpolates `text-size` from 11 to 14 across the zoom range, so no single
 * number is right everywhere. This is the middle of that range: over-estimating at low
 * zoom would hide labels that would have fitted, under-estimating at high zoom costs
 * nothing because everything fits by then anyway.
 */
export const LABEL_FONT_SIZE = 12;

/**
 * Average glyph advance as a fraction of font size, for proportional Latin text.
 *
 * A real measurement would need the font metrics and a text-shaping pass, which is
 * exactly the work MapLibre does natively and which we cannot do in JS without shipping
 * a shaper. 0.55 is the usual approximation for mixed-case Latin in a humanist sans, and
 * the tolerance below absorbs the error.
 */
export const AVG_GLYPH_RATIO = 0.55;

/**
 * Must match the layer's `text-max-width`, in ems.
 *
 * Long labels *wrap* rather than growing wider, so past this point extra characters cost
 * height, not width. Without the cap, "Shona, Ndebele, English" is estimated at 152 dp
 * and Zimbabwe never gets a language label at any zoom.
 */
export const TEXT_MAX_WIDTH_EM = 8;

/**
 * How much wider than its country a label may be: a label is allowed when the country is
 * at least this fraction of the label's width, so at 0.55 the text may be ~1.8x the
 * country.
 *
 * Deliberately not 1.0. Requiring a label to fit strictly inside its country rules out
 * every long thin country on the map - Chile, Norway, Vietnam, Italy - none of which is
 * ever as wide as its own name, and all of which look wrong unlabelled at a zoom where
 * their neighbours are named. Overhang onto the ocean or a neighbour reads fine as long
 * as the anchor is unambiguous, which is what `labelPoints.json` guarantees.
 *
 * This is the one number to turn if labels overhang more or less than you want.
 */
export const FIT_TOLERANCE = 0.55;

/** Matches the explore map's own ceiling, so no label is permanently unreachable. */
export const MAX_LABEL_ZOOM = 10;

/**
 * Estimated rendered width of a label in dp, capped at the wrap width.
 */
export function estimateLabelWidthDp(text: string, fontSize = LABEL_FONT_SIZE): number {
  const unwrapped = text.length * AVG_GLYPH_RATIO * fontSize;
  return Math.min(unwrapped, TEXT_MAX_WIDTH_EM * fontSize);
}

/**
 * The zoom at which `text` starts being drawn over a country `widthDeg` degrees wide.
 *
 * Mercator x is linear in longitude, so a country's on-screen width is exactly
 * `widthDeg / 360 * WORLD_WIDTH_AT_ZOOM_0 * 2^zoom` dp at every latitude - no projection
 * correction needed for the horizontal axis, which is the only axis a text width cares
 * about.
 *
 * Returns `MAX_LABEL_ZOOM` for a degenerate width rather than `Infinity`: a zero span
 * would send `log2(0)` to `-Infinity` and, negated, poison the filter with a value the
 * native comparison cannot order.
 */
export function getLabelMinZoom(
  text: string,
  widthDeg: number,
  fontSize = LABEL_FONT_SIZE,
): number {
  if (!text || !Number.isFinite(widthDeg) || widthDeg <= 0) return MAX_LABEL_ZOOM;

  const needDp = estimateLabelWidthDp(text, fontSize) * FIT_TOLERANCE;
  const countryDpAtZoom0 = (widthDeg / 360) * WORLD_WIDTH_AT_ZOOM_0;

  const zoom = Math.log2(needDp / countryDpAtZoom0);

  // Rounded to 2dp purely to keep the committed/derived numbers readable; the filter
  // compares against integer zooms anyway.
  return Number(Math.min(MAX_LABEL_ZOOM, Math.max(0, zoom)).toFixed(2));
}
