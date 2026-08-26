/**
 * Places the country flag images the app bundles, and writes the maps that reach them.
 *
 * `npm run flags:data` - offline, and its output is committed, exactly like the JSON in
 * `src/data`. Everything below comes from one source, the `flag-icons` devDependency, and from
 * one list of codes, so no two outputs can describe different worlds.
 *
 * ## The vector set, for the UI
 *
 * 1. **`assets/flags/<iso2>.svg`** - the canonical copy. It lives under `assets/` rather
 *    than `public/` because Metro only bundles what the app `require`s, and `public/` is
 *    a web staging directory that never reaches an APK. `scripts/copy-web-assets.mjs`
 *    writes the web's `public/flags` from the SAME `flag-icons` source, so the two
 *    directories are copies of one upstream rather than of each other.
 *
 * 2. **`src/components/flagAssets.ts`** - a static `require` per flag.
 *
 * The map has to be generated because **Metro cannot do a dynamic `require`**. There is
 * no way to write a template-literal path: the bundler resolves requires at build time, so
 * every path has to appear literally somewhere. 249 literals in a generated file is the honest
 * way to say that.
 *
 * Only the flags the dataset actually references are copied - 249 of the 271 the package
 * carries - so the APK does not grow by flags for countries the app cannot show.
 *
 * ## And a RASTER set, for the map
 *
 * The explore map's `flag` label option draws each country's flag as `icon-image`, and those
 * have to be PNG. That is not a preference:
 *
 * **MapLibre's icon pipeline is raster-only on every platform.** On Android a `require`d asset
 * reaches `BitmapUtils.getBitmapFromResource` -> `BitmapFactory.decodeResource` in a release
 * build, and Fresco over a Metro URL in dev; iOS goes through `UIImage`; and `maplibre-gl`
 * hardcodes `new Blob([...], {type: "image/png"})` and throws *"Note that SVGs are not
 * supported"*. `expo-image`'s Android SVG decoder - the reason `assets/flags/*.svg` renders in
 * `<CountryFlag>` at all - is expo-image's OWN Glide pipeline and never reaches MapLibre. So
 * the very same file that draws fine in the info sheet draws NOTHING as a map icon, and it
 * fails log-only: `FLog.e("Failed to load bitmap from: ...")` and a blank space on screen.
 *
 * `flag-icons` ships no raster assets at all (271 SVGs in `4x3`, 271 in `1x1`, nothing else),
 * so they are rasterised here with `@resvg/resvg-js`, offline, output committed - the same
 * deal as every other generated artefact in this repo. Three sinks, one render:
 * `assets/map-flags/` (both scales), `public/map-flags/` (the 3x bytes, for the web), and the
 * two `src/map/mapFlagImages*.ts` maps.
 */
import {
  mkdirSync,
  copyFileSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  statSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Resvg } from '@resvg/resvg-js';

const require = createRequire(import.meta.url);

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIR = join(root, 'assets', 'flags');
const MAP_FILE = join(root, 'src', 'components', 'flagAssets.ts');
const RASTER_DIR = join(root, 'assets', 'map-flags');
const WEB_RASTER_DIR = join(root, 'public', 'map-flags');
const RASTER_MAP_FILE = join(root, 'src', 'map', 'mapFlagImages.ts');
const WEB_RASTER_MAP_FILE = join(root, 'src', 'map', 'mapFlagImages.web.ts');

/** Where `flag-icons` keeps the 4:3 set. The 1:1 set is unused. */
const source = join(root, 'node_modules', 'flag-icons', 'flags', '4x3');

/**
 * Regional indicator pair to its ISO 3166-1 alpha-2 code.
 *
 * A local copy of `src/components/flagEmoji.ts`'s `flagLetters`, because this script runs
 * under plain node with no TypeScript and no module alias. `data-integrity.test.ts`
 * asserts the two agree on every record in the dataset.
 */
const REGIONAL_INDICATOR_A = 0x1f1e6;

function isoFromFlag(flag) {
  if (!flag) return null;
  const points = [...flag].map((c) => c.codePointAt(0));
  if (points.length !== 2) return null;
  if (points.some((p) => p < REGIONAL_INDICATOR_A || p > REGIONAL_INDICATOR_A + 25)) return null;
  return points.map((p) => String.fromCharCode(65 + p - REGIONAL_INDICATOR_A)).join('');
}

export function buildFlagAssets() {
  const facts = require('../src/data/countryFacts.json');

  const codes = [
    ...new Set(
      Object.values(facts)
        .map((record) => isoFromFlag(record.flag))
        .filter(Boolean),
    ),
  ].sort();

  // Rebuilt from scratch, so a flag that leaves the dataset leaves the APK with it.
  rmSync(ASSET_DIR, { recursive: true, force: true });
  mkdirSync(ASSET_DIR, { recursive: true });

  const available = new Set(readdirSync(source));
  let bytes = 0;

  for (const code of codes) {
    const file = `${code.toLowerCase()}.svg`;
    // Loud rather than silent: a missing flag would otherwise reach a player as an empty
    // frame in the middle of a quiz question. Same rule as the data pipeline's.
    if (!available.has(file)) throw new Error(`No flag SVG for: ${code}`);

    const to = join(ASSET_DIR, file);
    copyFileSync(join(source, file), to);
    bytes += statSync(to).size;
  }

  const entries = codes
    .map(
      (code) => `  ${code.toLowerCase()}: require('../../assets/flags/${code.toLowerCase()}.svg'),`,
    )
    .join('\n');

  writeFileSync(
    MAP_FILE,
    `/**
 * Every bundled flag, keyed by lower-case ISO 3166-1 alpha-2.
 *
 * GENERATED by \`scripts/build-flag-assets.mjs\` - do not edit. Run \`npm run flags:data\`.
 *
 * A literal \`require\` per flag because **Metro cannot do a dynamic one**: the bundler
 * resolves requires at build time, so a template-literal path resolves to nothing. This
 * file is what makes \`FLAG_ASSETS[iso2]\` possible at all.
 *
 * The values are opaque asset references - a number under Metro's native bundler, a URL
 * on web - so they are typed as whatever \`require\` returns rather than pinned to one.
 */
export const FLAG_ASSETS: Record<string, ReturnType<typeof require>> = {
${entries}
};
`,
    'utf8',
  );

  console.log(`  assets/flags  ${codes.length} files, ${(bytes / 1048576).toFixed(2)} MB`);
  console.log(`  ${MAP_FILE.slice(root.length + 1)}  ${codes.length} entries`);
  return codes;
}

/**
 * The two rasters written per flag, and why there are two.
 *
 * `DownloadMapImageTask` sets `inDensity` only when the resolved asset's scale is not 1:
 *
 *     options.inTargetDensity = metrics.densityDpi;
 *     if (scale != ImageEntry.DEFAULT_SCALE) options.inDensity = (int)(160 * scale);
 *
 * An unsuffixed PNG is filed by React Native under `drawable-mdpi`, so `decodeResource` takes
 * its `inDensity` from the bucket (160) against an `inTargetDensity` of 480 on a 3x phone and
 * UPSAMPLES every flag 3x at decode time - a blurry icon, and roughly 35 MB of bitmaps for the
 * set. With an `@3x` present, `resolveAssetSource` reports scale 3, `inDensity` matches
 * `inTargetDensity`, and the bitmap is used as-is: crisp, and about 3.9 MB. Dev agrees, because
 * Fresco resolves the same file and `bitmap.setDensity(160 * 3)` lands in the same place.
 *
 * Because MapLibre derives an image's pixel ratio from the bitmap's density, both files end up
 * being **24 style px wide** - which is what makes one `icon-size` expression correct on every
 * density. See `MAP_FLAG_INTRINSIC_DP` in `src/map/labelFit.ts`.
 *
 * The 1x file also keeps **Jest** working: its resolver does no `@Nx` suffix lookup, so a
 * 3x-only set would fail `require('../../assets/map-flags/us.png')` in every test that touches
 * the map. It costs about 100 KB.
 */
const RASTERS = [
  { width: 24, borderPx: 1, suffix: '' },
  { width: 72, borderPx: 2, suffix: '@3x' },
];

/** The web serves the 3x bytes and is told the ratio explicitly; see `WorldMap.web.tsx`. */
const WEB_RASTER_SUFFIX = '@3x';

/**
 * The hairline drawn around each flag.
 *
 * Not decoration. Japan, Finland and Nigeria are almost entirely white, and the land under a
 * map label runs from the flat green basemap through the near-white low end of the choropleth
 * ramps to their deep maroon - so an unbordered flag is a shapeless hole in three of those
 * cases. Same reasoning as the plaque behind the quiz's `FlagStage`, and the same colour as
 * `mapColors.labelHalo` in `src/map/offlineStyle.ts`, restated here because a `.mjs` build
 * script cannot import TypeScript. **MapLibre has no `icon-halo`**, so this is the one chance
 * to draw it.
 *
 * **The stroke straddles the viewBox edge rather than sitting inside it**, and that is not a
 * detail: a stroke centred on an inset rect lands on a fractional pixel boundary once the whole
 * flag is 24 px wide, and antialiasing washes the corner out to a pale grey. Drawn on the box
 * edge itself, the outer half is clipped away and the inner half is exactly `borderPx` opaque
 * pixels at both scales. Measured: `13,43,69,255` at every corner, at both sizes.
 */
const BORDER_COLOR = '#0d2b45';

/**
 * Flags are composited onto white before the border goes on.
 *
 * `flag-icons` does not guarantee an opaque canvas - Nepal is a pennant on transparency - and a
 * dark frame drawn around empty space reads as a broken image rather than as a flag.
 */
const BACKGROUND = '#ffffff';

/**
 * Prefix on every map-image name, so a feature carries `flag-br` rather than a bare `br`.
 *
 * A style's images share one namespace, so an unprefixed two-letter name is a collision waiting
 * for the first non-flag icon this app ever adds. `FLAG_IMAGE_PREFIX` in `src/map/mapLabels.ts`
 * is the same string - restated here for the same reason `isoFromFlag` is - and
 * `mapFlagImages.test.ts` asserts the generated keys and the feature properties agree.
 */
const IMAGE_PREFIX = 'flag-';

/** Every `flag-icons` 4x3 SVG uses this box; the border rect's coordinates assume it. */
const EXPECTED_VIEWBOX = '0 0 640 480';

/**
 * The source SVG with a border rect spliced in before its closing tag.
 *
 * Asserted rather than assumed, all three ways: a source that stopped using the shared viewBox
 * would get its border in the wrong place, one that did not end in a closing tag would get none
 * at all, and a splice that quietly matched nothing would ship the whole set unbordered. Every
 * one of those is invisible until somebody looks at the map.
 */
function borderedSvg(svg, file, borderPx, width) {
  const viewBox = svg.match(/viewBox="([^"]+)"/);
  if (!viewBox || viewBox[1].trim() !== EXPECTED_VIEWBOX) {
    const got = viewBox ? viewBox[1] : 'none';
    throw new Error(`${file}: expected viewBox "${EXPECTED_VIEWBOX}", got "${got}"`);
  }

  // Half of this width falls outside the viewBox and is clipped, leaving exactly `borderPx`.
  const strokeWidth = (2 * borderPx * 640) / width;
  const rect =
    '<rect x="0" y="0" width="640" height="480" fill="none"' +
    ` stroke="${BORDER_COLOR}" stroke-width="${strokeWidth}"/>`;

  const spliced = svg.replace(/<\/svg>\s*$/, `${rect}</svg>`);
  if (spliced === svg) throw new Error(`${file}: has no closing tag, so no border was drawn`);

  return spliced;
}

/** The header both generated maps share. */
function generatedHeader(extra) {
  const sizes = RASTERS.map((raster) => `${raster.width}px`).join(' and ');

  return `/**
 * Every bundled flag as a MAP ICON, keyed by the image name the symbol layer asks for.
 *
 * GENERATED by \`scripts/build-flag-assets.mjs\` - do not edit. Run \`npm run flags:data\`.
 * Rendered at ${sizes} wide, ${BORDER_COLOR} border, on ${BACKGROUND}.
 *
 * PNG rather than the SVG \`components/flagAssets.ts\` uses, because **MapLibre's icon pipeline
 * is raster-only on every platform** - see the script's header for the receipts.
 *
${extra}
 */`;
}

/**
 * Rasterises every flag the dataset references, and writes the maps the symbol layer reaches
 * them through.
 *
 * Takes the codes `buildFlagAssets` already derived rather than deriving them again, so the
 * vector set and the raster set cannot come out of one run describing different worlds.
 *
 * **One renderer, three sinks.** `public/map-flags` is written here rather than by
 * `copy-web-assets.mjs` because that file's rule - both directories must be copies of a single
 * upstream - is satisfied by this being the upstream. Rendering the same SVG twice from two
 * scripts would put the border arithmetic in two places, which is exactly the drift that rule
 * exists to prevent. `webAssets.test.ts` asserts the copies are byte-identical.
 */
export function buildMapFlagAssets(codes) {
  for (const dir of [RASTER_DIR, WEB_RASTER_DIR]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }

  let bytes = 0;
  let webBytes = 0;

  for (const code of codes) {
    const iso2 = code.toLowerCase();
    const file = `${iso2}.svg`;
    const raw = readFileSync(join(source, file), 'utf8');

    for (const { width, borderPx, suffix } of RASTERS) {
      const png = new Resvg(borderedSvg(raw, file, borderPx, width), {
        fitTo: { mode: 'width', value: width },
        background: BACKGROUND,
      })
        .render()
        .asPng();

      writeFileSync(join(RASTER_DIR, `${iso2}${suffix}.png`), png);
      bytes += png.length;

      // The web has no scale suffixes; it gets these bytes and an explicit pixelRatio.
      if (suffix === WEB_RASTER_SUFFIX) {
        writeFileSync(join(WEB_RASTER_DIR, `${iso2}.png`), png);
        webBytes += png.length;
      }
    }
  }

  const nativeNote = ` * A literal \`require\` per flag for the reason \`flagAssets.ts\` gives: Metro cannot do a
 * dynamic one. The paths are UNSUFFIXED - React Native picks the scale from what sits beside
 * them, which is the whole point of shipping two.
 *
 * Typed as \`ImageRequireSource\` - a number - rather than \`flagAssets.ts\`'s
 * \`ReturnType<typeof require>\`, because this map is handed straight to \`<Images>\`, whose
 * \`ImageEntry\` will not accept an \`unknown\`. The web sibling holds URLs and is imported by
 * its explicit path, so the two never have to agree on one type.`;

  const webNote = ` * Same-origin URLs rather than requires, so the web bundle does not emit a second copy of all
 * 249 beside the ones \`public/\` already serves. These are the 3x bytes and nothing tells the
 * browser that, so \`WorldMap.web.tsx\` passes \`pixelRatio\` explicitly.`;

  writeFileSync(
    RASTER_MAP_FILE,
    `${generatedHeader(nativeNote)}
import type { ImageRequireSource } from 'react-native';

export const MAP_FLAG_IMAGES: Record<string, ImageRequireSource> = {
${codes.map((c) => `  '${IMAGE_PREFIX}${c.toLowerCase()}': require('../../assets/map-flags/${c.toLowerCase()}.png'),`).join('\n')}
};
`,
    'utf8',
  );

  writeFileSync(
    WEB_RASTER_MAP_FILE,
    `${generatedHeader(webNote)}
export const MAP_FLAG_IMAGES: Record<string, string> = {
${codes.map((c) => `  '${IMAGE_PREFIX}${c.toLowerCase()}': '/map-flags/${c.toLowerCase()}.png',`).join('\n')}
};
`,
    'utf8',
  );

  console.log(
    `  assets/map-flags  ${codes.length * RASTERS.length} files, ${(bytes / 1024).toFixed(0)} KB`,
  );
  console.log(`  public/map-flags  ${codes.length} files, ${(webBytes / 1024).toFixed(0)} KB`);
  console.log(`  ${RASTER_MAP_FILE.slice(root.length + 1)}  ${codes.length} entries`);
  console.log(`  ${WEB_RASTER_MAP_FILE.slice(root.length + 1)}  ${codes.length} entries`);
}

// `pathToFileURL`, not string surgery: on Windows `argv[1]` is a backslashed drive path,
// and `file://` + it yields two slashes where a file URL needs three - so the guard never
// fires and running the script does nothing at all, silently.
if (import.meta.url === pathToFileURL(process.argv[1]).href) buildMapFlagAssets(buildFlagAssets());
