/**
 * Framing a country into the part of the map the info sheet does not cover.
 *
 * This is the only place the offset arithmetic can be seen at all. A bad camera stop is
 * invisible until the native renderer gets it - an Infinity zoom or a centre in the wrong
 * hemisphere passes every other unit test and then blanks the map on a device, which is
 * the same failure mode as a malformed paint expression and cost this project the most
 * time it has lost to one bug.
 *
 * The signs are the part worth staring at. `mercatorY` is 0 at the north pole and grows
 * southward, and screen y also grows downward, so the two conventions cancel and BOTH
 * axes shift with the same sign. Code that looks like it is missing a negation is the
 * expected shape here, and these tests are what say so.
 */
import rawGeoJson from '@/data/countries.geo.json';
import { getViewportFitZoom } from '@/map/cameraFit';
import { getCountryBounds } from '@/map/countryBounds';
import { getCountryCameraStop, getFocusedCameraStop } from '@/map/quizCamera';
import { getMapFocusRect } from '@/components/infoSheetLayout';

const PORTRAIT = { width: 390, height: 844 };
const LANDSCAPE = { width: 914, height: 411 };

const ALL_ISO3: string[] = (
  rawGeoJson as unknown as { features: { properties: { iso3: string } }[] }
).features.map((feature) => feature.properties.iso3);

const boundsOf = (iso3: string) => {
  const bounds = getCountryBounds(iso3);
  if (!bounds) throw new Error(`no geometry for ${iso3}`);
  return bounds;
};

const focused = (iso3: string, viewport: { width: number; height: number }) =>
  getFocusedCameraStop({
    bbox: boundsOf(iso3).bbox,
    viewport,
    focus: getMapFocusRect(viewport),
    minZoom: getViewportFitZoom(viewport.width, viewport.height),
    maxZoom: 10,
  });

/**
 * The same country framed in the WHOLE window - what the map would do with no info sheet.
 *
 * Uses the same zoom floor as `focused`, so the two differ only in the rect they fit. The
 * floor genuinely changes the answer for the handful of countries that reach it (Russia
 * asks for 0.29 and is held at 0.72), and comparing across two different floors would
 * make the "never larger" invariant below meaningless rather than merely false.
 */
const centred = (iso3: string, viewport: { width: number; height: number }) =>
  getCountryCameraStop({
    bbox: boundsOf(iso3).bbox,
    viewport,
    minZoom: getViewportFitZoom(viewport.width, viewport.height),
    maxZoom: 10,
  });

describe('it generalises the quiz camera', () => {
  /**
   * The countries whose plain stop points somewhere that would show past a pole.
   *
   * With the focus rect equal to the whole viewport the new function must agree with the
   * old one exactly - it is the same arithmetic plus an offset of zero. It does, for 235
   * of 240. The five below are the ones where `getCountryCameraStop` asks for a centre
   * that MapLibre would silently clamp anyway; the new function clamps it up front so the
   * zoom it reports is the zoom that gets rendered. Pinned as a list because a sixth
   * country appearing here means the geometry moved, not that the maths did.
   */
  const POLE_CLAMPED = ['USA', 'RUS', 'GRL', 'CAN', 'ATA'];

  it('is exactly getCountryCameraStop when the focus rect is the whole viewport', () => {
    const diverged: string[] = [];

    for (const iso3 of ALL_ISO3) {
      if (!getCountryBounds(iso3)) continue;

      // Both with minZoom 0, so nothing but the offset can differ - `centred` above
      // applies the viewport floor, which is exactly the thing not under test here.
      const shared = { bbox: boundsOf(iso3).bbox, viewport: PORTRAIT, minZoom: 0, maxZoom: 10 };
      const whole = getFocusedCameraStop({ ...shared, focus: { x: 0, y: 0, ...PORTRAIT } });
      const plain = getCountryCameraStop(shared);

      expect(whole.zoom).toBe(plain.zoom);
      expect(whole.center[0]).toBeCloseTo(plain.center[0], 9);
      if (Math.abs(whole.center[1] - plain.center[1]) > 1e-9) diverged.push(iso3);
    }

    expect(diverged).toEqual(POLE_CLAMPED);
  });
});

describe('the offset', () => {
  it('pushes the camera SOUTH in portrait, so the country sits above the sheet', () => {
    const stop = focused('FRA', PORTRAIT);
    const plain = centred('FRA', PORTRAIT);

    expect(stop.center[1]).toBeLessThan(plain.center[1]);
    expect(stop.center[0]).toBeCloseTo(plain.center[0], 9);
  });

  it('pushes the camera EAST in landscape, so the country sits left of the panel', () => {
    const stop = focused('FRA', LANDSCAPE);
    const plain = centred('FRA', LANDSCAPE);

    expect(stop.center[0]).toBeGreaterThan(plain.center[0]);
    // And NORTH, a little: the chrome row reserves the top of the map in both
    // orientations, so the visible band's centre is below the window's.
    expect(stop.center[1]).toBeGreaterThan(plain.center[1]);
  });

  it('never frames the country larger than the whole window would', () => {
    // Portrait strictly shrinks it: France's fit is height-limited and the sheet takes
    // 55% of the height. Landscape only narrows the rect, so a country whose fit is
    // still height-limited - France is - keeps the same zoom. Hence <= for the general
    // invariant and < for the case that must move.
    expect(focused('FRA', PORTRAIT).zoom).toBeLessThan(centred('FRA', PORTRAIT).zoom);

    for (const iso3 of ALL_ISO3) {
      if (!getCountryBounds(iso3)) continue;

      for (const viewport of [PORTRAIT, LANDSCAPE]) {
        expect(focused(iso3, viewport).zoom).toBeLessThanOrEqual(centred(iso3, viewport).zoom);
      }
    }
  });

  it('strictly shrinks a WIDE shape in landscape, where the panel takes the width', () => {
    // Landscape leaves the height alone, so only a shape whose fit is width-limited can
    // lose zoom to the side panel - and most countries are height-limited on a 914x411
    // window, Australia included. A synthetic bbox rather than a real country, so the
    // test says what it means and cannot be invalidated by a geometry update.
    const wide: [number, number, number, number] = [-20, 0, 20, 4];
    const shared = { bbox: wide, minZoom: 0, maxZoom: 10 };

    const full = getFocusedCameraStop({
      ...shared,
      viewport: LANDSCAPE,
      focus: { x: 0, y: 0, ...LANDSCAPE },
    });
    const beside = getFocusedCameraStop({
      ...shared,
      viewport: LANDSCAPE,
      focus: getMapFocusRect(LANDSCAPE),
    });

    expect(beside.zoom).toBeLessThan(full.zoom);
    // ...and the camera moved east to put it left of the panel.
    expect(beside.center[0]).toBeGreaterThan(full.center[0]);
  });

  it('puts France where the worked example says', () => {
    // Pinned rather than derived: this is the one case anyone can check by hand against
    // the arithmetic in CLAUDE.md, and a silent drift here is a silent drift everywhere.
    // No safe-area inset, so the band is y 60..380 of an 844 dp screen.
    const stop = focused('FRA', PORTRAIT);

    expect(stop.center[0]).toBeCloseTo(2.3965, 3);
    expect(stop.center[1]).toBeCloseTo(37.795, 2);
    expect(stop.zoom).toBeCloseTo(3.6, 1);
  });

  it('drops the country further down the screen on a notched phone', () => {
    // The chrome row sits below the status bar, so a taller inset pushes the whole band
    // down with it. 47 dp is the notch the RNTL suites model.
    const plain = focused('FRA', PORTRAIT);
    const notched = getFocusedCameraStop({
      bbox: boundsOf('FRA').bbox,
      viewport: PORTRAIT,
      focus: getMapFocusRect(PORTRAIT, 47),
      minZoom: getViewportFitZoom(PORTRAIT.width, PORTRAIT.height),
      maxZoom: 10,
    });

    expect(notched.center[1]).toBeLessThan(plain.center[1]);
  });
});

describe('the antimeridian', () => {
  it('keeps Fiji on its own side of the date line', () => {
    // The offset is added to the longitude before it is normalised, so a country already
    // near 180 can be pushed across it. Getting this wrong lands the camera in Africa.
    const stop = focused('FJI', PORTRAIT);

    expect(Math.abs(stop.center[0])).toBeGreaterThan(170);
    expect(stop.center[1]).toBeLessThan(0);
  });

  it('never returns a longitude outside [-180, 180]', () => {
    for (const iso3 of ALL_ISO3) {
      if (!getCountryBounds(iso3)) continue;

      for (const viewport of [PORTRAIT, LANDSCAPE]) {
        const stop = focused(iso3, viewport);
        expect(stop.center[0]).toBeGreaterThanOrEqual(-180);
        expect(stop.center[0]).toBeLessThanOrEqual(180);
      }
    }
  });
});

describe('the pole clamp', () => {
  /**
   * Why this exists, in one assertion.
   *
   * Russia's fit zoom is already at the floor, so the world is barely taller than the
   * screen and the 232 dp the offset wants is a large share of the entire globe. Without
   * the clamp the camera goes to latitude -54 and Russia leaves the top of the screen
   * altogether - the exact opposite of framing it.
   */
  it('refuses an offset that would show past a pole', () => {
    const stop = focused('RUS', PORTRAIT);

    expect(stop.center[1]).toBeCloseTo(0, 6);
    expect(stop.zoom).toBeCloseTo(getViewportFitZoom(PORTRAIT.width, PORTRAIT.height), 6);
  });

  it('still offsets a country that has room for it', () => {
    // Greenland is far north and large, and is the case that proves the clamp is a limit
    // rather than an off switch: it moves, just not all the way.
    const stop = focused('GRL', PORTRAIT);
    const plain = centred('GRL', PORTRAIT);

    expect(stop.center[1]).toBeLessThan(plain.center[1]);
    expect(stop.center[1]).toBeGreaterThan(0);
  });
});

describe('degenerate input', () => {
  it('survives a zero-sized bbox', () => {
    const stop = getFocusedCameraStop({
      bbox: [5, 5, 5, 5],
      viewport: PORTRAIT,
      focus: getMapFocusRect(PORTRAIT),
      minZoom: 0,
      maxZoom: 10,
    });

    expect(stop.zoom).toBe(10);
    expect(Number.isFinite(stop.center[0])).toBe(true);
    expect(Number.isFinite(stop.center[1])).toBe(true);
  });

  it('survives a zero-sized viewport', () => {
    // Reachable for one frame before the first layout pass, and a NaN centre reaching the
    // native camera blanks the map.
    const stop = getFocusedCameraStop({
      bbox: boundsOf('FRA').bbox,
      viewport: { width: 0, height: 0 },
      focus: { x: 0, y: 0, width: 0, height: 0 },
      minZoom: 0,
      maxZoom: 10,
    });

    expect(Number.isFinite(stop.zoom)).toBe(true);
    expect(Number.isFinite(stop.center[0])).toBe(true);
    expect(Number.isFinite(stop.center[1])).toBe(true);
  });

  it('never hands the renderer a value it cannot use, for any country', () => {
    for (const iso3 of ALL_ISO3) {
      if (!getCountryBounds(iso3)) continue;

      for (const viewport of [PORTRAIT, LANDSCAPE]) {
        const stop = focused(iso3, viewport);

        expect(Number.isFinite(stop.zoom)).toBe(true);
        expect(stop.zoom).toBeLessThanOrEqual(10);
        expect(Number.isFinite(stop.center[1])).toBe(true);
        expect(Math.abs(stop.center[1])).toBeLessThanOrEqual(85.051129);
      }
    }
  });
});
