/**
 * The two places a country flag appears, and how big it is in each.
 *
 * Shared by `CountryFlag.tsx` and `CountryFlag.web.tsx` so the emoji and the SVG agree
 * on their footprint - the whole point of the web fallback is that a Windows user sees
 * the same layout as everyone else, and that only holds if the image occupies the space
 * the emoji would have.
 *
 * The image is wider and shorter than the emoji's em box because flag SVGs are 4:3 while
 * an emoji glyph is roughly square. These ratios were picked so the two render at the
 * same optical weight rather than the same nominal size.
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
