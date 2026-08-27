/**
 * Imports the flag MASTERS - the one committed upstream every other flag artefact is
 * derived from - out of a raster pack far too large to live in the repo.
 *
 * `npm run flags:import`. This is the **one-off** half of a pair, exactly as `build:data`
 * is to `enrich:data`: it needs a 189 MB folder of ~4500 px JPEGs that is not committed,
 * and its output is. `npm run flags:data` then runs offline against what this wrote and
 * needs the pack no more than the app needs the World Bank.
 *
 * ## Why a raster pack at all, when the app already had 249 SVGs
 *
 * `flag-icons` normalises every flag to **4:3**, and almost no flag is 4:3. Measured over
 * the 208 usable files in this pack: 4 are, 103 are ~3:2, 64 are ~2:1, and the outliers
 * are real - Qatar is 28:11, Nepal is a pennant taller than it is wide, the Vatican is
 * square. So the app spent its whole life drawing nearly every flag the wrong shape.
 * `FLAG_ASPECTS`, written below, is how each flag's own ratio reaches the UI.
 *
 * ## Three sources, in priority order, and never a silent skip
 *
 * 1. **The pack's JPEG.** 206 countries, after dropping 14 non-country files (`eu`,
 *    `nato`, `scotland`, ...) and repairing three filenames the pack gets wrong.
 * 2. **A loose SVG dropped into the pack.** Montenegro and South Sudan are simply absent
 *    from it, and both are asked as quiz questions, so they were sourced by hand. Syria's
 *    is the same file placed as an override, because the pack carries the pre-2024 flag.
 * 3. **`flag-icons`' 4x3 SVG.** The 41 remaining codes are dependent territories the pack
 *    does not carry - Puerto Rico, Kosovo, the Falklands, New Caledonia. They keep the 4:3
 *    shape they have always had here. None is ever a quiz question; they are reachable
 *    through the info sheet, search and the map's flag labels.
 *
 * An unresolved code THROWS, per this repo's rule everywhere else: an explicit allowlist,
 * never a silent skip. A missing flag reaches a player as an empty frame.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

const require = createRequire(import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Overridable so the pack can live anywhere; the default is where it was downloaded. */
const PACK_DIR = process.env.FLAG_PACK_DIR ?? join(root, 'temp', 'classic_big_1000');

const MASTER_DIR = join(root, 'assets', 'flags');
const ASPECTS_FILE = join(root, 'src', 'components', 'flagAspects.ts');
const FALLBACK_DIR = join(root, 'node_modules', 'flag-icons', 'flags', '4x3');

/**
 * The master's long side in pixels, and the quality it is encoded at.
 *
 * Sized by its ONE demanding consumer, the quiz's flag round: the stage runs the full
 * width of a phone, ~370 dp, which is ~1110 device px on a 3x screen. 1024 is within a
 * hair of that and comfortably past what a desktop browser asks for, where `FLAG_MAX_WIDTH`
 * caps the frame at 460 dp. Every other consumer is served by `assets/flag-thumbs`, which
 * `build-flag-assets.mjs` derives from these - a 1024 px file behind a 21 dp search row
 * would be fifty full-size decodes on the search screen for nothing.
 *
 * WebP rather than PNG because the pack is JPEG-sourced and PNG stores its ringing
 * faithfully and expensively: this same set is 2.5 MB here and 19 MB as PNG.
 */
const MASTER_LONG_EDGE = 1024;
const MASTER_QUALITY = 82;

/**
 * Flattened onto white before encoding.
 *
 * WebP could carry the alpha, but nothing downstream wants it: the map rasters composite
 * onto white anyway (a dark border drawn around empty space reads as a broken image), and
 * a transparent Nepal in the quiz's frame would show the panel's navy through the pennant
 * rather than a flag. The pack's own JPEGs are already opaque white; this only matters for
 * the SVG sources.
 */
const BACKGROUND = '#ffffff';

/** Not countries. The pack ships flags for unions, nations and, for some reason, pirates. */
const NOT_A_COUNTRY = new Set([
  'african_union',
  'arab_league',
  'asean',
  'caricom',
  'cis',
  'england',
  'eu',
  'nato',
  'northern_ireland',
  'pirats',
  'quebec',
  'scotland',
  'un',
  'wales',
]);

/**
 * Filenames the pack gets wrong, mapped to ISO 3166-1 alpha-2.
 *
 * `by_` is a trailing-underscore escape of Belarus, `uk` is the internet TLD rather than
 * the ISO code `gb`, and `tp` is East Timor's code from before 2002 - the pack is dated
 * 2017, but its naming is older than that.
 */
const FILENAME_ALIASES = { by_: 'by', uk: 'gb', tp: 'tl' };

/**
 * A hand-placed replacement for one of the pack's flags: `CH-1.0-1200.png`.
 *
 * Anything in the pack directory whose name begins `<alpha-2>-` overrides the plain
 * `<alpha-2>.jpg` beside it. The rest of the name is documentation - by convention the
 * aspect as height/width and then the height in pixels - and is deliberately **not
 * parsed**: the file's own dimensions are what the master is built from and what
 * `FLAG_ASPECTS` is measured off, so a filename that disagreed with its contents could
 * only mislead. `DE-O-1200.png` has a typo where its ratio should be and imports
 * correctly, which is the point.
 *
 * The pack is a 2017 snapshot and wrong in two different ways, both represented here:
 *
 * - **Shape.** Switzerland is drawn 3:2 and is square; Germany comes out 1.6517 against
 *   an official 3:5. Every other ratio in the pack is faithful, which is what made these
 *   worth replacing one at a time rather than distrusting the set.
 * - **Content.** Libya is the pre-2011 plain green flag, Mauritania predates the red
 *   stripes added in 2017, Afghanistan is the pre-2021 republic tricolour and Syria the
 *   pre-2024 one. No amount of care about ratios helps with a flag that is out of date,
 *   and nothing in this pipeline could have noticed. Two of those four also changed
 *   shape with their content - Afghanistan's 2:1 for the tricolour's 3:2 - which is why
 *   the ratio is always re-measured off the written master rather than carried over.
 *
 * An override may be an SVG (`SY-0.67-600.svg`), in which case it takes the rasterising
 * path and is still counted as hand-replaced: what the count documents is a correction,
 * not a file format.
 *
 * This is the same shape as `scripts/countryOverrides.mjs`: a deliberate, listed
 * correction to a pinned upstream, kept where the next person will find it. Unlike that
 * one there is no "this override stopped differing" check, because the pack is a frozen
 * folder rather than a package that can be upgraded underneath us.
 */
const OVERRIDE_FILENAME = /^([a-z]{2})-/i;

/** U+1F1E6 REGIONAL INDICATOR SYMBOL LETTER A. Mirrors `components/flagEmoji.ts`. */
const REGIONAL_INDICATOR_A = 0x1f1e6;

/**
 * The lowercase alpha-2 code a flag emoji encodes, or null if it is not a pair.
 *
 * A third copy of `flagLetters`, for the reason the other two scripts give: a `.mjs` build
 * script cannot import TypeScript. `data-integrity.test.ts` asserts they all agree.
 */
function isoFromFlag(flag) {
  if (!flag) return null;
  const points = [...flag].map((c) => c.codePointAt(0));
  if (points.length !== 2) return null;
  if (points.some((p) => p < REGIONAL_INDICATOR_A || p > REGIONAL_INDICATOR_A + 25)) return null;
  return points.map((p) => String.fromCharCode(p - REGIONAL_INDICATOR_A + 97)).join('');
}

/** Every flag the dataset references, lower-case and sorted. The same 249 the other scripts derive. */
function requiredCodes() {
  const facts = require('../src/data/countryFacts.json');
  return [
    ...new Set(Object.values(facts).map((record) => isoFromFlag(record.flag)).filter(Boolean)),
  ].sort();
}

/**
 * What the pack offers, keyed by the code it MEANT rather than the name it used.
 *
 * Two passes, so an override wins however the directory happens to be ordered: a plain
 * `ch.jpg` read after `CH-1.0-1200.png` would otherwise silently undo the correction.
 */
function indexPack() {
  const plain = new Map();
  const overrides = new Map();
  if (!existsSync(PACK_DIR)) return plain;

  for (const file of readdirSync(PACK_DIR)) {
    const stem = basename(file, extname(file));
    if (NOT_A_COUNTRY.has(stem)) continue;

    const override = OVERRIDE_FILENAME.exec(stem);
    if (override) {
      const code = override[1].toLowerCase();
      // Two replacements for one country is a half-finished edit, not a preference, and
      // which one won would come down to readdir order.
      if (overrides.has(code)) {
        throw new Error(`Two overrides for ${code}: ${basename(overrides.get(code))} and ${file}`);
      }
      overrides.set(code, join(PACK_DIR, file));
      continue;
    }

    plain.set(FILENAME_ALIASES[stem] ?? stem, join(PACK_DIR, file));
  }

  return { files: new Map([...plain, ...overrides]), overridden: new Set(overrides.keys()) };
}

/**
 * An SVG rasterised at `MASTER_LONG_EDGE` on whichever side is longer.
 *
 * `fitTo` takes one axis, so the axis has to be chosen: asking for a width of 1024 on a
 * portrait flag would render it taller than the budget. Every source here happens to be
 * landscape, but two of them are hand-dropped files and the one that is not would fail
 * silently, as a slightly-too-large master.
 */
function rasterise(svg) {
  const probe = new Resvg(svg);
  const mode = probe.width >= probe.height ? 'width' : 'height';
  return new Resvg(svg, { fitTo: { mode, value: MASTER_LONG_EDGE } }).render().asPng();
}

export async function importFlagMasters() {
  const codes = requiredCodes();
  const { files: pack, overridden } = indexPack();

  // Rebuilt from scratch, so a flag that leaves the dataset leaves the APK with it.
  rmSync(MASTER_DIR, { recursive: true, force: true });
  mkdirSync(MASTER_DIR, { recursive: true });

  const aspects = {};
  const sources = { pack: 0, override: 0, svg: 0, fallback: 0 };
  let bytes = 0;

  for (const code of codes) {
    const packFile = pack.get(code);
    const fallbackFile = join(FALLBACK_DIR, `${code}.svg`);

    let input;
    if (packFile && extname(packFile).toLowerCase() === '.svg') {
      input = rasterise(readFileSync(packFile, 'utf8'));
      sources[overridden.has(code) ? 'override' : 'svg'] += 1;
    } else if (packFile) {
      input = readFileSync(packFile);
      sources[overridden.has(code) ? 'override' : 'pack'] += 1;
    } else if (existsSync(fallbackFile)) {
      input = rasterise(readFileSync(fallbackFile, 'utf8'));
      sources.fallback += 1;
    } else {
      throw new Error(`No flag source for: ${code}`);
    }

    const to = join(MASTER_DIR, `${code}.webp`);
    const { width, height } = await sharp(input)
      .resize(MASTER_LONG_EDGE, MASTER_LONG_EDGE, { fit: 'inside', withoutEnlargement: true })
      .flatten({ background: BACKGROUND })
      .webp({ quality: MASTER_QUALITY, effort: 6 })
      .toFile(to);

    // Read back off what was WRITTEN, never off the source: the table and the images it
    // describes cannot then drift, and every downstream size is arithmetic on this number.
    aspects[code] = Number((width / height).toFixed(4));
    bytes += statSync(to).size;
  }

  writeAspects(aspects);

  console.log(
    `  assets/flags  ${codes.length} files, ${(bytes / 1048576).toFixed(2)} MB` +
      `  (${sources.pack} pack, ${sources.override} hand-replaced,` +
      ` ${sources.svg} pack svg, ${sources.fallback} flag-icons)`,
  );
  console.log(`  ${ASPECTS_FILE.slice(root.length + 1)}  ${codes.length} entries`);
  return codes;
}

function writeAspects(aspects) {
  const entries = Object.entries(aspects)
    .map(([code, aspect]) => `  ${code}: ${aspect},`)
    .join('\n');

  writeFileSync(
    ASPECTS_FILE,
    `/**
 * Every bundled flag's true width-to-height ratio, keyed by lower-case ISO 3166-1 alpha-2.
 *
 * GENERATED by \`scripts/import-flag-masters.mjs\` - do not edit. Run \`npm run flags:import\`.
 *
 * **The app used to assume 4:3 everywhere**, because \`flag-icons\` normalises to it. Almost
 * no flag is: Qatar is 28:11, Nepal is a pennant taller than it is wide, the Vatican is
 * square, and the commonest ratio in the set by a distance is 3:2. Every place that used to
 * write \`4 / 3\` reads this instead - the quiz frame's \`aspectRatio\`, the row layout in
 * \`CountryFlag\`, and the map label's fit test, which needs a flag's DRAWN width and now
 * derives it from a fixed height and this.
 *
 * Measured off the master files themselves rather than off their sources, so the table
 * cannot describe a set of images the repo does not hold; \`flagAspects.test.ts\` re-reads
 * both and asserts it.
 *
 * The 41 codes the raster pack does not carry fall back to \`flag-icons\` and are therefore
 * exactly \`1.3333\`. They are all dependent territories, and none is ever a quiz question.
 */
export const FLAG_ASPECTS: Record<string, number> = {
${entries}
};

/**
 * The ratio to draw a flag at when the table has nothing to say.
 *
 * Only reachable for a record with no flag at all - BES is \`""\` upstream - which every
 * consumer of this handles before it gets here. It exists so a \`??\` has something honest
 * to fall back to rather than a \`0\` that would collapse a layout to nothing.
 */
export const DEFAULT_FLAG_ASPECT = 4 / 3;
`,
    'utf8',
  );
}

// `pathToFileURL`, not string surgery: on Windows `argv[1]` is a backslashed drive path,
// and `file://` + it yields two slashes where a file URL needs three - so the guard never
// fires and running the script does nothing at all, silently.
if (import.meta.url === pathToFileURL(process.argv[1]).href) await importFlagMasters();
