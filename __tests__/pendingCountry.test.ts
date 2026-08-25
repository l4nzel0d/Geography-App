/**
 * The search-to-map handover, including the deep-link case the web target introduced.
 */
import { selectCountry, subscribeToCountrySelection } from '@/search/pendingCountry';

/** Drain anything a previous test left buffered, so cases cannot leak into each other. */
afterEach(() => subscribeToCountrySelection(() => {})());

describe('the normal path, with the map already mounted', () => {
  it('delivers the pick synchronously', () => {
    const seen: string[] = [];
    const stop = subscribeToCountrySelection((iso3) => seen.push(iso3));

    selectCountry('NLD');

    expect(seen).toEqual(['NLD']);
    stop();
  });

  it('stops delivering once unsubscribed', () => {
    const seen: string[] = [];
    subscribeToCountrySelection((iso3) => seen.push(iso3))();

    selectCountry('FRA');

    expect(seen).toEqual([]);
  });
});

describe('the deep-link path, where the map is not mounted yet', () => {
  it('holds the pick for the next subscriber', () => {
    // Nobody is listening: `/search` was opened directly, so leaving it replaces the
    // route and MapScreen only mounts afterwards.
    selectCountry('JPN');

    const seen: string[] = [];
    const stop = subscribeToCountrySelection((iso3) => seen.push(iso3));

    expect(seen).toEqual(['JPN']);
    stop();
  });

  it('is consumed once, so a back gesture cannot resurrect it', () => {
    selectCountry('JPN');

    subscribeToCountrySelection(() => {})();

    const second: string[] = [];
    const stop = subscribeToCountrySelection((iso3) => second.push(iso3));

    expect(second).toEqual([]);
    stop();
  });

  it('keeps only the most recent pick', () => {
    selectCountry('JPN');
    selectCountry('FRA');

    const seen: string[] = [];
    const stop = subscribeToCountrySelection((iso3) => seen.push(iso3));

    expect(seen).toEqual(['FRA']);
    stop();
  });

  it('does not buffer when someone IS listening', () => {
    const live: string[] = [];
    const stopLive = subscribeToCountrySelection((iso3) => live.push(iso3));

    selectCountry('BRA');
    stopLive();

    // A later subscriber must not receive the already-delivered pick.
    const later: string[] = [];
    const stop = subscribeToCountrySelection((iso3) => later.push(iso3));

    expect(live).toEqual(['BRA']);
    expect(later).toEqual([]);
    stop();
  });
});
