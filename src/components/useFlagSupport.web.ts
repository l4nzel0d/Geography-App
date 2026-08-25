/**
 * Whether this browser draws country flag emoji, measured rather than guessed.
 *
 * Windows is the case that matters: Segoe UI Emoji ships no country flags, so a regional
 * indicator pair renders as two letter glyphs instead of one flag. macOS, iOS, Android
 * and most Linux desktops render it properly. User-agent sniffing would be the wrong
 * tool - the real question is what the installed fonts can do, so measure that.
 *
 * **The measurement is a width comparison.** A supported pair composes into ONE glyph,
 * roughly as wide as a single character. An unsupported pair stays TWO glyphs, so it
 * comes out about twice as wide. The 1.5x threshold sits comfortably between the two and
 * needs no pixel sampling.
 *
 * The hook returns `true` on the first render and corrects itself in an effect, which is
 * the same hydration-safe shape `use-color-scheme.web.ts` already uses in this project:
 * `src/app/+html` is rendered in Node at export time, where there is no canvas and no
 * font at all, so a first render that disagreed with the server's markup would be a
 * hydration mismatch. Assuming flags work and downgrading is also the right way round -
 * it is the majority case, and the correction lands before paint.
 */
import { useEffect, useState } from 'react';

/** Brazil, purely as a well-formed pair to measure. */
const FLAG_PAIR = '\u{1F1E7}\u{1F1F7}';
const SINGLE_INDICATOR = '\u{1F1E7}';

/** Above this ratio the pair clearly did not compose into a single glyph. */
const COMPOSED_MAX_RATIO = 1.5;

/** Measured once per document; the answer cannot change without a font install. */
let cached: boolean | undefined;

function measureFlagSupport(): boolean {
  if (cached !== undefined) return cached;

  try {
    const context = document.createElement('canvas').getContext('2d');
    if (!context) return (cached = true);

    context.font = '32px sans-serif';
    const single = context.measureText(SINGLE_INDICATOR).width;
    if (!single) return (cached = true);

    cached = context.measureText(FLAG_PAIR).width / single < COMPOSED_MAX_RATIO;
  } catch {
    // Canvas unavailable or blocked. Assume flags work rather than badging everyone.
    cached = true;
  }

  return cached;
}

export function useFlagSupport(): boolean {
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(measureFlagSupport());
  }, []);

  return supported;
}
