/**
 * The whole web build: static assets, icons, the Expo export, then the service worker.
 *
 * Ordering matters. Workbox globs `dist/` to build its precache manifest, so it has to
 * run **after** the export - and the assets have to be in `public/` **before** it, or
 * Expo will not copy them into `dist/` for Workbox to find.
 */
import { generateSW } from 'workbox-build';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildWebIcons } from './build-web-icons.mjs';
import { copyFlagAssets, copyWebAssets } from './copy-web-assets.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

/**
 * Workbox skips any file larger than this and says so only in a summary line.
 *
 * **The default is 2 MB and the JS bundle is over 5 MB**, so the default silently
 * produces a service worker that registers, activates, looks perfect in DevTools and
 * fails the moment you go offline - because the one file that matters was never cached.
 * This is the same shape as the stale-Gradle-bundle bug in CLAUDE.md: a build that
 * succeeds and is wrong.
 */
const MAX_PRECACHE_BYTES = 12 * 1024 * 1024;

console.log('1/4  Copying web assets');
copyWebAssets();
copyFlagAssets();

console.log('2/4  Generating PWA icons');
await buildWebIcons();

console.log('3/4  expo export -p web');
execFileSync('npx', ['expo', 'export', '-p', 'web'], { cwd: root, stdio: 'inherit', shell: true });

console.log('4/4  Generating the service worker');
const { count, size, warnings } = await generateSW({
  globDirectory: dist,
  globPatterns: ['**/*.{html,js,mjs,css,json,webmanifest,ttf,otf,woff2,png,svg,ico}'],
  // The route listing is a debug page, not part of the app.
  globIgnores: ['**/_sitemap.html'],
  swDest: join(dist, 'sw.js'),

  /**
   * Every route falls back to the shell when the network is gone. `dist/` holds real
   * per-route HTML, all precached, so this only catches URLs that were never exported.
   */
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/_expo\//],

  maximumFileSizeToCacheInBytes: MAX_PRECACHE_BYTES,

  /**
   * Deliberately empty. Nothing in this app is fetched at runtime from anywhere - no
   * tiles, no glyphs, no API, no fonts over the wire - so there is no request worth a
   * runtime strategy. Anything that showed up here would be a network dependency that
   * should not exist; see the offline rule in CLAUDE.md.
   */
  runtimeCaching: [],

  // Take over immediately rather than waiting for every tab to close, so a redeploy is
  // one reload rather than a mystery.
  clientsClaim: true,
  skipWaiting: true,
  cleanupOutdatedCaches: true,
});

for (const warning of warnings) console.warn('  warning:', warning);

/**
 * Prove the precache actually contains the app.
 *
 * A service worker that quietly omitted the bundle is worse than none: it looks
 * installed and fails only offline, which is precisely the gate this build exists to
 * pass. So assert rather than trust the summary line.
 */
const bundleDir = join(dist, '_expo/static/js/web');
const bundleBytes = existsSync(bundleDir)
  ? Math.max(0, ...readdirSync(bundleDir).map((f) => statSync(join(bundleDir, f)).size))
  : 0;

if (!bundleBytes) {
  throw new Error(`No JS bundle found in ${bundleDir} - did the export succeed?`);
}

if (bundleBytes > MAX_PRECACHE_BYTES) {
  throw new Error(
    `The JS bundle is ${(bundleBytes / 1048576).toFixed(1)} MB, over the ` +
      `${MAX_PRECACHE_BYTES / 1048576} MB precache limit - it would be silently skipped ` +
      `and the app would not work offline. Raise MAX_PRECACHE_BYTES.`,
  );
}

console.log(
  `\nPrecached ${count} files, ${(size / 1048576).toFixed(2)} MB. ` +
    `Largest bundle ${(bundleBytes / 1048576).toFixed(2)} MB.`,
);
