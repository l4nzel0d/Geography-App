/**
 * The wording and the buttons of the "clear everything you have learned" confirmation.
 *
 * Pure, and separate from the dialog that draws it, for the same reason `exitPrompt.ts` is:
 * the thing worth testing is the DECISION - how many buttons there are, in what order, and
 * what each one says - and none of that is legible once it is tangled up with a `Modal` and
 * a scrim.
 *
 * ## Order
 *
 * The buttons are STACKED, so the order is top to bottom, and it follows `exitPrompt.ts`
 * exactly: the destructive action first, cancel last. Cancel at the bottom is the
 * action-sheet convention, and it is the furthest point from the destructive button, which
 * is the pair most worth keeping apart.
 *
 * ## Why the count is in the message
 *
 * This is the only irreversible thing a player can do in the app, and "your progress" is
 * an abstraction - "37 countries" is the thing they would actually miss. The setup screen
 * disables the button entirely at zero, so the singular/plural branch below is really about
 * the one-country case, not the empty one; the empty wording exists so this module is total
 * rather than because anything reaches it.
 */
export type ResetAction =
  /** Clear the mastery table for every country. Irreversible. */
  | 'reset'
  /** Keep it. Also what the scrim, and Android's back button, mean. */
  | 'cancel';

/** Drives the button's appearance in `ConfirmDialog`, not just its meaning. */
export type ResetButtonStyle = 'primary' | 'destructive' | 'quiet';

export type ResetPromptButton = {
  id: ResetAction;
  label: string;
  style: ResetButtonStyle;
};

export type ResetPrompt = {
  title: string;
  message: string;
  buttons: ResetPromptButton[];
};

const RESET: ResetPromptButton = {
  id: 'reset',
  label: 'Reset progress',
  style: 'destructive',
};
const CANCEL: ResetPromptButton = { id: 'cancel', label: 'Cancel', style: 'quiet' };

export function buildResetPrompt({
  tracked,
}: {
  /** How many countries have any quiz history at all - `MasterySnapshot.scores`' size. */
  tracked: number;
}): ResetPrompt {
  const countries = tracked === 1 ? '1 country' : `${tracked} countries`;
  const subject =
    tracked > 0 ? `Your quiz history for ${countries}` : 'Your quiz history';

  return {
    title: 'Reset mastery?',
    // Names the consequence on the map as well as the deletion: the mastery fill mode is
    // where this is visible, and "not asked yet" is the legend's own wording for the band
    // every country lands back in.
    message: `${subject} will be cleared, and the map's mastery colours go back to "not asked yet". This cannot be undone.`,
    buttons: [RESET, CANCEL],
  };
}
