import { Pressable, StyleSheet, Text, View } from 'react-native';

import { quizColors, quizRadii } from '../palette';
import { useTranslator } from '@/i18n/useTranslator';

type AnswerStylePickerProps = {
  choice: boolean;
  onChange: (choice: boolean) => void;
};

/**
 * How you answer: by typing, or by pressing one of four buttons.
 *
 * A sibling of `ModePicker` and `PracticePicker` rather than more rows inside either,
 * because it is a third question. The mode decides HOW you are shown a country and
 * `PracticePicker` decides WHO is asked; this decides what the input is, which every
 * mode that asks for facts can be combined with. `MODE_USES_MAP` and `MODE_ASKS_FIELDS`
 * are exhaustive over `QuizMode` precisely so a fourth mode has to answer "does it show
 * a map?", and this has no answer to give - which is what makes it a flag rather than a
 * mode. See `QuizConfig.choice`.
 *
 * Ordinary conditional rendering and ordinary mounting are correct in here: the setup
 * screen has no map on it, so nothing can be inserted above a MapLibre surface.
 */
export function AnswerStylePicker({ choice, onChange }: AnswerStylePickerProps) {
  const t = useTranslator();

  const options = [
    {
      value: false,
      label: t('quiz.style.type.label'),
      /* Names the tolerance, which is otherwise invisible: a player who does not know a
         typo is forgiven plays as if it is not. */
      hint: t('quiz.style.type.hint'),
    },
    {
      value: true,
      label: t('quiz.style.choice.label'),
      /* "Nearby" is the honest word for what the distractors are, and the one thing
         worth knowing before choosing: the options are neighbours, not the whole world,
         so this is easier than typing but not a giveaway. */
      hint: t('quiz.style.choice.hint'),
    },
  ];

  return (
    <View testID="answer-style-picker" style={styles.container}>
      {options.map((option) => {
        const active = option.value === choice;
        return (
          <Pressable
            key={String(option.value)}
            testID={`answer-style-${option.value ? 'choice' : 'type'}`}
            onPress={() => onChange(option.value)}
            style={[styles.row, active && styles.rowActive]}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={option.hint}
          >
            <View style={styles.rowText}>
              <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
              <Text style={[styles.hint, active && styles.hintActive]}>{option.hint}</Text>
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
