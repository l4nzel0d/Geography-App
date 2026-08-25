import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { mapColors } from '@/map/offlineStyle';

/**
 * The HTML shell wrapped around every statically rendered web route.
 *
 * **This file runs in Node at export time**, once per route, and never in the browser -
 * it has no DOM and no access to component state. It is the only place to put things
 * that must exist before the bundle has parsed: the theme colour, the manifest link, and
 * the service worker registration.
 *
 * Web-only. Android and iOS never resolve it.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />

        {/*
          `viewport-fit=cover` is what makes `env(safe-area-inset-*)` non-zero on a
          notched phone - without it an installed PWA letterboxes instead of going
          edge-to-edge, which is the opposite of what the map wants.

          `user-scalable=no` because the map does its own pinch zoom; browser page-zoom
          on top of it zooms the chrome and the canvas together and is never what anyone
          means. It is a real accessibility trade, taken deliberately and only because
          every text surface here is already reachable at the OS zoom level.

          `interactive-widget=resizes-content` makes the layout viewport shrink when the
          on-screen keyboard opens. That is exactly the behaviour `useKeyboardHeight`
          hand-rolls for edge-to-edge Android, so on web the search and quiz inputs get
          it from the platform for free.
        */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no, interactive-widget=resizes-content"
        />

        {/*
          The ocean colour, so the browser chrome and the splash match the map rather
          than flashing white. Imported rather than re-spelled, so it cannot drift from
          the style's background layer.
        */}
        <meta name="theme-color" content={mapColors.ocean} />

        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

        {/* iOS ignores the manifest's `display` and reads these instead. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Countries" />

        {/*
          Disable body scrolling so ScrollView behaves as it does on native. Provided by
          expo-router; see its docs before removing.
        */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: pageStyle }} />
        <script dangerouslySetInnerHTML={{ __html: registerServiceWorker }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

/**
 * `overscroll-behavior: none` is load-bearing, not cosmetic: without it Chrome on
 * Android fires pull-to-refresh on a downward drag, which is exactly the gesture
 * `CountryInfoSheet`'s PanResponder uses to dismiss the card in portrait. The page would
 * reload instead of the sheet closing.
 *
 * The background colour is set here as well as on the body so there is no white flash
 * between first paint and the bundle mounting.
 */
const pageStyle = `
html, body {
  background-color: #0d2b45;
  overscroll-behavior: none;
}
#root {
  display: flex;
  min-height: 100%;
}
`;

/**
 * Registers the Workbox-generated worker written by `scripts/build-web.mjs`.
 *
 * Production only: in development there is no `sw.js`, and a stale worker caching a dev
 * bundle is a genuinely confusing failure - edits stop appearing for reasons that look
 * like Metro. Registered on `load` so it never competes with the first paint for
 * bandwidth.
 */
const registerServiceWorker = `
if (${process.env.NODE_ENV === 'production'} && 'serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function (error) {
      console.error('[sw] registration failed', error);
    });
  });
}
`;
