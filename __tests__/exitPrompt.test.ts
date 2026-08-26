import { translatorFor } from '@/i18n/t';
import { buildExitPrompt } from '@/quiz/exitPrompt';

/** Every existing assertion is about the English wording, so they all pass this. */
const t = translatorFor('en');

/**
 * The confirmation's shape.
 *
 * Worth a suite of its own because the order and the count are the decision - once this
 * reaches `ConfirmDialog` it is a stack of pressables and the reasoning is invisible.
 */
describe('the mid-round exit prompt', () => {
  const ids = (graded: number) =>
    buildExitPrompt({ index: 0, total: 8, graded, t }).buttons.map((b) => b.id);

  it('counts the question from one', () => {
    expect(buildExitPrompt({ index: 2, total: 8, graded: 1, t }).message).toBe(
      'You are on question 3 of 8.'
    );
    expect(buildExitPrompt({ index: 0, total: 8, graded: 0, t }).message).toBe(
      'You are on question 1 of 8.'
    );
  });

  it('offers a score once anything has been checked', () => {
    expect(ids(1)).toEqual(['score', 'discard', 'cancel']);
  });

  it('drops the score button when there is nothing to score', () => {
    // Nothing graded means a score of nothing out of nothing, which is not an offer.
    expect(ids(0)).toEqual(['discard', 'cancel']);
  });

  it('keeps cancel at the bottom, never adjacent to nothing but discard above it', () => {
    // Cancel last is the action-sheet convention, and it is the furthest the stack can
    // put the dismissive button from the destructive one.
    for (const graded of [0, 1, 5]) {
      const list = ids(graded);
      expect(list[list.length - 1]).toBe('cancel');
    }
  });

  it('marks the destructive and dismissive buttons as such', () => {
    const byId = Object.fromEntries(
      buildExitPrompt({ index: 0, total: 2, graded: 1, t }).buttons.map((b) => [b.id, b])
    );
    expect(byId.discard.style).toBe('destructive');
    expect(byId.cancel.style).toBe('quiet');
    expect(byId.score.style).toBe('primary');
  });

  it('always asks the same question', () => {
    expect(buildExitPrompt({ index: 0, total: 1, graded: 0, t }).title).toBe('Leave quiz?');
  });
});
