/**
 * What the search box offers for what you type.
 *
 * This is the half of the feature that has no pixels, so it is the half Jest can own
 * outright. The cases below are not a sample - each one is a way the ranking has gone
 * wrong or could: a prefix losing to a substring ("ger" must not lead with Algeria), an
 * alias that is the only name most people know ("Holland"), a family of countries that
 * share a word ("Guinea"), and a transposition, which is the commonest typing mistake and
 * the reason grading uses Damerau rather than plain Levenshtein.
 *
 * The contrast with `grading.test.ts` is deliberate and worth keeping in mind: grading
 * must REJECT a near-miss, because "Gambia" for Zambia would award a point nobody earned.
 * Search must OFFER one, because not knowing the spelling is why the box is open.
 */
import rawGeoJson from '@/data/countries.geo.json';
import { allCountryFacts } from '@/data/countryFacts';
import { searchCountries, SEARCH_INDEX } from '@/search/countrySearch';

const isoOrder = (query: string, limit?: number) =>
  searchCountries(query, limit).map((result) => result.iso3);

const mappedIso3 = new Set(
  (rawGeoJson as unknown as { features: { properties: { iso3: string } }[] }).features.map(
    (feature) => feature.properties.iso3,
  ),
);

describe('the searchable pool', () => {
  it('is every country with both an outline and a facts record', () => {
    // 240 outlines intersected with 250 fact records. Wider than the quiz's 193 UN
    // members on purpose - the map draws Greenland, so search has to find it.
    expect(SEARCH_INDEX).toHaveLength(237);
    expect(isoOrder('greenland')).toContain('GRL');
    expect(isoOrder('puerto rico')).toContain('PRI');
    expect(isoOrder('western sahara')).toContain('ESH');
  });

  it('never offers a country the map could not highlight', () => {
    // The three geometry-only entries (Somaliland, Northern Cyprus, Siachen Glacier)
    // have no facts, so the info sheet would open empty. They must not be reachable.
    for (const entry of SEARCH_INDEX) {
      expect(mappedIso3.has(entry.iso3)).toBe(true);
      expect(allCountryFacts[entry.iso3]).toBeTruthy();
    }
    expect(SEARCH_INDEX.map((entry) => entry.iso3)).not.toContain('SOL');
  });

  it('lists the whole world alphabetically for an empty query', () => {
    // The screen opens before a key is pressed and should be useful then: a browsable
    // index, not an empty panel telling you to start typing.
    const all = searchCountries('', 500);

    expect(all).toHaveLength(237);
    expect(all[0].name.localeCompare(all[1].name)).toBeLessThanOrEqual(0);
    expect(searchCountries('   ', 500)).toHaveLength(237);
  });

  it('respects the limit', () => {
    expect(searchCountries('', 5)).toHaveLength(5);
  });
});

describe('ranking', () => {
  it('puts a prefix of the name above a substring of another', () => {
    // "ger" is inside Algeria and Niger too. Germany starts with it, and starting with
    // it is what the user meant.
    expect(isoOrder('ger')[0]).toBe('DEU');
  });

  it('puts an exact name first even when it is a prefix of longer ones', () => {
    // Guinea, Guinea-Bissau, Equatorial Guinea and Papua New Guinea all match.
    const guineas = isoOrder('guinea');

    expect(guineas[0]).toBe('GIN');
    expect(guineas).toEqual(expect.arrayContaining(['GIN', 'GNB', 'GNQ', 'PNG']));
  });

  it('surfaces every United-something for a shared prefix, alphabetically', () => {
    expect(isoOrder('united').slice(0, 4)).toEqual(['ARE', 'GBR', 'USA', 'VIR']);
  });

  it('breaks ties alphabetically WITHIN a tier, not across the whole list', () => {
    // "united" also hits Mexico and Tanzania, whose OFFICIAL names are the United
    // Mexican States and the United Republic of Tanzania. Those are real matches and
    // belong in the list - just below every country whose everyday name starts with the
    // word. So the result is alphabetical in blocks, not end to end.
    const names = searchCountries('united').map((result) => result.name);
    const byName = names.slice(0, 4);

    expect(byName).toEqual([...byName].sort((a, b) => a.localeCompare(b)));
    expect(names.slice(4)).toEqual(['Mexico', 'Tanzania']);
  });
});

describe('aliases', () => {
  it('finds a country by the name most people use for it', () => {
    expect(isoOrder('holland')[0]).toBe('NLD');
    expect(isoOrder('ivory coast')[0]).toBe('CIV');
    expect(isoOrder('burma')[0]).toBe('MMR');
    expect(isoOrder('swaziland')[0]).toBe('SWZ');
  });

  it('reports which alias matched, so the row can show it', () => {
    // Offering "Netherlands" for "holland" with no explanation reads like a bug.
    const [netherlands] = searchCountries('holland');

    expect(netherlands.name).toBe('Netherlands');
    expect(netherlands.matchedAs).toBe('Holland');
  });

  it('reports no alias when the primary name is what matched', () => {
    expect(searchCountries('germany')[0].matchedAs).toBeNull();
  });

  it('finds the short forms the dataset carries', () => {
    expect(isoOrder('uk')[0]).toBe('GBR');
    expect(isoOrder('usa')[0]).toBe('USA');
    expect(isoOrder('uae')[0]).toBe('ARE');
  });

  it('reaches the United States from a two-letter prefix of its alias', () => {
    // "us" is not a prefix of "united states", but it is one of "USA". Without the
    // alias tier this returns Belarus and Cyprus and nothing else.
    expect(isoOrder('us')).toContain('USA');
  });
});

describe('spelling', () => {
  it('ignores accents and punctuation', () => {
    for (const query of ['cote divoire', "cote d'ivoire", 'Côte d’Ivoire']) {
      expect(isoOrder(query)).toContain('CIV');
    }
  });

  it('forgives a transposition', () => {
    // Damerau, not Levenshtein: "Frnace" is one adjacent swap from France but two plain
    // edits, which is outside the budget for a six-letter target.
    expect(isoOrder('frnace')).toContain('FRA');
  });

  it('forgives a wrong letter in a longer name', () => {
    expect(isoOrder('kazakstan')).toContain('KAZ');
  });

  it('does not fuzzy-match a query too short to mean anything', () => {
    // `allowedEdits` returns 0 below five characters, so a short fuzzy pass can only
    // cost time. This pins that the cutoff is real rather than incidental.
    expect(isoOrder('irn')).not.toContain('IRN');
  });

  it('ranks a literal match above a typo', () => {
    // "mali" is a country and also a substring of Malawi and Somalia.
    expect(isoOrder('mali')[0]).toBe('MLI');
  });
});

describe('no match', () => {
  it('returns nothing for a query that is not a country', () => {
    expect(searchCountries('qqqqzzzz')).toEqual([]);
  });
});
