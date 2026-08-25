/**
 * Whether a round should be playable from the keyboard alone. Web: yes.
 *
 * A quiz is typing, so the round is wired to need no pointer at all: the first answer
 * field takes focus as each question arrives, Enter moves down the fields and then
 * checks, and the advance button takes focus once an answer is graded - so Enter carries
 * straight on to the next country.
 *
 * A hardware keyboard costs nothing to summon, which is what makes this a good trade
 * here and a bad one on a phone. See the native sibling.
 */
export const KEYBOARD_PLAY = true;
