import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { quizColors, quizRadii } from '../palette';

/**
 * The way into country search, sitting immediately left of the quiz pill.
 *
 * Shares the top-right row rather than claiming a corner of its own, because there is no
 * corner left: the fill-mode toggle and the choropleth legend own the top-left, and the
 * info sheet owns the bottom in portrait and the right edge in landscape. Keeping it the
 * same height as the quiz pill is what stops the chrome growing downward into the three
 * Maestro flows that tap the map by screen percentage.
 *
 * Uses the imperative `router` singleton for the same reason `QuizLaunchButton` does:
 * nothing here touches router context at render time, so `MapScreen.test.tsx` can keep
 * rendering the screen bare.
 */
export function SearchLaunchButton() {
  return (
    <Pressable
      testID="open-search"
      onPress={() => router.push('/search')}
      style={styles.pill}
      accessibilityRole="button"
      accessibilityLabel="Search for a country"
    >
      {/* A glyph rather than an icon font: nothing else in the app ships one, and a
          dependency for one character is not worth the bundle or the offline risk. */}
      <Text style={styles.glyph}>⌕</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: quizRadii.pill,
    // Opaque, like every other piece of chrome over the map surface.
    backgroundColor: quizColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
  },
  // Nudged up a little: the glyph sits low in its line box, which reads as misaligned
  // next to the quiz pill's text.
  glyph: { color: quizColors.accent, fontSize: 20, lineHeight: 20, marginTop: -2 },
});
