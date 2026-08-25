import { Pressable, StyleSheet, Text, View } from 'react-native';

import { type QuizMode, QUIZ_MODE_LABELS, QUIZ_MODES } from '@/quiz/quizConfig';

import { quizColors, quizRadii } from '../palette';

type ModePickerProps = {
  selected: QuizMode;
  onChange: (mode: QuizMode) => void;
};

/** What each mode actually asks of you, for the screen reader and the row's subtitle. */
const MODE_HINTS: Record<QuizMode, string> = {
  facts: 'The map zooms to a country and you type what you know about it',
  locate: 'You are given a name and have to find the country on the map',
};

/**
 * Which way round a round runs.
 *
 * A radio rather than the `FieldPicker`'s checkboxes, and that is not styling: the two
 * modes use the map in opposite directions - one paints the country and asks about it,
 * the other must not paint it because that is the answer - so they cannot be combined.
 */
export function ModePicker({ selected, onChange }: ModePickerProps) {
  return (
    <View testID="mode-picker" style={styles.container}>
      {QUIZ_MODES.map((mode) => {
        const active = mode === selected;
        return (
          <Pressable
            key={mode}
            testID={`mode-${mode}`}
            onPress={() => onChange(mode)}
            style={[styles.row, active && styles.rowActive]}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={MODE_HINTS[mode]}
          >
            <View style={styles.rowText}>
              <Text style={[styles.label, active && styles.labelActive]}>
                {QUIZ_MODE_LABELS[mode]}
              </Text>
              <Text style={[styles.hint, active && styles.hintActive]}>{MODE_HINTS[mode]}</Text>
            </View>
            <Text style={[styles.tick, active && styles.tickActive]}>{active ? '✓' : ''}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: quizRadii.card,
    backgroundColor: quizColors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
  },
  rowActive: { backgroundColor: quizColors.accent, borderColor: quizColors.accent },
  rowText: { flex: 1, gap: 2 },
  label: { color: quizColors.text, fontSize: 15, fontWeight: '600' },
  labelActive: { color: quizColors.textInverted },
  hint: { color: quizColors.textFaint, fontSize: 12 },
  hintActive: { color: quizColors.textInverted, opacity: 0.75 },
  tick: { color: quizColors.textInverted, fontSize: 16, fontWeight: '700' },
  tickActive: { color: quizColors.textInverted },
});
