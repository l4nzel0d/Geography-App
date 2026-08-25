/**
 * The country's flag for the info sheet header, on the web.
 *
 * ## Why this is not just a `Text` like the native one
 *
 * `countryFacts.json` stores each flag as a regional indicator pair - "🇧🇷" is U+1F1E7
 * U+1F1F7, the letters B and R in a block fonts are expected to compose into a flag.
 * Android, iOS and macOS all do. **Windows ships no country flags in Segoe UI Emoji at
 * all**, so every browser there draws the two letters instead, and the header shows a
 * bare "BR" that reads like a bug.
 *
 * No font stack or CSS fixes that, so where the platform cannot draw a flag this fetches
 * a real one: `public/flags/<iso2>.svg`, placed by `scripts/copy-web-assets.mjs` from the
 * `flag-icons` devDependency.
 *
 * ## This does not weaken the offline requirement
 *
 * The flags are **same-origin static assets**, not a third-party CDN - the page still
 * talks to exactly one origin, which is the property the offline acceptance test checks
 * for. They are ordinary files under `public/`, so the service worker precaches them with
 * everything else and they are a one-time download: after the first visit the app draws
 * flags with the network off, like the rest of it.
 *
 * They are also only fetched **where they are needed and when they are needed** - one
 * file per country actually opened, and nothing at all on a platform whose fonts already
 * work. A macOS or Android browser downloads zero flag images.
 *
 * Android is untouched by any of this; it resolves `CountryFlag.tsx`.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { flagLetters } from './flagEmoji';
import { useFlagSupport } from './useFlagSupport';

/** No flag in the dataset - a real white-flag glyph, which every platform draws. */
export const NO_FLAG = '🏳️';

/** Where `scripts/copy-web-assets.mjs` puts them. Same origin, no CDN. */
const flagSource = (iso2: string) => `/flags/${iso2.toLowerCase()}.svg`;

export function CountryFlag({ flag }: { flag: string | null }) {
  const supported = useFlagSupport();
  const letters = flagLetters(flag);

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
    return <Text style={styles.flag}>{flag ?? NO_FLAG}</Text>;
  }

  /**
   * Last resort: the two letters as a deliberate badge. Reached only if the SVG itself
   * fails to load - a missing file, or a first visit while offline before the service
   * worker has precached. Drawing the letters as an intentional badge is honest about
   * what is known, and looks designed rather than broken.
   */
  if (failed) {
    return (
      <View testID="country-flag-badge" style={styles.badge}>
        <Text style={styles.badgeText} accessibilityLabel={`Country code ${letters}`}>
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
      alt={`Flag of ${letters}`}
      width={40}
      height={30}
      onError={() => setFailed(true)}
      style={{
        // Matches the 34px emoji's optical size so the header does not reflow between
        // platforms, and the radius/border keep a white flag legible on the navy card.
        width: 40,
        height: 30,
        borderRadius: 3,
        objectFit: 'cover',
        boxShadow: '0 0 0 1px rgba(143, 169, 189, 0.45)',
      }}
    />
  );
}

const styles = StyleSheet.create({
  flag: { fontSize: 34 },
  badge: {
    minWidth: 44,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#8fa9bd',
    backgroundColor: 'rgba(246, 247, 242, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#f6f7f2', fontSize: 15, fontWeight: '700', letterSpacing: 1 },
});
