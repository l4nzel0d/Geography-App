/**
 * The info card's three size tiers, asserted on the rendered styles.
 *
 * `infoSheetLayout.test.ts` proves the arithmetic; this proves the card actually WEARS
 * it. That gap is not hypothetical - the desktop tier initially reached the panel width
 * and the title but only two of the five facts, because the flag was threaded by hand
 * through each call site and three were missed. Nothing in the pure test could have seen
 * that.
 */
import { render as rtlRender, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { CountryInfoSheet } from '@/components/CountryInfoSheet';
import {
  DESKTOP_PANEL_MAX_WIDTH,
  PANEL_MAX_WIDTH,
  getInfoSheetLayout,
} from '@/components/infoSheetLayout';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const FACT_IDS = [
  'fact-population',
  'fact-currencies',
  'fact-capital',
  'fact-area',
] as const;

/** Pretend the window is this size for the duration of one render. */
function withWindow(width: number, height: number) {
  jest.spyOn(Dimensions, 'get').mockImplementation((dim) =>
    dim === 'window'
      ? { width, height, scale: 2, fontScale: 1 }
      : { width, height, scale: 2, fontScale: 1 },
  );
}

const renderSheet = () =>
  rtlRender(
    <SafeAreaProvider initialMetrics={METRICS}>
      {/* BRA has every fact populated, including a population year note. */}
      <CountryInfoSheet iso3="BRA" onClose={() => {}} />
    </SafeAreaProvider>,
  );

/** The flattened style of a rendered element, with conditional entries resolved. */
const styleOf = (element: { props: { style?: unknown } }) =>
  StyleSheet.flatten(element.props.style) as Record<string, number | string>;

const fontSizeOfFactValue = (testID: string) =>
  // Children are [label, value] and optionally a note; the value is the second Text.
  styleOf(screen.getByTestId(testID).children[1] as never).fontSize;

afterEach(() => jest.restoreAllMocks());

describe('CountryInfoSheet sizing', () => {
  it('uses the phone side panel in landscape below the desktop tier', async () => {
    withWindow(891, 411);
    await renderSheet();

    expect(styleOf(screen.getByTestId('country-info-sheet')).width).toBe(PANEL_MAX_WIDTH);
    expect(styleOf(screen.getByText('Brazil')).fontSize).toBe(22);
  });

  it('widens the panel and the type on a desktop window', async () => {
    withWindow(1920, 1080);
    await renderSheet();

    expect(styleOf(screen.getByTestId('country-info-sheet')).width).toBe(
      DESKTOP_PANEL_MAX_WIDTH,
    );
    expect(styleOf(screen.getByText('Brazil')).fontSize).toBe(28);
  });

  it('scales EVERY fact, not just the ones someone remembered to pass a prop to', async () => {
    withWindow(1920, 1080);
    await renderSheet();

    for (const id of FACT_IDS) {
      expect(fontSizeOfFactValue(id)).toBe(20);
    }
  });

  it('leaves every fact at the phone size below the desktop tier', async () => {
    withWindow(891, 411);
    await renderSheet();

    for (const id of FACT_IDS) {
      expect(fontSizeOfFactValue(id)).toBe(16);
    }
  });

  it('has no width in portrait, where the sheet spans the screen', async () => {
    withWindow(411, 891);
    await renderSheet();

    expect(getInfoSheetLayout({ width: 411, height: 891 }).panelWidth).toBeNull();
    expect(styleOf(screen.getByTestId('country-info-sheet')).width).toBeUndefined();
  });
});
