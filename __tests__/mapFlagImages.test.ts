/**
 * The flag rasters the map draws, and the two generated maps that reach them.
 *
 * **This suite exists because the failure it guards is silent.** A symbol layer whose
 * `icon-image` names an image nothing registered draws nothing at all: MapLibre Native logs one
 * `FLog.e("Failed to load bitmap from: ...")` line and carries on, and maplibre-gl logs a
 * missing-image warning. No exception, no red screen - just a map with no flags on it, which
 * reads as "the picker is broken" and is impossible to attribute without a logcat.
 *
 * So the join is asserted here instead: every image name a feature carries must exist in the
 * map that registers it, on both platforms, and the files behind it must be on disk at the
 * dimensions `icon-size` was derived from.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { FLAG_ASPECTS } from '@/components/flagAspects';
import { flagLetters } from '@/components/flagEmoji';
import { allCountryFacts } from '@/data/countryFacts';
import { labelGeoJson } from '@/data/labelGeoJson';
import { MAP_FLAG_IMAGES } from '@/map/mapFlagImages';
import { MAP_FLAG_IMAGES as WEB_MAP_FLAG_IMAGES } from '@/map/mapFlagImages.web';
import { FLAG_ICON_PROPERTY, FLAG_IMAGE_PREFIX } from '@/map/mapLabels';

const ROOT = join(__dirname, '..');
const RASTER_DIR = join(ROOT, 'assets', 'map-flags');
const WEB_RASTER_DIR = join(ROOT, 'public', 'map-flags');

/**
 * The scales `scripts/build-flag-assets.mjs` writes, and the HEIGHT each must come out at.
 *
 * The width used to be here too, a flat 24 and 72, because every flag was 4:3. It is now a
 * property of the flag - see `expectedWidth` - and height is what all 249 share.
 */
const RASTERS = [
  { suffix: '', height: 18, scale: 1 },
  { suffix: '@3x', height: 54, scale: 3 },
];

/**
 * The script's own width rule, restated so the two have to be changed together.
 *
 * **The 3x width is three times the 1x width, not an independent `round(54 * aspect)`.**
 * Rounding each scale separately disagrees by a pixel for some ratios, and MapLibre derives
 * an icon's style width as `pixels / pixelRatio` - so the same flag would be 34.00 dp wide
 * on a 1x screen and 34.33 dp on a 3x one, from one `icon-size`. Nothing in Jest opens these
 * files; this is the only place that would ever notice.
 */
const expectedWidth = (iso2: string, scale: number) =>
  scale * Math.round(RASTERS[0].height * FLAG_ASPECTS[iso2]);

/** PNG dimensions straight out of the IHDR chunk - no decoder needed. */
function pngSize(file: string) {
  const buffer = readFileSync(file);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

const codes = [
  ...new Set(
    Object.values(allCountryFacts)
      .map((facts) => flagLetters(facts.flag))
      .filter((iso2): iso2 is string => Boolean(iso2))
      .map((iso2) => iso2.toLowerCase()),
  ),
].sort();

const namesInUse = [
  ...new Set(
    labelGeoJson.features
      .map((feature) => (feature.properties ?? {})[FLAG_ICON_PROPERTY] as string | undefined)
      .filter((name): name is string => Boolean(name)),
  ),
].sort();

describe('the registered images cover what the layer asks for', () => {
  it('registers an image for every name a feature carries', () => {
    // The assertion that matters. Everything else here is a way of keeping this one true.
    const missing = namesInUse.filter((name) => !(name in MAP_FLAG_IMAGES));
    expect(missing).toEqual([]);
  });

  it('derives the same names the picker builds', () => {
    expect(Object.keys(MAP_FLAG_IMAGES).sort()).toEqual(
      codes.map((iso2) => `${FLAG_IMAGE_PREFIX}${iso2}`),
    );
  });

  it('agrees with the web map, key for key', () => {
    // The two are generated in one pass from one list, so a mismatch means someone edited a
    // generated file by hand or ran only half the pipeline.
    expect(Object.keys(WEB_MAP_FLAG_IMAGES).sort()).toEqual(Object.keys(MAP_FLAG_IMAGES).sort());
  });

  it('points the web at same-origin URLs', () => {
    // A remote URL here would break the offline requirement without any test noticing, since
    // the app would still work perfectly on a machine with a network.
    for (const url of Object.values(WEB_MAP_FLAG_IMAGES)) {
      expect(url).toMatch(/^\/map-flags\/[a-z]{2}\.png$/);
    }
  });
});

describe('the rasters on disk', () => {
  it('ships both scales for every flag, at the size icon-size assumes', () => {
    // `icon-size` is a fraction of `MAP_FLAG_INTRINSIC_DP`, and the 18 in that is this file's
    // 18. Re-render at another height without changing the constant and every flag is drawn
    // at the wrong size, on a device, with nothing else to say so.
    for (const iso2 of codes) {
      for (const { suffix, height, scale } of RASTERS) {
        const file = join(RASTER_DIR, `${iso2}${suffix}.png`);
        expect(existsSync(file)).toBe(true);
        expect(pngSize(file)).toEqual({ width: expectedWidth(iso2, scale), height });
      }
    }
  });

  it('keeps the two scales in exact proportion', () => {
    // Stated separately from the sizes above, because it is the property that survives a
    // change to either of them: whatever the widths are, the 3x must be exactly 3x.
    for (const iso2 of codes) {
      expect(pngSize(join(RASTER_DIR, `${iso2}@3x.png`)).width).toBe(
        3 * pngSize(join(RASTER_DIR, `${iso2}.png`)).width,
      );
    }
  });

  it('leaves the 4:3 flags exactly where they were before the raster set', () => {
    /*
      The 41 codes the raster pack does not carry still come from `flag-icons`, still at 4:3,
      and must still be 24x18 and 72x54 - the numbers this file used to hardcode for all 249.
      If they moved, the migration touched labels it had no business touching.
    */
    const fourThirds = codes.filter((iso2) => FLAG_ASPECTS[iso2] === 1.3333);
    expect(fourThirds.length).toBeGreaterThan(20);

    for (const iso2 of fourThirds) {
      expect(pngSize(join(RASTER_DIR, `${iso2}.png`))).toEqual({ width: 24, height: 18 });
      expect(pngSize(join(RASTER_DIR, `${iso2}@3x.png`))).toEqual({ width: 72, height: 54 });
    }
  });

  it('serves the web the very same bytes as the 3x native raster', () => {
    // One renderer, three sinks - see the script's header. Byte identity is the proof, and it
    // is the same check `webAssets.test.ts` applies to the MapLibre worker copies.
    for (const iso2 of codes) {
      const native = readFileSync(join(RASTER_DIR, `${iso2}@3x.png`));
      const web = readFileSync(join(WEB_RASTER_DIR, `${iso2}.png`));
      expect(web.equals(native)).toBe(true);
    }
  });

  it('leaves nothing stale behind in either directory', () => {
    const expected = codes.flatMap((iso2) => RASTERS.map((r) => `${iso2}${r.suffix}.png`)).sort();
    expect(readdirSync(RASTER_DIR).sort()).toEqual(expected);
    expect(readdirSync(WEB_RASTER_DIR).sort()).toEqual(codes.map((iso2) => `${iso2}.png`));
  });

  it('gives every flag image a unique Android drawable name', () => {
    /*
      React Native flattens `assets/map-flags/br.png` into a single `drawable-*` resource,
      and the rule is `getAndroidResourceIdentifier` in `@react-native/assets-registry`:
      lower-case, `/` -> `_`, everything outside [a-z0-9_] DELETED, and a leading `assets_`
      stripped. Two details make this worth checking rather than assuming - the hyphen is
      deleted rather than replaced, so `flag-thumbs` and `flagthumbs` would be the same
      resource, and **the extension is not part of the name at all**, so `flags/br.webp` and
      a hypothetical `flags/br.png` would collide even though the files differ.

      Three directories now feed that one flat namespace, and a collision resolves to
      whichever file was copied last, in release builds only, and silently.
    */
    const drawableName = (dir: string, file: string) =>
      `${dir}/${file}`
        // `br.png` and `br@3x.png` are ONE resource in two density buckets, so they are
        // meant to flatten to the same name. Dropping the suffix is what lets the rest of
        // this be a uniqueness check rather than a guaranteed failure.
        .replace(/@\d+x(?=\.)/i, '')
        .replace(/\.[a-z0-9]+$/i, '')
        .toLowerCase()
        .replace(/\//g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .replace(/^assets_/, '');

    const names = [
      ...readdirSync(join(ROOT, 'assets', 'flags')).map((f) => drawableName('assets/flags', f)),
      ...readdirSync(join(ROOT, 'assets', 'flag-thumbs')).map((f) =>
        drawableName('assets/flag-thumbs', f),
      ),
      ...readdirSync(RASTER_DIR).map((f) => drawableName('assets/map-flags', f)),
    ];

    // The three directory prefixes survive the hyphen deletion as distinct strings, which is
    // the only reason the set below can be unique at all.
    expect(new Set([...names].map((n) => n.replace(/_[a-z]{2}$/, ''))).size).toBe(3);

    // One name per code per directory - the @3x files having collapsed onto their 1x twins.
    expect(new Set(names).size).toBe(codes.length * 3);
  });
});
