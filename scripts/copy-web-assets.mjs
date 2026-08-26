/**
 * Copies the web target's verbatim static assets into `public/`, which Metro serves in
 * dev and copies into `dist/` on export.
 *
 * Two groups, both of which MUST be copies of a single source rather than hand-placed
 * files - the same discipline as `scripts/countryFactRecord.mjs` being shared by both
 * writers of countryFacts.json. `__tests__/web/webAssets.test.ts` asserts byte identity,
 * so a `maplibre-gl` bump that ships a mismatched worker fails a test rather than
 * failing at runtime, offline, in production.
 *
 * 1. **The MapLibre web worker, and the shared chunk it imports.**
 *
 *    maplibre-gl cannot render a single tile without its worker, and under Metro it
 *    cannot find it. From `dist/maplibre-gl.mjs`:
 *
 *        function wi(){ let e=import.meta.url;
 *          if(!/^https?:/.test(e)) return ``;            // <- Metro lands here
 *          ... return new URL(`./${t}`, e).href }
 *
 *    Metro does not give modules an `http:` `import.meta.url`, so the default resolves
 *    to the empty string and `new Worker("")` throws. `setWorkerUrl()` in
 *    `WorldMap.web.tsx` points at the copy this script places.
 *
 *    BOTH files are required and must stay side by side: `maplibre-gl-worker.mjs` does
 *    `import ... from "./maplibre-gl-shared.mjs"`, resolved relative to the worker's own
 *    URL. Copying only the worker yields a worker that 404s on startup.
 *
 * 2. **The flag images.** The flag is a real image on every platform now - Windows draws
 *    no country flag emoji at all (see `components/flagEmoji.ts`), and the native side
 *    stopped using emoji too - so all three tiers have to be reachable over HTTP as well
 *    as through a Metro `require`.
 *
 *    They are a straight copy of `assets/`, which `scripts/build-flag-assets.mjs` derives
 *    from the committed masters and which is the single upstream. **This function is the
 *    only writer of `public/flags`, `public/flag-thumbs` and `public/map-flags`** - that
 *    script calls it rather than writing them itself, so there is one copier rather than
 *    two places that could disagree about which bytes go where. `webAssets.test.ts`
 *    asserts byte identity, and it can, because a copy is all this is.
 *
 *    Nothing here decodes an image, deliberately: Vercel runs `build:web`, which calls
 *    this, and that build must never need a native image binary.
 *
 * The label font deliberately does NOT need copying. Expo's static rendering already
 * emits `@font-face{font-family:"Map Label";src:url("/assets/.../NotoSans-Regular.<hash>.ttf")}`
 * into every exported HTML file, derived from the `useFonts` call in `WorldMap.web.tsx` -
 * so the family the label layer's `text-font` names is registered without any help, and a
 * second unhashed copy would only add 556 KB of never-requested bytes to the payload.
 */
import { copyFileSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mlDist = join(root, 'node_modules', 'maplibre-gl', 'dist');

export const WEB_ASSET_COPIES = [
  { from: join(mlDist, 'maplibre-gl-worker.mjs'), to: join(root, 'public/maplibre/maplibre-gl-worker.mjs') },
  { from: join(mlDist, 'maplibre-gl-shared.mjs'), to: join(root, 'public/maplibre/maplibre-gl-shared.mjs') },
];

export function copyWebAssets() {
  for (const { from, to } of WEB_ASSET_COPIES) {
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    console.log(`  ${to.slice(root.length + 1)}  (${statSync(to).size} bytes)`);
  }
}

/** U+1F1E6 REGIONAL INDICATOR SYMBOL LETTER A. Mirrors `components/flagEmoji.ts`. */
const REGIONAL_INDICATOR_A = 0x1f1e6;

/** The lowercase alpha-2 code a flag emoji encodes, or null if it is not a pair. */
function isoFromFlag(flag) {
  if (!flag) return null;
  const codePoints = [...flag].map((c) => c.codePointAt(0));
  if (codePoints.length !== 2) return null;
  if (!codePoints.every((c) => c >= REGIONAL_INDICATOR_A && c <= REGIONAL_INDICATOR_A + 25)) {
    return null;
  }
  return codePoints
    .map((c) => String.fromCharCode(c - REGIONAL_INDICATOR_A + 97))
    .join('');
}

/**
 * The three flag tiers, and where each one is served from.
 *
 * `map-flags` is the odd one: the web has no `@Nx` scale suffixes, so it takes the 3x
 * bytes under an unsuffixed name and `WorldMap.web.tsx` passes `pixelRatio` explicitly.
 */
export const FLAG_COPIES = [
  { from: 'assets/flags', to: 'public/flags', ext: 'webp', suffix: '' },
  { from: 'assets/flag-thumbs', to: 'public/flag-thumbs', ext: 'webp', suffix: '' },
  { from: 'assets/map-flags', to: 'public/map-flags', ext: 'png', suffix: '@3x' },
];

/**
 * Copies every shipped flag image into `public/`.
 *
 * Driven by `countryFacts.json` rather than by listing the source directories, so the set
 * shipped is exactly the set the UI can ask for. A code with no matching file FAILS the
 * script rather than being skipped - a silent gap here is a broken image in the UI, and
 * the pipeline's rule throughout this project is an explicit allowlist, never a silent
 * skip. The misses are accumulated first so one run names all of them.
 */
export function copyFlagAssets() {
  const facts = require('../src/data/countryFacts.json');

  const codes = [...new Set(Object.values(facts).map((f) => isoFromFlag(f.flag)).filter(Boolean))]
    .sort();

  const missing = [];

  for (const { from, to, ext, suffix } of FLAG_COPIES) {
    const sourceDir = join(root, from);
    const targetDir = join(root, to);

    // Rebuilt from scratch so a country dropped upstream does not leave a stale file behind.
    rmSync(targetDir, { recursive: true, force: true });
    mkdirSync(targetDir, { recursive: true });

    let bytes = 0;
    for (const code of codes) {
      const file = join(sourceDir, `${code}${suffix}.${ext}`);
      try {
        copyFileSync(file, join(targetDir, `${code}.${ext}`));
        bytes += statSync(file).size;
      } catch {
        missing.push(`${from}/${code}${suffix}.${ext}`);
      }
    }

    console.log(`  ${to}/  (${readdirSync(targetDir).length} flags, ${(bytes / 1024).toFixed(0)} KB)`);
  }

  if (missing.length) {
    throw new Error(
      `No flag image for: ${missing.join(', ')}. ` +
        'Run `npm run flags:data` (or `npm run flags:import` first, if the masters are gone).',
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Copying web assets into public/');
  copyWebAssets();
  copyFlagAssets();
}
