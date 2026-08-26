import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MessageKey } from '@/i18n/t';
import { useTranslator } from '@/i18n/useTranslator';
import { ANSWERABLE_FIELDS, type FieldId, FIELD_LABEL_KEYS } from '@/quiz/quizConfig';

import { quizColors, quizRadii } from '../palette';

type FieldPickerProps = {
  selected: FieldId[];
  onChange: (fields: FieldId[]) => void;
};

/** What each field actually asks of you, for the screen reader and the subtitle. */
/**
 * The one-line explanation under each field's name.
 *
 * Message KEYS, not words - this table was English prose in the component until a Russian
 * round showed "Страна / Name the highlighted country" on a device. Everything else on this
 * screen went through the catalogue and this one local table did not.
 */
const FIELD_HINT_KEYS: Record<FieldId, MessageKey> = {
  name: 'quiz.field.name.hint',
  capital: 'quiz.field.capital.hint',
  currency: 'quiz.field.currency.hint',
  population: 'quiz.field.population.hint',
};

export function FieldPicker({ selected, onChange }: FieldPickerProps) {
  const t = useTranslator();

  const chosen = new Set(selected);

  const toggle = (field: FieldId) => {
    const next = new Set(chosen);
    if (next.has(field)) next.delete(field);
    else next.add(field);
    // Order follows ANSWERABLE_FIELDS rather than click order, so the panel's rows are
    // always in the same sequence whatever order they were picked in.
    onChange(ANSWERABLE_FIELDS.filter((f) => next.has(f)));
  };

  return (
    <View testID="field-picker" style={styles.container}>
      {ANSWERABLE_FIELDS.map((field) => {
        const active = chosen.has(field);
        return (
          <Pressable
            key={field}
            testID={`field-${field}`}
            onPress={() => toggle(field)}
            style={[styles.row, active && styles.rowActive]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: active }}
            accessibilityLabel={t(FIELD_HINT_KEYS[field])}
          >
            <View style={styles.rowText}>
              <Text style={[styles.label, active && styles.labelActive]}>
                {t(FIELD_LABEL_KEYS[field])}
              </Text>
              <Text style={[styles.hint, active && styles.hintActive]}>{t(FIELD_HINT_KEYS[field])}</Text>
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
