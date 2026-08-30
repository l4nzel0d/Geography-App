/**
 * The About route: that every credit the licences require actually reaches the screen,
 * and that it survives a language change.
 *
 * The point of this suite is narrow and worth stating. Three of these sources are
 * credited as a **condition of use** - ODbL for the country facts, CC BY for the
 * population figures, OFL for the bundled typeface - so a credit silently dropped from
 * the list is a licence breach rather than a cosmetic bug, and nothing else in the app
 * would notice. The list is therefore driven off `credits.ts` rather than retyped here:
 * a test carrying its own copy of the names would pass while the screen rendered none.
 *
 * Queries go through `within(row)` and match a whole `Text` node exactly, rather than
 * asserting a substring of the row. That is deliberate: `toHaveTextContent` compares
 * against the node's WHOLE concatenated text, so the loose version of this test would
 * have to build an escaped regex per credit, and the strict version says something
 * stronger anyway - that the name and the licence are their own elements.
 *
 * Like `/search` and `/quiz`, this route has no map on it, so queries are ordinary and do
 * not pass `includeHiddenElements`.
 */
import Constants from 'expo-constants';
import { fireEvent, render as rtlRender, screen, within } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import AboutScreen from '@/app/about';
import { ALL_CREDITS, DATA_CREDITS, labelText, SOFTWARE_CREDITS } from '@/about/credits';
import { __resetLocale, setLocale } from '@/i18n/locale';
import { translate, translatorFor } from '@/i18n/t';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * The manifest is absent under jest-expo, so the version has to be supplied here - and
 * supplying it is the point: the screen drops the line entirely when there is no version,
 * and a guard nothing exercises is a guard nobody knows is inverted.
 */
let mockExpoConfig: { version?: string } | null = { version: '9.9.9' };

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return mockExpoConfig;
    },
  },
}));

/** Prefixed `mock` because `jest.mock` is hoisted above these declarations. */
const mockBack = jest.fn();
const mockReplace = jest.fn();
/**
 * Whether there is anything to go back TO. False is the web case that matters: the static
 * export makes `/about` a real URL, so it can be opened directly with no history behind
 * it - which is the case `goBack` exists for.
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
  mockExpoConfig = { version: '9.9.9' };
  mockBack.mockClear();
  mockReplace.mockClear();
});

const render = () =>
  rtlRender(
    <SafeAreaProvider initialMetrics={METRICS}>
      <AboutScreen />
    </SafeAreaProvider>,
  );

const creditRow = (id: string) => screen.getByTestId('about-credit-' + id);

describe('the about screen', () => {
  it('shows every credit, with its name and its licence', async () => {
    await render();

    for (const credit of ALL_CREDITS) {
      const row = creditRow(credit.id);
      const en = translatorFor('en');
      expect(within(row).getByText(labelText(credit.name, en))).toBeTruthy();
      expect(within(row).getByText(labelText(credit.licence, en))).toBeTruthy();
      expect(within(row).getByText(translate('en', credit.roleKey))).toBeTruthy();
    }
  });

  /**
   * The three that are not optional. Named individually rather than left to the sweep
   * above, so deleting one from `credits.ts` fails with the obligation in the test name
   * rather than as an anonymous count mismatch.
   */
  it('credits the three sources whose licences require it', async () => {
    await render();

    expect(within(creditRow('world-countries')).getByText('ODbL 1.0')).toBeTruthy();
    expect(within(creditRow('world-bank')).getByText('CC BY 4.0')).toBeTruthy();
    expect(within(creditRow('noto-sans')).getByText('SIL OFL 1.1')).toBeTruthy();
  });

  /** ODbL asks for more than a name: a derived database carries the licence onward. */
  it('carries the share-alike notice on the ODbL entry', async () => {
    await render();

    const notice = translate('en', 'about.credit.worldCountries.notice');
    expect(within(creditRow('world-countries')).getByText(notice)).toBeTruthy();
  });

  it('names the app and its version', async () => {
    await render();

    expect(screen.getByTestId('about-app-name')).toHaveTextContent(
      translate('en', 'app.name'),
    );
    expect(screen.getByTestId('about-version')).toHaveTextContent(
      translate('en', 'about.version', { version: '9.9.9' }),
    );
  });

  /**
   * A missing version drops the line rather than rendering "Version" trailing off into
   * nothing. Reachable wherever the manifest is stripped - which is exactly the state
   * every other test in this file runs in.
   */
  it('omits the version line when the manifest carries none', async () => {
    mockExpoConfig = null;
    await render();

    expect(screen.queryByTestId('about-version')).toBeNull();
    expect(screen.getByTestId('about-app-name')).toBeTruthy();
  });

  it('goes back to the map', async () => {
    await render();
    await fireEvent.press(screen.getByTestId('about-close'));

    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  /** Opened directly as a URL by the static web export, with no history behind it. */
  it('falls back to the map when there is nothing to go back to', async () => {
    mockCanGoBack = false;
    await render();
    await fireEvent.press(screen.getByTestId('about-close'));

    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  describe('in Russian', () => {
    beforeEach(() => {
      setLocale('ru');
    });
    afterEach(() => {
      __resetLocale('en');
    });

    it('translates the headings and every role line', async () => {
      await render();

      expect(screen.getByTestId('about-title')).toHaveTextContent(
        translate('ru', 'about.title'),
      );
      expect(screen.getByText(translate('ru', 'about.section.data'))).toBeTruthy();

      for (const credit of ALL_CREDITS) {
        const role = translate('ru', credit.roleKey);
        expect(within(creditRow(credit.id)).getByText(role)).toBeTruthy();
      }
    });

    /**
     * The distinction the `Label` union exists to keep, checked in the language that can
     * see it. An identifier is the same string in Russian; a description is not.
     *
     * This shipped wrong once: `name` and `licence` were plain strings, so the flag
     * artwork read "National flags" and two rows read "Public domain" on an otherwise
     * fully Russian screen. Found by looking at the screen, not by a test - hence this
     * one.
     */
    it('renders identifiers verbatim and descriptions through the catalogue', async () => {
      await render();
      const ru = translatorFor('ru');

      for (const credit of ALL_CREDITS) {
        const row = creditRow(credit.id);
        expect(within(row).getByText(labelText(credit.name, ru))).toBeTruthy();
        expect(within(row).getByText(labelText(credit.licence, ru))).toBeTruthy();
      }

      // The identifiers, unchanged - these are the same worldwide.
      expect(within(creditRow('world-countries')).getByText('ODbL 1.0')).toBeTruthy();
      expect(within(creditRow('maplibre')).getByText('MapLibre')).toBeTruthy();

      // The descriptions, translated - and gone in their English form.
      // Two rows carry it - Natural Earth and the flags - so it is deliberately shared
      // from one constant rather than spelled twice.
      expect(screen.getAllByText(translate('ru', 'about.licence.publicDomain'))).toHaveLength(2);
      expect(screen.queryByText('Public domain')).toBeNull();
      expect(screen.queryByText('National flags')).toBeNull();
    });
  });
});

describe('the credit list', () => {
  it('gives every credit a unique id, so no row can silently replace another', () => {
    const ids = ALL_CREDITS.map((credit) => credit.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is exactly the two sections the screen renders', () => {
    expect(ALL_CREDITS).toEqual([...DATA_CREDITS, ...SOFTWARE_CREDITS]);
  });
});
