/**
 * Selection wiring: a press on the map source must drive the info sheet.
 *
 * The native map is replaced by `__mocks__/@maplibre/maplibre-react-native.tsx`, so
 * what is under test here is our own plumbing - feature -> iso3 -> facts -> UI - not
 * MapLibre itself.
 *
 * Note: React Native Testing Library v14 made `render` and `fireEvent` async. They
 * must be awaited or `screen` is never populated.
 */
import { act, fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import MapScreen from '@/app/index';
import { PORTRAIT_MAX_HEIGHT_FRACTION } from '@/components/infoSheetLayout';
import { getWorldFitZoom } from '@/map/cameraFit';
import { getCountryBounds } from '@/map/countryBounds';
import { getCountryCameraStop } from '@/map/quizCamera';
import { DENSITY_RAMP, POPULATION_RAMP } from '@/map/choropleth';
import { INITIAL_CENTER, INITIAL_ZOOM } from '@/map/WorldMap';
import { selectCountry } from '@/search/pendingCountry';

/**
 * `_layout.tsx` supplies the SafeAreaProvider in the real app; these tests render
 * the screen in isolation, so they have to stand one up with fixed metrics (the
 * provider otherwise measures asynchronously and yields nothing under Jest).
 */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const render = () =>
  rtlRender(
    <SafeAreaProvider initialMetrics={METRICS}>
      <MapScreen />
    </SafeAreaProvider>,
  );

/**
 * Synthetic source-press. `stopPropagation` is part of the real contract: MapLibre
 * bubbles source presses up to Map.onPress, and WorldMap must stop that or the ocean
 * handler clears the selection the instant it is made.
 */
const countryPressEvent = (iso3: string) => ({
  stopPropagation: jest.fn(),
  nativeEvent: { features: [{ properties: { iso3, name: iso3 } }] },
});

const pressCountry = (iso3: string) =>
  fireEvent(screen.getByTestId('countries-source'), 'press', countryPressEvent(iso3));

/** The fill mode control is a three-way segmented group, one testID per segment. */
const selectMode = (mode: 'flat' | 'population' | 'density') =>
  fireEvent.press(screen.getByTestId(`mode-${mode}`));

const fillColor = () => screen.getByTestId('layer-country-fill').props.paint['fill-color'];

describe('MapScreen', () => {
  it('shows no info sheet until a country is pressed', async () => {
    await render();
    expect(screen.queryByTestId('country-info-sheet')).toBeNull();
  });

  it('opens the info sheet with the pressed country facts', async () => {
    await render();
    await pressCountry('BRA');

    expect(screen.getByTestId('country-info-sheet')).toBeTruthy();
    expect(screen.getByTestId('country-name')).toHaveTextContent('Brazil');
    expect(screen.getByTestId('fact-population')).toHaveTextContent(/[\d,]{7,}/);
    // Regex rather than a string: each Fact renders its label alongside its value,
    // and v14's toHaveTextContent matches the concatenation exactly.
    expect(screen.getByTestId('fact-currencies')).toHaveTextContent(
      /Brazilian real \(BRL, R\$\)/,
    );
    expect(screen.getByTestId('fact-languages')).toHaveTextContent(/Portuguese/);
  });

  it('swaps content when a different country is pressed', async () => {
    await render();
    await pressCountry('BRA');
    await pressCountry('JPN');

    expect(screen.getByTestId('country-name')).toHaveTextContent('Japan');
    expect(screen.queryByText('Brazil')).toBeNull();
  });

  it('highlights the selected country via the filtered layer', async () => {
    await render();
    await pressCountry('BRA');

    expect(screen.getByTestId('layer-country-selected').props.filter).toEqual([
      '==',
      ['get', 'iso3'],
      'BRA',
    ]);
  });

  it('covers exactly the share of the screen the camera reserves for it', async () => {
    // The drift guard. `getMapFocusRect` frames a searched country into the height this
    // card does NOT take, and the two only agree because both derive from one constant.
    // Re-hardcoding '55%' here would leave the camera framing into a gap that no longer
    // exists, and nothing else in the suite would notice.
    await render();
    await pressCountry('BRA');

    const style = StyleSheet.flatten(screen.getByTestId('country-info-sheet').props.style);
    expect(style.maxHeight).toBe(`${PORTRAIT_MAX_HEIGHT_FRACTION * 100}%`);
  });

  it('closes the sheet via the close button', async () => {
    await render();
    await pressCountry('BRA');
    await fireEvent.press(screen.getByTestId('close-info-sheet'));

    // The card slides out rather than vanishing, so it stays mounted - and stops
    // taking touches - for the duration of the animation, and unmounts only once
    // the animation reports finished.
    const sheet = screen.getByTestId('country-info-sheet');
    expect(sheet.props.pointerEvents).toBe('none');
    await waitFor(() => expect(screen.queryByTestId('country-info-sheet')).toBeNull());
  });

  it('ignores a press that carries no feature', async () => {
    await render();
    await fireEvent(screen.getByTestId('countries-source'), 'press', {
      stopPropagation: jest.fn(),
      nativeEvent: { features: [] },
    });

    expect(screen.queryByTestId('country-info-sheet')).toBeNull();
  });

  /**
   * The legend is deliberately mounted from startup and slid off-screen when hidden -
   * conditionally rendering it means it never paints over the map at all. So presence
   * says nothing; `accessibilityElementsHidden` is what tracks visibility.
   */
  const legend = () =>
    // `includeHiddenElements` is required: RNTL hides accessibility-hidden nodes from
    // queries by default, and the legend marks itself hidden while it is parked.
    screen.getByTestId('choropleth-legend', { includeHiddenElements: true });

  const legendShown = () => legend().props.accessibilityElementsHidden === false;

  it('starts on the flat basemap with the legend hidden', async () => {
    await render();

    expect(fillColor()).toBe('#7d9b76');
    expect(legendShown()).toBe(false);
  });

  it('paints the population ramp and shows its legend', async () => {
    await render();
    await selectMode('population');

    expect(fillColor()).toEqual(POPULATION_RAMP.fillColor);
    expect(legendShown()).toBe(true);
    // Regex, not a string: the legend renders its title, every axis label and the
    // no-data key, and v14's toHaveTextContent matches the concatenation exactly.
    expect(legend()).toHaveTextContent(/People per country/);
  });

  it('paints the density ramp and retitles the legend', async () => {
    await render();
    await selectMode('density');

    expect(fillColor()).toEqual(DENSITY_RAMP.fillColor);
    expect(legendShown()).toBe(true);
    expect(legend()).toHaveTextContent(/People per km²/);
  });

  it('reads density from its own feature property, not population', async () => {
    // The two ramps differ only in the property they read and the colours they emit.
    // Painting density off `population` would look plausible and be silently wrong.
    await render();
    await selectMode('density');

    const expression = fillColor() as unknown[];
    expect(expression[1]).toEqual(['has', 'density']);
    expect((expression[2] as unknown[])[2]).toEqual(['log10', ['get', 'density']]);
  });

  it('switches straight from one ramp to the other', async () => {
    await render();
    await selectMode('population');
    await selectMode('density');

    expect(fillColor()).toEqual(DENSITY_RAMP.fillColor);
    expect(legendShown()).toBe(true);
  });

  it('keeps the legend mounted while it is hidden', async () => {
    // Regression guard for the bug that cost the most time on this feature: a view
    // inserted over the MapLibre surface after the initial mount never gets drawn.
    await render();
    expect(
      screen.queryByTestId('choropleth-legend', { includeHiddenElements: true }),
    ).not.toBeNull();
  });

  it('keeps showing the ramp it was on while the legend slides out', async () => {
    // The legend outlives the mode that opened it. Blanking the content on the frame
    // the mode changes would empty the card for the whole 800ms slide.
    await render();
    await selectMode('density');
    await selectMode('flat');

    expect(legendShown()).toBe(false);
    expect(legend()).toHaveTextContent(/People per km²/);
  });

  it('toggles back to the flat basemap', async () => {
    await render();
    await selectMode('population');
    await selectMode('flat');

    expect(fillColor()).toBe('#7d9b76');
    expect(legendShown()).toBe(false);
  });

  it.each(['population', 'density'] as const)(
    'marks the selection with an outline instead of a fill in %s mode',
    async (mode) => {
      // A solid orange fill would hide the very colour you tapped the country to read.
      // Both layers stay mounted; only one is handed the iso3.
      await render();
      await pressCountry('BRA');
      await selectMode(mode);

      expect(screen.getByTestId('layer-country-selected').props.filter).toEqual([
        '==',
        ['get', 'iso3'],
        '',
      ]);
      expect(screen.getByTestId('layer-country-selected-outline').props.filter).toEqual([
        '==',
        ['get', 'iso3'],
        'BRA',
      ]);
    },
  );

  it('draws the outline over a casing, so it reads at both ends of the ramp', async () => {
    // A white line vanishes on a low-population country and a dark one vanishes on
    // China. The casing must be the wider of the two and must track the same country.
    await render();
    await selectMode('population');
    await pressCountry('BRA');

    const casing = screen.getByTestId('layer-country-selected-casing').props;
    const outline = screen.getByTestId('layer-country-selected-outline').props;

    expect(casing.filter).toEqual(outline.filter);
    expect(casing.paint['line-width']).toBeGreaterThan(outline.paint['line-width']);
  });

  it('keeps the selection working while a choropleth is on', async () => {
    await render();
    await selectMode('density');
    await pressCountry('JPN');

    expect(screen.getByTestId('country-name')).toHaveTextContent('Japan');
  });

  it('stops the source press from bubbling to the ocean handler', async () => {
    // Regression guard. Without stopPropagation, Map.onPress fires straight after
    // the source press and deselects the country that was just selected, so nothing
    // ever appears. Only reproducible on a device, hence this explicit assertion.
    await render();
    const event = countryPressEvent('BRA');
    await fireEvent(screen.getByTestId('countries-source'), 'press', event);

    expect(event.stopPropagation).toHaveBeenCalled();
  });
});

/**
 * Explore mode's camera moves for a SEARCH, and for nothing else.
 *
 * The three coordinate Maestro flows tap the map by screen percentage, and those
 * percentages are only meaningful because the camera sits at INITIAL_CENTER from launch
 * until the user actually asks for something. This block used to say "never given a
 * stop", which search made false; the property worth protecting was never "no stop", it
 * was "no stop the user did not ask for". So: nothing on launch, nothing on a tap, and a
 * stop only when a search hands one over - none of which any other test would notice, and
 * each of which silently breaks every coordinate tap.
 */
describe('the explore camera', () => {
  it('is given no stop on launch', async () => {
    await render();
    const camera = screen.getByTestId('map-camera');

    expect(camera.props.center).toBeUndefined();
    expect(camera.props.zoom).toBeUndefined();
    expect(camera.props.bounds).toBeUndefined();
    expect(camera.props.duration).toBeUndefined();
  });

  it('is given no stop when a country is pressed on the map', async () => {
    // A tap highlights; it must never fly. This is the assertion the three coordinate
    // flows actually depend on.
    await render();
    await pressCountry('BRA');

    expect(screen.getByTestId('map-camera').props.center).toBeUndefined();
  });

  it('flies to a country handed over by search, framed clear of the info sheet', async () => {
    await render();
    await act(async () => selectCountry('FRA'));

    const camera = screen.getByTestId('map-camera');
    const bounds = getCountryBounds('FRA');
    const window = Dimensions.get('window');
    const centred = getCountryCameraStop({
      bbox: bounds!.bbox,
      viewport: window,
      minZoom: 0,
      maxZoom: 10,
    });

    // Jest's window is 750x1334, i.e. portrait, so the sheet docks to the BOTTOM and the
    // country is framed above it: same longitude, camera pushed SOUTH of the country so
    // the country renders in the upper part of the screen.
    expect(camera.props.center[0]).toBeCloseTo(centred.center[0], 6);
    expect(camera.props.center[1]).toBeLessThan(centred.center[1]);

    // ...and it is framed smaller than it would be with the whole window to play with,
    // because it has to fit the 45% the sheet leaves.
    expect(camera.props.zoom).toBeLessThan(centred.zoom);
    expect(camera.props.duration).toBe(900);
    expect(screen.getByTestId('country-name')).toHaveTextContent('France');
  });

  it('never withdraws a stop it has already given', async () => {
    // Handing `camera` back as undefined would take the native stop from
    // {center, zoom, duration, easing} to {} - a real prop change pushed into a renderer
    // Jest replaces with a stub, so this is the only place it can be caught. Tapping
    // another country must leave the stop exactly as it was.
    await render();
    await act(async () => selectCountry('FRA'));
    const before = screen.getByTestId('map-camera').props.center;

    await pressCountry('BRA');

    expect(screen.getByTestId('map-camera').props.center).toBe(before);
  });

  it('flies again when the same country is searched twice', async () => {
    // The stop is recomputed from a nonce precisely so an identical destination is still
    // a change. Without it, searching Brazil, panning away and searching Brazil again
    // does nothing at all.
    await render();
    await act(async () => selectCountry('FRA'));
    const first = screen.getByTestId('map-camera').props.center;

    await pressCountry('BRA');
    await act(async () => selectCountry('FRA'));

    const second = screen.getByTestId('map-camera').props.center;
    expect(second).not.toBe(first);
    expect(second).toEqual(first);
  });

  it('still starts at the pinned initial view', async () => {
    await render();
    const camera = screen.getByTestId('map-camera');

    // The zoom is derived from the window rather than pinned - `getWorldFitZoom` returns
    // exactly INITIAL_ZOOM in portrait and more in landscape, and Jest's default window
    // is wider than it is tall, so this asserts the rule rather than one of its values.
    const fitZoom = getWorldFitZoom(Dimensions.get('window').width);
    expect(camera.props.initialViewState).toEqual({ center: INITIAL_CENTER, zoom: fitZoom });
    expect(camera.props.minZoom).toBe(fitZoom);
    expect(camera.props.maxZoom).toBe(10);
    expect(getWorldFitZoom(390)).toBe(INITIAL_ZOOM);
  });

  it('keeps the map tappable, unlike the quiz map', async () => {
    await render();
    expect(screen.getByTestId('world-map').props.onPress).toEqual(expect.any(Function));
  });
});
