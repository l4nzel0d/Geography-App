/**
 * The country's flag for the info sheet header. Native: just the emoji.
 *
 * Android composes regional indicator pairs into flags through Noto Color Emoji, as do
 * iOS and macOS, so there is nothing to detect, nothing to download and nothing to fall
 * back to. This stays a plain `Text` with no state and no effect, so the native render
 * path is exactly what it has always been.
 *
 * The web build resolves `CountryFlag.web.tsx` instead, where Windows ships no flag
 * glyphs at all and the flag has to be a real image. See `flagEmoji.ts`.
 */
import { StyleSheet, Text } from 'react-native';

/** No flag in the dataset - a real white-flag glyph, which every platform draws. */
export const NO_FLAG = '🏳️';

export function CountryFlag({ flag }: { flag: string | null }) {
  return <Text style={styles.flag}>{flag ?? NO_FLAG}</Text>;
}

const styles = StyleSheet.create({
  flag: { fontSize: 34 },
});
