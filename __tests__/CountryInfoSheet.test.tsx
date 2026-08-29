/**
 * The info card's three size tiers, asserted on the rendered styles.
 *
 * `infoSheetLayout.test.ts` proves the arithmetic; this proves the card actually WEARS
 * it. That gap is not hypothetical - the desktop tier initially reached the panel width
 * and the title but only two of the five facts, because the flag was threaded by hand
 * through each call site and three were missed. Nothing in the pure test could have seen
 * that.
 */
import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { Dimensions, StyleSheet } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { CountryInfoSheet } from '@/components/CountryInfoSheet';
import { FLAG_ASPECTS } from '@/components/flagAspects';
import { FLAG_ASSETS } from '@/components/flagAssets';
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
  'fact-capital',
  'fact-population',
  'fact-currencies',
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

const sheet = (iso3: string | null) => (
  <SafeAreaProvider initialMetrics={METRICS}>
    {/* BRA has every fact populated, including a population year note. */}
    <CountryInfoSheet iso3={iso3} onClose={() => {}} />
  </SafeAreaProvider>
);

const renderSheet = () => rtlRender(sheet('BRA'));

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

/**
 * Tapping the header flag shows it full size.
 *
 * Everything here is about the ONE thing the feature exists for - the enlarged flag must
 * be the ~1024 px master, at that country's own shape - plus the two ways out. What Jest
 * cannot see is the thing worth checking on a device: that a `Modal` over the live
 * MapLibre surface actually PAINTS. See CLAUDE.md.
 */
describe('CountryInfoSheet flag lightbox', () => {
  const openLightbox = async () => {
    await renderSheet();
    await fireEvent.press(screen.getByTestId('open-flag-lightbox'));
  };

  /**
   * `country-flag-image` matches TWICE while the lightbox is up - the header thumb and the
   * master behind it - so this cannot use `getByTestId`. The master is the second, in tree
   * order, and `expo-image` normalises `source` into an array.
   */
  const enlargedFlagSource = () => {
    const images = screen.getAllByTestId('country-flag-image');
    const source = images[images.length - 1].props.source;
    return Array.isArray(source) ? source[0] : source;
  };

  it('stays closed until the flag is pressed', async () => {
    await renderSheet();

    expect(screen.queryByTestId('flag-lightbox-frame')).toBeNull();
  });

  it('opens on a press of the header flag', async () => {
    await openLightbox();

    expect(screen.getByTestId('flag-lightbox-frame')).toBeTruthy();
  });

  /*
    The whole point of the feature. The header draws the 96 px thumb, and an enlarged flag
    that is still the thumb blown up to 500 dp is the regression this pins against -
    `CountryFlag`'s `fill` prop is the switch between the two committed tiers.
  */
  it('enlarges the 1024 px master, not the row-sized thumb', async () => {
    await openLightbox();

    expect(enlargedFlagSource()).toBe(FLAG_ASSETS.br);
  });

  // Against the generated table rather than a literal: the shapes come from the images
  // themselves, so a literal here would only be a second thing to keep in step.
  it('gives the frame the shape of THIS flag', async () => {
    await openLightbox();

    expect(styleOf(screen.getByTestId('flag-lightbox-frame')).aspectRatio).toBe(
      FLAG_ASPECTS.br,
    );
  });

  it('dismisses on a tap outside the flag', async () => {
    await openLightbox();
    await fireEvent.press(screen.getByTestId('flag-lightbox-scrim'));

    expect(screen.queryByTestId('flag-lightbox-frame')).toBeNull();
  });

  /*
    Android's back key. The Modal holds window focus, so it never reaches the screen
    underneath - without this wired the flag would be closable only by tapping the scrim.
    Asserted as a prop for the same reason `MapScreen.test.tsx` guards `icon-padding`:
    nothing in Jest delivers a real back press.
  */
  it('closes on Android back', async () => {
    await openLightbox();
    await fireEvent(screen.getByTestId('flag-lightbox'), 'requestClose');

    expect(screen.queryByTestId('flag-lightbox-frame')).toBeNull();
  });

  /*
    Selecting another country while the flag is up must not leave Brazil's flag over
    France's card. The same effect covers the selection being cleared, which is what
    Escape does on the web through `MapScreen`'s `useDismissKey`.
  */
  it('closes when a different country is selected', async () => {
    const view = await renderSheet();
    await fireEvent.press(screen.getByTestId('open-flag-lightbox'));
    await view.rerender(sheet('FRA'));

    expect(screen.queryByTestId('flag-lightbox-frame')).toBeNull();
  });

  /*
    BES is the only record with no flag at all. There is nothing to enlarge, so there is no
    control either - rather than a button that opens an empty frame.
  */
  it('is not offered for a country with no flag', async () => {
    await rtlRender(sheet('BES'));

    expect(screen.queryByTestId('open-flag-lightbox')).toBeNull();
  });
});
