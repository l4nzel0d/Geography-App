/**
 * The three places a country flag appears at a FIXED size, and how big it is in each.
 *
 * Shared by `CountryFlag.tsx` and `CountryFlag.web.tsx` so the two platforms agree on the
 * footprint.
 *
 * **These are HEIGHTS, not boxes.** Every flag used to be 4:3, because `flag-icons`
 * normalises every SVG to that, so a `{ width, height }` pair was a plain layout table.
 * The shipped flags now carry their real ratios - see `flagAspects.ts` - and a flag's width
 * is therefore a property of the flag, not of the call site. What a row of flags actually
 * needs is to share a baseline and a cap height, and that is height.
 *
 * `fontSize` survives for one case only: a record with no flag at all - BES alone - where
 * the white-flag glyph is still drawn as text.
 *
 * **There is deliberately no `lg`.** The quiz's flag round wants the flag as large as its
 * box allows rather than a number of dp, so it passes `fill` and lets the frame's
 * `aspectRatio` do the sizing. A fourth entry here would only tempt someone to pin it back
 * to a constant.
 */
export type FlagSize = 'md' | 'sm' | 'xs';

/**
 * How wide a flag is allowed to get, as a multiple of its height.
 *
 * **2.1 clamps Qatar and nothing else**, which is the whole design of the number. The
 * widest flag in the set by a distance is Qatar's 28:11 = 2.55; the next widest are a
 * cluster at 2.00-2.01, the ordinary 1:2 ensigns and tricolours, sixty-four of them. A cap
 * of exactly 2 would shave half a percent off all sixty-four for no reason, and a cap at
 * 2.55 would size every row for one outlier.
 *
 * A clamped flag gives up HEIGHT rather than being cropped or stretched - see `flagBox`.
 * Qatar therefore draws a little shorter than its neighbours, which is the honest way to
 * say "this flag really is that long".
 */
const MAX_WIDTH_RATIO = 2.1;

const size = (fontSize: number, height: number) => ({
  fontSize,
  height,
  maxWidth: Math.round(height * MAX_WIDTH_RATIO),
});

export const FLAG_SIZES: Record<FlagSize, { fontSize: number; height: number; maxWidth: number }> =
  {
    /** The info sheet header. */
    md: size(34, 30),
    /** A search result row. */
    sm: size(24, 21),
    /** A per-question row on the quiz results screen. */
    xs: size(20, 18),
  };

/**
 * The box a flag of this ratio occupies at this height.
 *
 * Height-first, width-capped - the same shape `FlagStage`'s frame makes against the whole
 * screen. A flag no wider than the cap is drawn at full height, and one that is wider gives
 * up height instead of overflowing into the country name beside it.
 *
 * Rounded, because these are the `width`/`height` attributes of a web `<img>` as well as RN
 * styles, and a fractional attribute there is a reflow once the image decodes.
 */
export function flagBox(height: number, aspect: number, maxWidth: number) {
  // A non-finite or non-positive aspect would collapse the box to nothing or to NaN, and a
  // NaN width on Android is a silently unmeasured view rather than an error.
  if (!Number.isFinite(aspect) || aspect <= 0) return { width: maxWidth, height };

  const width = Math.round(height * aspect);
  return width <= maxWidth
    ? { width, height }
    : { width: maxWidth, height: Math.round(maxWidth / aspect) };
}
