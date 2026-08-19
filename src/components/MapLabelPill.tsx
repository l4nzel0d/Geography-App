import { Pressable, StyleSheet, Text } from 'react-native';

import { LABEL_FIELDS, type LabelField } from '@/map/mapLabels';

import { quizColors, quizRadii } from './palette';

/**
 * Opens the map-label picker, sitting immediately left of the search and quiz pills.
 *
 * Shares the top-right row rather than claiming space of its own. The fill-mode toggle
 * owns the top-left and **cannot grow downward**: the portrait Greenland tap at 19%,13%
 * sits about 11 dp below it, so a second row on the left would break `tap-country.yaml`.
 * Growing the top-right row leftward is free - the nearest coordinate tap is Russia at
 * 81%,20%, some 80 dp further down - which is why this is here and the same height as
 * its neighbours.
 *
 * Shows the current field rather than a bare icon, because "which fact am I looking at"
 * is not otherwise recoverable from the map: capitals and currencies look alike at a
 * glance if you did not just choose one.
 */
export function MapLabelPill({
  field,
  expanded,
  onPress,
}: {
  field: LabelField;
  expanded: boolean;
  onPress: () => void;
}) {
  const active = field !== 'none';
  const current = LABEL_FIELDS.find((option) => option.field === field) ?? LABEL_FIELDS[0];

  return (
    <Pressable
      testID="toggle-label-field"
      onPress={onPress}
      style={[styles.pill, active && styles.pillActive]}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={`Map labels: ${current.label}. Choose what to show on each country`}
    >
      <Text style={[styles.text, active && styles.textActive]}>
        {active ? current.label : 'Labels'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    // Matches SearchLaunchButton and QuizLaunchButton exactly. Keep it that way: the row
    // must not grow taller, for the reason in the docstring above.
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: quizRadii.pill,
    // Opaque, like every other piece of chrome over the map surface.
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
