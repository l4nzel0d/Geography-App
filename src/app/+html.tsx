import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { withBaseUrl } from '@/i18n/baseUrl';
import { getLocale } from '@/i18n/locale';
import { translate } from '@/i18n/t';
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
 *
 * **It is rendered once per locale**, because the web ships as two static exports. The
 * locale is a build constant here (`locale.web.ts` derives it from `EXPO_BASE_URL`), so
 * `lang`, the title and every root-relative link below are baked correctly into each
 * tree's HTML rather than patched by a script after hydration.
 */
export default function Root({ children }: PropsWithChildren) {
  const locale = getLocale();

  return (
    <html lang={locale}>
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

          The catch is that a shrunken viewport is WIDER THAN IT IS TALL on a phone in
          portrait, and `getInfoSheetLayout` reads that as landscape - which docked the
          quiz panel to the right edge of an upright phone the moment anyone typed.
          `quizScreenBox.web.ts` adds the keyboard's bite back before any layout decision
          is made; read it before changing this line.
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

        {/* Base-URL aware, all of them. The Russian build is served from `/ru` and has
            its own service worker scoped there; a manifest or icon fetched from the root
            would be outside that scope and would not be cached for offline use. */}
        <link rel="manifest" href={withBaseUrl('/manifest.webmanifest')} />
        <link rel="icon" href={withBaseUrl('/favicon.ico')} sizes="any" />
        <link rel="apple-touch-icon" href={withBaseUrl('/icons/apple-touch-icon.png')} />

        {/* iOS ignores the manifest's `display` and reads these instead. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={translate(locale, 'app.shortName')} />

        {/*
          Disable body scrolling so ScrollView behaves as it does on native. Provided by
          expo-router; see its docs before removing.
        */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: pageStyle }} />
        <script dangerouslySetInnerHTML={{ __html: registerServiceWorker() }} />
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
const registerServiceWorker = () => `
if (${process.env.NODE_ENV === 'production'} && 'serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    /*
     * Each locale registers ITS OWN worker, scoped to its own tree. The scope is explicit
     * rather than left to default from the script's directory: it is the same value, but
     * saying it makes the intent legible next to the \`Service-Worker-Allowed\` header in
     * vercel.json, and it is what keeps the two builds from fighting over one scope.
     */
    navigator.serviceWorker.register('${withBaseUrl('/sw.js')}', {
      scope: '${withBaseUrl('/')}',
    }).catch(function (error) {
      console.error('[sw] registration failed', error);
    });
  });

  /*
   * Reload once when a NEW worker takes over.
   *
   * Without this a redeploy needs TWO visits to appear: the open page keeps the assets
   * the old worker gave it, the new worker installs quietly in the background, and only
   * the visit after that sees the new build. That is a genuinely nasty trap - the app
   * looks like it ignored your change, and every conclusion you draw from that first
   * load is about the previous version.
   *
   * \`controllerchange\` fires only when a new worker actually assumes control, which
   * \`skipWaiting\`+\`clientsClaim\` make immediate. The guard is what keeps it from
   * looping: the very first registration on a page that had no controller also fires
   * this, and reloading then would be pointless.
   */
  var reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (reloading || !navigator.serviceWorker.controller) return;
    reloading = true;
    window.location.reload();
  });
}
`;
