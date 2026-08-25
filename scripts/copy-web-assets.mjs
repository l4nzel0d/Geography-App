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
 * 2. **The flag images.** Windows draws no country flag emoji at all (see
 *    `components/flagEmoji.ts`), so the web build ships real flag SVGs and reaches for
 *    one only on the platforms that need it. They come from the `flag-icons`
 *    devDependency and are copied per ISO 3166-1 alpha-2 code, so only the ~249 flags the
 *    dataset actually references ship - not the 271 the package carries.
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

export const FLAGS_DIR = join(root, 'public/flags');

/**
 * Copies one 4x3 SVG per flag the dataset references.
 *
 * Driven by `countryFacts.json` rather than by listing the package, so the set shipped is
 * exactly the set the info sheet can ask for. A code with no matching SVG FAILS the
 * script rather than being skipped - a silent gap here is a broken image in the UI, and
 * the pipeline's rule throughout this project is an explicit allowlist, never a silent
 * skip.
 */
export function copyFlagAssets() {
  const facts = require('../src/data/countryFacts.json');
  const source = join(dirname(require.resolve('flag-icons/package.json')), 'flags/4x3');

  const codes = [...new Set(Object.values(facts).map((f) => isoFromFlag(f.flag)).filter(Boolean))]
    .sort();

  // Rebuilt from scratch so a country dropped upstream does not leave a stale file behind.
  rmSync(FLAGS_DIR, { recursive: true, force: true });
  mkdirSync(FLAGS_DIR, { recursive: true });

  const missing = [];
  let bytes = 0;
  for (const code of codes) {
    const from = join(source, `${code}.svg`);
    try {
      copyFileSync(from, join(FLAGS_DIR, `${code}.svg`));
      bytes += statSync(join(FLAGS_DIR, `${code}.svg`)).size;
    } catch {
      missing.push(code);
    }
  }

  if (missing.length) {
    throw new Error(`No flag SVG for: ${missing.join(', ')}`);
  }

  console.log(
    `  public/flags/  (${readdirSync(FLAGS_DIR).length} flags, ${(bytes / 1024).toFixed(0)} KB)`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Copying web assets into public/');
  copyWebAssets();
  copyFlagAssets();
}
