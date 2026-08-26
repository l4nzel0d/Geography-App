/**
 * The country's flag, on the web.
 *
 * ## The image is now unconditional, and the native sibling agrees
 *
 * This used to draw the emoji wherever the platform could compose one and reach for an
 * image only on Windows. It no longer does: **the flag is always the image**, because the
 * native side stopped using emoji too and the two should not disagree about what a flag
 * looks like. `useFlagSupport` and its canvas measurement went with that decision.
 *
 * The reasoning below is what made the image files exist in the first place, and still
 * stands.
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
 * real one out of `public/`.
 *
 * ## Two tiers, and each flag at its own shape
 *
 * Exactly as the native sibling: `fill` takes the ~1024 px master from `/flags`, every
 * fixed size takes the 96 px thumb from `/flag-thumbs`, and a fixed size is a HEIGHT whose
 * width comes from `flagAspects.ts` rather than from an assumed 4:3. The computed size goes
 * on the `<img>` as real `width`/`height` ATTRIBUTES as well as in the style, so the row
 * does not reflow between layout and decode.
 *
 * ## This does not weaken the offline requirement
 *
 * The flags are **same-origin static assets**, not a third-party CDN - the page still
 * talks to exactly one origin, which is the property the offline test checks for. They
 * are ordinary files under `public/`, so the service worker precaches them with
 * everything else: a one-time download, then flags with the network off. Verified with
 * the server process killed, not merely throttled.
 *
 * Android is untouched by any of this; it resolves `CountryFlag.tsx`.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DEFAULT_FLAG_ASPECT, FLAG_ASPECTS } from './flagAspects';
import { flagLetters } from './flagEmoji';
import { FLAG_SIZES, flagBox, type FlagSize } from './flagSizes';
import { useTranslator } from '@/i18n/useTranslator';
import { withBaseUrl } from '@/i18n/baseUrl';

/** No flag in the dataset - a real white-flag glyph, which every platform draws. */
export const NO_FLAG = '🏳️';

/**
 * Where `scripts/build-flag-assets.mjs` puts them. Same origin, no CDN.
 *
 * Base-URL aware: the Russian build is served from `/ru`, and a flag fetched from the root
 * would sit outside that build's service-worker scope and vanish offline.
 */
const flagSource = (iso2: string, fill: boolean) =>
  withBaseUrl(`/${fill ? 'flags' : 'flag-thumbs'}/${iso2}.webp`);

export function CountryFlag({
  flag,
  size = 'md',
  label,
  fill = false,
}: {
  flag: string | null;
  size?: FlagSize;
  /**
   * What assistive tech is told this flag is. Defaults to naming the country's code.
   *
   * **The quiz's flag round overrides it**, because there the flag is the question and
   * the default reads the answer out - `alt="Flag of BR"` is not much of a puzzle. Note
   * what this does NOT hide: the `<img src="/flags/br.webp">` is still in the DOM, so
   * view-source always spoils a web round. What it fixes is the case that matters, a
   * screen reader or find-in-page handing over the answer unasked.
   */
  label?: string;
  /**
   * Fill the parent instead of taking a size from `FLAG_SIZES`. See the native sibling.
   */
  fill?: boolean;
}) {
  const t = useTranslator();

  const letters = flagLetters(flag);
  const iso2 = letters?.toLowerCase();
  const { fontSize, height, maxWidth } = FLAG_SIZES[size];

  /**
   * Reset per country, so a country whose image failed does not poison the next one.
   * Keyed on `letters` rather than cleared in the error handler, because the component
   * is reused across selections rather than remounted.
   */
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [letters]);

  const box = flagBox(height, FLAG_ASPECTS[iso2 ?? ''] ?? DEFAULT_FLAG_ASPECT, maxWidth);

  /**
   * No pair to look up - a record with no flag, which is BES alone. The white-flag glyph
   * renders correctly everywhere, so a `Text` is still the right answer for it.
   */
  if (!letters || !iso2) {
    return <Text style={{ fontSize }}>{flag ?? NO_FLAG}</Text>;
  }

  /**
   * Last resort: the two letters as a deliberate badge. Reached only if the image itself
   * fails to load - a missing file, or a first visit while offline before the service
   * worker has precached. Drawing the letters as an intentional badge is honest about
   * what is known, and looks designed rather than broken.
   */
  if (failed) {
    return (
      <View testID="country-flag-badge" style={[styles.badge, { minWidth: box.width + 4 }]}>
        <Text
          style={[styles.badgeText, { fontSize: Math.round(fontSize * 0.44) }]}
          accessibilityLabel={label ?? t('flag.codeA11y', { code: letters })}
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
      src={flagSource(iso2, fill)}
      alt={label ?? t('flag.a11y', { code: letters })}
      {...(fill ? null : { width: box.width, height: box.height })}
      onError={() => setFailed(true)}
      style={
        fill
          ? // The parent owns the shape; this just occupies it. `contain` rather than
            // `cover` for the same reason as the native sibling - a cropped flag is a
            // different flag - and no ring, because at that size the parent frames it.
            { width: '100%', height: '100%', objectFit: 'contain', display: 'block' }
          : {
              /*
                Sized from the flag's OWN ratio, so `contain` has almost nothing left to do -
                but it is `contain` and not `cover` all the same. `cover` was harmless only
                while every image was 4:3 in a 4:3 box; with real ratios it would crop the
                hoist off Qatar, whose box is capped by `maxWidth`.
              */
              width: box.width,
              height: box.height,
              borderRadius: 3,
              objectFit: 'contain',
              flexShrink: 0,
              display: 'block',
              boxShadow: '0 0 0 1px rgba(143, 169, 189, 0.45)',
            }
      }
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
