/**
 * How long a camera move takes, given how far it travels.
 *
 * The point of this file is that the pacing is a NUMBER, not a feel. A fixed duration
 * was wrong in both directions at once, and the fix is only worth having if a short hop
 * really is short and an ocean crossing really is longer - so the assertions here are
 * about the shape of the curve and about the real flights the quiz actually makes.
 *
 * The formula is van Wijk & Nuij, the same one `maplibre-gl` uses for a `flyTo` with no
 * duration. It is reproduced in `quizCamera.ts` because MapLibre Native Android has no
 * equivalent - see the note there.
 */
import { getWorldFitZoom } from '@/map/cameraFit';
import { getCountryBounds } from '@/map/countryBounds';
import {
  getCountryCameraStop,
  getFlightDuration,
  MAX_FLIGHT_MS,
  MIN_FLIGHT_MS,
} from '@/map/quizCamera';

/** The map's box on a portrait phone, with the quiz panel taking its share. */
const VIEWPORT = { width: 411, height: 500 };

const QUIZ_MAX_ZOOM = 10;

/** The same framing the play screen computes, so these are the real flights. */
const poseFor = (iso3: string) => {
  const bounds = getCountryBounds(iso3)!;
  return getCountryCameraStop({
    bbox: bounds.bbox,
    viewport: VIEWPORT,
    minZoom: getWorldFitZoom(VIEWPORT.width),
    maxZoom: QUIZ_MAX_ZOOM,
  });
};

const between = (a: string, b: string) =>
  getFlightDuration({ from: poseFor(a), to: poseFor(b), viewport: VIEWPORT });

describe('the shape of the curve', () => {
  it('takes longer the further the camera goes', () => {
    // The whole complaint this replaced: at a flat 900 ms these three were identical.
    const neighbours = between('FRA', 'DEU');
    const continent = between('FRA', 'TUR');
    const ocean = between('FRA', 'JPN');

    expect(neighbours).toBeLessThan(continent);
    expect(continent).toBeLessThan(ocean);
  });

  it('keeps a short hop short', () => {
    // France to Germany is half a screen at that zoom. Anything approaching a second
    // here is the sluggishness a bigger fixed duration would have bought.
    expect(between('FRA', 'DEU')).toBeLessThan(800);
  });

  it('gives an ocean crossing real time', () => {
    expect(between('FRA', 'JPN')).toBeGreaterThan(1000);
  });

  it('never drops below the floor or above the ceiling', () => {
    // The ceiling is the one that bites: the formula will happily spend four seconds
    // crossing the world from a street-level zoom, and that is a wait, twenty times a
    // round. Past it the move is simply faster than optimal.
    const identical = getFlightDuration({
      from: poseFor('FRA'),
      to: poseFor('FRA'),
      viewport: VIEWPORT,
    });
    expect(identical).toBe(MIN_FLIGHT_MS);

    const worldToMicrostate = getFlightDuration({
      from: { center: [10, 20], zoom: 0 },
      to: poseFor('MCO'),
      viewport: VIEWPORT,
    });
    expect(worldToMicrostate).toBeLessThanOrEqual(MAX_FLIGHT_MS);
    expect(worldToMicrostate).toBeGreaterThan(MIN_FLIGHT_MS);
  });

  it('charges for a pure zoom with no panning at all', () => {
    // The degenerate case: the general formula divides by the distance between the
    // centres, so a straight descent has to be handled separately or it returns
    // Infinity - which reaches the native camera and blanks the map.
    const straightDown = getFlightDuration({
      from: { center: [10, 20], zoom: 0 },
      to: { center: [10, 20], zoom: 9 },
      viewport: VIEWPORT,
    });

    expect(Number.isFinite(straightDown)).toBe(true);
    expect(straightDown).toBeGreaterThan(MIN_FLIGHT_MS);
  });
});

describe('the awkward inputs', () => {
  it('goes the short way round the antimeridian', () => {
    // 170E to 170W is 20 degrees apart, not 340. Getting this wrong would pace a hop
    // between two Pacific neighbours as though it crossed the whole world.
    const shortWay = getFlightDuration({
      from: { center: [170, 0], zoom: 4 },
      to: { center: [-170, 0], zoom: 4 },
      viewport: VIEWPORT,
    });
    const longWay = getFlightDuration({
      from: { center: [170, 0], zoom: 4 },
      to: { center: [-10, 0], zoom: 4 },
      viewport: VIEWPORT,
    });

    expect(shortWay).toBeLessThan(longWay);
  });

  it('survives a viewport that does not exist yet', () => {
    // A zero-sized box is a real state on web - see WorldMap.web.tsx - and every term of
    // the formula divides by it.
    const duration = getFlightDuration({
      from: { center: [10, 20], zoom: 0 },
      to: { center: [0, 0], zoom: 5 },
      viewport: { width: 0, height: 0 },
    });

    expect(duration).toBe(MIN_FLIGHT_MS);
  });

  it('is symmetric: the way back takes as long as the way out', () => {
    expect(between('FRA', 'JPN')).toBe(between('JPN', 'FRA'));
  });
});

describe('the real flights a round makes', () => {
  /**
   * If the real flights all landed on the same value - or on the two clamps - this would
   * be a fixed duration again with extra steps. So the assertion is about SPREAD, not
   * about any one number, which also means retuning `FLIGHT_SPEED` does not turn it red.
   */
  it('spans a wide range of durations', () => {
    const flights = [
      between('FRA', 'DEU'),
      between('FRA', 'TUR'),
      between('BRA', 'ARG'),
      between('FRA', 'JPN'),
      between('NZL', 'ISL'),
      between('USA', 'CHN'),
    ];

    expect(new Set(flights).size).toBeGreaterThanOrEqual(4);
    expect(Math.max(...flights)).toBeGreaterThan(3 * Math.min(...flights));
  });

  it('paces by screenfuls, not by kilometres', () => {
    // Both of these read as wrong until you remember what the unit is, and both would be
    // backwards under any distance-based scheme.
    //
    // The USA and China each frame at around zoom 1, so nearly the whole world is
    // already on screen at both ends and very little of it actually moves.
    expect(between('USA', 'CHN')).toBeLessThan(between('FRA', 'JPN'));
    // Monaco and Liechtenstein are 500 km apart, but at zoom 10 that is hundreds of
    // screenfuls - by far the longest flight here.
    expect(between('MCO', 'LIE')).toBeGreaterThan(between('FRA', 'JPN'));
  });
});
