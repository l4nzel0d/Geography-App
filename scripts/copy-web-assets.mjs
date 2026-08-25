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
 * The label font deliberately does NOT need copying. Expo's static rendering already
 * emits `@font-face{font-family:"Map Label";src:url("/assets/.../NotoSans-Regular.<hash>.ttf")}`
 * into every exported HTML file, derived from the `useFonts` call in `WorldMap.web.tsx` -
 * so the family the label layer's `text-font` names is registered without any help, and a
 * second unhashed copy would only add 556 KB of never-requested bytes to the payload.
 */
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Copying web assets into public/');
  copyWebAssets();
}
