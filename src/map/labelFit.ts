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
 * How wide a flag icon is drawn, in dp - the nominal middle of the layer's `icon-size` ramp,
 * exactly as `LABEL_FONT_SIZE` is the middle of its `text-size` one.
 *
 * The user's call. It roughly matches the visual weight of a name label's cap height, so
 * switching between Name and Flag does not change how busy the map feels. It is also what
 * decides WHICH countries get a flag: at the launch camera a 411 dp screen shows ~166 degrees
 * of longitude, so a country needs about 4.5 degrees of width to clear the fit test below.
 * Expect flags to be markedly denser than name labels - a 20 dp flag fits where 66 dp of
 * "Uzbekistan" does not.
 */
export const MAP_FLAG_WIDTH_DP = 20;

/**
 * What MapLibre thinks a flag image is wide, in dp, before `icon-size` scales it.
 *
 * The rasters are 24 px at 1x and 72 px at 3x (`scripts/build-flag-assets.mjs`), and the scale
 * is reported alongside the URI, so the image arrives as 24 dp on every density. The layer's
 * `icon-size` is `MAP_FLAG_WIDTH_DP / MAP_FLAG_INTRINSIC_DP` - derived from these two rather
 * than written as a bare number, because if the flags ever come out the wrong size on a device
 * the cause is the image arriving at a different pixel ratio than assumed, and this is the one
 * place to correct it.
 */
export const MAP_FLAG_INTRINSIC_DP = 24;

/**
 * Device pixels per dp in the raster the map actually draws - the `@3x` file.
 *
 * Native never needs to be told: React Native reports the scale it resolved and MapLibre reads
 * it back off the decoded bitmap's density. The web has no such channel - a PNG carries no
 * notion of scale - so `WorldMap.web.tsx` passes this to `addImage` as `pixelRatio`, and
 * without it every flag is drawn three times too large.
 */
export const MAP_FLAG_RASTER_SCALE = 3;

/**
 * Estimated rendered width of a label in dp, capped at the wrap width.
 */
export function estimateLabelWidthDp(text: string, fontSize = LABEL_FONT_SIZE): number {
  const unwrapped = text.length * AVG_GLYPH_RATIO * fontSize;
  return Math.min(unwrapped, TEXT_MAX_WIDTH_EM * fontSize);
}

/**
 * The zoom at which `neededDp` of label fits over a country `widthDeg` degrees wide.
 *
 * The half `getLabelMinZoom` and `getFlagMinZoom` share. What differs between them is only how
 * many dp the thing being drawn wants: a string's width is estimated from its length, a flag's
 * is a constant.
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
export function getFitMinZoom(neededDp: number, widthDeg: number): number {
  if (!Number.isFinite(widthDeg) || widthDeg <= 0) return MAX_LABEL_ZOOM;

  const countryDpAtZoom0 = (widthDeg / 360) * WORLD_WIDTH_AT_ZOOM_0;

  const zoom = Math.log2(neededDp / countryDpAtZoom0);

  // Rounded to 2dp purely to keep the committed/derived numbers readable; the filter
  // compares against integer zooms anyway.
  return Number(Math.min(MAX_LABEL_ZOOM, Math.max(0, zoom)).toFixed(2));
}

/** The zoom at which `text` starts being drawn over a country `widthDeg` degrees wide. */
export function getLabelMinZoom(
  text: string,
  widthDeg: number,
  fontSize = LABEL_FONT_SIZE,
): number {
  if (!text) return MAX_LABEL_ZOOM;

  return getFitMinZoom(estimateLabelWidthDp(text, fontSize) * FIT_TOLERANCE, widthDeg);
}

/**
 * The zoom at which a country `widthDeg` degrees wide is big enough to carry its flag.
 *
 * **`FIT_TOLERANCE` is reused deliberately, not by omission.** The argument its comment makes -
 * that Chile, Norway, Vietnam and Italy are never as wide as their own label, and look wrong
 * unlabelled beside named neighbours - is about width, and applies to a rectangle exactly as it
 * does to a string. If flags turn out to read as too crowded, the fix is a separate
 * `FLAG_FIT_TOLERANCE` here rather than changing the shared one and moving every text label
 * with it.
 */
export function getFlagMinZoom(widthDeg: number): number {
  return getFitMinZoom(MAP_FLAG_WIDTH_DP * FIT_TOLERANCE, widthDeg);
}
