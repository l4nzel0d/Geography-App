/**
 * The camera stop the quiz hands MapLibre.
 *
 * Everything here exists because a bad stop is invisible until it reaches the native
 * renderer: an Infinity zoom or a centre in the wrong hemisphere passes every other
 * test in the project and then shows a blank map on a device.
 */
import { getCountryBounds } from '@/map/countryBounds';
import {
  CONTEXT_MARGIN,
  getCountryCameraStop,
  longitudeSpan,
  normalizeLongitude,
} from '@/map/quizCamera';

const PORTRAIT = { width: 411, height: 500 };
const LANDSCAPE = { width: 640, height: 300 };

const stopFor = (iso3: string, viewport = PORTRAIT, maxZoom = 10) => {
  const bounds = getCountryBounds(iso3);
  if (!bounds) throw new Error(`no geometry for ${iso3}`);
  return getCountryCameraStop({ bbox: bounds.bbox, viewport, minZoom: 0, maxZoom });
};

describe('normalizeLongitude', () => {
  it.each([
    [0, 0],
    [180, -180],
    [-180, -180],
    [190, -170],
    [-190, 170],
    [540, -180],
  ])('maps %p to %p', (input, expected) => {
    expect(normalizeLongitude(input)).toBeCloseTo(expected, 6);
  });
});

describe('longitudeSpan', () => {
  it('measures a plain box west to east', () => {
    expect(longitudeSpan([10, 0, 30, 10])).toBe(20);
  });

  it('goes the short way round when the box wraps the antimeridian', () => {
    // Fiji's shape: west is a large positive, east has wrapped to a negative. The naive
    // subtraction is -354, which as a camera fit would frame the entire planet.
    expect(longitudeSpan([177, -20, -178, -16])).toBe(5);
  });
});

describe('framing real countries', () => {
  it('centres on the country, not on the far side of the world', () => {
    // Point-in-bbox is the assertion that matters: it is what fails if the Mercator
    // maths or the antimeridian handling is wrong.
    for (const iso3 of ['FRA', 'BRA', 'JPN', 'ZAF', 'MNG']) {
      const bounds = getCountryBounds(iso3)!;
      const { center } = stopFor(iso3);
      expect(center[0]).toBeGreaterThanOrEqual(bounds.bbox[0]);
      expect(center[0]).toBeLessThanOrEqual(bounds.bbox[2]);
      expect(center[1]).toBeGreaterThan(bounds.bbox[1]);
      expect(center[1]).toBeLessThan(bounds.bbox[3]);
    }
  });

  it('puts Fiji in the Pacific rather than in the Atlantic', () => {
    // The antimeridian regression. Averaging a wrapped west and east naively gives a
    // centre near 0 degrees longitude - the Gulf of Guinea, half a world away.
    const { center } = stopFor('FJI');
    expect(Math.abs(center[0])).toBeGreaterThan(170);
    expect(center[1]).toBeLessThan(0);
  });

  it('zooms further into a small country than a large one', () => {
    expect(stopFor('LUX').zoom).toBeGreaterThan(stopFor('BRA').zoom);
    expect(stopFor('BRA').zoom).toBeGreaterThan(stopFor('RUS').zoom);
  });

  it('produces a finite, in-range stop for every country in the pool', () => {
    const bad: string[] = [];
    for (const iso3 of ['VAT', 'MCO', 'TUV', 'RUS', 'USA', 'FJI', 'KIR', 'CAN', 'CHL']) {
      const { center, zoom } = stopFor(iso3);
      if (
        !Number.isFinite(zoom) ||
        !Number.isFinite(center[0]) ||
        !Number.isFinite(center[1]) ||
        center[0] < -180 ||
        center[0] > 180 ||
        center[1] < -90 ||
        center[1] > 90
      ) {
        bad.push(iso3);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('zoom clamping', () => {
  const square: [number, number, number, number] = [0, 0, 10, 10];

  it('never exceeds maxZoom, however small the country', () => {
    // Monaco is 0.05 degrees across. Unclamped that is roughly zoom 13, which at 3dp
    // geometry would render a blocky polygon and tell the player nothing.
    const { zoom } = getCountryCameraStop({
      bbox: [7.4, 43.72, 7.45, 43.75],
      viewport: PORTRAIT,
      minZoom: 0,
      maxZoom: 10,
    });
    expect(zoom).toBe(10);
  });

  it('never drops below minZoom', () => {
    const { zoom } = getCountryCameraStop({
      bbox: [-170, -80, 170, 80],
      viewport: PORTRAIT,
      minZoom: 2,
      maxZoom: 10,
    });
    expect(zoom).toBe(2);
  });

  it('falls back to maxZoom rather than emitting Infinity for a degenerate box', () => {
    // countryBounds' MIN_SPAN_DEG should make this unreachable; it is the second line
    // of defence, because Infinity is precisely what blanks the native map.
    const { zoom } = getCountryCameraStop({
      bbox: [5, 5, 5, 5],
      viewport: PORTRAIT,
      minZoom: 0,
      maxZoom: 9,
    });
    expect(zoom).toBe(9);
  });

  it('survives a zero-sized viewport on the very first frame', () => {
    const { zoom } = getCountryCameraStop({
      bbox: square,
      viewport: { width: 0, height: 0 },
      minZoom: 0,
      maxZoom: 8,
    });
    expect(Number.isFinite(zoom)).toBe(true);
  });
});

describe('viewport and margin', () => {
  it('fits a wide country to width and a tall one to height', () => {
    // A landscape map box is wider and shorter, so the same country settles at a
    // different zoom. This is why the camera memo has to re-run on rotation.
    const wide = getCountryCameraStop({
      bbox: [0, 0, 40, 5],
      viewport: LANDSCAPE,
      minZoom: 0,
      maxZoom: 12,
    });
    const tall = getCountryCameraStop({
      bbox: [0, 0, 5, 40],
      viewport: LANDSCAPE,
      minZoom: 0,
      maxZoom: 12,
    });
    expect(tall.zoom).toBeLessThan(wide.zoom);
  });

  it('gives the same country a different zoom in each orientation', () => {
    expect(stopFor('FRA', PORTRAIT).zoom).not.toBeCloseTo(stopFor('FRA', LANDSCAPE).zoom, 3);
  });

  it('zooms out further the larger the margin', () => {
    const tight = getCountryCameraStop({
      bbox: [0, 0, 10, 10],
      viewport: PORTRAIT,
      minZoom: 0,
      maxZoom: 12,
      margin: 0,
    });
    const loose = getCountryCameraStop({
      bbox: [0, 0, 10, 10],
      viewport: PORTRAIT,
      minZoom: 0,
      maxZoom: 12,
      margin: 0.25,
    });
    expect(loose.zoom).toBeLessThan(tight.zoom);
  });

  it('defaults to CONTEXT_MARGIN, so neighbours stay visible', () => {
    const explicit = getCountryCameraStop({
      bbox: [0, 0, 10, 10],
      viewport: PORTRAIT,
      minZoom: 0,
      maxZoom: 12,
      margin: CONTEXT_MARGIN,
    });
    const defaulted = getCountryCameraStop({
      bbox: [0, 0, 10, 10],
      viewport: PORTRAIT,
      minZoom: 0,
      maxZoom: 12,
    });
    expect(defaulted.zoom).toBe(explicit.zoom);
    expect(CONTEXT_MARGIN).toBeGreaterThan(0);
  });
});
