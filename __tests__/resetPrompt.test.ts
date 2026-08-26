import { buildResetPrompt } from '@/quiz/resetPrompt';

/**
 * The reset confirmation's shape.
 *
 * Same argument as `exitPrompt.test.ts`: the order, the styles and what the message
 * actually promises are the decision, and all of it is invisible once `ConfirmDialog` has
 * turned it into a stack of pressables. This is also the app's only irreversible action, so
 * the wording is worth pinning rather than leaving to a glance at the screen.
 */
describe('the reset-mastery prompt', () => {
  it('always asks the same question', () => {
    expect(buildResetPrompt({ tracked: 12 }).title).toBe('Reset mastery?');
  });

  it('names how many countries would be cleared', () => {
    expect(buildResetPrompt({ tracked: 37 }).message).toContain('37 countries');
  });

  it('counts one country in the singular', () => {
    const message = buildResetPrompt({ tracked: 1 }).message;
    expect(message).toContain('1 country');
    expect(message).not.toContain('1 countries');
  });

  it('stays sensible at zero, which the disabled button means nothing reaches', () => {
    const message = buildResetPrompt({ tracked: 0 }).message;
    expect(message).toContain('Your quiz history');
    expect(message).not.toContain('0 countries');
  });

  it('says the deletion is permanent, and what happens to the map', () => {
    const message = buildResetPrompt({ tracked: 5 }).message;
    expect(message).toContain('cannot be undone');
    expect(message).toContain('not asked yet');
  });

  it('offers the destructive action first and cancel last', () => {
    // Cancel at the bottom is the action-sheet convention exitPrompt.ts documents, and it
    // is the furthest a stack can put the dismissive button from the destructive one.
    expect(buildResetPrompt({ tracked: 5 }).buttons.map((b) => b.id)).toEqual([
      'reset',
      'cancel',
    ]);
  });

  it('marks the destructive and dismissive buttons as such', () => {
    const byId = Object.fromEntries(
      buildResetPrompt({ tracked: 5 }).buttons.map((b) => [b.id, b]),
    );
    expect(byId.reset.style).toBe('destructive');
    expect(byId.cancel.style).toBe('quiet');
  });
});
