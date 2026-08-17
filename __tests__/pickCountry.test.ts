/**
 * Regression suite for the tap-accuracy bug.
 *
 * MapLibre hit-tests with a 44dp hitbox. At zoom 0 that covers ~30 degrees of
 * longitude, so a single press near the Sahara returns six countries. Taking
 * `features[0]` selected whichever one MapLibre returned first, which showed up as
 * "the country above or below my fingertip gets selected".
 */
import { pickCountry } from '@/map/pickCountry';

// Captured from a real press on a Galaxy S25, device pixel (540, 1000).
const SAHARA_PRESS: [number, number] = [10.00000000000685, 25.290206636895675];
const SAHARA_CANDIDATES = ['LBY', 'DZA', 'TUN', 'NER', 'MLI', 'TCD'];

/**
 * Algeria, not Libya - and the change of answer is the point.
 *
 * This press lands a few km west of the Algeria/Libya border, near Ghat. The old
 * 1:110m outline smoothed that stretch of border eastward, so Libya's polygon
 * covered the point and the assertion here was written to match. Both 1:50m and
 * 1:10m put it in Algeria, which is also where the real border puts it.
 *
 * It still exercises what it always did: `LBY` is first in the candidate list, so
 * the old features[0] behaviour would still get it wrong.
 */
const SAHARA_EXPECTED = 'DZA';

describe('pickCountry', () => {
  it('picks the country that actually contains the press, not the first candidate', () => {
    expect(pickCountry(SAHARA_PRESS, SAHARA_CANDIDATES)).toBe(SAHARA_EXPECTED);
  });

  it('is order-independent', () => {
    const reversed = [...SAHARA_CANDIDATES].reverse();
    expect(pickCountry(SAHARA_PRESS, reversed)).toBe(SAHARA_EXPECTED);
    expect(pickCountry(SAHARA_PRESS, ['TCD', 'LBY', 'DZA'])).toBe(SAHARA_EXPECTED);
  });

  it('picks France for a press on Paris, where France is the LAST candidate', () => {
    // Captured verbatim from the device. The old features[0] behaviour selected Great
    // Britain for a press on Paris; France came eighth of eight.
    const candidates = ['GBR', 'ITA', 'NLD', 'BEL', 'LUX', 'CHE', 'DEU', 'FRA'];
    expect(pickCountry([2.35, 48.85], candidates)).toBe('FRA');
  });

  it('resolves real captured candidate sets from dense borders', () => {
    // All captured from presses on the actual capitals.
    expect(pickCountry([13.4, 52.5], ['CZE', 'DNK', 'DEU', 'POL'])).toBe('DEU');
    expect(pickCountry([12.5, 41.9], ['BIH', 'ITA', 'HRV', 'FRA'])).toBe('ITA');
    expect(
      pickCountry([21.0, 52.23], ['CZE', 'SVK', 'LTU', 'POL', 'UKR', 'BLR', 'RUS']),
    ).toBe('POL');
    expect(pickCountry([32.85, 39.93], ['TUR', 'BGR', 'SYR'])).toBe('TUR');
  });

  it('resolves neighbours on both sides of a border correctly', () => {
    // Same candidate set, three presses. Each must return the country it is inside,
    // which is precisely what the old features[0] behaviour could not do.
    const candidates = ['FRA', 'ESP', 'DEU', 'ITA', 'CHE'];
    expect(pickCountry([2.35, 48.85], candidates)).toBe('FRA'); // Paris
    expect(pickCountry([-3.7, 40.4], candidates)).toBe('ESP'); // Madrid
    expect(pickCountry([13.4, 52.5], candidates)).toBe('DEU'); // Berlin
    expect(pickCountry([12.5, 41.9], candidates)).toBe('ITA'); // Rome
  });

  it('picks a microstate over the large neighbour surrounding it', () => {
    // The 1:50m geometry exists so these can be tapped at all, but existing is not
    // enough: at any usable zoom the hitbox still returns the big neighbour too, so
    // containment has to win. Verified on the emulator - a press at the Liechtenstein
    // point below selects Liechtenstein, not Switzerland.
    expect(pickCountry([9.5471, 47.1427], ['CHE', 'AUT', 'LIE'])).toBe('LIE');

    // Dominica sits between Guadeloupe and Martinique, both of which Natural Earth
    // draws as part of France - so FRA is a genuine competing candidate here.
    expect(pickCountry([-61.3612, 15.4371], ['FRA', 'DMA'])).toBe('DMA');
  });

  it('handles MultiPolygon countries', () => {
    // France is a MultiPolygon; a naive Polygon-only test would miss it.
    expect(pickCountry([2.35, 48.85], ['FRA', 'DEU'])).toBe('FRA');
    expect(pickCountry([138.0, 36.5], ['JPN', 'KOR'])).toBe('JPN'); // Honshu
  });

  it('falls back to the nearest candidate when the press is just offshore', () => {
    // Keeps small and coastal countries reachable without zooming right in. This
    // press is in the Atlantic just west of Senegal/Gambia.
    const result = pickCountry([-17.6, 13.5], ['GMB', 'SEN', 'MRT']);
    expect(['GMB', 'SEN']).toContain(result);
  });

  it('short-circuits a single candidate without geometry work', () => {
    expect(pickCountry([0, 0], ['BRA'])).toBe('BRA');
  });

  it('returns null when there are no candidates', () => {
    expect(pickCountry([0, 0], [])).toBeNull();
    expect(pickCountry([0, 0], [undefined, undefined])).toBeNull();
  });

  it('ignores duplicate candidates, which MapLibre does emit', () => {
    // The real payload contained each country twice.
    const doubled = [...SAHARA_CANDIDATES, ...SAHARA_CANDIDATES];
    expect(pickCountry(SAHARA_PRESS, doubled)).toBe(SAHARA_EXPECTED);
  });
});
