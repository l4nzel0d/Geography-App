/**
 * Guards the invariants that `scripts/build-country-data.mjs` enforces at build
 * time, so they cannot silently rot in the committed artifacts.
 *
 * This is the highest-value suite in the project: a broken ISO-3 join is invisible
 * in code review but immediately visible to a user tapping France.
 */
import geo from '@/data/countries.geo.json';
import { allCountryFacts, getCountryFacts } from '@/data/countryFacts';
import type { CountryFeatureProperties } from '@/data/types';

/** Territories we knowingly ship without facts - mirrors the build script. */
const FACTLESS_ALLOWLIST = new Set(['CYN', 'SOL']);

/** Territories with no World Bank population series - mirrors the build script. */
const POPULATIONLESS_ALLOWLIST = new Set(['TWN', 'ESH', 'FLK', 'ATF', 'ATA']);

const features = geo.features as unknown as {
  properties: CountryFeatureProperties;
  geometry: { type: string; coordinates: unknown[] };
}[];

const isoCodes = features.map((f) => f.properties.iso3);

describe('country geometry', () => {
  it('ships a plausible number of outlines', () => {
    // 1:110m Natural Earth has ~177 sovereign-state features. A large swing means
    // the upstream dataset changed shape and needs a look.
    expect(features.length).toBeGreaterThan(160);
    expect(features.length).toBeLessThan(200);
  });

  it('has a valid ISO-3 code on every feature', () => {
    const bad = isoCodes.filter((code) => !/^[A-Z]{3}$/.test(code ?? ''));
    expect(bad).toEqual([]);
  });

  it('has no unresolved Natural Earth "-99" placeholders', () => {
    expect(isoCodes).not.toContain('-99');
  });

  it('has no duplicate countries', () => {
    const dupes = isoCodes.filter((code, i) => isoCodes.indexOf(code) !== i);
    expect(dupes).toEqual([]);
  });

  it('contains only non-empty polygon geometry', () => {
    for (const f of features) {
      expect(['Polygon', 'MultiPolygon']).toContain(f.geometry.type);
      expect(f.geometry.coordinates.length).toBeGreaterThan(0);
    }
  });

  it('resolves the countries Natural Earth marks as "-99"', () => {
    // France and Norway are the canonical regression cases: both have ISO_A3 = "-99"
    // upstream, so a broken patch map makes them untappable blanks.
    for (const code of ['FRA', 'NOR', 'UNK']) {
      expect(isoCodes).toContain(code);
    }
  });
});

describe('geometry <-> facts join', () => {
  it('resolves facts for every mapped country', () => {
    const missing = isoCodes.filter(
      (code) => !getCountryFacts(code) && !FACTLESS_ALLOWLIST.has(code),
    );
    expect(missing).toEqual([]);
  });

  it('has a population for every mapped country outside the allowlist', () => {
    const missing = isoCodes.filter((code) => {
      const facts = getCountryFacts(code);
      return facts && facts.population == null && !POPULATIONLESS_ALLOWLIST.has(code);
    });
    expect(missing).toEqual([]);
  });

  it('only tolerates factless countries that are on the allowlist', () => {
    // Catches the reverse failure: an allowlist entry that is no longer needed,
    // which would otherwise hide a genuine regression.
    for (const code of FACTLESS_ALLOWLIST) {
      expect(getCountryFacts(code)).toBeNull();
    }
  });

  it('keeps facts for microstates that have no 110m outline', () => {
    // Expected and harmless - they simply are not tappable at this resolution.
    const geometryCodes = new Set(isoCodes);
    const factsOnly = Object.keys(allCountryFacts).filter((c) => !geometryCodes.has(c));
    expect(factsOnly.length).toBeGreaterThan(0);
    expect(factsOnly).toContain('MCO'); // Monaco
  });
});

describe('facts content', () => {
  it('has the three headline facts for a representative country', () => {
    const brazil = getCountryFacts('BRA');
    expect(brazil).not.toBeNull();
    expect(brazil!.name).toBe('Brazil');
    expect(brazil!.population).toBeGreaterThan(100_000_000);
    expect(brazil!.currencies).toEqual([
      expect.objectContaining({ code: 'BRL', symbol: 'R$' }),
    ]);
    expect(brazil!.languages).toContain('Portuguese');
  });

  it('handles multi-currency and multi-language countries', () => {
    const swiss = getCountryFacts('CHE');
    expect(swiss!.languages.length).toBeGreaterThan(1);
    expect(swiss!.currencies[0].code).toBe('CHF');
  });

  it('returns null for an unknown code rather than throwing', () => {
    expect(getCountryFacts('ZZZ')).toBeNull();
    expect(getCountryFacts(null)).toBeNull();
    expect(getCountryFacts(undefined)).toBeNull();
  });
});
