/**
 * What the quiz camera frames.
 *
 * Two failure modes, both invisible in code review and both immediately obvious on a
 * device: a country whose overseas territories drag the frame across an ocean, and a
 * country straddling the antimeridian whose frame wraps the long way round the world.
 *
 * The expectations below are measured against the committed 1:50m geometry. If one
 * flips after a data change, check the outlines before the code - CLAUDE.md records
 * the same thing happening to a `pickCountry` expectation when a border moved.
 */
import { allCountryFacts } from '@/data/countryFacts';
import {
  computeCountryBounds,
  getCountryBounds,
  MIN_SPAN_DEG,
} from '@/map/countryBounds';

const bounds = (iso3: string) => {
  const result = getCountryBounds(iso3);
  if (!result) throw new Error(`no geometry for ${iso3}`);
  return result;
};

describe('outlying territories', () => {
  // The case that motivates the whole module: Natural Earth draws French Guiana as
  // part of FRA, so the full extent runs from -54 to +9 and a plain bounding box
  // frames the Atlantic with a speck of Europe in the corner.
  it('frames metropolitan France, not the Atlantic', () => {
    const { bbox, lngSpan } = bounds('FRA');
    expect(bbox[0]).toBeGreaterThan(-20); // French Guiana sits near -54
    expect(lngSpan).toBeLessThan(20);
    expect(bbox[2]).toBeGreaterThan(8); // ...but Corsica is kept
  });

  it.each([
    ['ESP', 'the Canaries', (b: number[]) => expect(b[0]).toBeGreaterThan(-12)],
    ['PRT', 'the Azores', (b: number[]) => expect(b[0]).toBeGreaterThan(-12)],
    ['ECU', 'the Galapagos', (b: number[]) => expect(b[0]).toBeGreaterThan(-85)],
    ['CHL', 'Easter Island', (b: number[]) => expect(b[0]).toBeGreaterThan(-85)],
    ['NLD', 'the Caribbean Netherlands', (b: number[]) => expect(b[0]).toBeGreaterThan(0)],
    ['ZAF', 'the Prince Edward Islands', (b: number[]) => expect(b[2]).toBeLessThan(40)],
  ])('excludes %s\'s distant %s', (iso3, _label, assert) => {
    assert(bounds(iso3).bbox);
  });
});

describe('archipelagos', () => {
  // The opposite failure: clustering too tightly frames one island of a country that
  // is entirely islands. These must keep every polygon.
  it.each(['IDN', 'PHL', 'JPN', 'GRC', 'VUT'])('keeps every polygon of %s', (iso3) => {
    const { kept, total } = bounds(iso3);
    expect(kept).toBe(total);
  });

  it('keeps both halves of Malaysia', () => {
    // The case that sets GAP_MIN_DEG. Peninsular Malaysia and Malaysian Borneo are 5.2
    // degrees apart across the South China Sea, and Borneo is the larger, so a tighter
    // floor seeds the cluster there and drops the peninsula - which is where the
    // capital and most of the population are.
    const { bbox, lngSpan, kept, total } = bounds('MYS');
    expect(kept).toBe(total);
    expect(bbox[0]).toBeLessThan(102); // the peninsula reaches ~99.6E
    expect(bbox[2]).toBeGreaterThan(118); // Borneo reaches ~119.3E
    expect(lngSpan).toBeGreaterThan(15);
  });

  it('frames scattered ocean states to their main group, not their full spread', () => {
    // An accepted limitation, pinned so it is a decision rather than a surprise.
    // Kiribati's islands span 38 degrees of ocean and Micronesia's 25; framing either
    // in full shows an empty blue rectangle with a few invisible specks. The main
    // group at least renders. Both are inherently hard questions, and the subregion
    // filter is the way to opt out of them.
    expect(bounds('KIR').kept).toBeLessThan(bounds('KIR').total);
    expect(bounds('FSM').kept).toBeLessThan(bounds('FSM').total);
  });
});

describe('the antimeridian', () => {
  // These countries have territory on both sides of 180 degrees. Naively, min/max over
  // the raw longitudes gives a frame spanning nearly the whole globe.
  it.each(['RUS', 'USA', 'FJI', 'NZL', 'KIR'])('does not wrap %s the long way', (iso3) => {
    expect(bounds(iso3).lngSpan).toBeLessThan(180);
  });

  it('frames Fiji tightly around 180 rather than around 0', () => {
    const { bbox, lngSpan } = bounds('FJI');
    expect(lngSpan).toBeLessThan(15);
    // west is a positive longitude near 180; east has wrapped past it and is negative
    // or just under 180. Either way the midpoint is out in the Pacific, not Africa.
    expect(bbox[0]).toBeGreaterThan(170);
  });

  it('reports a positive span even when west exceeds east', () => {
    for (const iso3 of ['FJI', 'KIR', 'USA', 'RUS']) {
      expect(bounds(iso3).lngSpan).toBeGreaterThan(0);
    }
  });
});

describe('microstates', () => {
  // Every one of these rounds to a point or near-point at the 3dp the geometry ships
  // at. A zero span means log2(0) = -Infinity reaches the native camera.
  it.each(['VAT', 'MCO', 'TUV', 'NRU', 'SMR', 'LIE', 'SGP', 'MDV'])(
    'gives %s a usable span',
    (iso3) => {
      const { lngSpan, latSpan } = bounds(iso3);
      expect(lngSpan).toBeGreaterThanOrEqual(MIN_SPAN_DEG);
      expect(latSpan).toBeGreaterThanOrEqual(MIN_SPAN_DEG);
    },
  );
});

describe('every country in the quiz pool', () => {
  const pool = Object.entries(allCountryFacts)
    .filter(([iso3, facts]) => facts.unMember && iso3 !== 'VAT')
    .map(([iso3]) => iso3)
    .filter((iso3) => getCountryBounds(iso3) !== null);

  it('covers the whole pool', () => {
    expect(pool).toHaveLength(193);
  });

  it('produces finite, in-range, non-degenerate bounds for all of them', () => {
    // The blanket guard. An Infinity or a NaN here passes every other test in this file
    // and then blanks the map inside the native renderer, where nothing can see it.
    const bad = pool.filter((iso3) => {
      const { bbox, lngSpan, latSpan } = bounds(iso3);
      return (
        !bbox.every(Number.isFinite) ||
        bbox[0] < -180 ||
        bbox[0] > 180 ||
        bbox[2] < -180 ||
        bbox[2] > 180 ||
        bbox[1] < -90 ||
        bbox[3] > 90 ||
        bbox[1] > bbox[3] ||
        lngSpan < MIN_SPAN_DEG ||
        latSpan < MIN_SPAN_DEG ||
        lngSpan > 180
      );
    });
    expect(bad).toEqual([]);
  });
});

describe('getCountryBounds', () => {
  it('memoises, so a re-asked country does not re-walk its coordinates', () => {
    expect(getCountryBounds('CAN')).toBe(getCountryBounds('CAN'));
  });

  it('returns null for a country with no outline rather than throwing', () => {
    expect(getCountryBounds('ZZZ')).toBeNull();
  });
});

describe('computeCountryBounds', () => {
  it('handles a bare Polygon as well as a MultiPolygon', () => {
    const { bbox, kept, total } = computeCountryBounds({
      type: 'Polygon',
      coordinates: [
        [
          [10, 20],
          [12, 20],
          [12, 24],
          [10, 24],
          [10, 20],
        ],
      ],
    });
    expect(bbox).toEqual([10, 20, 12, 24]);
    expect(kept).toBe(1);
    expect(total).toBe(1);
  });

  it('drops a far-flung island but keeps a near one', () => {
    const square = (x: number, y: number, size: number) => [
      [x, y],
      [x + size, y],
      [x + size, y + size],
      [x, y + size],
      [x, y],
    ];

    const { bbox, kept } = computeCountryBounds({
      type: 'MultiPolygon',
      coordinates: [
        [square(0, 0, 10)], // mainland
        [square(11, 2, 1)], // just offshore - keep
        [square(80, 2, 1)], // another ocean entirely - drop
      ],
    });

    expect(kept).toBe(2);
    expect(bbox[2]).toBeLessThan(20);
  });
});
