import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslator } from '@/i18n/useTranslator';
import {
  type QuizMode,
  QUIZ_MODE_HINT_KEYS,
  QUIZ_MODE_LABEL_KEYS,
  QUIZ_MODES,
} from '@/quiz/quizConfig';

import { quizColors, quizRadii } from '../palette';

type ModePickerProps = {
  selected: QuizMode;
  onChange: (mode: QuizMode) => void;
};

/**
 * Which way round a round runs.
 *
 * A radio rather than the `FieldPicker`'s checkboxes, and that is not styling: the modes
 * use the map in incompatible ways - one paints the country and asks about it, one must
 * not paint it because that is the answer, and one shows no map at all - so they cannot
 * be combined.
 *
 * The hints live in `quizConfig.ts` rather than here because the setup screen's own
 * subtitle says the same thing; two copies drifted apart the moment a third mode existed.
 */
export function ModePicker({ selected, onChange }: ModePickerProps) {
  const t = useTranslator();

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
            accessibilityLabel={t(QUIZ_MODE_HINT_KEYS[mode])}
          >
            <View style={styles.rowText}>
              <Text style={[styles.label, active && styles.labelActive]}>
                {t(QUIZ_MODE_LABEL_KEYS[mode])}
              </Text>
              <Text style={[styles.hint, active && styles.hintActive]}>
                {t(QUIZ_MODE_HINT_KEYS[mode])}
              </Text>
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
