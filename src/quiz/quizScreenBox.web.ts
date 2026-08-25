/**
 * The box the quiz screen splits between map and answer panel. Web: the layout viewport,
 * with the on-screen keyboard's bite added back.
 *
 * React Native Web maps `Dimensions.get('screen')` to `window.screen` - the physical
 * monitor. A browser window filling part of a 1920x1080 display would size its panel from
 * 1080 while having 900 to work with, and hand the camera a map box that does not exist.
 * The layout viewport is the only honest answer here.
 *
 * ## Why the keyboard has to be added back
 *
 * `interactive-widget=resizes-content` in `+html.tsx` shrinks the layout viewport when a
 * keyboard opens, which is what gives the web the room-giving-back that `useKeyboardHeight`
 * hand-rolls for edge-to-edge Android. But it also makes the viewport SHORTER THAN IT IS
 * WIDE on a phone in portrait: measured on a 1080x2340 device, a round with the keyboard
 * up leaves 1080x1055. `getInfoSheetLayout` reads `width > height` as landscape, so the
 * answer panel docked itself to the RIGHT EDGE of a phone held upright, every time anyone
 * typed. That is the bug this exists for.
 *
 * Reporting the unobstructed box also restores the property the native sibling names as
 * the whole reason it prefers the screen: a box the IME cannot move, so the camera does
 * not re-frame the country while someone is answering. The web build used to accept one
 * re-fit as the keyboard appeared and one as it went; it no longer needs to.
 *
 * The panel is still laid out inside the real, shortened viewport - it is asked for a
 * height computed from the full one and `flexShrink` gives it back what does not fit,
 * exactly as it does on Android when the keyboard takes half the screen.
 *
 * ## How the bite is measured
 *
 * Purely by observation, because nothing reports it: with `resizes-content` the layout
 * viewport, the visual viewport and `documentElement.clientHeight` all shrink together,
 * and `window.screen` is the monitor rather than the window. So the tallest this width
 * has been is remembered, and a LATER, SHORTER report is only treated as the keyboard
 * when a text field has focus. Anything else that shortens the window - a desktop drag,
 * browser chrome appearing - is a real resize and is believed immediately.
 *
 * One case is knowingly not covered: rotating INTO an orientation this session has never
 * seen unobstructed while the keyboard is already up seeds the memory with a bitten
 * height. It corrects itself the moment the keyboard closes.
 *
 * See the native sibling for why this is a plain function rather than a hook.
 */
import type { ScreenBox } from './quizScreenBox';

/** The tallest the window has been seen at its current width. */
let rest: ScreenBox | null = null;

/**
 * Whether the thing with focus is something a soft keyboard opens for.
 *
 * Guarded for the static export, which runs every route in Node where there is no
 * document at all.
 */
const textFieldHasFocus = (): boolean => {
  if (typeof document === 'undefined') return false;

  const focused = document.activeElement as HTMLElement | null;
  if (!focused) return false;

  return (
    focused.tagName === 'INPUT' ||
    focused.tagName === 'TEXTAREA' ||
    focused.isContentEditable === true
  );
};

export function quizScreenBox({ width, height }: ScreenBox): ScreenBox {
  const keyboard =
    rest !== null && rest.width === width && height < rest.height && textFieldHasFocus();

  // Same object while the keyboard is up, so nothing downstream sees a new box per render.
  if (!keyboard) rest = { width, height };

  return rest as ScreenBox;
}
