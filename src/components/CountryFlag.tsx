/**
 * The country's flag. Native: just the emoji.
 *
 * Android composes regional indicator pairs into flags through Noto Color Emoji, as do
 * iOS and macOS, so there is nothing to detect, nothing to download and nothing to fall
 * back to. This stays a plain `Text` with no state and no effect, so the native render
 * path is exactly what it has always been.
 *
 * The web build resolves `CountryFlag.web.tsx` instead, where Windows ships no flag
 * glyphs at all and the flag has to be a real image. See `flagEmoji.ts`.
 */
import { Text } from 'react-native';

import { FLAG_SIZES, type FlagSize } from './flagSizes';

/** No flag in the dataset - a real white-flag glyph, which every platform draws. */
export const NO_FLAG = '🏳️';

/**
 * The line box `nudge` asks for, as a multiple of the font size.
 *
 * Deliberately generous. A flag glyph can be drawn taller than the line box the font's
 * default metrics produce, and Android then clips it - which is what cut the bottom off a
 * 120 dp flag in the quiz. Giving the line somewhere to be drawn is the fix; the empty
 * band that comes with it is invisible, because the only caller centres the glyph inside
 * a frame rather than stacking it against anything.
 */
const NUDGED_LINE_BOX = 1.5;

export function CountryFlag({
  flag,
  size = 'md',
  label,
  nudge = 0,
}: {
  flag: string | null;
  size?: FlagSize;
  /**
   * What assistive tech is told this flag is. Unset here means unlabelled, which is what
   * a decorative flag beside a country's name should be.
   *
   * **The quiz's flag round sets it**, because there the flag is the question. It matters
   * far more on the web sibling, whose `alt` text names the country's code by default -
   * "Flag of BR" is not much of a puzzle - but both take it so the two stay in step.
   */
  label?: string;
  /**
   * Lift the glyph by this fraction of the font size, and give it room not to be clipped.
   *
   * **A flag emoji does not sit in the middle of the box the text engine lays out for
   * it.** The font's metrics leave a tall empty band above the glyph and almost none
   * below, so centring that box parks the flag on the floor of whatever contains it. The
   * error is proportional to the font size, which is why three call sites lived with it
   * unnoticed for months and it became glaring the moment the quiz asked for a 120 dp
   * flag: at `xs` it is barely 2 dp, at `lg` it is 16.
   *
   * Opt-in rather than applied by size, because it is only worth correcting where the
   * flag is centred in a frame of its own. The info sheet, the search row and the results
   * row all set it beside text, where the same offset reads as ordinary baseline
   * alignment and "fixing" it would move three settled layouts for nothing.
   *
   * **Native only by construction.** The web sibling draws an `<img>` with explicit
   * dimensions - no line box, no glyph metrics, nothing to correct - and accepts this
   * prop only so the two components keep one signature.
   */
  nudge?: number;
}) {
  const { fontSize } = FLAG_SIZES[size];

  return (
    <Text
      style={{
        fontSize,
        ...(nudge
          ? {
              // The two go together: the taller line box stops Android clipping the
              // glyph, and the margin lifts it onto the centre of its container. Margin
              // rather than `transform: translateY`, which Android composites against the
              // bounds the view had BEFORE the transform - that cut the flag in half.
              // Doubled because the parent centres what is left after the margin.
              lineHeight: Math.round(fontSize * NUDGED_LINE_BOX),
              marginBottom: fontSize * nudge * 2,
            }
          : null),
      }}
      accessibilityLabel={label}
    >
      {flag ?? NO_FLAG}
    </Text>
  );
}
