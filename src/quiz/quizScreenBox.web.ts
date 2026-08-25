/**
 * The box the quiz screen splits between map and answer panel. Web: the window.
 *
 * React Native Web maps `Dimensions.get('screen')` to `window.screen` - the physical
 * monitor. A browser window filling part of a 1920x1080 display would size its panel from
 * 1080 while having 900 to work with, and hand the camera a map box that does not exist.
 * The layout viewport is the only honest answer here.
 *
 * Native's reason for preferring the screen - a box the on-screen keyboard cannot move -
 * is handled differently on the web: `interactive-widget=resizes-content` in `+html.tsx`
 * shrinks the layout viewport when a keyboard opens, so the split does follow it. That
 * costs one re-fit as the keyboard appears and one as it goes, not one per keystroke,
 * which is a fair price for a panel that is never sized from the wrong box.
 *
 * See the native sibling for why this is a pure function rather than a hook.
 */
import type { ScreenBox } from './quizScreenBox';

export function quizScreenBox(window: ScreenBox): ScreenBox {
  return window;
}
