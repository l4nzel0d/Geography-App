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
import { searchCountries, SEARCH_INDEX, SEARCH_RANK } from '@/search/countrySearch';

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
    // Then the two official-name aliases, in their own alphabetical block. Below THOSE
    // comes a third block: every country whose currency is the United States dollar, which
    // is a real match and correctly ranked under every name and alias hit.
    expect(names.slice(4, 6)).toEqual(['Mexico', 'Tanzania']);
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
    expect(netherlands.matchedAs).toEqual({ kind: 'alias', text: 'Holland' });
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

describe('capitals and currencies', () => {
  it('finds a country by its capital', () => {
    const [peru] = searchCountries('Lima');

    expect(peru.iso3).toBe('PER');
    expect(peru.matchedAs).toEqual({ kind: 'capital', text: 'Lima' });
  });

  it('finds every country sharing a currency, alphabetically', () => {
    // A currency is shared, unlike a capital - which is exactly why it ranks below one.
    // The tie-break inside the tier still has to be the pre-sorted index's order.
    const kwacha = searchCountries('Kwacha');

    expect(kwacha.map((result) => result.iso3)).toEqual(['MWI', 'ZMB']);
    expect(kwacha[0].matchedAs?.kind).toBe('currency');
  });

  it('ranks every name and alias tier above every capital and currency tier', () => {
    // THE ordering pin, on real data. "george" prefix-matches Georgetown - Guyana's
    // capital - and only substring-matches Georgia. A country whose own NAME contains the
    // query still wins, because the block is not interleaved. This is the assertion that
    // fails the moment someone decides a capital prefix ought to beat a name substring.
    const results = searchCountries('george').map((result) => result.iso3);

    expect(results.indexOf('GEO')).toBeLessThan(results.indexOf('GUY'));
  });

  it('pins the rank block itself, since the data may not always exercise it', () => {
    // A constant-ordering assertion is the honest test when no query happens to reach the
    // boundary today - and a literal hit on a real fact must always beat a spelling guess.
    expect(SEARCH_RANK.AliasSubstring).toBeLessThan(SEARCH_RANK.ExactCapital);
    expect(SEARCH_RANK.ExactCapital).toBeLessThan(SEARCH_RANK.ExactCurrency);
    expect(SEARCH_RANK.CurrencySubstring).toBeLessThan(SEARCH_RANK.Fuzzy);
  });

  it('never lets a currency hit outrank a country whose name matched', () => {
    // The real overlap case: "franc" is a name PREFIX of France and simultaneously the
    // currency of two dozen countries. France has to open the list, because every name tier
    // beats every currency tier - and the two dozen still belong below it.
    const francs = searchCountries('franc');

    expect(francs[0].iso3).toBe('FRA');
    expect(francs[0].matchedAs).toBeNull();
    expect(francs.length).toBeGreaterThan(5);
  });

  it('keeps a broad currency query inside the usual cap', () => {
    // "euro" matches no country NAME at all, so every row here is a currency hit - which is
    // the tail the cap exists to bound.
    const euro = searchCountries('euro');

    expect(euro.length).toBeGreaterThan(5);
    expect(euro.length).toBeLessThanOrEqual(50);
    expect(euro.every((result) => result.matchedAs?.kind === 'currency')).toBe(true);
  });

  it('says nothing about a capital that is also the country name', () => {
    // Djibouti, Singapore, Monaco and Luxembourg are all their own capitals. The shared
    // `seen` set drops the duplicate spelling, so the name still matches at rank 0 and no
    // row ever explains itself with "Capital: Monaco" under the word Monaco.
    for (const query of ['Djibouti', 'Singapore', 'Monaco', 'Luxembourg']) {
      expect(searchCountries(query)[0].matchedAs).toBeNull();
    }
  });

  it('indexes currency NAMES and not their codes', () => {
    // "USD" is different knowledge from "United States dollar" - the same call
    // `gradeAnswer` makes when it rejects a code as a currency answer.
    expect(searchCountries('USD')).toHaveLength(0);
  });

  it('keeps every indexed spelling normalized and deduped against the name', () => {
    for (const entry of SEARCH_INDEX) {
      for (const spelling of [...entry.capitals, ...entry.currencies]) {
        expect(spelling.raw.length).toBeGreaterThan(0);
        expect(spelling.normalized).toBe(spelling.normalized.trim());
        expect(spelling.normalized).not.toBe(entry.normalizedName);
      }
    }
  });
});

describe('in Russian', () => {
  it('finds a country by its Russian capital', () => {
    // No new data made this work: `localize()` already swaps `capital` for
    // `translations.ru.capital`, so the Russian index carries it for free.
    const [peru] = searchCountries('Лима', undefined, 'ru');

    expect(peru.iso3).toBe('PER');
    expect(peru.name).toBe('Перу');
    expect(peru.matchedAs).toEqual({ kind: 'capital', text: 'Лима' });
  });

  it('finds a country by its Russian currency', () => {
    const kwacha = searchCountries('квача', undefined, 'ru');

    expect(kwacha.map((result) => result.iso3).sort()).toEqual(['MWI', 'ZMB']);
    expect(kwacha[0].matchedAs?.kind).toBe('currency');
  });
});
