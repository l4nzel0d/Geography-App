import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslator } from '@/i18n/useTranslator';

import { quizColors, quizRadii } from './palette';

/**
 * The way into `/about`, in the bottom-left corner of the map.
 *
 * ## Why it is not in the top row with the others
 *
 * Because it does not fit. `chromeWidth.test.ts` budgets both top rows against the 379 dp
 * between the safe-area insets at 411 dp, and Russian already uses 355 of it. A glyph
 * button costs 40 dp plus an 8 dp gap and even a compact single-glyph pill costs ~36, so
 * either overflows - and two chrome rows drawing on top of each other is the one bug
 * CLAUDE.md records as having actually shipped.
 *
 * ## Why the bottom LEFT specifically
 *
 * `MapControls` contains no `bottom` at all - the legend hangs from `top: belowPills`, not
 * from the floor - so both bottom corners are unclaimed. Left wins over right because
 * `CountryInfoSheet` docks right, full height, in landscape, which would bury a
 * bottom-right button for as long as a country was selected. In portrait the sheet is
 * full width and covers either corner, which is fine: the card is dismissible, and since
 * `MapScreen` renders this button BEFORE the sheet, the sheet takes the taps rather than
 * leaving a live control underneath it.
 *
 * ## Two things not to change without re-deriving a Maestro point
 *
 * `landscape-info-panel.yaml`'s ocean-deselect tap is at `16%,83%` - 146 dp from the left
 * and 70 dp up from the bottom on the pinned 914x411 dp window. This button clears it by
 * ~82 dp horizontally, which is only true while it stays a **glyph with no label beside
 * it**. Do not let it grow rightward.
 *
 * The other neighbour is much closer than it looks. Measured on the emulator in landscape,
 * the label-field panel's six rows end about **2 dp** above this button - they very nearly
 * touch. That is survivable only because `MapScreen` draws this button BEFORE
 * `MapControls`, so a panel that ever grows taller covers it rather than being covered by
 * it; see the comment there. A seventh label field is what would cross that line.
 *
 * Mounted from the first frame and never conditionally rendered, like the pills - it
 * never appears or disappears, so it needs none of the legend's slide-in machinery.
 */
export function AboutLaunchButton() {
  const t = useTranslator();
  const insets = useSafeAreaInsets();

  return (
    <Pressable
      testID="open-about"
      onPress={() => router.push('/about')}
      // The imperative `router` singleton, like the other two launch buttons: nothing
      // here touches router context at render time, which is what lets
      // `MapScreen.test.tsx` render the screen bare with no router mock.
      style={[
        styles.button,
        { left: insets.left + 16, bottom: insets.bottom + 16 },
      ]}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={t('about.open')}
    >
      {/* A glyph rather than an icon font, for the reason `SearchLaunchButton` gives:
          nothing else in the app ships one, and a dependency for a single character is
          not worth the bundle or the offline risk. */}
      <Text style={styles.glyph}>i</Text>
    </Pressable>
  );
}

/** Diameter. Matches the search button's budgeted width, so the chrome reads as one set. */
const SIZE = 40;

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: quizRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    // Opaque, like every other piece of chrome over the map surface. A translucent
    // background over MapLibre did not paint at all.
    backgroundColor: quizColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
  },
  glyph: {
    color: quizColors.accent,
    fontSize: 18,
    lineHeight: 22,
    // A lowercase serif-less "i" reads as an accident at this size without the weight.
    fontWeight: '700',
  },
});
