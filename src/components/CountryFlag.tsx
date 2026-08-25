/**
 * The country's flag. Native: the real SVG, bundled in the app.
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
 * ## This does not weaken the offline requirement
 *
 * The SVGs are **bundled in the APK**, not fetched: `scripts/build-flag-assets.mjs` puts
 * them in `assets/flags/` and generates the static `require` map that reaches them, so
 * Metro packages them like any other asset. No socket, no DNS, nothing to precache.
 *
 * Rendering them needs no new native module either. `expo-image` is already a dependency
 * and ships its own Android SVG support - it vendors AndroidSVG and registers a Glide
 * decoder (`InputStream -> SVG -> Drawable`), so this needed no `react-native-svg`, no
 * `expo prebuild` and no native rebuild.
 */
import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { FLAG_ASSETS } from './flagAssets';
import { flagLetters } from './flagEmoji';
import { FLAG_SIZES, type FlagSize } from './flagSizes';

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
  const { fontSize, width, height } = FLAG_SIZES[size];
  const box = fill ? ({ width: '100%', height: '100%' } as const) : { width, height };
  const letters = flagLetters(flag);
  const asset = letters ? FLAG_ASSETS[letters.toLowerCase()] : undefined;

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

  return (
    <Image
      testID="country-flag-image"
      source={asset}
      // `contain`, not `cover`: a flag cropped to fill a box is a different flag. Every
      // `flag-icons` SVG is 4:3, so given a 4:3 parent this fills it exactly and the
      // choice never shows - it is insurance against a parent that is not.
      contentFit="contain"
      style={[box, fill ? null : { borderRadius: 3 }]}
      accessibilityLabel={label ?? `Flag of ${letters}`}
    />
  );
}
