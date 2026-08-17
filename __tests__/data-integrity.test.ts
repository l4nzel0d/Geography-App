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
const FACTLESS_ALLOWLIST = new Set(['CYN', 'SOL', 'KAS']);

/** Territories with no World Bank population series - mirrors the build script. */
const POPULATIONLESS_ALLOWLIST = new Set([
  'TWN', 'ESH', 'FLK', 'ATF', 'ATA',
  'VAT', 'SGS', 'IOT', 'SHN', 'PCN', 'AIA', 'MSR', 'JEY', 'GGY', 'NIU',
  'COK', 'SPM', 'WLF', 'BLM', 'ALA', 'HMD', 'NFK',
]);

const features = geo.features as unknown as {
  properties: CountryFeatureProperties;
  geometry: { type: string; coordinates: unknown[] };
}[];

const isoCodes = features.map((f) => f.properties.iso3);

describe('country geometry', () => {
  it('ships a plausible number of outlines', () => {
    // 1:50m Natural Earth has 242 features, which merge down to 240 countries.
    // A large swing means the upstream dataset changed shape and needs a look.
    expect(features.length).toBeGreaterThan(220);
    expect(features.length).toBeLessThan(260);
  });

  it('has an outline for the microstates 1:110m omitted', () => {
    // The reason for moving to 1:50m: at 110m none of these had a polygon, so they
    // could not be tapped or highlighted at all. Dropping back would silently undo it.
    for (const code of ['LIE', 'DMA', 'MCO', 'SMR', 'AND', 'VAT', 'MLT', 'SGP']) {
      expect(isoCodes).toContain(code);
    }
  });

  it('rounds coordinates to the documented precision', () => {
    // roundGeometry once took the coordinate array but was handed the geometry
    // object, so it rounded nothing and the file shipped at full 6dp. Anything
    // finer than 3dp here means that regressed.
    const tooPrecise: number[] = [];
    const walk = (node: unknown): void => {
      if (typeof node === 'number') {
        if (Number(node.toFixed(3)) !== node) tooPrecise.push(node);
      } else if (Array.isArray(node)) {
        node.forEach(walk);
      }
    };
    features.forEach((f) => walk(f.geometry.coordinates));
    expect(tooPrecise).toEqual([]);
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

  it('keeps facts for territories that have no outline of their own', () => {
    // Expected and harmless. At 1:50m these are not missing so much as absorbed:
    // Natural Earth draws the French overseas departments as part of FRA, Svalbard
    // as part of NOR, and Christmas / Cocos inside Australia's territories.
    const geometryCodes = new Set(isoCodes);
    const factsOnly = Object.keys(allCountryFacts).filter((c) => !geometryCodes.has(c));
    expect(factsOnly.length).toBeGreaterThan(0);
    expect(factsOnly).toContain('GUF'); // French Guiana - drawn as part of France
  });

  it('folds a country split across several source features into one', () => {
    // Australia ships as mainland + Indian Ocean Territories + Ashmore and Cartier,
    // all resolving to AUS. Left unmerged they are duplicate features, and the
    // highlight layer filters on iso3 so only one of them would ever light up.
    const australia = features.filter((f) => f.properties.iso3 === 'AUS');
    expect(australia).toHaveLength(1);
    expect(australia[0].geometry.type).toBe('MultiPolygon');
    expect(australia[0].geometry.coordinates.length).toBeGreaterThan(2);
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

  it('records every population as a positive, finite number', () => {
    // Guards the choropleth: its fill expression takes log10 of this value, and a 0
    // or a negative would evaluate to -Infinity/NaN and break the paint for the whole
    // layer - inside the native renderer, where no unit test can see it. Null is fine
    // and expected; `worldGeoJson.ts` drops those features out of the ramp entirely.
    const bad = Object.entries(allCountryFacts)
      .filter(([, facts]) => facts.population !== null)
      .filter(([, facts]) => !Number.isFinite(facts.population) || facts.population! <= 0)
      .map(([iso3, facts]) => `${iso3}=${facts.population}`);

    expect(bad).toEqual([]);
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
