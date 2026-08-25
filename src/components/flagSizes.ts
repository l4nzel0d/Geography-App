/**
 * Every place a country flag appears, and how big it is in each.
 *
 * Shared by `CountryFlag.tsx` and `CountryFlag.web.tsx` so the emoji and the SVG agree
 * on their footprint - the whole point of the web fallback is that a Windows user sees
 * the same layout as everyone else, and that only holds if the image occupies the space
 * the emoji would have.
 *
 * The image is wider and shorter than the emoji's em box because flag SVGs are 4:3 while
 * an emoji glyph is roughly square. Every entry keeps the same two ratios - width is
 * ~1.167x the font size and height ~0.875x, which is exactly 4:3 - so the two paths
 * render at the same optical weight rather than the same nominal size.
 *
 * **`lg` is the one size where that agreement is not enough**, because an emoji occupies
 * its font's LINE box (~1.2x the font size) while the `<img>` occupies exactly `height`.
 * At `md` those differ by 4 dp and nobody notices; at `lg` it is ~39, which is a stage
 * that lays out one way on Android and another on Windows. `FlagStage` pins its own box
 * height for that reason - see the note there.
 */
export type FlagSize = 'lg' | 'md' | 'sm' | 'xs';

export const FLAG_SIZES: Record<FlagSize, { fontSize: number; width: number; height: number }> = {
  /**
   * The quiz's flag round, where the flag IS the question.
   *
   * 120 rather than something larger for a reason worth keeping: Android draws emoji as
   * scalable COLRv1 vectors only from 13 (API 33). Below that they are 136x128 bitmap
   * strikes, so on a 3x screen this is already a ~2.6x upscale and anything bigger starts
   * to visibly mush the detailed flags - Mexico, Serbia, Croatia's chequerboard. If it
   * looks soft on an older device, this number is the knob; the ratios below it hold.
   */
  lg: { fontSize: 120, width: 140, height: 105 },
  /** The info sheet header. */
  md: { fontSize: 34, width: 40, height: 30 },
  /** A search result row. */
  sm: { fontSize: 24, width: 28, height: 21 },
  /** A per-question row on the quiz results screen. */
  xs: { fontSize: 20, width: 24, height: 18 },
};
