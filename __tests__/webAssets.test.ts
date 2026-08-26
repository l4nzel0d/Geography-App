/**
 * The copies in `public/` must stay byte-identical to their sources in `node_modules`.
 *
 * `public/maplibre/` holds MapLibre's web worker and the shared chunk it imports, because
 * maplibre cannot find its own worker under Metro (see `WorldMap.web.tsx`). Those copies
 * are made by `scripts/copy-web-assets.mjs`, and a `maplibre-gl` version bump would leave
 * them stale - a mismatched worker against a newer main bundle, which fails at runtime,
 * offline, in production, and nowhere earlier.
 *
 * This is the same discipline the data pipeline already uses: one source, and a test that
 * proves the copies agree, rather than trusting that someone re-ran the script.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { flagLetters } from '@/components/flagEmoji';
import factsJson from '@/data/countryFacts.json';

const root = join(__dirname, '..');

const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');

const COPIES = [
  {
    what: 'the MapLibre web worker',
    from: 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs',
    to: 'public/maplibre/maplibre-gl-worker.mjs',
  },
  {
    what: 'the shared chunk the worker imports',
    from: 'node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs',
    to: 'public/maplibre/maplibre-gl-shared.mjs',
  },
] as const;

describe('public/ web assets', () => {
  it.each(COPIES)('$what is byte-identical to its source', ({ from, to }) => {
    const source = join(root, from);
    const copy = join(root, to);

    expect(existsSync(copy)).toBe(true);
    // If this fails, run `npm run web:assets` - do not edit the copy by hand.
    expect(sha(copy)).toBe(sha(source));
  });

  it('keeps the worker and its shared chunk side by side', () => {
    // The worker does `import ... from "./maplibre-gl-shared.mjs"`, resolved against its
    // OWN url. Copying the worker alone yields one that 404s the moment it starts.
    const worker = readFileSync(join(root, 'public/maplibre/maplibre-gl-worker.mjs'), 'utf8');
    expect(worker).toContain('./maplibre-gl-shared.mjs');
    expect(existsSync(join(root, 'public/maplibre/maplibre-gl-shared.mjs'))).toBe(true);
  });
});

/**
 * Every flag image the app can ask for must exist under `public/`, and be the same bytes as
 * the copy under `assets/`.
 *
 * The flag is a real image on every platform now, and the web reaches it over HTTP:
 * `/flags` for the quiz's full-size master, `/flag-thumbs` for a row, `/map-flags` for the
 * symbol layer (see `CountryFlag.web.tsx` and `WorldMap.web.tsx`). A country whose file is
 * missing renders a broken image until the badge fallback catches it - so the invariant is
 * checked here rather than discovered in the UI, mirroring how `data-integrity.test.ts`
 * guards the pipeline.
 *
 * **Byte identity is the point**, and it is checkable now in a way it never was: `public/`
 * used to be a second copy of the `flag-icons` SVGs and `public/map-flags` a second render,
 * so the two could only be compared for existence. Both are now a straight `copyFileSync` of
 * `assets/`, performed by the one function in `copy-web-assets.mjs`.
 */
describe('the flag images under public/', () => {
  const facts = factsJson as Record<string, { flag: string | null }>;
  const codes = [
    ...new Set(
      Object.values(facts)
        .map((f) => flagLetters(f.flag))
        .filter((c): c is string => Boolean(c))
        .map((c) => c.toLowerCase()),
    ),
  ].sort();

  /** Mirrors `FLAG_COPIES` in `scripts/copy-web-assets.mjs`. */
  const TIERS = [
    { what: 'the quiz master', from: 'assets/flags', to: 'public/flags', ext: 'webp', suffix: '' },
    {
      what: 'the row thumb',
      from: 'assets/flag-thumbs',
      to: 'public/flag-thumbs',
      ext: 'webp',
      suffix: '',
    },
    {
      // The web has no `@Nx` suffixes, so it takes the 3x bytes under a plain name and
      // `WorldMap.web.tsx` passes `pixelRatio` explicitly.
      what: 'the map raster',
      from: 'assets/map-flags',
      to: 'public/map-flags',
      ext: 'png',
      suffix: '@3x',
    },
  ];

  it.each(TIERS)('serves $what for every flag in the dataset', ({ to, ext }) => {
    expect(codes.length).toBeGreaterThan(200);

    // If this fails, run `npm run flags:data`.
    const missing = codes.filter((c) => !existsSync(join(root, `${to}/${c}.${ext}`)));
    expect(missing).toEqual([]);
  });

  it.each(TIERS)('serves $what as the very same bytes as assets/', ({ from, to, ext, suffix }) => {
    for (const c of codes) {
      expect(sha(join(root, `${to}/${c}.${ext}`))).toBe(
        sha(join(root, `${from}/${c}${suffix}.${ext}`)),
      );
    }
  });

  it.each(TIERS)('ships only the flags the dataset references, as $what', ({ to, ext }) => {
    // Anything extra here is dead payload in every service-worker precache, twice over -
    // Expo copies `public/` into both locale trees.
    const shipped = readdirSync(join(root, to))
      .filter((f) => f.endsWith(`.${ext}`))
      .map((f) => f.replace(`.${ext}`, ''))
      .sort();

    expect(shipped).toEqual(codes);
  });
});

/**
 * The committed dev-server manifest.
 *
 * The per-locale invariants - scope, prefixed icons, the Russian strings - are asserted in
 * `scripts/manifest.mjs` at BUILD time rather than here, because that module is ESM and
 * Jest's transform does not reach `.mjs`. Putting them in the build is not a workaround:
 * it is where the rest of this pipeline's invariants live, and a manifest that is wrong
 * should fail the deploy rather than a test run.
 *
 * What this file can still check is that the committed copy is a real manifest with the
 * root scope, which is the one thing the dev server depends on.
 */
describe('the committed web manifest', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8'));

  it('is scoped to the root, for the dev server and the English deploy', () => {
    expect(manifest.scope).toBe('/');
    expect(manifest.start_url).toBe('/');
    expect(manifest.lang).toBe('en');
  });

  it('names icons that public/ actually holds', () => {
    for (const icon of manifest.icons) {
      expect(existsSync(join(root, 'public', icon.src.replace(/^\//, '')))).toBe(true);
    }
  });
});
