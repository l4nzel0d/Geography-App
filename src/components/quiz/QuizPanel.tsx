import { useEffect, useRef } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { QuestionResult } from '@/quiz/gradeAnswer';
import { CURRENCIES_REQUIRED } from '@/quiz/gradeAnswer';
import type { QuizQuestion } from '@/quiz/quizBuilder';
import type { FieldId } from '@/quiz/quizConfig';

import { AnswerField } from './AnswerField';
import { autoFocusFirstField, KEYBOARD_PLAY } from './keyboardPlay';
import { quizColors, quizRadii } from '../palette';
import { useTranslator } from '@/i18n/useTranslator';

export type PanelAnswers = {
  text: Partial<Record<FieldId, string>>;
  chips: Partial<Record<FieldId, string[]>>;
  /**
   * The option pressed per field, in a choice round.
   *
   * A third map rather than a reuse of `text`, which is the uncommitted typed draft: a
   * pick is already a canonical string, and letting one reach `toAnswerInput` would put
   * a formatted population figure through a parser meant for what a player typed.
   */
  picks: Partial<Record<FieldId, string>>;
};

type QuizPanelProps = {
  /** Every field the ROUND asks, not just this country - the row set never changes. */
  configuredFields: FieldId[];
  question: QuizQuestion;
  answers: PanelAnswers;
  onChangeText: (field: FieldId, value: string) => void;
  onChangeChips: (field: FieldId, chips: string[]) => void;
  onPick: (field: FieldId, value: string) => void;
  /** Whether the round is answered by button. Constant for the life of the round. */
  choice: boolean;
  /** Null while the question is open; set once checked. */
  result: QuestionResult | null;
  onCheck: () => void;
  onNext: () => void;
  index: number;
  total: number;
  onEnd: () => void;
  landscape: boolean;
  /**
   * Space under the Check button, in dp - the safe-area inset plus the panel's own gutter.
   *
   * **It has to be padding on THIS view, not on the slot that holds it.** The slot has no
   * background of its own, so padding there takes its space out of the panel's surface: the
   * button ends up flush against the panel's bottom edge with a strip of ocean below it,
   * which is the opposite of what the space was for. Both quiz footers - `quiz/index.tsx`
   * and `results.tsx` - put `insets.bottom + N` on the surface itself for this reason, and
   * this is the same shape.
   *
   * A prop rather than a constant because only the screen knows the inset, and it drops to
   * a bare gutter while the keyboard is up - the screen has already reserved the IME's
   * height there, and adding the navigation bar's inset on top would leave a gap.
   */
  bottomInset: number;
};

/**
 * The answer form.
 *
 * A flex sibling of the map rather than an overlay on it. That is the structural fix for
 * the paint bug in CLAUDE.md: this panel grows a chip every time the player names a
 * currency, and a view inserted over a live MapLibre surface after mount is laid out
 * perfectly and never drawn. Nothing here is over the map, so it cannot happen.
 *
 * The belt to that braces: one row per CONFIGURED field for the whole round, hidden with
 * `display` when the current country cannot be asked it, and one button whose label
 * changes rather than two that swap.
 */
export function QuizPanel({
  configuredFields,
  question,
  answers,
  onChangeText,
  onChangeChips,
  onPick,
  choice,
  result,
  onCheck,
  onNext,
  index,
  total,
  onEnd,
  landscape,
  bottomInset,
}: QuizPanelProps) {
  const t = useTranslator();

  const inputs = useRef<Record<string, TextInput | null>>({});

  /**
   * The Check/Next button, so it can take focus once an answer is graded.
   *
   * Typed loosely on purpose: RN's `Pressable` exposes no cross-platform `focus`, but
   * on the web the ref IS the DOM node and does. The optional call keeps native inert.
   */
  const submitRef = useRef<{ focus?: () => void } | null>(null);
  const askable = new Set(question.fields);
  const graded = result != null;

  const requirementFor = (field: FieldId) => {
    // "Currency (3 of 9)" is a promise about typing three chips. A choice round asks for
    // one of four buttons, so the count would be describing a rule it does not follow.
    if (choice) return undefined;
    if (field === 'currency') {
      return {
        required: Math.min(CURRENCIES_REQUIRED, question.facts.currencies.length),
        available: question.facts.currencies.length,
      };
    }
    return undefined;
  };

  const visibleFields = configuredFields.filter((field) => askable.has(field));

  /**
   * A new country arrives: put the cursor in the first thing it can be asked.
   *
   * Keyed on the country rather than on the field list, which is rebuilt every render.
   * Desktop web only - a phone browser is a web build too, and there this would summon
   * the on-screen keyboard for every question. See `keyboardPlay.ts`.
   */
  useEffect(() => {
    // Nothing to focus and no keyboard to summon when the answers are buttons.
    if (choice || !autoFocusFirstField()) return;
    inputs.current[visibleFields[0]]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.iso3]);

  /**
   * An answer has been graded: move focus to the button that advances.
   *
   * This is the step that closes the loop - without it a player types every answer, hits
   * Enter to check, and then has to reach for the mouse to carry on. With it, Enter
   * checks and Enter again moves to the next country.
   */
  useEffect(() => {
    if (!KEYBOARD_PLAY || !graded) return;
    submitRef.current?.focus?.();
  }, [graded]);

  const focusNext = (field: FieldId) => {
    const position = visibleFields.indexOf(field);
    const next = visibleFields[position + 1];
    if (next) inputs.current[next]?.focus();
    else {
      Keyboard.dismiss();
      if (!graded) onCheck();
    }
  };

  return (
    <View
      testID="quiz-panel"
      style={[
        styles.panel,
        landscape ? styles.panelLandscape : styles.panelPortrait,
        { paddingBottom: bottomInset },
      ]}
    >
      <View style={styles.header}>
        <Text testID="quiz-progress" style={styles.progress}>
          {index + 1} / {total}
        </Text>
        <Pressable
          testID="quiz-end"
          onPress={onEnd}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('quiz.endA11y')}
        >
          <Text style={styles.end}>{t('quiz.end')}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        keyboardShouldPersistTaps="handled"
      >
        {configuredFields.map((field, position) => (
          <AnswerField
            key={field}
            ref={(node) => {
              inputs.current[field] = node;
            }}
            field={field}
            visible={askable.has(field)}
            value={answers.text[field] ?? ''}
            chips={answers.chips[field] ?? []}
            onChangeText={(text) => onChangeText(field, text)}
            onChangeChips={(chips) => onChangeChips(field, chips)}
            choice={choice}
            options={question.options?.[field]}
            picked={answers.picks[field]}
            onPick={(value) => onPick(field, value)}
            requirement={requirementFor(field)}
            grade={result?.grades.find((g) => g.field === field)}
            onSubmitEditing={() => focusNext(field)}
            isLast={position === configuredFields.length - 1}
          />
        ))}
      </ScrollView>

      <Pressable
        ref={submitRef as never}
        testID="quiz-submit"
        style={styles.button}
        onPress={() => {
          Keyboard.dismiss();
          if (graded) onNext();
          else onCheck();
        }}
        accessibilityRole="button"
        accessibilityLabel={t(graded ? 'quiz.nextA11y' : 'quiz.checkA11y')}
      >
        <Text style={styles.buttonText}>{t(graded ? 'quiz.next' : 'quiz.check')}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    // Fills the box `quizPanelLayout` allotted it. Without this the panel shrink-wraps
    // its header and button, the body ScrollView's `flex: 1` resolves against a
    // zero-height parent, and every answer field collapses to nothing.
    flex: 1,
    backgroundColor: quizColors.surface,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderColor: quizColors.border,
  },
  panelPortrait: { borderTopWidth: StyleSheet.hairlineWidth },
  panelLandscape: { borderLeftWidth: StyleSheet.hairlineWidth },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  progress: { color: quizColors.text, fontSize: 15, fontWeight: '700' },
  end: { color: quizColors.textMuted, fontSize: 13 },
  body: { flex: 1 },
  bodyContent: { gap: 12, paddingBottom: 10 },
  button: {
    backgroundColor: quizColors.accent,
    borderRadius: quizRadii.pill,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: quizColors.textInverted, fontSize: 15, fontWeight: '700' },
});
