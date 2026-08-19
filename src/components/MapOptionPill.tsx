import { Pressable, StyleSheet, Text } from 'react-native';

import { quizColors, quizRadii } from './palette';

/**
 * A chrome pill that opens one of the map's option panels.
 *
 * Both of the map's settings - how the land is coloured, and what is written on it - are
 * this shape: a pill showing the current choice, opening a panel of the alternatives.
 *
 * **The fill mode used to be a three-segment control, and it had to stop being one.**
 * With the label pill added, the top-left segmented group (~206 dp) and the top-right row
 * (~187-216 dp) came to more than the 379 dp a 411 dp-wide phone has between its safe
 * areas, so they overlapped - visibly, and worse once a long field like "Currencies" was
 * selected. Collapsing the group to a pill frees about 130 dp and makes the two controls
 * symmetrical.
 *
 * What that trades away is the old segmented control's best property: every mode visible
 * at once, which is what made density discoverable. The panel keeps them all visible one
 * tap in, and the pill now states the current mode in words, which the segmented control
 * only did by colour.
 *
 * Same height as `SearchLaunchButton` and `QuizLaunchButton` - keep it that way, because
 * the chrome must not grow downward into the portrait Greenland tap at 19%,13%.
 */
export function MapOptionPill({
  testID,
  label,
  active,
  expanded,
  accessibilityLabel,
  onPress,
}: {
  testID: string;
  label: string;
  /** Filled rather than outlined, to show the setting is doing something. */
  active: boolean;
  expanded: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      style={[styles.pill, active && styles.pillActive]}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.text, active && styles.textActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: quizRadii.pill,
    // Opaque, like every other piece of chrome over the map surface: a translucent
    // background did not paint at all. See CLAUDE.md.
    backgroundColor: quizColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
  },
  pillActive: {
    backgroundColor: quizColors.text,
    borderColor: quizColors.text,
  },
  text: {
    color: quizColors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 16,
  },
  textActive: {
    color: quizColors.textInverted,
  },
});
