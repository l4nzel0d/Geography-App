import { DEFAULT_FIELDS, DEFAULT_MODE } from '@/quiz/quizConfig';
import {
  DEFAULT_SETUP_PREFS,
  decodeSetupPrefs,
  encodeSetupPrefs,
  mergeSetupPrefs,
  type QuizSetupPrefs,
  SETUP_PREFS_KEY,
  SETUP_PREFS_SCHEMA,
} from '@/quiz/setupPrefs';

/** A config that differs from the defaults in every single field. */
const CUSTOM: QuizSetupPrefs = {
  mode: 'locate',
  subregions: ['Western Europe', 'Eastern Africa'],
  fields: ['capital', 'currency'],
  practice: true,
  choice: true,
};

/** Encode an arbitrary blob at the current schema, the way a hand edit would look. */
function raw(payload: Record<string, unknown>): string {
  return JSON.stringify({ v: SETUP_PREFS_SCHEMA, ...payload });
}

describe('the wire format', () => {
  it('round-trips a fully custom config', () => {
    expect(mergeSetupPrefs(decodeSetupPrefs(encodeSetupPrefs(CUSTOM)))).toEqual(CUSTOM);
  });

  it('round-trips the defaults', () => {
    expect(mergeSetupPrefs(decodeSetupPrefs(encodeSetupPrefs(DEFAULT_SETUP_PREFS)))).toEqual(
      DEFAULT_SETUP_PREFS,
    );
  });

  it('round-trips an empty selection on both list fields', () => {
    const empty: QuizSetupPrefs = { ...CUSTOM, fields: [], subregions: [] };
    expect(mergeSetupPrefs(decodeSetupPrefs(encodeSetupPrefs(empty)))).toEqual(empty);
  });

  it('pins the key and the schema version', () => {
    // Both are load-bearing across a release: changing either silently orphans everything
    // already on players' devices, so it has to be a deliberate edit to a failing test.
    expect(SETUP_PREFS_KEY).toBe('geographyapp:quizSetup:v1');
    expect(SETUP_PREFS_SCHEMA).toBe(1);
  });
});

describe('decoding never throws', () => {
  it.each([
    ['empty string', ''],
    ['truncated json', '{'],
    ['the literal null', 'null'],
    ['an array', '[]'],
    ['a bare number', '123'],
    ['a bare string', '"facts"'],
    ['a future schema', '{"v":2,"mode":"locate"}'],
    ['no schema at all', '{"mode":"locate"}'],
  ])('returns nothing for %s', (_label, blob) => {
    expect(decodeSetupPrefs(blob)).toEqual({});
  });

  it('returns nothing for null and undefined', () => {
    expect(decodeSetupPrefs(null)).toEqual({});
    expect(decodeSetupPrefs(undefined)).toEqual({});
  });

  it('survives a megabyte of junk', () => {
    expect(decodeSetupPrefs('x'.repeat(1024 * 1024))).toEqual({});
  });

  it('falls all the way back to the defaults when nothing decodes', () => {
    expect(mergeSetupPrefs(decodeSetupPrefs('{'))).toEqual(DEFAULT_SETUP_PREFS);
  });
});

describe('per-field validation', () => {
  it('drops a mode the app no longer has', () => {
    const decoded = decodeSetupPrefs(raw({ mode: 'silhouette' }));
    expect(decoded.mode).toBeUndefined();
    expect(mergeSetupPrefs(decoded).mode).toBe(DEFAULT_MODE);
  });

  it('keeps a real mode', () => {
    expect(decodeSetupPrefs(raw({ mode: 'flag' })).mode).toBe('flag');
  });

  it('drops a removed field but keeps its neighbours', () => {
    // Exactly what `isMasteryField` does to a stored `languages` grade: a field that has
    // left the app costs that field, not the whole preference.
    expect(decodeSetupPrefs(raw({ fields: ['languages', 'name'] })).fields).toEqual(['name']);
  });

  it('dedupes fields', () => {
    expect(decodeSetupPrefs(raw({ fields: ['name', 'name', 'capital'] })).fields).toEqual([
      'name',
      'capital',
    ]);
  });

  it('leaves fields EMPTY when every stored one is gone, rather than reinstating the default', () => {
    // The load-bearing half of the rule. An empty selection is a state the player can
    // genuinely be in, and `canStart` already says so with a disabled button. Falling back
    // here would silently start a name round nobody configured.
    const decoded = decodeSetupPrefs(raw({ fields: ['languages'] }));
    expect(decoded.fields).toEqual([]);
    expect(mergeSetupPrefs(decoded).fields).toEqual([]);
  });

  it('DOES reinstate the default when fields were never stored at all', () => {
    // The other half, and it only means anything alongside the test above: absent and
    // emptied have to reach different answers or the distinction is untested.
    const decoded = decodeSetupPrefs(raw({ mode: 'flag' }));
    expect(decoded.fields).toBeUndefined();
    expect(mergeSetupPrefs(decoded).fields).toEqual(DEFAULT_FIELDS);
  });

  it('ignores a fields value that is not an array', () => {
    expect(decodeSetupPrefs(raw({ fields: 'name' })).fields).toBeUndefined();
  });

  it('drops non-string and empty subregion entries', () => {
    expect(decodeSetupPrefs(raw({ subregions: ['Polynesia', 7, null, ''] })).subregions).toEqual([
      'Polynesia',
    ]);
  });

  it('dedupes and caps subregions', () => {
    const many = Array.from({ length: 80 }, (_, i) => `Region ${i}`);
    expect(decodeSetupPrefs(raw({ subregions: many })).subregions).toHaveLength(32);
  });

  it('takes booleans only as literal booleans', () => {
    // We are our own writer here, unlike `parseQuizParams` reading a hand-typed URL - so
    // anything truthy must NOT turn a setting on.
    expect(decodeSetupPrefs(raw({ practice: 'yes' })).practice).toBeUndefined();
    expect(decodeSetupPrefs(raw({ practice: 1 })).practice).toBeUndefined();
    expect(decodeSetupPrefs(raw({ practice: true })).practice).toBe(true);
    expect(decodeSetupPrefs(raw({ practice: false })).practice).toBe(false);
    expect(decodeSetupPrefs(raw({ choice: true })).choice).toBe(true);
  });
});

describe('what deliberately does not persist', () => {
  it('ignores a seed and an only list even when they are in the blob', () => {
    // They are excluded by the `Pick`, so widening what is stored has to be a conscious
    // act rather than something a stray key can do.
    const decoded = decodeSetupPrefs(
      raw({ mode: 'facts', seed: 12345, only: [{ iso3: 'FRA', fields: ['capital'] }] }),
    );
    expect(decoded).not.toHaveProperty('seed');
    expect(decoded).not.toHaveProperty('only');
    expect(mergeSetupPrefs(decoded)).not.toHaveProperty('only');
  });

  it('never writes a seed or an only list', () => {
    const encoded = JSON.parse(encodeSetupPrefs(CUSTOM)) as Record<string, unknown>;
    expect(Object.keys(encoded).sort()).toEqual([
      'choice',
      'fields',
      'mode',
      'practice',
      'subregions',
      'v',
    ]);
  });
});
