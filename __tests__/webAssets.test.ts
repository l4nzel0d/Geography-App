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
 * Every flag the info sheet can ask for must exist on disk.
 *
 * Windows draws no flag emoji, so the web build serves real SVGs from `public/flags/`
 * (see `CountryFlag.web.tsx`). A country whose file is missing renders a broken image
 * until the badge fallback catches it - so the invariant is checked here rather than
 * discovered in the UI, mirroring how `data-integrity.test.ts` guards the pipeline.
 */
describe('public/flags', () => {
  const facts = factsJson as Record<string, { flag: string | null }>;
  const codes = [
    ...new Set(
      Object.values(facts)
        .map((f) => flagLetters(f.flag))
        .filter((c): c is string => Boolean(c))
        .map((c) => c.toLowerCase()),
    ),
  ].sort();

  it('has an SVG for every flag in the dataset', () => {
    expect(codes.length).toBeGreaterThan(200);

    // If this fails, run `npm run web:assets`.
    const missing = codes.filter((c) => !existsSync(join(root, `public/flags/${c}.svg`)));
    expect(missing).toEqual([]);
  });

  it('ships only the flags the dataset references', () => {
    // flag-icons carries more codes than this app has countries. Shipping the extras
    // would be dead payload in every service-worker precache.
    const shipped = readdirSync(join(root, 'public/flags'))
      .filter((f) => f.endsWith('.svg'))
      .map((f) => f.replace('.svg', ''))
      .sort();

    expect(shipped).toEqual(codes);
  });
});
