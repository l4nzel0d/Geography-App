import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { quizColors, quizRadii } from './palette';

/**
 * The way into quiz mode, parked in the map's top-right corner.
 *
 * Top-LEFT is taken by the fill-mode toggle and the choropleth legend, and the info
 * sheet owns the bottom in portrait and the right edge in landscape - so the top-right
 * is the one corner that is free in both orientations and clear of every Maestro tap
 * point (the portrait Russia tap at 81%,20% is around y=169dp, well below this pill).
 *
 * Uses the imperative `router` singleton rather than `useRouter()` so that nothing here
 * touches router context at render time, and `MapScreen.test.tsx` can keep rendering the
 * screen bare.
 */
export function QuizLaunchButton() {
  return (
    <Pressable
      testID="open-quiz"
      onPress={() => router.push('/quiz')}
      style={styles.pill}
      accessibilityRole="button"
      accessibilityLabel="Start a country quiz"
    >
      <Text style={styles.label}>Quiz</Text>
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
  label: { color: quizColors.accent, fontSize: 13, fontWeight: '700' },
});
