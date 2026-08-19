/**
 * Guards the invariants that `scripts/build-country-data.mjs` enforces at build
 * time, so they cannot silently rot in the committed artifacts.
 *
 * This is the highest-value suite in the project: a broken ISO-3 join is invisible
 * in code review but immediately visible to a user tapping France.
 */
import worldCountries from 'world-countries';

import { booleanPointInPolygon } from '@turf/boolean-point-in-polygon';

import geo from '@/data/countries.geo.json';
import { allCountryFacts, getCountryFacts } from '@/data/countryFacts';
import labelPoints from '@/data/labelPoints.json';
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

  it('records every area as a finite number, and flags the unusable ones', () => {
    // The density ramp divides by this and takes log10 of the result, so a 0 or a
    // negative would evaluate to -Infinity/NaN and break the paint for the whole layer
    // inside the native renderer. `worldGeoJson.ts` drops these features out of the
    // ramp; this pins how many there are to drop.
    const unusable = Object.entries(allCountryFacts)
      .filter(([, facts]) => facts.area == null || !Number.isFinite(facts.area) || facts.area <= 0)
      .map(([iso3]) => iso3);

    // mledoze ships -1 for an unknown area, and Svalbard is the only one that has it.
    // A new entry here is a new hole in the density map, not a rounding detail.
    expect(unusable).toEqual(['SJM']);
    expect(allCountryFacts.SJM.area).toBe(-1);
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

/**
 * Quiz mode asks these fields of every UN member, so a gap here is an unanswerable
 * question rather than a blank row in the info sheet. Mirrors the checks in
 * `scripts/countryFactRecord.mjs` - the same "explicit allowlist, never a silent
 * skip" rule as the two allowlists above.
 */
describe('quiz data', () => {
  /**
   * mledoze sets `unMember` on Vatican City, which is a permanent observer state and
   * not a member. The quiz pool excludes it explicitly, so the flag is 194 wide and
   * the pool is 193.
   */
  const OBSERVER_STATE = 'VAT';

  /** Micronesia carries no currency upstream - checked, genuinely absent. */
  const CURRENCYLESS = new Set(['FSM']);

  const geometryCodes = new Set(isoCodes);
  const unMembers = Object.entries(allCountryFacts).filter(
    ([iso3, facts]) => facts.unMember && geometryCodes.has(iso3),
  );
  const pool = unMembers.filter(([iso3]) => iso3 !== OBSERVER_STATE);

  it('flags exactly 194 UN members with geometry, giving a pool of 193', () => {
    // Pinned rather than bounded: a change here is a change to the dataset's idea of
    // who is a country, which should never happen quietly.
    expect(unMembers).toHaveLength(194);
    expect(pool).toHaveLength(193);
    expect(unMembers.map(([iso3]) => iso3)).toContain(OBSERVER_STATE);
  });

  it('excludes non-members that would otherwise look like countries', () => {
    for (const code of ['TWN', 'PSE', 'UNK', 'GRL', 'PRI', 'HKG']) {
      expect(allCountryFacts[code]?.unMember).toBe(false);
    }
  });

  it('gives every quiz country a region and a subregion', () => {
    // The setup menu groups the 24 subregions under 6 regions; an empty one would be
    // a country that no filter can reach and that therefore never gets asked.
    const missing = pool.filter(([, f]) => !f.region || !f.subregion).map(([iso3]) => iso3);
    expect(missing).toEqual([]);
  });

  it('spreads the pool over exactly 24 subregions, none of them empty', () => {
    const counts = new Map<string, number>();
    for (const [, facts] of pool) {
      counts.set(facts.subregion, (counts.get(facts.subregion) ?? 0) + 1);
    }
    expect(counts.size).toBe(24);
    expect([...counts.values()].every((n) => n > 0)).toBe(true);
    expect([...counts.values()].reduce((a, b) => a + b, 0)).toBe(193);
  });

  it('has a population for every quiz country', () => {
    // Population is an answerable field, and the grader takes a ±20% band around it.
    // VAT is the only UN-flagged record without one, which is why it is also the one
    // the pool excludes.
    expect(pool.filter(([, f]) => f.population == null).map(([iso3]) => iso3)).toEqual([]);
    expect(allCountryFacts[OBSERVER_STATE].population).toBeNull();
  });

  it('has a capital and at least one language for every quiz country', () => {
    expect(pool.filter(([, f]) => f.capital.length === 0).map(([c]) => c)).toEqual([]);
    expect(pool.filter(([, f]) => f.languages.length === 0).map(([c]) => c)).toEqual([]);
  });

  it('has a currency for every quiz country except Micronesia', () => {
    // Exact, not a `toContain`: an allowlist entry that stops being needed would
    // otherwise hide the next genuine gap.
    expect(pool.filter(([, f]) => f.currencies.length === 0).map(([c]) => c)).toEqual([
      ...CURRENCYLESS,
    ]);
  });

  it('strips the two-letter country code out of altSpellings', () => {
    // Without this "fr" is an accepted answer for France and "in" for India. The
    // filter is on the cca2 itself, not on length, so UK / USA / UAE / DRC / RSA -
    // exactly what a player types - all survive.
    expect(allCountryFacts.FRA.altSpellings).not.toContain('FR');
    expect(allCountryFacts.GBR.altSpellings).toContain('UK');
    expect(allCountryFacts.ARE.altSpellings).toContain('UAE');
    expect(allCountryFacts.COD.altSpellings).toContain('DRC');

    // The rule is "not the country's own cca2", checked against the same upstream the
    // build reads. A length cutoff would be wrong in both directions: it would drop UK
    // and DRC, and it would keep the Korean and Chinese names, which are 2-3 characters
    // and entirely legitimate.
    const wearingItsOwnCode = worldCountries
      .filter((c) => allCountryFacts[c.cca3])
      .filter((c) =>
        allCountryFacts[c.cca3].altSpellings.some(
          (s) => s.toUpperCase() === c.cca2.toUpperCase(),
        ),
      )
      .map((c) => `${c.cca3}:${c.cca2}`);
    expect(wearingItsOwnCode).toEqual([]);
  });

  it('carries the aliases the forgiving grader leans on', () => {
    expect(allCountryFacts.CIV.altSpellings).toContain('Ivory Coast');
    expect(allCountryFacts.NLD.altSpellings).toContain('Holland');
    expect(allCountryFacts.KOR.altSpellings).toContain('Republic of Korea');
  });
});

/**
 * Mirrors what `scripts/build-label-points.mjs` enforces, so the committed anchors cannot
 * rot against the geometry they were derived from.
 *
 * The containment check is the valuable one and the reason `polylabel` is used at all: a
 * bbox centre lands in the sea for Norway, Chile, Croatia, Vietnam and Indonesia, and an
 * anchor outside its own country puts the label over a neighbour with no visible error.
 */
describe('map label anchors', () => {
  const anchors = labelPoints as unknown as Record<string, { at: [number, number]; w: number }>;

  it('has an anchor for every country with an outline', () => {
    for (const iso3 of isoCodes) {
      expect(anchors).toHaveProperty(iso3);
    }
  });

  it('has no anchor for a country that has no outline', () => {
    expect(Object.keys(anchors).sort()).toEqual([...isoCodes].sort());
  });

  it('places every anchor inside its own country', () => {
    const outside: string[] = [];

    for (const feature of features) {
      const anchor = anchors[feature.properties.iso3];
      if (
        !booleanPointInPolygon(
          anchor.at,
          feature.geometry as unknown as GeoJSON.Polygon | GeoJSON.MultiPolygon,
        )
      ) {
        outside.push(feature.properties.iso3);
      }
    }

    // If this fails after a geometry change, re-run `npm run labels:data` rather than
    // editing the expectation - the anchors are derived, not authored.
    expect(outside).toEqual([]);
  });

  it('records a positive longitude span for every country', () => {
    // A zero span reaches log2(0) in labelFit.ts.
    for (const [iso3, anchor] of Object.entries(anchors)) {
      expect(Number.isFinite(anchor.w)).toBe(true);
      expect(anchor.w).toBeGreaterThan(0);
      expect(`${iso3} ${anchor.w <= 360}`).toBe(`${iso3} true`);
    }
  });

  it('keeps coordinates in range', () => {
    for (const { at } of Object.values(anchors)) {
      expect(at[0]).toBeGreaterThanOrEqual(-180);
      expect(at[0]).toBeLessThanOrEqual(180);
      expect(at[1]).toBeGreaterThanOrEqual(-90);
      expect(at[1]).toBeLessThanOrEqual(90);
    }
  });
});
