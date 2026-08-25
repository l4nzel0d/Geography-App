/**
 * Country flags are emoji, and one major platform refuses to draw them.
 *
 * `countryFacts.json` stores each flag as a **regional indicator pair** - "🇧🇷" is not a
 * flag character at all, it is U+1F1E7 U+1F1F7, the letters B and R in a special block
 * that fonts are expected to compose into a flag. Android, iOS and macOS all do.
 * **Windows does not**: Segoe UI Emoji deliberately ships no country flags, so every
 * browser on Windows falls back to drawing the two letters, and the info sheet shows a
 * bare "BR" that reads like a bug.
 *
 * There is no way to fix that with CSS, and fetching flag images would break the offline
 * requirement. So the app detects the gap and draws a deliberate badge instead - see
 * the flag's own SVG. This module is the pure half: turning the pair back into its letters.
 */

/** U+1F1E6 REGIONAL INDICATOR SYMBOL LETTER A - the base of the 26-codepoint block. */
const REGIONAL_INDICATOR_A = 0x1f1e6;
const REGIONAL_INDICATOR_Z = 0x1f1ff;
const LATIN_A = 'A'.charCodeAt(0);

/**
 * The ISO 3166-1 alpha-2 code a flag emoji encodes, or `null` if it is not one.
 *
 * `null` for the "🏳️" fallback the info sheet uses for a country with no flag, which is a
 * real white-flag glyph plus a variation selector rather than an indicator pair - so the
 * caller keeps rendering it as the emoji it is, and there is no badge to draw.
 */
export function flagLetters(flag: string | null | undefined): string | null {
  if (!flag) return null;

  // Spread rather than index: these are astral codepoints, two UTF-16 units each.
  const codePoints = [...flag].map((char) => char.codePointAt(0) ?? 0);
  if (codePoints.length !== 2) return null;

  const isIndicator = (cp: number) => cp >= REGIONAL_INDICATOR_A && cp <= REGIONAL_INDICATOR_Z;
  if (!codePoints.every(isIndicator)) return null;

  return codePoints
    .map((cp) => String.fromCharCode(cp - REGIONAL_INDICATOR_A + LATIN_A))
    .join('');
}
