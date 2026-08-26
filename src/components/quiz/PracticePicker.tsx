import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PRACTICE_ROUND_SIZE } from '@/quiz/practicePool';

import { quizColors, quizRadii } from '../palette';
import { useTranslator } from '@/i18n/useTranslator';

type PracticePickerProps = {
  practice: boolean;
  onChange: (practice: boolean) => void;
};

/**
 * Who gets asked: everybody, or the countries you keep getting wrong.
 *
 * A sibling of `ModePicker` rather than another of its rows, because this is a different
 * question. The mode decides HOW you are asked - and `MODE_USES_MAP` / `MODE_ASKS_FIELDS`
 * are exhaustive records over it, so a fourth mode would have to answer "does it show a
 * map?" - while this decides WHO is asked, which every mode can be combined with.
 *
 * Ordinary conditional rendering and ordinary mounting are correct in here: the setup
 * screen has no map on it, so nothing can be inserted above a MapLibre surface. See the
 * note in `quiz/index.tsx`.
 */
export function PracticePicker({ practice, onChange }: PracticePickerProps) {
  const t = useTranslator();

  const options = [
    {
      value: false,
      label: t('quiz.practice.all.label'),
      /* Not a count, because it depends on the subregions chosen below and the start
         button already states the real number. */
      hint: t('quiz.practice.all.hint'),
    },
    {
      value: true,
      label: t('quiz.practice.weak.label'),
      /* The second sentence is the ONLY place the never-asked rule is discoverable, and
         it is what stops the option looking broken on a fresh install - where the table
         is empty and every country is therefore equally, maximally weak. */
      hint: t.plural('quiz.practice.weak.hint', PRACTICE_ROUND_SIZE),
    },
  ];

  return (
    <View testID="practice-picker" style={styles.container}>
      {options.map((option) => {
        const active = option.value === practice;
        return (
          <Pressable
            key={String(option.value)}
            testID={`practice-${option.value ? 'weak' : 'all'}`}
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
