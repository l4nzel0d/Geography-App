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
import { fireEvent, render as rtlRender, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import MapScreen from '@/app/index';
import { DENSITY_RAMP, POPULATION_RAMP } from '@/map/choropleth';

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
