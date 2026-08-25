/**
 * The window size to lay out against, measured from the DOM.
 *
 * Two separate problems make this a hook rather than `useWindowDimensions()`.
 *
 * ## 1. It must agree with what the map renderer actually projects with
 *
 * `MapScreen` frames a searched country by computing how far to shift the camera, in
 * pixels, from the middle of the viewport - so the "viewport" it measures has to be the
 * same box MapLibre is drawing into. React Native Web's `useWindowDimensions()` updates
 * from window `resize` events, and was observed reporting **735** while the map canvas
 * was already **791**. Framing computed against a stale height lands the country off
 * centre, and it self-corrects later only because something else eventually triggers a
 * re-render - which reads exactly like "the animation fires late".
 *
 * `document.documentElement.clientWidth/Height` is the box the layout - and therefore
 * the canvas - is sized from, and a `ResizeObserver` on it fires for any layout change,
 * not only for window resizes. That closes the gap by construction rather than by luck.
 *
 * ## 2. It must survive hydration
 *
 * `web.output: "static"` renders each route to HTML **in Node**, where there is no window
 * and every responsive branch takes its smallest path. On the client React hydrates,
 * recomputes the correct classes, and **keeps the server's `className` anyway** - so a
 * page silently wears the phone layout on a desktop monitor, with no error and nothing to
 * see except a width that makes no sense. Reporting the server's view for the first
 * render keeps hydration matching; the effect below then commits the real size, and an
 * ordinary post-hydration update does patch the DOM.
 *
 * This is the same shape as `use-color-scheme.web.ts`, for the same reason.
 */
import { useEffect, useState } from 'react';

import type { WindowSize } from './infoSheetLayout';

/**
 * What the exported HTML was laid out against: Node has no window, so
 * `useWindowDimensions()` reports 0x0 there. The first client render must match.
 */
const SERVER_WINDOW: WindowSize = { width: 0, height: 0 };

const readWindow = (): WindowSize => ({
  width: document.documentElement.clientWidth,
  height: document.documentElement.clientHeight,
});

export function useWindowSize(): WindowSize {
  const [size, setSize] = useState<WindowSize>(SERVER_WINDOW);

  useEffect(() => {
    const update = () =>
      setSize((previous) => {
        const next = readWindow();
        // Same object when nothing moved: this feeds camera effects keyed on width and
        // height, and a fresh object every observation would re-fire them constantly.
        return previous.width === next.width && previous.height === next.height
          ? previous
          : next;
      });

    update();

    window.addEventListener('resize', update);
    // Catches layout changes that never fire a window resize - a scrollbar appearing,
    // browser UI collapsing on mobile, the virtual keyboard resizing the layout viewport.
    const observer = new ResizeObserver(update);
    observer.observe(document.documentElement);

    return () => {
      window.removeEventListener('resize', update);
      observer.disconnect();
    };
  }, []);

  return size;
}
