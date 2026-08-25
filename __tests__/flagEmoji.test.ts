import { flagLetters } from '@/components/flagEmoji';
import factsJson from '@/data/countryFacts.json';

describe('flagLetters', () => {
  it('reads the ISO 3166-1 alpha-2 code out of a regional indicator pair', () => {
    expect(flagLetters('\u{1F1E7}\u{1F1F7}')).toBe('BR');
    expect(flagLetters('\u{1F1FA}\u{1F1F8}')).toBe('US');
    expect(flagLetters('\u{1F1E6}\u{1F1FF}')).toBe('AZ');
  });

  it('handles both ends of the indicator block', () => {
    // A and Z, the first and last codepoints the block defines.
    expect(flagLetters('\u{1F1E6}\u{1F1E6}')).toBe('AA');
    expect(flagLetters('\u{1F1FF}\u{1F1FF}')).toBe('ZZ');
  });

  it('returns null for the no-flag fallback the info sheet renders', () => {
    // A real white-flag glyph plus a variation selector, not an indicator pair - it draws
    // correctly everywhere, so there is no badge to substitute.
    expect(flagLetters('\u{1F3F3}\u{FE0F}')).toBeNull();
  });

  it('returns null for anything that is not a pair of indicators', () => {
    expect(flagLetters(null)).toBeNull();
    expect(flagLetters(undefined)).toBeNull();
    expect(flagLetters('')).toBeNull();
    expect(flagLetters('BR')).toBeNull();
    expect(flagLetters('\u{1F1E7}')).toBeNull();
    expect(flagLetters('\u{1F1E7}\u{1F1F7}\u{1F1E7}')).toBeNull();
    expect(flagLetters('\u{1F600}\u{1F600}')).toBeNull();
  });

  it('decodes every flag in the shipped dataset', () => {
    const facts = factsJson as Record<string, { flag: string | null }>;
    const flags = Object.values(facts)
      .map((f) => f.flag)
      .filter((f): f is string => Boolean(f));

    expect(flags.length).toBeGreaterThan(200);
    // Two uppercase letters for every one - a null here means a record the badge
    // fallback would silently render as a blank box on Windows.
    for (const flag of flags) {
      expect(flagLetters(flag)).toMatch(/^[A-Z]{2}$/);
    }
  });
});
