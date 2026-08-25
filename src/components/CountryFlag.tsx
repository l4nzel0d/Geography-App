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

export function CountryFlag({ flag, size = 'md' }: { flag: string | null; size?: FlagSize }) {
  return <Text style={{ fontSize: FLAG_SIZES[size].fontSize }}>{flag ?? NO_FLAG}</Text>;
}
