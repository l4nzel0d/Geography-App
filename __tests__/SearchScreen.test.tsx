/**
 * The search route's wiring: query in, results out, and the handover to the map.
 *
 * What Jest cannot see is whether any of it PAINTS, which is what
 * `.maestro/search-country.yaml` exists for. What it can see - and what breaks silently
 * otherwise - is the handover contract: the map is told the country BEFORE the screen
 * navigates away, and cancelling tells it nothing at all.
 *
 * Note this screen is the one place in the app where ordinary conditional rendering is
 * correct. The always-mounted, park-it-off-screen discipline everywhere else exists only
 * because those views share a window with a live MapLibre surface; this route has no map,
 * so the tests query normally and do not pass `includeHiddenElements`.
 */
import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import SearchScreen from '@/app/search';
import { subscribeToCountrySelection } from '@/search/pendingCountry';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/** Prefixed `mock` because `jest.mock` is hoisted above these declarations. */
const mockBack = jest.fn();
const mockReplace = jest.fn();
/**
 * Whether there is anything to go back TO. False is the web case that matters: every
 * route is a real URL in the static export, so `/search` can be opened directly.
 */
let mockCanGoBack = true;

jest.mock('expo-router', () => ({
  router: {
    back: () => mockBack(),
    replace: (href: string) => mockReplace(href),
    canGoBack: () => mockCanGoBack,
    push: jest.fn(),
  },
}));

beforeEach(() => {
  mockCanGoBack = true;
  mockReplace.mockClear();
});

const render = () =>
  rtlRender(
    <SafeAreaProvider initialMetrics={METRICS}>
      <SearchScreen />
    </SafeAreaProvider>,
  );

const type = (text: string) =>
  fireEvent.changeText(screen.getByTestId('country-search-input'), text);

beforeEach(() => {
  mockBack.mockClear();
});

describe('the results list', () => {
  it('opens on the whole world, before anything is typed', async () => {
    // An empty query is not an empty screen: the list doubles as a browsable index, and
    // 237 rows is nothing for a FlatList.
    await render();

    expect(screen.getByTestId('country-result-AFG')).toBeTruthy();
    expect(screen.queryByTestId('country-search-empty')).toBeNull();
  });

  it('narrows as you type', async () => {
    await render();
    await type('germ');

    expect(screen.getByTestId('country-result-DEU')).toBeTruthy();
    expect(screen.queryByTestId('country-result-AFG')).toBeNull();
  });

  it('shows which alias matched', async () => {
    await render();
    await type('holland');

    expect(screen.getByTestId('country-result-NLD')).toHaveTextContent(/Holland/);
  });

  it('says so when nothing matches, and quotes what was typed', async () => {
    await render();
    await type('qqqzzz');

    expect(screen.getByTestId('country-search-empty')).toHaveTextContent(/qqqzzz/);
    expect(screen.queryByTestId('country-result-DEU')).toBeNull();
  });

  it('restores the full list when the query is cleared', async () => {
    await render();
    await type('germ');
    await fireEvent.press(screen.getByTestId('country-search-clear'));

    expect(screen.getByTestId('country-search-input').props.value).toBe('');
    expect(screen.getByTestId('country-result-AFG')).toBeTruthy();
  });

  it('offers no clear button until there is something to clear', async () => {
    await render();
    expect(screen.queryByTestId('country-search-clear')).toBeNull();
  });

  it('keeps the IME out of fullscreen mode', async () => {
    // Found on the emulator, not in a test: in landscape Android decides the field has
    // too little vertical room and replaces the ENTIRE screen with its own extract
    // editor - a white full-screen box and a SEARCH button - with the results list
    // nowhere to be seen. Jest cannot see that happen, so this asserts the one prop that
    // prevents it, which is the next best thing.
    await render();
    expect(screen.getByTestId('country-search-input').props.disableFullscreenUI).toBe(true);
  });
});

describe('the handover', () => {
  it('announces the country and only then navigates back', async () => {
    // Order matters: MapScreen is still mounted underneath, so telling it first means the
    // highlight and the camera fly start while this screen is sliding away.
    const order: string[] = [];
    const unsubscribe = subscribeToCountrySelection((iso3) => order.push(`select:${iso3}`));
    mockBack.mockImplementation(() => order.push('back'));

    await render();
    await type('nether');
    await fireEvent.press(screen.getByTestId('country-result-NLD'));

    expect(order).toEqual(['select:NLD', 'back']);
    unsubscribe();
  });

  it('dismisses the keyboard, so the IME does not linger over the map', async () => {
    const dismiss = jest.spyOn(Keyboard, 'dismiss');

    await render();
    await type('nether');
    await fireEvent.press(screen.getByTestId('country-result-NLD'));

    expect(dismiss).toHaveBeenCalled();
    dismiss.mockRestore();
  });

  it('tells the map nothing when the search is cancelled', async () => {
    // The guard against a stale fly: backing out must leave the camera where it is.
    const listener = jest.fn();
    const unsubscribe = subscribeToCountrySelection(listener);

    await render();
    await fireEvent.press(screen.getByTestId('country-search-cancel'));

    expect(mockBack).toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('stops notifying once unsubscribed', async () => {
    const listener = jest.fn();
    subscribeToCountrySelection(listener)();

    await render();
    await type('nether');
    await fireEvent.press(screen.getByTestId('country-result-NLD'));

    expect(listener).not.toHaveBeenCalled();
  });
});

/**
 * Arriving directly at `/search` - a bookmark, a shared link, a new tab. Only reachable
 * on the web, where `web.output: "static"` gives every route its own HTML file, but the
 * guard is platform-free so it is tested once here.
 */
describe('when there is no history to go back to', () => {
  it('goes home rather than doing nothing at all', async () => {
    mockCanGoBack = false;
    await render();

    await fireEvent.press(screen.getByTestId('country-search-cancel'));

    expect(mockBack).not.toHaveBeenCalled();
    // `replace`, not `push`: the dead-end screen should not stay behind the map for a
    // second Back press to land on again.
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('still hands the country over before leaving', async () => {
    mockCanGoBack = false;
    const seen: (string | null)[] = [];
    const stop = subscribeToCountrySelection((iso3) => seen.push(iso3));

    await render();
    await type('nether');
    await fireEvent.press(screen.getByTestId('country-result-NLD'));

    expect(seen).toEqual(['NLD']);
    expect(mockReplace).toHaveBeenCalledWith('/');
    stop();
  });
});
