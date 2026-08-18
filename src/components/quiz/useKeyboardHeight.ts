import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * How much of the screen the soft keyboard is currently covering, in dp.
 *
 * Needed because the app runs **edge-to-edge**, which is the RN 0.86 / Expo 57 default.
 * Under edge-to-edge Android does not resize the window when the IME opens - the app
 * keeps its full height and the keyboard is drawn over the bottom of it. So a panel
 * docked to the bottom edge simply disappears behind the keyboard, which is exactly what
 * a write-in quiz cannot afford.
 *
 * `KeyboardAvoidingView` is the usual answer and is unreliable here for the same reason:
 * its Android path assumes the window resizes. Listening to the IME directly is a dozen
 * lines and behaves the same in both orientations.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // `Did` rather than `Will`: Android does not emit the `Will` pair at all.
    const shown = Keyboard.addListener('keyboardDidShow', (event) =>
      setHeight(event.endCoordinates.height),
    );
    const hidden = Keyboard.addListener('keyboardDidHide', () => setHeight(0));

    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  return height;
}
