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

import { flagLetters } from '@/components/flagEmoji';
import { allCountryFacts } from '@/data/countryFacts';
import { labelGeoJson } from '@/data/labelGeoJson';
import { MAP_FLAG_IMAGES } from '@/map/mapFlagImages';
import { MAP_FLAG_IMAGES as WEB_MAP_FLAG_IMAGES } from '@/map/mapFlagImages.web';
import { FLAG_ICON_PROPERTY, FLAG_IMAGE_PREFIX } from '@/map/mapLabels';

const ROOT = join(__dirname, '..');
const RASTER_DIR = join(ROOT, 'assets', 'map-flags');
const WEB_RASTER_DIR = join(ROOT, 'public', 'map-flags');

/** The scales `scripts/build-flag-assets.mjs` writes, and the sizes they must come out at. */
const RASTERS = [
  { suffix: '', width: 24, height: 18 },
  { suffix: '@3x', width: 72, height: 54 },
];

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
  it('ships both scales for every flag, at the sizes icon-size assumes', () => {
    // `icon-size` is `MAP_FLAG_WIDTH_DP / MAP_FLAG_INTRINSIC_DP`, and the 24 in that is this
    // file's 24. Re-render at another width without changing the constant and every flag is
    // drawn at the wrong size, on a device, with nothing else to say so.
    for (const iso2 of codes) {
      for (const { suffix, width, height } of RASTERS) {
        const file = join(RASTER_DIR, `${iso2}${suffix}.png`);
        expect(existsSync(file)).toBe(true);
        expect(pngSize(file)).toEqual({ width, height });
      }
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

  it('gives every raster a unique Android drawable name', () => {
    /*
      React Native flattens `assets/map-flags/br.png` into a single `drawable-*` resource named
      `assets_mapflags_br` - lower-cased, separators turned to underscores, everything outside
      [a-z0-9_] deleted. `assets/flags/` and `assets/map-flags/` both feed that one flat
      namespace, so a collision would resolve to whichever file was copied last, in release
      builds only, and silently. The hyphen being DELETED rather than replaced is what makes
      this worth checking rather than assuming.
    */
    const drawableName = (dir: string, file: string) =>
      `${dir}/${file}`.toLowerCase().replace(/[/.]/g, '_').replace(/[^a-z0-9_]/g, '');

    const names = [
      ...readdirSync(join(ROOT, 'assets', 'flags')).map((f) => drawableName('assets/flags', f)),
      ...readdirSync(RASTER_DIR).map((f) => drawableName('assets/map-flags', f)),
    ];

    expect(new Set(names).size).toBe(names.length);
  });
});
