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
import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import MapScreen from '@/app/index';

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

    expect(screen.queryByTestId('country-info-sheet')).toBeNull();
  });

  it('ignores a press that carries no feature', async () => {
    await render();
    await fireEvent(screen.getByTestId('countries-source'), 'press', {
      stopPropagation: jest.fn(),
      nativeEvent: { features: [] },
    });

    expect(screen.queryByTestId('country-info-sheet')).toBeNull();
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
