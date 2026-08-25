/**
 * The box the quiz screen splits between map and answer panel, on the web.
 *
 * ## Why not `Dimensions.get('screen')`, as native does
 *
 * React Native Web maps `screen` to `window.screen` - the physical monitor. A browser
 * window occupying part of a 1920x1080 display would size its panel from 1080 while
 * having 900 to work with, and hand the camera a map box that does not exist.
 *
 * ## Why not the plain window either
 *
 * Native picks `screen` to get a box the on-screen keyboard cannot move, because the
 * split feeds the camera stop and a box that changed mid-answer would re-frame the
 * country on every keystroke. The web needs that same guarantee, and gets less help:
 * `interactive-widget=resizes-content` in `+html.tsx` makes the layout viewport shrink
 * when the keyboard opens, which is the right behaviour everywhere else in the app and
 * precisely the wrong one here.
 *
 * So this reports the layout viewport but holds it steady while a text field has focus.
 * That is the moment the keyboard can be open, and it is also the moment a re-frame
 * would be most disruptive. A genuine window resize mid-answer is deferred to the next
 * blur, which is a fair trade for a map that stays put while you type.
 */
import { useEffect, useState } from 'react';

type Size = { width: number; height: number };

const read = (): Size => ({
  width: document.documentElement.clientWidth,
  height: document.documentElement.clientHeight,
});

/** Whether the focused element is somewhere text is typed. */
const isTyping = () => {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (active as HTMLElement).isContentEditable;
};

/** Matches the server render, so hydration agrees. See `components/useWindowSize.web.ts`. */
const SERVER: Size = { width: 0, height: 0 };

export function useQuizScreenSize(): Size {
  const [size, setSize] = useState<Size>(SERVER);

  useEffect(() => {
    const update = () =>
      setSize((previous) => {
        // Never while typing: that shrink is the keyboard, not the window.
        if (previous !== SERVER && isTyping()) return previous;

        const next = read();
        return previous.width === next.width && previous.height === next.height
          ? previous
          : next;
      });

    update();

    window.addEventListener('resize', update);
    // Also catches layout changes that fire no resize event at all.
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);

    return () => {
      window.removeEventListener('resize', update);
      observer.disconnect();
    };
  }, []);

  return size;
}
