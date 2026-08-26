/**
 * The country's flag. Native: a real raster image, bundled in the app.
 *
 * ## Why not the emoji any more
 *
 * It used to be a plain `Text` carrying the regional indicator pair, which Android, iOS
 * and macOS all compose into a flag. That works, costs nothing and needs no assets - and
 * it fell apart the moment the quiz asked for a flag 120 dp tall, because **an emoji is a
 * glyph, not an image**:
 *
 * - it is not centred in the box the text engine lays out for it. The font's metrics
 *   leave a tall empty band above the glyph and almost none below, so centring that box
 *   parked the flag on the floor of its frame. Measured: 35 dp of gap above and 3 below.
 * - the error is proportional to the font size, so it hid at 20 dp and was glaring at 120.
 * - it can be drawn taller than its own line box, and Android then clips it.
 * - `transform: translateY` to correct any of that clips it too, because Android
 *   composites a transformed child against its pre-transform bounds.
 * - and below Android 13 emoji are 136x128 bitmap strikes, so a large flag is an upscale.
 *
 * An image has none of those properties. It occupies exactly the width and height it is
 * given, centres by arithmetic, and is vector all the way down. Every workaround the
 * emoji needed - the nudge, the generous line box, the roomy plaque - is deleted.
 *
 * ## Two tiers, picked by how big the flag is about to be drawn
 *
 * `fill` - the quiz's flag round, where the flag runs the full width of the stage - takes
 * the ~1024 px master out of `flagAssets.ts`. Every fixed size takes the 96 px thumb out
 * of `flagThumbs.ts` instead, because the search screen lists every country it matches and
 * fifty full-size decodes on a keystroke is not a thing to do for a 21 dp row.
 *
 * ## Each flag is drawn at ITS OWN shape
 *
 * The images used to be `flag-icons` SVGs, which normalise every flag to 4:3. Almost none
 * is - see `flagAspects.ts` - so a fixed size is a HEIGHT now and the width follows the
 * flag. A LIST of flags therefore has a ragged right edge; the two screens that show one
 * park this in a fixed-width slot themselves, which keeps that decision where the layout
 * is rather than inside a component that only knows about one flag.
 *
 * ## This does not weaken the offline requirement
 *
 * The images are **bundled in the APK**, not fetched: `scripts/build-flag-assets.mjs` puts
 * them in `assets/flags/` and `assets/flag-thumbs/` and generates the static `require` maps
 * that reach them, so Metro packages them like any other asset. No socket, no DNS, nothing
 * to precache.
 */
import { Image } from 'expo-image';
import { Text } from 'react-native';

import { DEFAULT_FLAG_ASPECT, FLAG_ASPECTS } from './flagAspects';
import { FLAG_ASSETS } from './flagAssets';
import { flagLetters } from './flagEmoji';
import { FLAG_SIZES, flagBox, type FlagSize } from './flagSizes';
import { FLAG_THUMBS } from './flagThumbs';
import { useTranslator } from '@/i18n/useTranslator';

/** No flag in the dataset - a real white-flag glyph, which every platform draws. */
export const NO_FLAG = '🏳️';

export function CountryFlag({
  flag,
  size = 'md',
  label,
  fill = false,
}: {
  flag: string | null;
  size?: FlagSize;
  /**
   * What assistive tech is told this flag is. Unset means unlabelled, which is what a
   * decorative flag beside a country's name should be.
   *
   * **The quiz's flag round sets it**, because there the flag is the question and the
   * default would name the country it is asking about.
   */
  label?: string;
  /**
   * Fill the parent instead of taking a size from `FLAG_SIZES`.
   *
   * For the quiz's flag round, where the flag is the question and should be as big as the
   * space allows rather than a fixed number of dp. The parent owns the shape - give it
   * `aspectRatio` - and this just occupies it. Only possible at all because the flag is
   * an image now; a glyph can only be sized by its font size.
   */
  fill?: boolean;
}) {
  const t = useTranslator();

  const { fontSize } = FLAG_SIZES[size];
  const letters = flagLetters(flag);
  const iso2 = letters?.toLowerCase();
  // The master only where the flag is drawn large; see the tier note above.
  const asset = iso2 ? (fill ? FLAG_ASSETS[iso2] : FLAG_THUMBS[iso2]) : undefined;

  /**
   * Only reachable for a record with no flag - BES is `""` upstream - since every code
   * the dataset carries has an asset, which `data-integrity.test.ts` pins. The white flag
   * is a real glyph on every platform, so a `Text` is still the right answer for it.
   */
  if (!asset) {
    return (
      <Text style={{ fontSize }} accessibilityLabel={label}>
        {NO_FLAG}
      </Text>
    );
  }

  const a11y = label ?? t('flag.a11y', { code: letters ?? '' });

  const { height, maxWidth } = FLAG_SIZES[size];
  const box = fill
    ? ({ width: '100%', height: '100%' } as const)
    : flagBox(height, FLAG_ASPECTS[iso2 ?? ''] ?? DEFAULT_FLAG_ASPECT, maxWidth);

  return (
    <Image
      testID="country-flag-image"
      source={asset}
      /*
        `contain`, not `cover`: a flag cropped to fill a box is a different flag.

        It used to be described as insurance that never showed, because every flag and every
        box were both 4:3. Now it is load-bearing in two real cases - a `fill` parent whose
        `aspectRatio` rounds a hair away from the image's, and Qatar, whose box is capped by
        `maxWidth` and is a rounding off its own 28:11.
      */
      contentFit="contain"
      style={[box, fill ? null : { borderRadius: 3 }]}
      accessibilityLabel={a11y}
    />
  );
}
