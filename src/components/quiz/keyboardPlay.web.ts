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

/**
 * Whether the first answer field should take focus as a question arrives.
 *
 * `KEYBOARD_PLAY` is not enough on its own: **a phone browser is a web build too**, and
 * there the auto-focus summons the on-screen keyboard for every question, costing the
 * map half its height whether or not the player wanted to type yet - exactly what the
 * native sibling refuses to do. So the trade is re-made per device rather than per
 * platform, and the discriminator is the pointer, not the window: a desktop browser
 * dragged narrow still has a real keyboard, and a tablet held wide still does not.
 *
 * The rest of the keyboard wiring stays on everywhere - Enter still walks the fields and
 * then checks - because none of it summons anything the player did not ask for.
 *
 * A function rather than a constant so it is never read during the static export, where
 * there is no `window` at all; both call sites are effects, so the value is only ever
 * wanted on the client.
 */
export const autoFocusFirstField = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: fine) and (hover: hover)').matches;
