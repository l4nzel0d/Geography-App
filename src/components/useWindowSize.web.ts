/**
 * The window size to lay out against, safe to use in statically rendered markup.
 *
 * ## The bug this exists to prevent
 *
 * `app.json` sets `web.output: "static"`, so every route is rendered to HTML **in Node
 * at export time**. There is no window there, and `useWindowDimensions()` reports 0x0 -
 * so any responsive branch takes its smallest path and that is what ships in the HTML.
 *
 * On the client, React hydrates. The component re-runs and computes the correct desktop
 * classes... and **React keeps the server's `className` anyway.** The corrected classes
 * are visible in the fiber's props and never reach the DOM. Nothing throws, nothing
 * warns in production, and the page silently wears the phone layout on a 1920 dp monitor
 * for as long as it is open. Measuring `getBoundingClientRect()` will not reveal it
 * either; only comparing `element.className` against `__reactProps$*.className` does.
 *
 * `/search` hit exactly this. The country info sheet did NOT, and the difference is
 * instructive: the sheet mounts in response to a tap, long after hydration, so it has no
 * server markup to disagree with. Anything present in the FIRST render is exposed.
 *
 * ## The fix
 *
 * Report the server's view of the world for the first client render, so hydration
 * matches exactly, then switch to the real size in an effect. Effects run after
 * hydration commits, so that update is an ordinary re-render and does patch the DOM.
 *
 * This is the same shape as `use-color-scheme.web.ts`, which returns `'light'` until its
 * effect fires, for the same reason.
 */
import { useEffect, useState } from 'react';
import { useWindowDimensions } from 'react-native';

import type { WindowSize } from './infoSheetLayout';

/**
 * What `useWindowDimensions()` reports in Node, and therefore what the exported HTML was
 * laid out against. Must match, or the mismatch is back.
 */
const SERVER_WINDOW: WindowSize = { width: 0, height: 0 };

export function useWindowSize(): WindowSize {
  const real = useWindowDimensions();

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  return hydrated ? real : SERVER_WINDOW;
}
