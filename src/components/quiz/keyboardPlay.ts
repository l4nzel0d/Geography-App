/**
 * Whether a round should be playable from the keyboard alone. Native: no.
 *
 * On a phone the only keyboard is the on-screen one, and focusing a field summons it -
 * which on the quiz screen costs the map half its height for every question, whether or
 * not the player wanted to type yet. Tapping the field they mean is both cheaper and
 * what a touch UI implies.
 *
 * The web build resolves `keyboardPlay.web.ts`, where a real keyboard is the primary
 * input and having to reach for the mouse between every answer is the friction.
 */
export const KEYBOARD_PLAY = false;

/**
 * Whether the first answer field should take focus as a question arrives. Native: no,
 * for the reason above - the on-screen keyboard is the only keyboard there.
 */
export const autoFocusFirstField = () => false;
