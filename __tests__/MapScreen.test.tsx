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
import { DENSITY_RAMP, MASTERY_RAMP, POPULATION_RAMP } from '@/map/choropleth';
import { MAP_FLAG_IMAGES } from '@/map/mapFlagImages';
import { FLAG_ICON_PROPERTY, type LabelField } from '@/map/mapLabels';
import { INITIAL_CENTER, INITIAL_ZOOM } from '@/map/WorldMap';
import { selectCountry } from '@/search/pendingCountry';
import { worldGeoJson } from '@/data/worldGeoJson';
import { publishMastery, recordResult, __resetMasteryStore } from '@/mastery/masteryStore';
import { setLocale, __resetLocale } from '@/i18n/locale';

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
  fireEvent(screen.getByTestId('source-countries'), 'press', countryPressEvent(iso3));

/**
 * The fill mode control is a pill that opens a panel, so choosing a mode is two presses.
 *
 * It used to be a three-segment group, and had to stop being one: with the label pill
 * added, the two rows of chrome were wider than the screen and overlapped. See
 * `MapControls.tsx`.
 *
 * The panel is always mounted and merely parked off-screen, so its rows are reachable
 * without opening it - but going through the pill is what a user does, and it is what
 * keeps this helper honest about the panel actually opening.
 */
const selectMode = async (mode: 'flat' | 'population' | 'density' | 'mastery') => {
  // Awaited, both of them: RNTL v14 made fireEvent async, and the panel's rows are
  // hidden from queries until the press that opens it has actually re-rendered.
  await fireEvent.press(screen.getByTestId('toggle-fill-mode'));
  await fireEvent.press(screen.getByTestId(`mode-${mode}`));
};

/** Same shape for the label field picker. */
const selectLabelField = async (field: LabelField) => {
  await fireEvent.press(screen.getByTestId('toggle-label-field'));
  await fireEvent.press(screen.getByTestId(`label-field-${field}`));
};

const labelLayer = () => screen.getByTestId('layer-country-label');
const flagLayer = () => screen.getByTestId('layer-country-flag');

/** What has been handed to `<Images>` - `{}` until flags are asked for. See WorldMap.tsx. */
const registeredImages = () =>
  screen.getByTestId('map-flag-images').props.images as Record<string, unknown>;

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
    await fireEvent(screen.getByTestId('source-countries'), 'press', {
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

  /**
   * Switching language must not touch either map source.
   *
   * This is the safety argument for baking both languages onto the label features rather
   * than building a collection per locale, and it is checkable here rather than only on a
   * device. Replacing `<GeoJSONSource data>` on a live map is the operation CLAUDE.md calls
   * the riskiest unproven thing in the app; a settings toggle must not be on that path.
   */
  describe('switching language', () => {
    afterEach(() => {
      __resetLocale('en');
    });

    const sourceData = () => screen.getByTestId('source-countries').props.data;
    const labelData = () => screen.getByTestId('source-country-labels').props.data;

    const switchLanguage = async () => {
      await act(async () => {
        setLocale('ru');
      });
    };

    it('re-uploads neither the outlines nor the label points', async () => {
      await render();
      const outlines = sourceData();
      const labels = labelData();

      await switchLanguage();

      expect(sourceData()).toBe(outlines);
      expect(labelData()).toBe(labels);
    });

    it('changes only the label layer|s expressions', async () => {
      await render();
      await selectLabelField('name');
      expect(labelLayer().props.layout['text-field']).toEqual(['get', 'tName']);

      await switchLanguage();

      // A layout-property change - the same code path the label-field picker already uses.
      expect(labelLayer().props.layout['text-field']).toEqual(['get', 'tNameRu']);
      expect(labelLayer().props.filter).toEqual([
        'all',
        ['has', 'tNameRu'],
        ['<=', ['get', 'zNameRu'], ['zoom']],
      ]);
    });

    /**
     * Every piece of chrome, in one assertion, because the failure this catches is
     * partial rather than total.
     *
     * Found on a device: the language toggle switched, the map's labels switched, and the
     * three pills beside them stayed in English until the next tap. `reactCompiler: true`
     * had memoised their `t('...')` calls - constants in, singleton read the compiler
     * cannot see, so no reactive input and no reason ever to recompute. `useTranslator`
     * turns the language into a value; this asserts the whole row moves together.
     */
    it('redraws every piece of chrome in the new language, not just some', async () => {
      await render();
      expect(screen.getByTestId('toggle-fill-mode')).toHaveTextContent('Flat');
      expect(screen.getByTestId('toggle-label-field')).toHaveTextContent('Labels');
      expect(screen.getByTestId('open-quiz')).toHaveTextContent('Quiz');
      expect(screen.getByTestId('toggle-language')).toHaveTextContent('RU');

      await switchLanguage();

      expect(screen.getByTestId('toggle-fill-mode')).toHaveTextContent('Обычная');
      expect(screen.getByTestId('toggle-label-field')).toHaveTextContent('Метки');
      expect(screen.getByTestId('open-quiz')).toHaveTextContent('Тест');
      expect(screen.getByTestId('toggle-language')).toHaveTextContent('EN');
    });

    /** The panels behind the pills, which are always mounted and merely parked. */
    it('redraws the option panels too', async () => {
      await render();
      await switchLanguage();

      // Regex, not a string: a panel renders its title AND every row, and v14's
      // toHaveTextContent matches the concatenation exactly. Same reason the legend
      // assertions above use one.
      expect(screen.getByTestId('fill-mode-panel', { includeHiddenElements: true }))
        .toHaveTextContent(/Раскрасить сушу по/);
      expect(screen.getByTestId('fill-mode-panel', { includeHiddenElements: true }))
        .toHaveTextContent(/Плотность/);
      expect(screen.getByTestId('label-field-panel', { includeHiddenElements: true }))
        .toHaveTextContent(/Подписывать страны/);
      expect(screen.getByTestId('label-field-panel', { includeHiddenElements: true }))
        .toHaveTextContent(/Столица/);
    });

    it('renames an open info sheet rather than leaving it in the old language', async () => {
      // `visibleFacts` deliberately LAGS its prop so the card can animate out, so this is
      // the one place a stale language could survive a switch.
      await render();
      await pressCountry('FRA');
      expect(screen.getByTestId('country-name')).toHaveTextContent('France');

      await switchLanguage();

      expect(screen.getByTestId('country-name')).toHaveTextContent('Франция');
    });
  });

  describe('the geometry handed to the source', () => {
    // Nothing in this app changed `<GeoJSONSource data>` after mount until mastery
    // arrived, and `worldGeoJson.test.ts` exists to protect that object's stability.
    // These two assertions are what stand between the feature and a 1.6 MB re-upload
    // per answer - see `masteryStore`, whose record/publish split exists for this.
    afterEach(() => {
      __resetMasteryStore();
    });

    const sourceData = () => screen.getByTestId('source-countries').props.data;

    it('is the untouched module constant while nothing has been played', async () => {
      await render();
      expect(sourceData()).toBe(worldGeoJson);
    });

    it('does not change when the fill mode changes', async () => {
      await render();
      const before = sourceData();

      await selectMode('mastery');
      await selectMode('population');
      await selectMode('flat');

      // The fold runs unconditionally, so switching modes never touches the source.
      expect(sourceData()).toBe(before);
    });

    it('does not change when an answer is merely recorded', async () => {
      await render();
      const before = sourceData();

      await act(async () => {
        for (let i = 0; i < 20; i += 1) {
          recordResult({
            iso3: 'BRA',
            grades: [
              { field: 'name', correct: true, how: 'exact', given: 'Brazil', expected: 'Brazil' },
            ],
            allCorrect: true,
          });
        }
      });

      expect(sourceData()).toBe(before);
    });

    it('changes exactly once when a round publishes', async () => {
      await render();
      const before = sourceData();

      await act(async () => {
        recordResult({
          iso3: 'BRA',
          grades: [
            { field: 'name', correct: true, how: 'exact', given: 'Brazil', expected: 'Brazil' },
          ],
          allCorrect: true,
        });
        publishMastery();
      });

      const after = sourceData();
      expect(after).not.toBe(before);

      // A second publish with nothing new recorded must not churn it again.
      await act(async () => {
        publishMastery();
      });
      expect(sourceData()).toBe(after);
    });
  });

  it('paints the mastery ramp and names its grey band for what it means', async () => {
    await render();
    await selectMode('mastery');

    expect(fillColor()).toEqual(MASTERY_RAMP.fillColor);
    expect(legendShown()).toBe(true);
    expect(legend()).toHaveTextContent(/Mastery from quizzes/);
    // The per-ramp no-data label. "no data" would be wrong here: those countries have
    // simply not been asked, which is an invitation rather than a gap in the dataset.
    expect(legend()).toHaveTextContent(/not asked yet/);
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
    await fireEvent(screen.getByTestId('source-countries'), 'press', event);

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

    // ...and never framed LARGER than it would be with the whole window, because it has
    // to fit the band the card leaves. Not strictly smaller: Jest's window is 1334 dp
    // tall, where the card takes ~440 rather than 55%, so the band is generous enough
    // that the fit is limited by width in both cases and the two agree.
    expect(camera.props.zoom).toBeLessThanOrEqual(centred.zoom);
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

/**
 * The map labels: the symbol layer's wiring, and the picker's mounted-but-hidden panel.
 *
 * What is NOT here is whether text actually appears on the map. That is drawn by the
 * native renderer, which Jest replaces with a stub, and it is not visible to Maestro
 * either because the glyphs live inside the MapLibre surface rather than the view
 * hierarchy. Confirming labels render is a manual screenshot step; what these tests can
 * do is prove the expressions are well-formed and the right property is being read.
 */
describe('map labels', () => {
  const panel = () =>
    // Required, like the legend: the panel marks itself accessibility-hidden while it is
    // parked off-screen, and RNTL excludes those from queries by default.
    screen.getByTestId('label-field-panel', { includeHiddenElements: true });

  const panelShown = () => panel().props.accessibilityElementsHidden === false;

  it('starts with no labels, and a filter that matches nothing', async () => {
    await render();

    // The layer is mounted in every mode - the empty-string idiom, same as the selection
    // layers. Unmounting it would mean inserting a layer at runtime.
    expect(labelLayer().props.filter).toEqual(['==', ['get', 'iso3'], '']);
    expect(panelShown()).toBe(false);
  });

  it('opens and closes the picker from its pill', async () => {
    await render();

    await fireEvent.press(screen.getByTestId('toggle-label-field'));
    expect(panelShown()).toBe(true);

    await fireEvent.press(screen.getByTestId('toggle-label-field'));
    expect(panelShown()).toBe(false);
  });

  it('reads the matching property once a field is chosen', async () => {
    await render();
    await selectLabelField('capital');

    expect(labelLayer().props.layout['text-field']).toEqual(['get', 'tCapital']);
    expect(labelLayer().props.filter).toEqual([
      'all',
      ['has', 'tCapital'],
      ['<=', ['get', 'zCapital'], ['zoom']],
    ]);
  });

  it.each(['name', 'capital', 'currencies', 'population'] as const)(
    'wires up the %s field',
    async (field) => {
      await render();
      await selectLabelField(field);

      const textField = labelLayer().props.layout['text-field'] as [string, string];
      expect(textField[0]).toBe('get');
      // The layout prop has to survive the mock, which used to strip it.
      expect(typeof textField[1]).toBe('string');
    },
  );

  it('closes the picker after a choice', async () => {
    await render();
    await selectLabelField('name');

    expect(panelShown()).toBe(false);
  });

  it('goes back to matching nothing when labels are turned off', async () => {
    await render();
    await selectLabelField('name');
    await selectLabelField('none');

    expect(labelLayer().props.filter).toEqual(['==', ['get', 'iso3'], '']);
    // Still well-formed rather than undefined: a malformed layout property is invisible
    // here and fatal in the native renderer.
    expect(labelLayer().props.layout['text-field']).toBe('');
  });

  it('mounts the flag layer well-formed and switched off', async () => {
    await render();

    // Same discipline as the text layer: the layer exists in every mode and its `icon-image`
    // is a valid expression from the first frame. The filter is what turns it on.
    expect(flagLayer().props.filter).toEqual(['==', ['get', 'iso3'], '']);
    expect(flagLayer().props.layout['icon-image']).toEqual(['get', FLAG_ICON_PROPERTY]);
    // And nothing has been decoded: the latch is closed until flags are actually asked for.
    expect(registeredImages()).toEqual({});
  });

  it('wires up the flag field, and turns the text layer off with it', async () => {
    await render();
    await selectLabelField('flag');

    const filter = flagLayer().props.filter as unknown[];
    expect(filter[0]).toBe('all');
    expect(filter[1]).toEqual(['has', FLAG_ICON_PROPERTY]);

    // The cross-layer half, which is the thing that would show up as flags underneath names.
    expect(labelLayer().props.filter).toEqual(['==', ['get', 'iso3'], '']);
    expect(labelLayer().props.layout['text-field']).toBe('');
  });

  it('registers the flag images on first use, and keeps them after', async () => {
    await render();
    await selectLabelField('flag');

    expect(Object.keys(registeredImages())).toHaveLength(Object.keys(MAP_FLAG_IMAGES).length);

    await selectLabelField('name');

    // The layer goes quiet, but the images stay: `MLRNImages.setImages` only ever ADDS keys,
    // so the latch is one-way by construction. Asserted so nobody "fixes" it into a leak.
    expect(flagLayer().props.filter).toEqual(['==', ['get', 'iso3'], '']);
    expect(Object.keys(registeredImages())).toHaveLength(Object.keys(MAP_FLAG_IMAGES).length);
  });

  it('declutters the flags the same way it declutters text', async () => {
    await render();
    await selectLabelField('flag');

    const { layout } = flagLayer().props;
    expect(layout['icon-allow-overlap']).toBe(false);
    // Same sort key as the text layer, so the widest country wins either way.
    expect(layout['symbol-sort-key']).toEqual(['get', 'rank']);
    // A malformed interpolate blanks the layer inside the native renderer and nowhere else.
    expect(layout['icon-size'][0]).toBe('interpolate');
    // And the numbers must be numbers: an undefined constant would make these NaN, which
    // Jest would otherwise wave through as a well-shaped expression.
    for (const stop of [layout['icon-size'][4], layout['icon-size'][6]]) {
      expect(Number.isFinite(stop)).toBe(true);
      expect(stop).toBeGreaterThan(0);
    }
  });

  it('never gives icon-padding a scalar, which crashes Android outright', async () => {
    /*
      A regression guard for a fatal crash, not a style preference.

      `MLRNStyleFactory.setIconPadding` calls `getFloatArray`, while `setTextPadding` calls
      `getFloat` - the spec types the first as a `padding` and the second as a `number`. So
      the symmetrical-looking `icon-padding: 2` beside `text-padding: 2` throws
      `UnexpectedNativeTypeException: cannot be cast from Double to ReadableArray` the instant
      the layer is added, killing the app on launch. maplibre-gl on the web accepts the scalar
      without complaint, so nothing in a browser catches it.

      Unset is correct - the spec default is already [2]. If it is ever set, it must be an array.
    */
    await render();
    await selectLabelField('flag');

    const padding = flagLayer().props.layout['icon-padding'];
    if (padding !== undefined) expect(Array.isArray(padding)).toBe(true);
  });

  it('lets labels sit on top of a choropleth', async () => {
    // The two settings are independent on purpose - density plus capitals is useful.
    await render();
    await selectMode('density');
    await selectLabelField('capital');

    expect(fillColor()).toEqual(DENSITY_RAMP.fillColor);
    expect(labelLayer().props.layout['text-field']).toEqual(['get', 'tCapital']);
  });

  it('keeps only one option panel open at a time', async () => {
    await render();

    await fireEvent.press(screen.getByTestId('toggle-label-field'));
    expect(panelShown()).toBe(true);

    await fireEvent.press(screen.getByTestId('toggle-fill-mode'));
    expect(panelShown()).toBe(false);
    expect(
      screen.getByTestId('fill-mode-panel', { includeHiddenElements: true }).props
        .accessibilityElementsHidden,
    ).toBe(false);
  });

  it('declutters natively rather than by hand', async () => {
    // These three are the whole decluttering story: MapLibre drops overlapping labels,
    // widest country first, and the filter above holds back labels bigger than their
    // country. Losing any of them silently turns the map into a pile-up.
    await render();
    const layout = labelLayer().props.layout;

    expect(layout['text-allow-overlap']).toBe(false);
    expect(layout['symbol-sort-key']).toEqual(['get', 'rank']);
    expect(layout['text-font']).toEqual(['Map Label']);
  });

  it('draws labels from their own point source, not the outlines', async () => {
    // Labelling the polygons directly gives France six labels, one over South America.
    await render();
    expect(screen.getByTestId('source-country-labels')).toBeTruthy();
  });
});
