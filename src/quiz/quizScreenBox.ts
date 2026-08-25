/**
 * The box the quiz screen splits between map and answer panel. Native: the SCREEN.
 *
 * Deliberately not the window: the split feeds the camera stop, and a box that changed
 * while someone was typing would re-frame the country mid-answer. The screen is immune to
 * the IME, which is exactly the property wanted.
 *
 * **A pure function, and it must stay one.** The obvious shape for this is a hook that
 * calls `useWindowDimensions()` itself - and that breaks the quiz on Android. `app.json`
 * sets `reactCompiler: true`, and moving the subscription out of the component body
 * changes what the compiler will memoise: the round then keeps a stale layout through a
 * rotation, docking the panel to the bottom in landscape and pushing the last answer
 * field off screen. Measured, bisected and confirmed against master - a hook that was
 * otherwise line-for-line identical still failed.
 *
 * So the caller keeps its own `useWindowDimensions()` inline and passes the result here.
 * That also gives the compiler a reactive value it can actually see.
 */
import { Dimensions } from 'react-native';

export type ScreenBox = { width: number; height: number };

export function quizScreenBox(_window: ScreenBox): ScreenBox {
  return Dimensions.get('screen');
}
