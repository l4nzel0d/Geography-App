/**
 * The box the quiz screen splits between map and answer panel.
 *
 * Native reads the SCREEN rather than the window, and deliberately: the split feeds the
 * camera stop, so a box that changed while someone was typing would re-fly the map on
 * every keystroke. The screen is immune to the IME, which is exactly the property wanted.
 *
 * The web build resolves `useQuizScreenSize.web.ts`, where `screen` means the physical
 * monitor and would be wrong for the same reason it is right here.
 */
import { Dimensions, useWindowDimensions } from 'react-native';

export function useQuizScreenSize(): { width: number; height: number } {
  // Subscribed to purely for the re-render: this is what updates the layout on rotation.
  useWindowDimensions();

  return Dimensions.get('screen');
}
