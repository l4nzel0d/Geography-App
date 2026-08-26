import type { Translator } from '@/i18n/t';

/**
 * The wording and the buttons of the "you are leaving mid-round" confirmation.
 *
 * Pure, and separate from the dialog that draws it, for the same reason `quizPanelLayout`
 * and `sheetDismiss` are: the thing worth testing is the DECISION - how many buttons there
 * are, in what order, and what each one does - and none of that is legible once it is
 * tangled up with a `Modal` and a scrim.
 *
 * ## Order
 *
 * The buttons are STACKED, so the order is simply top to bottom and the two useful
 * outcomes come before the one that undoes the gesture: keep the round, then end it with a
 * score, then throw it away, then cancel. Cancel sits at the bottom - the action-sheet
 * convention, and the furthest point from the destructive button, which is the pair most
 * worth keeping apart.
 *
 * This was briefly the reverse. The first cut of the feature used a native `Alert.alert`,
 * whose Android backend pops the array from the END to fill its neutral/negative/positive
 * slots, so the array had to be written backwards to read forwards on screen. Drawing the
 * dialog ourselves is what removed that constraint - if it ever goes back to `Alert`, the
 * order here has to be inverted again.
 */
export type ExitAction =
  /** Stay in the round. Also what the scrim, and a second back press, mean. */
  | 'cancel'
  /** End here and go to the results screen with what has been graded - the `End quiz` path. */
  | 'score'
  /** Throw the round away and pop back to the setup screen - what back did before this existed. */
  | 'discard';

/** Drives the button's appearance in `ConfirmDialog`, not just its meaning. */
export type ExitButtonStyle = 'primary' | 'destructive' | 'quiet';

export type ExitPromptButton = {
  id: ExitAction;
  label: string;
  style: ExitButtonStyle;
};

export type ExitPrompt = {
  title: string;
  message: string;
  buttons: ExitPromptButton[];
};

export function buildExitPrompt({
  index,
  total,
  graded,
  t,
}: {
  /** Zero-based, as the screen holds it; the message counts from one. */
  index: number;
  total: number;
  /** How many questions have been CHECKED - the number a score would be out of. */
  graded: number;
  /**
   * Passed in, never read from the locale singleton.
   *
   * The whole value of this module is that the dialog's wording and button list are
   * decided somewhere Jest can read them, and a pure function that reaches for a global
   * is not that. `translatorFor('ru')` is all a Russian test needs.
   */
  t: Translator;
}): ExitPrompt {
  const score: ExitPromptButton = {
    id: 'score',
    label: t('quiz.exit.score'),
    style: 'primary',
  };
  const discard: ExitPromptButton = {
    id: 'discard',
    label: t('quiz.exit.discard'),
    style: 'destructive',
  };
  const cancel: ExitPromptButton = {
    id: 'cancel',
    label: t('quiz.exit.cancel'),
    style: 'quiet',
  };

  const message = t('quiz.exit.message', { index: index + 1, total });

  // Offering "See my score" before anything has been checked would promise a score of
  // nothing out of nothing. There is genuinely only one way out at that point, so the
  // dialog drops to two buttons rather than carrying a dead one.
  const buttons = graded > 0 ? [score, discard, cancel] : [discard, cancel];

  return { title: t('quiz.exit.title'), message, buttons };
}
