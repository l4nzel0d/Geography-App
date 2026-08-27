import type { Locale } from '@/i18n/localeTypes';

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
 * The same measure for Cyrillic, which runs a little wider.
 *
 * Russian lowercase has more full-width, flat-sided letters than Latin does - ш, щ, ж, ы,
 * м, and no narrow i/l/t/f to average them down - so the same character count occupies
 * more room. 0.60 rather than 0.55 is a ~9% allowance, which at this granularity moves a
 * label by at most a fraction of a zoom level.
 *
 * **English stays at exactly 0.55**, so no English label moves by a pixel. If Russian
 * labels turn out to overhang more or less than you want, this is the number to turn -
 * the same role `FIT_TOLERANCE` plays for both.
 */
export const CYRILLIC_GLYPH_RATIO = 0.6;

/** Which ratio a locale's text is measured with. */
export function glyphRatioFor(locale: Locale): number {
  return locale === 'ru' ? CYRILLIC_GLYPH_RATIO : AVG_GLYPH_RATIO;
}

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
 * How TALL a flag icon is drawn, in dp, for the purposes of the FIT TEST - a different
 * number from the size actually drawn, and deliberately near the LOW end of the ramp below
 * rather than its middle.
 *
 * The ramp runs 13.5 dp at world zoom to 30 dp at the map's ceiling, so no single number is
 * right everywhere and the one worth calibrating against is the small end. Over-estimating
 * hides flags at low zoom that would have fitted; under-estimating costs nothing at high
 * zoom, because a country big enough to be worth a 30 dp flag has room for one. That is the
 * argument `LABEL_FONT_SIZE` makes about its own ramp, reached from the other side.
 *
 * **Height, and that is the whole point.** This used to be a width, because every flag was
 * 4:3 and a width was therefore also a statement about height. The shipped flags now carry
 * their own ratios, and the argument this number rests on - that it matches the visual
 * weight of a name label's cap height, so switching between Name and Flag does not change
 * how busy the map feels - was always an argument about height.
 *
 * 15 is exactly what the old 20 dp width meant at 4:3, so no 4:3 flag moves by a pixel and
 * the 41 that still come from `flag-icons` are untouched. It is also what decides WHICH
 * countries get a flag: at the launch camera a 411 dp screen shows ~166 degrees of
 * longitude, so an ordinary 3:2 flag needs about 5 degrees of width to clear the fit test
 * below. Expect flags to be markedly denser than name labels - a 22 dp flag fits where 66 dp
 * of "Uzbekistan" does not - and expect a 2:1 flag to need half again as much room as a 4:3
 * one, which is the honest answer and was invisible before.
 */
export const MAP_FLAG_HEIGHT_DP = 15;

/**
 * The stops of the `icon-size` ramp, in dp of HEIGHT. See `FLAG_ICON_SIZE`.
 *
 * Three, not two, and the middle one is a knee rather than an end: 13.5 dp at world zoom,
 * 18 dp at zoom 6 - where the icon is drawn texel-for-texel from the @3x raster - and 30 dp
 * at `MAX_LABEL_ZOOM`. The top stop is what makes a flag read as a label ON the map rather
 * than as fixed chrome over it: without it the flag is the one thing on screen that does not
 * change size across the top four zoom levels, which are the ones you are in whenever you
 * have actually zoomed into somewhere.
 */
export const MAP_FLAG_MIN_HEIGHT_DP = 13.5;
export const MAP_FLAG_MAX_HEIGHT_DP = 18;
export const MAP_FLAG_ZOOMED_HEIGHT_DP = 30;

/**
 * What MapLibre thinks a flag image is TALL, in dp, before `icon-size` scales it.
 *
 * The rasters are 18 px tall at 1x and 54 px at 3x (`scripts/build-flag-assets.mjs`), and
 * the scale is reported alongside the URI, so the image arrives 18 dp tall on every density.
 * Their WIDTH is per-flag and needs no constant: `icon-size` is one scalar and scales both
 * axes, so pinning the axis every flag shares pins everything.
 *
 * The layer's `icon-size` is derived from this rather than written as a bare number, because
 * if the flags ever come out the wrong size on a device the cause is the image arriving at a
 * different pixel ratio than assumed, and this is the one place to correct it.
 */
export const MAP_FLAG_INTRINSIC_DP = 18;

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
export function estimateLabelWidthDp(
  text: string,
  fontSize = LABEL_FONT_SIZE,
  glyphRatio = AVG_GLYPH_RATIO,
): number {
  const unwrapped = text.length * glyphRatio * fontSize;
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
  glyphRatio = AVG_GLYPH_RATIO,
): number {
  if (!text) return MAX_LABEL_ZOOM;

  return getFitMinZoom(
    estimateLabelWidthDp(text, fontSize, glyphRatio) * FIT_TOLERANCE,
    widthDeg,
  );
}

/**
 * The zoom at which a country `widthDeg` degrees wide is big enough to carry its flag.
 *
 * **`aspect` is required, not defaulted**, and that is deliberate: the icons are
 * height-anchored, so a 28:11 Qatar is three times the width of a 15:13 Belgium drawn beside
 * it, and a caller that forgot to say so would silently get 4:3 - the very assumption this
 * whole change exists to delete.
 *
 * **`FIT_TOLERANCE` is reused deliberately, not by omission.** The argument its comment makes -
 * that Chile, Norway, Vietnam and Italy are never as wide as their own label, and look wrong
 * unlabelled beside named neighbours - is about width, and applies to a rectangle exactly as it
 * does to a string. If flags turn out to read as too crowded, the fix is a separate
 * `FLAG_FIT_TOLERANCE` here rather than changing the shared one and moving every text label
 * with it.
 */
export function getFlagMinZoom(widthDeg: number, aspect: number): number {
  return getFitMinZoom(MAP_FLAG_HEIGHT_DP * aspect * FIT_TOLERANCE, widthDeg);
}
