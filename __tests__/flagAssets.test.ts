/**
 * The flag images the UI draws, and the aspect table every layout decision is arithmetic on.
 *
 * **This suite exists because `FLAG_ASPECTS` is a claim about files it does not contain.**
 * The quiz frame's shape, a search row's width, and the map's fit threshold are all
 * `height * FLAG_ASPECTS[iso2]` - so if the table and the images ever disagree, every one of
 * those is wrong at once, and nothing about it looks like an error. A flag simply draws
 * slightly squashed, or a row is a few dp out, on a device.
 *
 * So the join is asserted here: the table's numbers are re-derived from the bytes on disk,
 * by the same rounding the build script used.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { FLAG_ASPECTS } from '@/components/flagAspects';
import { FLAG_ASSETS } from '@/components/flagAssets';
import { flagLetters } from '@/components/flagEmoji';
import { FLAG_THUMBS } from '@/components/flagThumbs';
import { allCountryFacts } from '@/data/countryFacts';

const ROOT = join(__dirname, '..');
const MASTER_DIR = join(ROOT, 'assets', 'flags');
const THUMB_DIR = join(ROOT, 'assets', 'flag-thumbs');

/** What `scripts/import-flag-masters.mjs` fits the master's long side to. */
const MASTER_LONG_EDGE = 1024;

/** What `scripts/build-flag-assets.mjs` fits the thumb's height to. */
const THUMB_HEIGHT = 96;

/**
 * WebP dimensions straight out of the RIFF container - no decoder needed, the same trick
 * `mapFlagImages.test.ts` plays on a PNG's IHDR.
 *
 * Three chunk layouts, because which one an encoder picks is its business: `VP8 ` is the
 * lossy bitstream (what sharp writes here), `VP8L` is lossless, `VP8X` is the extended
 * header an alpha or animated file carries. Reading only the first would pass today and
 * fail silently the day a quality setting changes.
 */
function webpSize(file: string) {
  const buffer = readFileSync(file);
  const fourcc = buffer.toString('ascii', 12, 16);

  if (fourcc === 'VP8 ') {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    };
  }

  if (fourcc === 'VP8L') {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }

  if (fourcc === 'VP8X') {
    return {
      width: buffer.readUIntLE(24, 3) + 1,
      height: buffer.readUIntLE(27, 3) + 1,
    };
  }

  throw new Error(`${file}: not a WebP this reader understands (${fourcc})`);
}

const codes = [
  ...new Set(
    Object.values(allCountryFacts)
      .map((facts) => flagLetters(facts.flag))
      .filter((iso2): iso2 is string => Boolean(iso2))
      .map((iso2) => iso2.toLowerCase()),
  ),
].sort();

describe('the aspect table describes the images that ship', () => {
  it('covers exactly the flags the dataset references', () => {
    // Both generated maps and the table are written from one list of codes; this is what
    // says so, and it is the assumption every lookup in the app makes without checking.
    expect(Object.keys(FLAG_ASPECTS).sort()).toEqual(codes);
    expect(Object.keys(FLAG_ASSETS).sort()).toEqual(codes);
    expect(Object.keys(FLAG_THUMBS).sort()).toEqual(codes);
  });

  it('agrees with each master file, to the digit the script rounds to', () => {
    // The assertion the whole suite is for. `import-flag-masters.mjs` writes
    // `Number((width / height).toFixed(4))`, so this recomputes it the same way rather
    // than allowing a tolerance - a tolerance would hide exactly the drift being watched.
    for (const iso2 of codes) {
      const file = join(MASTER_DIR, `${iso2}.webp`);
      expect(existsSync(file)).toBe(true);

      const { width, height } = webpSize(file);
      expect(FLAG_ASPECTS[iso2]).toBe(Number((width / height).toFixed(4)));
    }
  });

  it('fits every master to the same long edge', () => {
    for (const iso2 of codes) {
      const { width, height } = webpSize(join(MASTER_DIR, `${iso2}.webp`));
      expect(Math.max(width, height)).toBe(MASTER_LONG_EDGE);
    }
  });

  it('is not a set of 4:3 flags wearing a table', () => {
    /*
      The migration's own smoke alarm. Every flag used to be 4:3, and the failure mode of
      re-running an old code path - or of pointing the importer at the wrong directory - is
      a complete, correct-looking set in which every ratio is 1.3333. Only the 41 codes the
      raster pack does not carry should be, and they are all dependent territories.
    */
    const fourThirds = codes.filter((iso2) => FLAG_ASPECTS[iso2] === 1.3333);
    expect(fourThirds.length).toBeLessThan(60);

    expect(new Set(Object.values(FLAG_ASPECTS)).size).toBeGreaterThan(30);

    // The shapes that would be flattest wrong: a pennant, a square, and the longest flag.
    expect(FLAG_ASPECTS.np).toBeLessThan(1);
    expect(FLAG_ASPECTS.va).toBe(1);
    expect(FLAG_ASPECTS.qa).toBeGreaterThan(2.5);
  });
});

describe('the thumbs', () => {
  it('are one height, and each flag its own width', () => {
    // Height, not width, is what a row of flags shares - see `flagSizes.ts`. The width is
    // the script's own rule restated, so a change to one has to be a change to both.
    for (const iso2 of codes) {
      const file = join(THUMB_DIR, `${iso2}.webp`);
      expect(existsSync(file)).toBe(true);

      expect(webpSize(file)).toEqual({
        width: Math.round(THUMB_HEIGHT * FLAG_ASPECTS[iso2]),
        height: THUMB_HEIGHT,
      });
    }
  });
});

describe('neither directory holds anything stale', () => {
  it('ships exactly one master and one thumb per code', () => {
    const expected = codes.map((iso2) => `${iso2}.webp`);
    expect(readdirSync(MASTER_DIR).sort()).toEqual(expected);
    expect(readdirSync(THUMB_DIR).sort()).toEqual(expected);
  });
});
