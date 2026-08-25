/**
 * Escape closes the country card.
 *
 * A desktop affordance with no native counterpart: on a phone the card is dismissed by
 * the back gesture, the close button or a drag, none of which a mouse-and-keyboard user
 * reaches for. Escape is the convention for "close the thing that is open", and its
 * absence is the kind of gap that makes a ported mobile app feel like one.
 *
 * Registered on `window` rather than a focused element, because the card is not focus-
 * trapped and the user's focus is usually the map canvas.
 */
import { useEffect, useRef } from 'react';

export function useDismissKey(onDismiss: () => void, enabled = true): void {
  /**
   * Reached from a listener registered once per enabled-state change rather than on every
   * render. Written in an effect, never during render: `app.json` sets
   * `reactCompiler: true`, the same reason `quiz/play.tsx` keeps its back handler in a ref.
   */
  const handler = useRef(onDismiss);
  useEffect(() => {
    handler.current = onDismiss;
  });

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      // Ignore a repeat from a held key, and leave composing IME input alone.
      if (event.key !== 'Escape' || event.repeat || event.isComposing) return;
      handler.current();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
