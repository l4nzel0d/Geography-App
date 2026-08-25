import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getCountryFacts } from '@/data/countryFacts';
import type { QuestionResult } from '@/quiz/gradeAnswer';
import type { QuizQuestion } from '@/quiz/quizBuilder';

import { KEYBOARD_PLAY } from './keyboardPlay';
import { quizColors, quizRadii } from '../palette';

type LocatePanelProps = {
  question: QuizQuestion;
  /** The country the player has tapped, or null while nothing is picked. */
  picked: string | null;
  /** Null while the question is open; set once checked. */
  result: QuestionResult | null;
  /**
   * Whether the answer is on the map yet.
   *
   * A wrong guess turns red immediately and the answer only appears a beat later, with
   * the camera - see `REVEAL_DELAY_MS` in `quiz/play.tsx`. The panel takes it as a prop
   * rather than running its own timer so the words and the map cannot get out of step.
   */
  answerShown: boolean;
  onCheck: () => void;
  onNext: () => void;
  index: number;
  total: number;
  onEnd: () => void;
  landscape: boolean;
};

/**
 * The `locate` mode panel: a name to find, and what you picked.
 *
 * A sibling of `QuizPanel` rather than a mode branch inside it. The two share only their
 * frame - progress row, scrolling body, one button whose label swaps Check/Next - and
 * differ in everything the body does: this one has no inputs at all, so none of
 * `QuizPanel`'s field rows, chip slots, focus chain or keyboard handling applies. They
 * keep the same testIDs (`quiz-panel`, `quiz-progress`, `quiz-end`, `quiz-submit`) so the
 * screen's wiring and the Maestro flows do not care which mode is on screen.
 *
 * Like `QuizPanel` it is a flex sibling of the map, never an overlay - see CLAUDE.md on
 * why anything mounted over a live MapLibre surface lays out perfectly and never paints.
 */
export function LocatePanel({
  question,
  picked,
  result,
  answerShown,
  onCheck,
  onNext,
  index,
  total,
  onEnd,
  landscape,
}: LocatePanelProps) {
  /** Typed loosely for the same reason as `QuizPanel`'s: only the web ref has `focus`. */
  const submitRef = useRef<{ focus?: () => void } | null>(null);
  const graded = result != null;
  const correct = result?.allCorrect ?? false;

  /**
   * Once graded, the button that advances takes focus, so a desktop player can drive a
   * whole round from the keyboard: click the country, Enter to check, Enter to carry on.
   */
  useEffect(() => {
    if (!KEYBOARD_PLAY || !graded) return;
    submitRef.current?.focus?.();
  }, [graded]);

  /** Only ever rendered after grading - see the comment on the pick line below. */
  const pickedName = picked ? (getCountryFacts(picked)?.name ?? picked) : null;

  return (
    <View
      testID="quiz-panel"
      style={[styles.panel, landscape ? styles.panelLandscape : styles.panelPortrait]}
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
          accessibilityLabel="End the quiz and see your score"
        >
          <Text style={styles.end}>End quiz</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Text style={styles.eyebrow}>Find</Text>
        <Text testID="locate-prompt" style={styles.target} accessibilityRole="header">
          {question.facts.name}
        </Text>

        {/*
          **Nothing here may name the pick before it is checked.** "Your pick - New
          Zealand" under a prompt reading "Find New Zealand" answers the question, and
          the player can then retap until the panel agrees with the prompt. So an open
          question gets a bare acknowledgement that a country is selected, and the
          highlight on the map is the only thing that says WHICH - which is exactly the
          judgement being tested.

          Once graded there is nothing left to spoil, and the verdict names it.
        */}
        {graded ? (
          <View testID="locate-verdict" style={styles.verdict}>
            <Text style={[styles.verdictText, correct ? styles.ok : styles.bad]}>
              {correct ? 'Correct' : pickedName ? `Not ${pickedName}` : 'Nothing picked'}
            </Text>
            {!correct && answerShown ? (
              <Text style={styles.verdictNote}>
                {question.facts.name} is the one in green.
              </Text>
            ) : null}
          </View>
        ) : (
          <Text testID="locate-pick" style={picked ? styles.pick : styles.pickEmpty}>
            {picked ? 'Ready — press Check' : 'Tap it on the map'}
          </Text>
        )}
      </ScrollView>

      <Pressable
        ref={submitRef as never}
        testID="quiz-submit"
        style={styles.button}
        onPress={graded ? onNext : onCheck}
        accessibilityRole="button"
        accessibilityLabel={graded ? 'Next country' : 'Check my answer'}
      >
        <Text style={styles.buttonText}>{graded ? 'Next' : 'Check'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    /**
     * `flexGrow`, and NOT the `flex: 1` that `QuizPanel`'s root needs.
     *
     * They are not interchangeable. RN's `flex: 1` also sets `flexBasis: 0`, so a panel
     * carrying it reports a content height of zero to an auto-height parent - which is
     * exactly what this one has in portrait, where its slot is deliberately given no
     * height so the button ends up under the last line rather than at the foot of a
     * facts-sized box. `flexGrow: 1` keeps `flexBasis: auto`, so the panel is content-
     * height in portrait and still fills the stretched column in landscape.
     *
     * CLAUDE.md's warning about `QuizPanel` losing its `flex: 1` still stands for that
     * panel: its slot has a definite height and its body must fill it, or every answer
     * field collapses. This one has neither property.
     */
    flexGrow: 1,
    backgroundColor: quizColors.surface,
    paddingHorizontal: 18,
    paddingTop: 12,
    borderColor: quizColors.border,
  },
  panelPortrait: {
    borderTopLeftRadius: quizRadii.panel,
    borderTopRightRadius: quizRadii.panel,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  panelLandscape: {
    borderTopLeftRadius: quizRadii.panel,
    borderBottomLeftRadius: quizRadii.panel,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  progress: { color: quizColors.text, fontSize: 15, fontWeight: '700' },
  end: { color: quizColors.textMuted, fontSize: 13 },
  // Same reasoning as the panel: grows to fill a landscape column, content-height in a
  // portrait one, and never reports zero to an auto-height parent.
  body: { flexGrow: 1, flexShrink: 1 },
  bodyContent: { gap: 4, paddingBottom: 10 },
  eyebrow: {
    color: quizColors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  target: { color: quizColors.text, fontSize: 28, fontWeight: '700' },
  pick: { color: quizColors.text, fontSize: 15, marginTop: 6 },
  pickEmpty: { color: quizColors.textFaint, fontSize: 15, marginTop: 6 },
  verdict: { marginTop: 6, gap: 2 },
  verdictText: { fontSize: 17, fontWeight: '700' },
  ok: { color: quizColors.correct },
  bad: { color: quizColors.wrong },
  verdictNote: { color: quizColors.textMuted, fontSize: 13 },
  button: {
    backgroundColor: quizColors.accent,
    borderRadius: quizRadii.pill,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonText: { color: quizColors.textInverted, fontSize: 15, fontWeight: '700' },
});
