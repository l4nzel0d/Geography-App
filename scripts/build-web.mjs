/**
 * The whole web build: static assets, icons, TWO Expo exports, then two service workers.
 *
 * ## Why two of everything
 *
 * The app ships in two languages, and on the web that is two separate static exports -
 * English at `/`, Russian at `/ru` via `experiments.baseUrl` (see `app.config.js`). Each
 * is pre-rendered in its own language, so `<html lang>` is real, there is no hydration
 * flash, and every `router.push('/search')` in the app keeps working untouched because
 * expo-router prefixes the base URL itself.
 *
 * ## Ordering, all of it load-bearing
 *
 * - Workbox globs the output to build its precache manifest, so it runs **after** the
 *   exports - and the assets have to be in `public/` **before** them, or Expo will not
 *   copy them into the output for Workbox to find.
 * - **English exports FIRST.** `expo export` calls `removeAsync(outputDir)` before writing
 *   (verified in @expo/cli's `exportAsync.js`), so running `--output-dir dist` second
 *   would delete `dist/ru` along with everything else.
 * - The Russian export goes straight into `dist/ru`, which removes only that subtree.
 *
 * ## Each tree is self-contained, and that is not waste
 *
 * Expo copies `public/` into every output directory, so `dist/ru` gets its own flags,
 * icons and MapLibre worker. It has to: **a service worker cannot intercept requests
 * outside its own scope**, so a page at `/ru/` reaching for `/flags/ru.webp` at the root
 * would work online and fail the moment the network went away - against the one hard
 * requirement this project has. ~3.4 MB of duplication buys that.
 */
import { generateSW } from 'workbox-build';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { writeFileSync } from 'node:fs';

import { buildWebIcons } from './build-web-icons.mjs';
import { copyFlagAssets, copyWebAssets } from './copy-web-assets.mjs';
import { manifestJson, manifestProblems } from './manifest.mjs';

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

/** Every locale that ships, and where each one lands. English is the root. */
const BUILDS = [
  { locale: 'en', dir: dist, base: '' },
  { locale: 'ru', dir: join(dist, 'ru'), base: '/ru' },
];

console.log('1/6  Copying web assets');
copyWebAssets();
copyFlagAssets();

console.log('2/6  Generating PWA icons');
await buildWebIcons();

// English FIRST - see the header. `--output-dir dist` wipes the directory, `dist/ru`
// included, so exporting it second would delete the Russian build.
for (const build of BUILDS) {
  console.log(`3/6  expo export -p web  (${build.locale} -> ${build.dir.slice(root.length + 1)})`);
  execFileSync('npx', ['expo', 'export', '-p', 'web', '--output-dir', build.dir], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    // Read once per process by app.config.js, which turns it into experiments.baseUrl.
    env: { ...process.env, EXPO_PUBLIC_LOCALE: build.locale },
  });
}

console.log('4/6  Writing the manifests');
for (const build of BUILDS) {
  const problems = manifestProblems(build.locale);
  if (problems.length) {
    throw new Error(`Manifest is wrong:\n  - ${problems.join('\n  - ')}`);
  }

  writeFileSync(join(build.dir, 'manifest.webmanifest'), manifestJson(build.locale));
  console.log(`  ${build.base}/manifest.webmanifest`);
}

// And keep the committed dev-server copy in step, so it cannot go stale between builds.
writeFileSync(join(root, 'public/manifest.webmanifest'), manifestJson('en'));

console.log('5/6  Asserting each bundle');
const bundleSizes = BUILDS.map(assertBuild);

console.log('6/6  Generating the service workers');
let count = 0;
let size = 0;

// Russian first, so the root worker's glob can ignore the whole subtree it produces -
// including `dist/ru/sw.js` itself.
for (const build of [...BUILDS].reverse()) {
  const result = await generateSW({
    globDirectory: build.dir,
    // `webp` is load-bearing: every flag the app ships is one, and a format missing from
    // this list is simply absent from the precache manifest. The app would install, look
    // perfect online, and show nothing but two-letter badges the moment the network went.
    globPatterns: ['**/*.{html,js,mjs,css,json,webmanifest,ttf,otf,woff2,png,webp,svg,ico}'],
    // The route listing is a debug page, not part of the app. The root build additionally
    // skips the Russian subtree, which has its own worker and would otherwise be precached
    // twice over by anyone who only ever visits one language.
    globIgnores: build.base ? ['**/_sitemap.html'] : ['**/_sitemap.html', 'ru/**'],
    swDest: join(build.dir, 'sw.js'),

    /**
     * Every route falls back to THIS locale's own shell when the network is gone. Each
     * tree holds real per-route HTML, all precached, so this only catches URLs that were
     * never exported - but pointing `/ru` at the English shell would serve the English
     * bundle from a Russian URL, which is a worse failure than a 404.
     */
    navigateFallback: `${build.base}/index.html`,
    /*
      The root worker must not claim another locale's pages.

      `(/|$)` is load-bearing and cost a debugging session: `vercel.json` sets
      `trailingSlash: false`, so the canonical Russian URL is `/ru` with NO trailing slash -
      and a denylist of `/^\/ru\//` does not match it. The root worker then served its own
      `/index.html` for `/ru`, the ENGLISH bundle booted at a Russian URL, and expo-router
      rendered "Unmatched Route" because `/ru` is not a route in that build. It looked like
      a routing bug and was a one-character regex bug.
    */
    navigateFallbackDenylist: build.base
      ? [new RegExp(`^${build.base}/_expo/`)]
      : [
          /^\/_expo\//,
          ...BUILDS.filter((other) => other.base).map(
            (other) => new RegExp(`^${other.base}(/|$)`),
          ),
        ],

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

  count += result.count;
  size += result.size;
  for (const warning of result.warnings) console.warn(`  warning (${build.locale}):`, warning);
}


console.log(
  `\nPrecached ${count} files, ${(size / 1048576).toFixed(2)} MB across ${BUILDS.length} ` +
    `locales. Largest bundle ${(Math.max(...bundleSizes) / 1048576).toFixed(2)} MB.`,
);

/**
 * Prove each build really is the app, in its own language.
 *
 * Three checks, and each has a concrete failure behind it:
 *
 * 1. **Size.** A service worker that quietly omitted the bundle is worse than none: it
 *    looks installed and fails only offline, which is precisely the gate this build exists
 *    to pass. Workbox skips an oversized file and mentions it only in a summary line.
 *
 * 2. **Base URL.** `<html lang>` and the service worker registration are both derived from
 *    `EXPO_BASE_URL` in `+html.tsx`. If the base did not reach the export, the Russian tree
 *    registers the ROOT worker and the two builds fight over one scope.
 *
 * 3. **Language.** `EXPO_PUBLIC_LOCALE` is Babel-inlined but is **not part of Metro's
 *    transform cache key**, while `baseUrl` is - so in principle a second export in the
 *    same tree could reuse the first's transform and produce a `/ru` build full of English,
 *    successfully and silently. That is the same shape as the stale-Gradle-bundle bug in
 *    CLAUDE.md, and this is the same grep-the-output diagnosis that file recommends.
 *
 * The language check reads the **exported HTML, not the JS bundle**, and that is not
 * arbitrary. Both bundles contain both catalogues - there is no per-locale tree-shaking -
 * and Metro escapes non-ASCII in minified output, so `Обычная` appears in neither as
 * literal text. The pre-rendered markup is the artifact that actually differs.
 */
function assertBuild({ locale, dir, base }) {
  const bundleDir = join(dir, '_expo/static/js/web');
  const files = existsSync(bundleDir) ? readdirSync(bundleDir) : [];
  const sized = files.map((file) => ({ file, bytes: statSync(join(bundleDir, file)).size }));
  const largest = sized.reduce((best, one) => (one.bytes > (best?.bytes ?? 0) ? one : best), null);

  if (!largest) {
    throw new Error(`No JS bundle in ${bundleDir} - did the ${locale} export succeed?`);
  }

  if (largest.bytes > MAX_PRECACHE_BYTES) {
    throw new Error(
      `The ${locale} JS bundle is ${(largest.bytes / 1048576).toFixed(1)} MB, over the ` +
        `${MAX_PRECACHE_BYTES / 1048576} MB precache limit - it would be silently skipped ` +
        `and the app would not work offline. Raise MAX_PRECACHE_BYTES.`,
    );
  }

  const html = readFileSync(join(dir, 'index.html'), 'utf8');

  if (!html.includes(`lang="${locale}"`)) {
    throw new Error(`${locale}: index.html is not marked lang="${locale}"`);
  }

  if (!html.includes(`register('${base}/sw.js'`)) {
    throw new Error(
      `${locale}: index.html does not register ${base}/sw.js - EXPO_BASE_URL did not ` +
        'reach the export, and this tree would claim the wrong service-worker scope.',
    );
  }

  // A UI string that exists in exactly one catalogue, read out of the pre-rendered markup.
  const RUSSIAN_UI = 'Обычная';
  const hasRussianUi = html.includes(RUSSIAN_UI);

  if ((locale === 'ru') !== hasRussianUi) {
    throw new Error(
      `${locale}: the pre-rendered HTML is in the wrong language. The export probably ` +
        'reused the other locale\'s transform cache - re-run with --clear.',
    );
  }

  console.log(
    `  ${locale}: ${(largest.bytes / 1048576).toFixed(2)} MB, lang="${locale}", ` +
      `worker ${base}/sw.js`,
  );
  return largest.bytes;
}
