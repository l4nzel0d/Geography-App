import { forwardRef } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { FieldGrade } from '@/quiz/gradeAnswer';
import { useTranslator } from '@/i18n/useTranslator';
import { type FieldId, FIELD_LABEL_KEYS, isSetField } from '@/quiz/quizConfig';

import { ChipInput } from './ChipInput';
import { quizColors, quizRadii } from '../palette';

type AnswerFieldProps = {
  field: FieldId;
  /** False when the current country cannot be asked this - the row hides but stays mounted. */
  visible: boolean;
  value: string;
  chips: string[];
  onChangeText: (text: string) => void;
  onChangeChips: (chips: string[]) => void;
  /** How many entries a set field needs, and out of how many, for the label. */
  requirement?: { required: number; available: number };
  /** Set once the answer is checked; drives the border colour and the reveal line. */
  grade?: FieldGrade;
  onSubmitEditing?: () => void;
  isLast: boolean;
};

/**
 * One labelled input, plus the reveal line under it.
 *
 * Both the row and its reveal line are ALWAYS mounted - hidden with `display` and
 * emptied of text, never conditionally rendered. Same reason as everything else on this
 * screen: it lives beside a live MapLibre surface, and views that appear after the first
 * mount are the one thing this project has learned not to do.
 */
export const AnswerField = forwardRef<TextInput, AnswerFieldProps>(function AnswerField(
  {
    field,
    visible,
    value,
    chips,
    onChangeText,
    onChangeChips,
    requirement,
    grade,
    onSubmitEditing,
    isLast,
  },
  ref,
) {
  const t = useTranslator();

  const isSet = isSetField(field);
  const graded = grade != null;
  const editable = !graded;

  // "Languages (3 of 15)" is not decoration: without it there is no way to know whether
  // naming three is enough, and guessing at the target is not the skill being tested.
  const fieldLabel = t(FIELD_LABEL_KEYS[field]);
  const label =
    requirement && requirement.available > requirement.required
      ? t('quiz.field.nameNOfM', {
          label: fieldLabel,
          required: requirement.required,
          available: requirement.available,
        })
      : requirement && requirement.available > 1
        ? t('quiz.field.allOf', { label: fieldLabel, available: requirement.available })
        : fieldLabel;

  /**
   * On a correct SET answer, name what the answers actually were.
   *
   * "Correct" alone is a wasted teaching moment here: the grader accepts a head noun, so
   * someone who typed "yen" never sees "Japanese yen", and someone who named 2 of 2
   * currencies never sees them spelled out. Only when the player had to name the WHOLE
   * set, though - Zimbabwe wants 3 of its 9 currencies and 3 of its 15 languages, and
   * listing all of those on a correct answer is a wall of text, not a reward.
   */
  const namesTheWholeSet =
    isSet && requirement != null && requirement.required === requirement.available;

  /**
   * Population is named on a correct answer too, for a sharper version of the same
   * reason: it is marked right anywhere within 20% either way, so "Correct" confirms the
   * player knew the size while withholding the one thing they came for. The figure IS
   * the fact being taught, and it is the only field whose right answer is a band rather
   * than a value.
   */
  const revealsExpected = namesTheWholeSet || field === 'population';

  const revealText = !graded
    ? ''
    : grade.correct
      ? revealsExpected
        ? t('quiz.reveal.correctWith', { expected: grade.expected })
        : t('quiz.reveal.correct')
      : t('quiz.reveal.answer', { expected: grade.expected });

  const detailText =
    graded && !grade.correct && grade.percentOff != null
      ? t('quiz.detail.percent', {
          given: grade.given,
          percent: Math.abs(Math.round(grade.percentOff * 100)),
          direction: t(grade.percentOff < 0 ? 'quiz.detail.under' : 'quiz.detail.over'),
        })
      : graded && !grade.correct && grade.missed?.length
        ? t('quiz.detail.missed', { missed: grade.missed.join(', ') })
        : graded && !grade.correct && grade.given
          ? t('quiz.detail.youSaid', { given: grade.given })
          : '';

  return (
    <View
      testID={`quiz-field-${field}`}
      style={[styles.row, !visible && styles.hidden]}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
    >
      <Text style={styles.label}>{label}</Text>

      {isSet ? (
        <ChipInput
          ref={ref}
          testID={`quiz-input-${field}`}
          chips={chips}
          onChange={onChangeChips}
          // The set fields use the SAME `value`/`onChangeText` pair as the plain ones -
          // it is the uncommitted draft. Keeping it here rather than inside ChipInput is
          // what lets `toAnswerInput` count a word the player never pressed return on.
          draft={value}
          onChangeDraft={onChangeText}
          placeholder={t('quiz.chip.placeholder')}
          editable={editable}
          onSubmitLast={onSubmitEditing}
        />
      ) : (
        <TextInput
          ref={ref}
          testID={`quiz-input-${field}`}
          style={[
            styles.input,
            graded && (grade.correct ? styles.inputCorrect : styles.inputWrong),
          ]}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          placeholder={t(
            field === 'population' ? 'quiz.placeholder.population' : 'quiz.placeholder.answer',
          )}
          placeholderTextColor={quizColors.textFaint}
          keyboardType={field === 'population' ? 'numbers-and-punctuation' : 'default'}
          autoCorrect={false}
          autoCapitalize="words"
          spellCheck={false}
          returnKeyType={isLast ? 'done' : 'next'}
          blurOnSubmit={isLast}
          onSubmitEditing={onSubmitEditing}
          accessibilityLabel={label}
        />
      )}

      <Text
        testID={`quiz-reveal-${field}`}
        style={[styles.reveal, graded && (grade.correct ? styles.revealCorrect : styles.revealWrong)]}
      >
        {revealText}
      </Text>
      <Text testID={`quiz-detail-${field}`} style={styles.detail}>
        {detailText}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: { gap: 4 },
  hidden: { display: 'none' },
  label: {
    color: quizColors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
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
  inputCorrect: { borderColor: quizColors.correct, borderWidth: 1 },
  inputWrong: { borderColor: quizColors.wrong, borderWidth: 1 },
  reveal: { fontSize: 12, color: 'transparent' },
  revealCorrect: { color: quizColors.correct },
  revealWrong: { color: quizColors.wrong },
  detail: { fontSize: 11, color: quizColors.textFaint },
});
