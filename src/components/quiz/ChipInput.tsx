import { forwardRef } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { quizColors, quizRadii } from '../palette';
import { useTranslator } from '@/i18n/useTranslator';

/** Nobody is naming more official languages than this; the pool is fixed, see below. */
export const MAX_CHIPS = 12;

type ChipInputProps = {
  testID: string;
  chips: string[];
  onChange: (chips: string[]) => void;
  /**
   * The uncommitted text, owned by the parent.
   *
   * Deliberately NOT local state. It used to be, and the last thing typed - the thing
   * nobody presses return on before hitting Check - was invisible to the grader, so a
   * correct answer scored as "left blank". Keeping it in the same place as the chips is
   * what makes that impossible; see `toAnswerInput`.
   */
  draft: string;
  onChangeDraft: (text: string) => void;
  placeholder: string;
  editable: boolean;
  onSubmitLast?: () => void;
};

/**
 * Multi-value entry for the set fields - languages and currencies.
 *
 * Type a word, press return, it becomes a chip. The chip SLOTS are all mounted from the
 * first frame and merely hidden when unused, which is the same discipline as
 * `ChoroplethLegend`: this panel sits next to a live MapLibre surface, and inserting a
 * view into that tree after mount is the bug that has cost this project the most.
 * The split layout should make it impossible here, but the cost of being sure is a
 * `display: 'none'` instead of a conditional render.
 */
export const ChipInput = forwardRef<TextInput, ChipInputProps>(function ChipInput(
  { testID, chips, onChange, draft, onChangeDraft, placeholder, editable, onSubmitLast },
  ref,
) {
  const t = useTranslator();

  const commit = (text: string): boolean => {
    const value = text.trim();
    onChangeDraft('');
    if (!value || chips.length >= MAX_CHIPS) return false;
    // Case-insensitive, so a repeat is rejected here rather than silently failing to
    // count later.
    if (chips.some((chip) => chip.toLowerCase() === value.toLowerCase())) return false;
    onChange([...chips, value]);
    return true;
  };

  const remove = (index: number) => onChange(chips.filter((_, i) => i !== index));

  return (
    <View testID={testID}>
      <TextInput
        ref={ref}
        testID={`${testID}-input`}
        style={styles.input}
        value={draft}
        onChangeText={onChangeDraft}
        editable={editable}
        placeholder={placeholder}
        placeholderTextColor={quizColors.textFaint}
        // Autocorrect would quietly turn "Nuuk" into "Nuke" and mark a right answer wrong.
        autoCorrect={false}
        autoCapitalize="words"
        spellCheck={false}
        returnKeyType="done"
        blurOnSubmit={false}
        onSubmitEditing={() => {
          const added = commit(draft);
          // Submitting an empty box means "I am finished with this field", so it moves
          // on; submitting a word means "add that", so it stays for the next one.
          if (!added) onSubmitLast?.();
        }}
        accessibilityLabel={placeholder}
      />

      <View style={styles.chips}>
        {Array.from({ length: MAX_CHIPS }, (_, index) => {
          const chip = chips[index];
          return (
            <Pressable
              key={index}
              testID={`${testID}-chip-${index}`}
              // Always mounted; hidden when there is no chip for this slot.
              style={[styles.chip, chip == null && styles.slotEmpty]}
              onPress={chip != null && editable ? () => remove(index) : undefined}
              accessibilityRole="button"
              accessibilityLabel={chip ? t('quiz.chip.remove', { chip }) : undefined}
              accessibilityElementsHidden={chip == null}
              importantForAccessibility={chip == null ? 'no-hide-descendants' : 'yes'}
            >
              <Text style={styles.chipText}>{chip ?? ''}</Text>
              {chip != null && editable ? <Text style={styles.chipRemove}>✕</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  input: {
    backgroundColor: quizColors.field,
    borderRadius: quizRadii.field,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
    color: quizColors.text,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 15,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: quizRadii.pill,
    backgroundColor: quizColors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
  },
  slotEmpty: { display: 'none' },
  chipText: { color: quizColors.text, fontSize: 13 },
  chipRemove: { color: quizColors.textFaint, fontSize: 11 },
});
