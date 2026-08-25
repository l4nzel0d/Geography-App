/**
 * The config's trip through the URL.
 *
 * expo-router hands params back as `string | string[] | undefined`, and a hand-typed
 * deep link (which is exactly how the Maestro flow starts a round) can carry anything.
 * A typo should start a quiz, not a red screen.
 */
import {
  ANSWERABLE_FIELDS,
  DEFAULT_FIELDS,
  newSeed,
  parseQuizParams,
  toQuizParams,
  type QuizConfig,
} from '@/quiz/quizConfig';
import { getQuizPanelLayout, PORTRAIT_MAX_FRACTION } from '@/quiz/quizPanelLayout';
import { getInfoSheetLayout } from '@/components/infoSheetLayout';

describe('ANSWERABLE_FIELDS', () => {
  it('does not include area', () => {
    // Deliberately unaskable: "how many square kilometres is Chad" is a memory test
    // with no intuition behind it.
    expect(ANSWERABLE_FIELDS).not.toContain('area');
    expect(ANSWERABLE_FIELDS).toEqual([
      'name',
      'capital',
      'currency',
      'languages',
      'population',
    ]);
  });
});

describe('parseQuizParams', () => {
  const seed = () => 777;

  it('reads a well-formed set of params', () => {
    expect(
      parseQuizParams({ subregions: 'Western Europe', fields: 'name,capital', seed: '42' }, seed),
    ).toEqual({
      // Absent `mode` is a facts round - which is what every link written before modes
      // existed says by omission.
      mode: 'facts',
      subregions: ['Western Europe'],
      fields: ['name', 'capital'],
      seed: 42,
    });
  });

  it('defaults an absent mode to facts', () => {
    expect(parseQuizParams({}, seed).mode).toBe('facts');
  });

  it('reads a locate round', () => {
    expect(parseQuizParams({ mode: 'locate' }, seed).mode).toBe('locate');
  });

  it('reads a flag round', () => {
    expect(parseQuizParams({ mode: 'flag' }, seed).mode).toBe('flag');
  });

  it('falls back to facts for a mode it does not recognise', () => {
    // A hand-typed deep link should start a quiz, not a red screen - same rule as the
    // rest of this parser.
    expect(parseQuizParams({ mode: 'pointing' }, seed).mode).toBe('facts');
    expect(parseQuizParams({ mode: ['locate', 'facts'] }, seed).mode).toBe('locate');
  });

  it('accepts params repeated as an array', () => {
    // Which is how they arrive when a link passes `?fields=name&fields=capital`.
    expect(
      parseQuizParams({ subregions: ['Polynesia', 'Melanesia'], fields: ['name'] }, seed).subregions,
    ).toEqual(['Polynesia', 'Melanesia']);
  });

  it('splits a comma list inside a single param', () => {
    expect(parseQuizParams({ subregions: 'Polynesia,Melanesia' }, seed).subregions).toEqual([
      'Polynesia',
      'Melanesia',
    ]);
  });

  it('trims whitespace and drops empties', () => {
    expect(parseQuizParams({ subregions: ' Polynesia , , Melanesia ' }, seed).subregions).toEqual([
      'Polynesia',
      'Melanesia',
    ]);
  });

  it('de-duplicates', () => {
    expect(parseQuizParams({ fields: 'name,name,capital' }, seed).fields).toEqual([
      'name',
      'capital',
    ]);
  });

  it('drops unknown fields rather than trusting them', () => {
    expect(parseQuizParams({ fields: 'name,area,flavour' }, seed).fields).toEqual(['name']);
  });

  it('falls back to the default field when none survives', () => {
    expect(parseQuizParams({ fields: 'area' }, seed).fields).toEqual(DEFAULT_FIELDS);
    expect(parseQuizParams({}, seed).fields).toEqual(DEFAULT_FIELDS);
  });

  it('treats no subregion as the whole world rather than an error', () => {
    expect(parseQuizParams({}, seed).subregions).toEqual([]);
  });

  it('keeps an unknown subregion, letting the pool filter decide', () => {
    // quizCountries owns the catalogue; an unknown name simply matches nothing.
    expect(parseQuizParams({ subregions: 'Atlantis' }, seed).subregions).toEqual(['Atlantis']);
  });

  it.each([undefined, '', 'abc', '-1', 'NaN'])('generates a seed when given %p', (raw) => {
    expect(parseQuizParams({ seed: raw }, seed).seed).toBe(777);
  });

  it('floors a fractional seed rather than carrying it into the rng', () => {
    expect(parseQuizParams({ seed: '12.9' }, seed).seed).toBe(12);
  });

  it('accepts zero as a seed', () => {
    expect(parseQuizParams({ seed: '0' }, seed).seed).toBe(0);
  });
});

describe('toQuizParams', () => {
  const config: QuizConfig = {
    mode: 'facts',
    subregions: ['Western Europe', 'Polynesia'],
    fields: ['name', 'population'],
    seed: 99,
  };

  it('round-trips through parseQuizParams', () => {
    expect(parseQuizParams({ ...toQuizParams(config) })).toEqual(config);
  });

  it('round-trips a flag round, which is the claim that its fields carry over', () => {
    // A flag round asks the same typed facts as a facts round, so the selection has to
    // survive the trip through the URL that "Play again" and "Change settings" make.
    const round = { ...config, mode: 'flag' as const };
    expect(parseQuizParams({ ...toQuizParams(round) })).toEqual(round);
  });

  it('round-trips a locate round, fields and all', () => {
    // The fields are dead weight to a locate round and are carried anyway: "Change
    // settings" and "Play again" both send the config back through the URL, and dropping
    // them would silently clear what the player had ticked for facts mode.
    const round = { ...config, mode: 'locate' as const };
    expect(parseQuizParams({ ...toQuizParams(round) })).toEqual(round);
  });

  it('produces strings, which is all a URL can carry', () => {
    const params = toQuizParams(config);
    expect(Object.values(params).every((v) => typeof v === 'string')).toBe(true);
  });
});

describe('newSeed', () => {
  it('produces a non-negative integer that survives a URL round trip', () => {
    for (let i = 0; i < 50; i++) {
      const value = newSeed();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(Number(String(value))).toBe(value);
    }
  });
});

describe('getQuizPanelLayout', () => {
  const PORTRAIT = { width: 411, height: 890 };
  const LANDSCAPE = { width: 890, height: 411 };

  it('docks below the map in portrait and beside it in landscape', () => {
    expect(getQuizPanelLayout(PORTRAIT, 2).landscape).toBe(false);
    expect(getQuizPanelLayout(LANDSCAPE, 2).landscape).toBe(true);
  });

  it('matches the info card\'s width in landscape', () => {
    // Reuse rather than a parallel rule, so the two panels are the same width on the
    // same device.
    expect(getQuizPanelLayout(LANDSCAPE, 3).panelWidth).toBe(
      getInfoSheetLayout(LANDSCAPE).panelWidth,
    );
  });

  it('leaves the map exactly what the panel does not take', () => {
    // This is the number the camera fits to, so an error here frames the wrong area.
    const portrait = getQuizPanelLayout(PORTRAIT, 3);
    expect(portrait.mapViewport.height + portrait.panelHeight!).toBe(PORTRAIT.height);
    expect(portrait.mapViewport.width).toBe(PORTRAIT.width);

    const landscape = getQuizPanelLayout(LANDSCAPE, 3);
    expect(landscape.mapViewport.width + landscape.panelWidth!).toBe(LANDSCAPE.width);
    expect(landscape.mapViewport.height).toBe(LANDSCAPE.height);
  });

  it('grows the portrait panel with the number of fields', () => {
    expect(getQuizPanelLayout(PORTRAIT, 5).panelHeight!).toBeGreaterThan(
      getQuizPanelLayout(PORTRAIT, 1).panelHeight!,
    );
  });

  it('never lets the panel take more than its share of the screen', () => {
    // A quiz where you cannot see the country is not a quiz. The panel scrolls instead.
    const layout = getQuizPanelLayout(PORTRAIT, 20);
    expect(layout.panelHeight!).toBeLessThanOrEqual(PORTRAIT.height * PORTRAIT_MAX_FRACTION + 1);
    expect(layout.mapViewport.height).toBeGreaterThan(PORTRAIT.height * 0.4);
  });

  it('keeps a positive map viewport on a tiny screen', () => {
    const layout = getQuizPanelLayout({ width: 320, height: 480 }, 5);
    expect(layout.mapViewport.width).toBeGreaterThan(0);
    expect(layout.mapViewport.height).toBeGreaterThan(0);
  });
});
