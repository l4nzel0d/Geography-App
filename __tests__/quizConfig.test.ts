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
  type FieldId,
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
    expect(ANSWERABLE_FIELDS).toEqual(['name', 'capital', 'currency', 'population']);
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
      // Absent `only` is no restriction, for the same reason as `mode` and `practice`.
      only: [],
      seed: 42,
      // Absent `practice` is a normal round, for the same reason as `mode`.
      practice: false,
      // Absent `choice` means type it, for the same reason as `practice`.
      choice: false,
    });
  });

  describe('practice', () => {
    it.each([
      ['1', true],
      ['true', true],
      ['0', false],
      ['no', false],
      ['', false],
      [undefined, false],
    ])('reads %p as %p', (raw, expected) => {
      expect(parseQuizParams({ practice: raw }, seed).practice).toBe(expected);
    });

    it('takes the first value when the router hands back an array', () => {
      expect(parseQuizParams({ practice: ['1', '0'] }, seed).practice).toBe(true);
    });

    it('round-trips through toQuizParams in both states', () => {
      const base = {
        mode: 'facts' as const,
        subregions: [],
        fields: ['name' as const],
        only: [],
        seed: 7,
        choice: false,
      };

      for (const practice of [true, false]) {
        const params = toQuizParams({ ...base, practice });
        // Always emitted, so nothing depends on how expo-router treats an absent param.
        expect(params.practice).toBe(practice ? '1' : '0');
        expect(parseQuizParams(params, seed).practice).toBe(practice);
      }
    });
  });

  describe('choice', () => {
    it.each([
      ['1', true],
      ['true', true],
      ['0', false],
      ['no', false],
      ['', false],
      [undefined, false],
    ])('reads %p as %p', (raw, expected) => {
      // Absent is false, which is what every link written before multiple choice existed
      // says by omission - the rule `mode` and `practice` already follow.
      expect(parseQuizParams({ choice: raw }, seed).choice).toBe(expected);
    });

    it('takes the first value when the router hands back an array', () => {
      expect(parseQuizParams({ choice: ['1', '0'] }, seed).choice).toBe(true);
    });

    it('round-trips through toQuizParams in both states', () => {
      const base = {
        mode: 'facts' as const,
        subregions: [],
        fields: ['name' as const],
        only: [],
        seed: 7,
        practice: false,
      };

      for (const choice of [true, false]) {
        const params = toQuizParams({ ...base, choice });
        // Always emitted, so nothing depends on how expo-router treats an absent param.
        expect(params.choice).toBe(choice ? '1' : '0');
        expect(parseQuizParams(params, seed).choice).toBe(choice);
      }
    });

    it('is carried through a locate round, which never reads it', () => {
      // Same reason `fields` is: "Change settings" pops back to a setup screen that has
      // to show what the player chose, and "Play again" round-trips the whole config.
      const params = toQuizParams({
        mode: 'locate',
        subregions: [],
        fields: ['name'],
        only: [],
        seed: 7,
        practice: false,
        choice: true,
      });

      expect(parseQuizParams(params, seed).choice).toBe(true);
    });
  });

  describe('only', () => {
    const BASE_CONFIG = {
      mode: 'facts' as const,
      subregions: [],
      fields: ['name' as const],
      only: [],
      seed: 7,
      practice: false,
      // Absent `choice` means type it, for the same reason as `practice`.
      choice: false,
    };

    const target = (iso3: string, fields: FieldId[] = []) => ({ iso3, fields });

    it.each([[undefined], ['']])('reads %p as no restriction', (raw) => {
      expect(parseQuizParams({ only: raw }, seed).only).toEqual([]);
    });

    it('reads a bare code as "ask this country the round’s own fields"', () => {
      // Which is what a hand-typed `?only=FRA` means, and what a locate retry emits -
      // `location` is not a `FieldId`, so there is nothing to name.
      expect(parseQuizParams({ only: 'FRA' }, seed).only).toEqual([target('FRA')]);
    });

    it('reads a per-country field list, which is the whole point of the encoding', () => {
      // France is re-asked its currency and Japan its name; neither is asked the other's.
      expect(parseQuizParams({ only: 'FRA:capital.currency,JPN:name' }, seed).only).toEqual([
        target('FRA', ['capital', 'currency']),
        target('JPN', ['name']),
      ]);
    });

    it('accepts the param repeated as an array', () => {
      expect(parseQuizParams({ only: ['FRA:name', 'JPN'] }, seed).only).toEqual([
        target('FRA', ['name']),
        target('JPN'),
      ]);
    });

    it('uppercases, because ISO-3 is uppercase everywhere it is compared', () => {
      // The geometry's `iso3` property and the keys of `COUNTRY_FACTS`. A hand-typed
      // `?only=fra` that matched nobody would be the failure that most looks like it
      // worked - an empty round with no error.
      expect(parseQuizParams({ only: 'fra:name' }, seed).only).toEqual([target('FRA', ['name'])]);
    });

    it('drops a field it does not recognise rather than trusting it', () => {
      expect(parseQuizParams({ only: 'FRA:capital.flavour' }, seed).only).toEqual([
        target('FRA', ['capital']),
      ]);
    });

    it('merges a country named twice rather than asking it twice', () => {
      expect(parseQuizParams({ only: 'FRA:capital,FRA:currency' }, seed).only).toEqual([
        target('FRA', ['capital', 'currency']),
      ]);
    });

    it('keeps an unrecognised code, letting the pool filter decide', () => {
      // Same rule as an unknown subregion: `quizCountries` owns the catalogue, and
      // importing it here would pull the geometry into a module that only coerces strings.
      expect(parseQuizParams({ only: 'XXX' }, seed).only).toEqual([target('XXX')]);
    });

    it('is always emitted, and empty when unrestricted', () => {
      // Nothing depends on how expo-router treats an absent versus an empty param.
      expect(toQuizParams({ ...BASE_CONFIG, only: [] }).only).toBe('');
      expect(
        toQuizParams({
          ...BASE_CONFIG,
          only: [target('FRA', ['capital', 'currency']), target('JPN')],
        }).only,
      ).toBe('FRA:capital.currency,JPN');
    });

    it('round-trips the worst case a real round can produce', () => {
      // 193 countries, every one of them wrong on every field. The pathological bound, and
      // the reason to know it: naming fields per country is what makes this param long, so
      // the size claim belongs next to the encoding rather than in someone's head.
      const every = Array.from({ length: 193 }, (_, i) =>
        target(`C${String(i).padStart(2, '0')}`, [...ANSWERABLE_FIELDS]),
      );
      const params = toQuizParams({ ...BASE_CONFIG, only: every });

      expect(params.only.length).toBeLessThan(10_000);
      expect(parseQuizParams(params, seed).only).toEqual(every);
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
    only: [],
    seed: 99,
    practice: false,
    choice: false,
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
