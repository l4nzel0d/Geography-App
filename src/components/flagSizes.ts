/**
 * The three places a country flag appears at a FIXED size, and how big it is in each.
 *
 * Shared by `CountryFlag.tsx` and `CountryFlag.web.tsx` so the two platforms agree on the
 * footprint. Both draw the same 4:3 SVG now, so this is a plain layout table rather than
 * the reconciliation between a glyph's em box and an image that it used to be.
 *
 * `fontSize` survives for one case only: a record with no flag at all - BES alone - where
 * the white-flag glyph is still drawn as text.
 *
 * **There is deliberately no `lg`.** The quiz's flag round wants the flag as large as its
 * box allows rather than a number of dp, so it passes `fill` and lets the frame's
 * `aspectRatio` do the sizing. A fourth entry here would only tempt someone to pin it
 * back to a constant.
 */
export type FlagSize = 'md' | 'sm' | 'xs';

export const FLAG_SIZES: Record<FlagSize, { fontSize: number; width: number; height: number }> = {
  /** The info sheet header. */
  md: { fontSize: 34, width: 40, height: 30 },
  /** A search result row. */
  sm: { fontSize: 24, width: 28, height: 21 },
  /** A per-question row on the quiz results screen. */
  xs: { fontSize: 20, width: 24, height: 18 },
};
