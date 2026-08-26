/**
 * Derives every shipped flag image from the committed masters, and writes the maps that
 * reach them.
 *
 * `npm run flags:data` - **offline**, and its output is committed, exactly like the JSON in
 * `src/data`. Its upstream is `assets/flags/*.webp`, which `npm run flags:import` produced
 * once from a raster pack too large to commit. The pair is the same split as
 * `build:data` / `enrich:data`: the online, one-off half fetches, and this half - the one
 * anybody can re-run - derives. Nothing here needs the pack, or a network, or the SVGs the
 * app used to ship.
 *
 * ## Three tiers, because the three consumers want three different sizes
 *
 * | tier | drawn at | shipped |
 * |---|---|---|
 * | master | the quiz's flag round, up to 460 dp wide | `assets/flags`, `public/flags` |
 * | thumb | info sheet 30 dp, search row 21 dp, results row 18 dp - all HEIGHTS | `assets/flag-thumbs`, `public/flag-thumbs` |
 * | map raster | the `country-flag` symbol layer, 13.5 -> 18 dp tall | `assets/map-flags` (both scales), `public/map-flags` |
 *
 * Handing a 1024 px master to a 21 dp search row would be fifty full-size decodes on the
 * search screen for nothing, which is the whole argument for the thumb tier.
 *
 * ## The map tier stays PNG
 *
 * **MapLibre's icon pipeline is raster-only on every platform**, which is why it exists at
 * all: on Android a `require`d asset reaches `BitmapUtils.getBitmapFromResource` ->
 * `BitmapFactory.decodeResource` in a release build, and Fresco over a Metro URL in dev.
 * (maplibre-gl v6 is more relaxed than it used to be - it loads through `img.src = url`,
 * so the web would take any format a browser decodes - but the Android path is the one
 * that was hard to get right, and the whole tier is under 2 MB, so there is nothing to buy
 * by re-proving it.)
 *
 * ## Every size is height-anchored
 *
 * A flag's width follows its own ratio - see `src/components/flagAspects.ts`. Height is
 * what makes a column of search results line up and what makes the map's flag labels carry
 * the same visual weight as a name label's cap height, so height is what is held fixed.
 */
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import sharp from 'sharp';

import { copyFlagAssets } from './copy-web-assets.mjs';

const require = createRequire(import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const MASTER_DIR = join(root, 'assets', 'flags');
const THUMB_DIR = join(root, 'assets', 'flag-thumbs');
const RASTER_DIR = join(root, 'assets', 'map-flags');

const MASTER_MAP_FILE = join(root, 'src', 'components', 'flagAssets.ts');
const THUMB_MAP_FILE = join(root, 'src', 'components', 'flagThumbs.ts');
const RASTER_MAP_FILE = join(root, 'src', 'map', 'mapFlagImages.ts');
const WEB_RASTER_MAP_FILE = join(root, 'src', 'map', 'mapFlagImages.web.ts');

/**
 * The thumb's height in pixels, and the quality it is encoded at.
 *
 * 96 is 3x the tallest fixed size any screen asks for - `FLAG_SIZES.md`, the info sheet's
 * 30 dp - so it is texel-exact on a 3x phone and generous everywhere else. Encoded a
 * notch above the master because the artefacts of a lossy encode are far more visible in
 * something the size of a favicon.
 */
const THUMB_HEIGHT = 96;
const THUMB_QUALITY = 88;

/**
 * The two map rasters written per flag, and why there are two.
 *
 * `DownloadMapImageTask` sets `inDensity` only when the resolved asset's scale is not 1:
 *
 *     options.inTargetDensity = metrics.densityDpi;
 *     if (scale != ImageEntry.DEFAULT_SCALE) options.inDensity = (int)(160 * scale);
 *
 * An unsuffixed PNG is filed by React Native under `drawable-mdpi`, so `decodeResource`
 * takes its `inDensity` from the bucket (160) against an `inTargetDensity` of 480 on a 3x
 * phone and UPSAMPLES every flag 3x at decode time - a blurry icon, and roughly 35 MB of
 * bitmaps for the set. With an `@3x` present, `resolveAssetSource` reports scale 3,
 * `inDensity` matches `inTargetDensity`, and the bitmap is used as-is. Dev agrees, because
 * Fresco resolves the same file and `bitmap.setDensity(160 * 3)` lands in the same place.
 *
 * Because MapLibre derives an image's pixel ratio from the bitmap's density, both files end
 * up **18 style px tall** - which is what makes one `icon-size` expression correct on every
 * density. See `MAP_FLAG_INTRINSIC_DP` in `src/map/labelFit.ts`.
 *
 * The 1x file also keeps **Jest** working: its resolver does no `@Nx` suffix lookup, so a
 * 3x-only set would fail `require('../../assets/map-flags/us.png')` in every test that
 * touches the map.
 */
const RASTERS = [
  { scale: 1, height: 18, borderPx: 1, suffix: '' },
  { scale: 3, height: 54, borderPx: 2, suffix: '@3x' },
];

/**
 * The hairline drawn around each map flag.
 *
 * Not decoration. Japan, Finland and Nigeria are almost entirely white, and the land under
 * a map label runs from the flat green basemap through the near-white low end of the
 * choropleth ramps to their deep maroon - so an unbordered flag is a shapeless hole in
 * three of those cases. Same reasoning as the plaque behind the quiz's `FlagStage`, and the
 * same colour as `mapColors.labelHalo` in `src/map/offlineStyle.ts`, restated here because
 * a `.mjs` build script cannot import TypeScript. **MapLibre has no `icon-halo`**, so this
 * is the one chance to draw it.
 *
 * It is composited OVER the flag rather than extended around it, so the file's outer
 * dimensions stay exactly the flag's own aspect box. Extending would inset the picture by
 * two pixels out of eighteen and quietly make every map flag a different shape from the
 * same flag in the info sheet.
 */
const BORDER_COLOR = { r: 13, g: 43, b: 69, alpha: 1 };

/**
 * Composited onto white before the border goes on.
 *
 * The masters are already flattened, so this is belt and braces for a source that stops
 * being: a dark frame drawn around empty space reads as a broken image rather than a flag.
 */
const BACKGROUND = '#ffffff';

/**
 * Prefix on every map-image name, so a feature carries `flag-br` rather than a bare `br`.
 *
 * A style's images share one namespace, so an unprefixed two-letter name is a collision
 * waiting for the first non-flag icon this app ever adds. `FLAG_IMAGE_PREFIX` in
 * `src/map/mapLabels.ts` is the same string - restated here for the same reason the flag
 * decoder is - and `mapFlagImages.test.ts` asserts the generated keys and the feature
 * properties agree.
 */
const IMAGE_PREFIX = 'flag-';

/** U+1F1E6 REGIONAL INDICATOR SYMBOL LETTER A. Mirrors `components/flagEmoji.ts`. */
const REGIONAL_INDICATOR_A = 0x1f1e6;

/** The lowercase alpha-2 code a flag emoji encodes, or null if it is not a pair. */
function isoFromFlag(flag) {
  if (!flag) return null;
  const points = [...flag].map((c) => c.codePointAt(0));
  if (points.length !== 2) return null;
  if (points.some((p) => p < REGIONAL_INDICATOR_A || p > REGIONAL_INDICATOR_A + 25)) return null;
  return points.map((p) => String.fromCharCode(p - REGIONAL_INDICATOR_A + 97)).join('');
}

/**
 * Every flag the dataset references, lower-case and sorted.
 *
 * Driven by `countryFacts.json` rather than by listing the master directory, so the set
 * shipped is exactly the set the UI can ask for - and a master that went missing FAILS the
 * script instead of quietly leaving a country flagless.
 */
function requiredCodes() {
  const facts = require('../src/data/countryFacts.json');
  return [
    ...new Set(Object.values(facts).map((record) => isoFromFlag(record.flag)).filter(Boolean)),
  ].sort();
}

/**
 * The master's aspect, rounded exactly as `flagAspects.ts` rounds it.
 *
 * Recomputed from the image rather than parsed out of the generated TypeScript, so this
 * script has one dependency fewer and cannot be fooled by a hand-edited table - but rounded
 * identically, because every raster width below is `round(height * aspect)` and the tests
 * check those against the table. A different rounding here would be a one-pixel
 * disagreement nobody could see and every test could.
 */
async function masterAspect(file) {
  const { width, height } = await sharp(file).metadata();
  return { aspect: Number((width / height).toFixed(4)), width, height };
}

/** A solid rectangle, for compositing the border a strip at a time. */
function bar(width, height) {
  return { create: { width, height, channels: 4, background: BORDER_COLOR } };
}

/**
 * One map raster: the flag at `height`, with a `borderPx` frame drawn over its own edge.
 *
 * Four strips rather than an SVG overlay, so nothing here depends on which optional
 * libvips loaders the installed `sharp` binary happens to carry.
 */
async function mapRaster(master, width, height, borderPx) {
  const flag = await sharp(master)
    .resize(width, height, { fit: 'fill' })
    .flatten({ background: BACKGROUND })
    .toBuffer();

  return sharp(flag)
    .composite([
      { input: bar(width, borderPx), top: 0, left: 0 },
      { input: bar(width, borderPx), top: height - borderPx, left: 0 },
      { input: bar(borderPx, height), top: 0, left: 0 },
      { input: bar(borderPx, height), top: 0, left: width - borderPx },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function reset(...dirs) {
  for (const dir of dirs) {
    // Rebuilt from scratch, so a flag that leaves the dataset leaves the APK with it.
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
}

export async function buildFlagAssets() {
  const codes = requiredCodes();

  reset(THUMB_DIR, RASTER_DIR);

  const bytes = { master: 0, thumb: 0, raster: 0 };

  for (const code of codes) {
    const master = join(MASTER_DIR, `${code}.webp`);
    // Loud rather than silent: a missing master would otherwise reach a player as an empty
    // frame in the middle of a quiz question. Same rule as the data pipeline's.
    if (!existsSyncSafe(master)) throw new Error(`No flag master for: ${code}`);

    const { aspect } = await masterAspect(master);
    bytes.master += statSync(master).size;

    const thumb = await sharp(master)
      .resize(Math.round(THUMB_HEIGHT * aspect), THUMB_HEIGHT, { fit: 'fill' })
      .webp({ quality: THUMB_QUALITY, effort: 6 })
      .toBuffer();

    writeFileSync(join(THUMB_DIR, `${code}.webp`), thumb);
    bytes.thumb += thumb.length;

    /*
      The 3x width is THREE TIMES the 1x width, not `round(54 * aspect)`.

      Rounding each scale independently disagrees by a pixel for some ratios, and the two
      files would then describe icons of different dp widths - so a flag would be one size
      on a 1x screen and another on a 3x one, from the same `icon-size`. Invisible in Jest,
      which never opens the files, and visible on a device.
    */
    const width1x = Math.round(RASTERS[0].height * aspect);

    for (const { scale, height, borderPx, suffix } of RASTERS) {
      const png = await mapRaster(master, width1x * scale, height, borderPx);

      writeFileSync(join(RASTER_DIR, `${code}${suffix}.png`), png);
      bytes.raster += png.length;
    }
  }

  writeImageMaps(codes);

  const mb = (n) => `${(n / 1048576).toFixed(2)} MB`;
  console.log(`  assets/flags        ${codes.length} masters, ${mb(bytes.master)}`);
  console.log(`  assets/flag-thumbs  ${codes.length} files, ${mb(bytes.thumb)}`);
  console.log(`  assets/map-flags    ${codes.length * RASTERS.length} files, ${mb(bytes.raster)}`);
  for (const file of [MASTER_MAP_FILE, THUMB_MAP_FILE, RASTER_MAP_FILE, WEB_RASTER_MAP_FILE]) {
    console.log(`  ${file.slice(root.length + 1)}  ${codes.length} entries`);
  }

  // One copier, called from here and from `build:web`, so `public/` is provably a copy of
  // `assets/` rather than a second render that could drift from it.
  copyFlagAssets();

  return codes;
}

/** `existsSync` without importing it twice; kept tiny so the throw above reads in one line. */
function existsSyncSafe(file) {
  try {
    statSync(file);
    return true;
  } catch {
    return false;
  }
}

/** The header every generated map shares. */
function generatedHeader(what, extra) {
  return `/**
 * ${what}
 *
 * GENERATED by \`scripts/build-flag-assets.mjs\` - do not edit. Run \`npm run flags:data\`.
 *
 * A literal \`require\` per flag because **Metro cannot do a dynamic one**: the bundler
 * resolves requires at build time, so a template-literal path resolves to nothing. 249
 * literals in a generated file is the honest way to say that.
 *
${extra}
 */`;
}

function writeImageMaps(codes) {
  const requires = (dir, ext) =>
    codes.map((code) => `  ${code}: require('../../assets/${dir}/${code}.${ext}'),`).join('\n');

  writeFileSync(
    MASTER_MAP_FILE,
    `${generatedHeader(
      'Every bundled flag at full size, keyed by lower-case ISO 3166-1 alpha-2.',
      ` * The MASTER tier - about 1024 px on the long side. Its one consumer is the quiz's flag
 * round, where the flag is the question and runs the full width of the stage. Anything
 * drawn at a fixed dp size takes \`flagThumbs.ts\` instead.
 *
 * The values are opaque asset references - a number under Metro's native bundler, a URL
 * on web - so they are typed as whatever \`require\` returns rather than pinned to one.`,
    )}
export const FLAG_ASSETS: Record<string, ReturnType<typeof require>> = {
${requires('flags', 'webp')}
};
`,
    'utf8',
  );

  writeFileSync(
    THUMB_MAP_FILE,
    `${generatedHeader(
      'Every bundled flag at row size, keyed by lower-case ISO 3166-1 alpha-2.',
      ` * The THUMB tier - 96 px tall, which is 3x the tallest fixed size any screen asks for.
 * Used by every \`CountryFlag\` that is not the quiz's \`fill\`: the info sheet header, a
 * search result row, a quiz results row.
 *
 * It exists so those rows do not decode a 1024 px master apiece. The search screen lists
 * every country it matches, so that is fifty full-size decodes on a keystroke.`,
    )}
export const FLAG_THUMBS: Record<string, ReturnType<typeof require>> = {
${requires('flag-thumbs', 'webp')}
};
`,
    'utf8',
  );

  writeFileSync(
    RASTER_MAP_FILE,
    `${generatedHeader(
      'Every bundled flag as a MAP ICON, keyed by the image name the symbol layer asks for.',
      ` * PNG rather than the WebP the UI tiers use, because **MapLibre's icon pipeline is
 * raster-only and its Android half is fussy** - see the script's header for the receipts.
 * Rendered 18 px tall at 1x and 54 px at 3x, each flag's own width, on white, with a
 * #0d2b45 border.
 *
 * The paths are UNSUFFIXED - React Native picks the scale from what sits beside them,
 * which is the whole point of shipping two.
 *
 * Typed as \`ImageRequireSource\` - a number - rather than \`flagAssets.ts\`'s
 * \`ReturnType<typeof require>\`, because this map is handed straight to \`<Images>\`, whose
 * \`ImageEntry\` will not accept an \`unknown\`. The web sibling holds URLs and is imported
 * by its explicit path, so the two never have to agree on one type.`,
    )}
import type { ImageRequireSource } from 'react-native';

export const MAP_FLAG_IMAGES: Record<string, ImageRequireSource> = {
${codes.map((c) => `  '${IMAGE_PREFIX}${c}': require('../../assets/map-flags/${c}.png'),`).join('\n')}
};
`,
    'utf8',
  );

  writeFileSync(
    WEB_RASTER_MAP_FILE,
    `${generatedHeader(
      'Every bundled flag as a MAP ICON, keyed by the image name the symbol layer asks for.',
      ` * Same-origin URLs rather than requires, so the web bundle does not emit a second copy of
 * all 249 beside the ones \`public/\` already serves. These are the 3x bytes and nothing
 * tells the browser that, so \`WorldMap.web.tsx\` passes \`pixelRatio\` explicitly.`,
    )}
export const MAP_FLAG_IMAGES: Record<string, string> = {
${codes.map((c) => `  '${IMAGE_PREFIX}${c}': '/map-flags/${c}.png',`).join('\n')}
};
`,
    'utf8',
  );
}

// `pathToFileURL`, not string surgery: on Windows `argv[1]` is a backslashed drive path,
// and `file://` + it yields two slashes where a file URL needs three - so the guard never
// fires and running the script does nothing at all, silently.
if (import.meta.url === pathToFileURL(process.argv[1]).href) await buildFlagAssets();
