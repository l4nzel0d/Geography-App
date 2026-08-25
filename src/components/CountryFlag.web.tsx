/**
 * The country's flag, on the web.
 *
 * ## Why this is not just a `Text` like the native one
 *
 * `countryFacts.json` stores each flag as a regional indicator pair - "🇧🇷" is U+1F1E7
 * U+1F1F7, the letters B and R in a block fonts are expected to compose into a flag.
 * Android, iOS and macOS all do. **Windows ships no country flags in Segoe UI Emoji at
 * all**, so every browser there draws the two letters instead, and the UI shows a bare
 * "BR" that reads like a bug.
 *
 * No font stack or CSS fixes that, so where the platform cannot draw a flag this uses a
 * real one: `public/flags/<iso2>.svg`, placed by `scripts/copy-web-assets.mjs` from the
 * `flag-icons` devDependency.
 *
 * ## This does not weaken the offline requirement
 *
 * The flags are **same-origin static assets**, not a third-party CDN - the page still
 * talks to exactly one origin, which is the property the offline test checks for. They
 * are ordinary files under `public/`, so the service worker precaches them with
 * everything else: a one-time download, then flags with the network off. Verified with
 * the server process killed, not merely throttled.
 *
 * They are also only fetched **where and when needed** - one file per country actually
 * shown, and nothing at all on a platform whose fonts already work. A macOS or Android
 * browser downloads zero flag images.
 *
 * Android is untouched by any of this; it resolves `CountryFlag.tsx`.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { flagLetters } from './flagEmoji';
import { FLAG_SIZES, type FlagSize } from './flagSizes';
import { useFlagSupport } from './useFlagSupport';

/** No flag in the dataset - a real white-flag glyph, which every platform draws. */
export const NO_FLAG = '🏳️';

/** Where `scripts/copy-web-assets.mjs` puts them. Same origin, no CDN. */
const flagSource = (iso2: string) => `/flags/${iso2.toLowerCase()}.svg`;

export function CountryFlag({
  flag,
  size = 'md',
  label,
}: {
  flag: string | null;
  size?: FlagSize;
  /**
   * What assistive tech is told this flag is. Defaults to naming the country's code.
   *
   * **The quiz's flag round overrides it**, because there the flag is the question and
   * the default reads the answer out - `alt="Flag of BR"` is not much of a puzzle. Note
   * what this does NOT hide: the `<img src="/flags/br.svg">` is still in the DOM, so
   * view-source always spoils a web round. What it fixes is the case that matters, a
   * screen reader or find-in-page handing over the answer unasked.
   */
  label?: string;
  /**
   * Accepted and ignored, so the two components keep one signature.
   *
   * It corrects for where an emoji glyph sits inside its line box - see the native
   * sibling. Here the flag is an `<img>` with explicit dimensions on the platforms that
   * need it, and on the platforms that do not, the emoji is small enough that the same
   * proportional error is a dp or two. Nothing to correct either way.
   */
  nudge?: number;
}) {
  const supported = useFlagSupport();
  const letters = flagLetters(flag);
  const { fontSize, width, height } = FLAG_SIZES[size];

  /**
   * Reset per country, so a country whose image failed does not poison the next one.
   * Keyed on `letters` rather than cleared in the error handler, because the component
   * is reused across selections rather than remounted.
   */
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [letters]);

  // The platform can draw it, or there is no pair to look up (the NO_FLAG glyph, which
  // renders correctly everywhere). Either way, the emoji is the right answer.
  if (supported || !letters) {
    return <Text style={{ fontSize }}>{flag ?? NO_FLAG}</Text>;
  }

  /**
   * Last resort: the two letters as a deliberate badge. Reached only if the SVG itself
   * fails to load - a missing file, or a first visit while offline before the service
   * worker has precached. Drawing the letters as an intentional badge is honest about
   * what is known, and looks designed rather than broken.
   */
  if (failed) {
    return (
      <View testID="country-flag-badge" style={[styles.badge, { minWidth: width + 4 }]}>
        <Text
          style={[styles.badgeText, { fontSize: Math.round(fontSize * 0.44) }]}
          accessibilityLabel={label ?? `Country code ${letters}`}
        >
          {letters}
        </Text>
      </View>
    );
  }

  return (
    // A plain <img>, not RN's Image: this file is web-only, and an img gets native lazy
    // decoding, the browser HTTP cache and a real `onError` for the badge fallback.
    <img
      data-testid="country-flag-image"
      src={flagSource(letters)}
      alt={label ?? `Flag of ${letters}`}
      width={width}
      height={height}
      onError={() => setFailed(true)}
      style={{
        // Sized from FLAG_SIZES so the image occupies the space the emoji would have and
        // a Windows user gets the same layout as everyone else. The hairline ring keeps a
        // mostly-white flag legible against the navy surfaces.
        width,
        height,
        borderRadius: 3,
        objectFit: 'cover',
        flexShrink: 0,
        boxShadow: '0 0 0 1px rgba(143, 169, 189, 0.45)',
      }}
    />
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#8fa9bd',
    backgroundColor: 'rgba(246, 247, 242, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#f6f7f2', fontWeight: '700', letterSpacing: 1 },
});
