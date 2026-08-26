import {
  decodeMastery,
  encodeMastery,
  MASTERY_KEY,
  MASTERY_SCHEMA,
  mergeTables,
} from '@/mastery/masteryCodec';
import { MASTERY_FIELDS, type MasteryTable } from '@/mastery/masteryScore';
import { QUIZ_COUNTRIES } from '@/quiz/quizCountries';

/** Every country, every field - the largest table the app can ever produce. */
function saturatedTable(): MasteryTable {
  const table: MasteryTable = {};
  for (const country of QUIZ_COUNTRIES) {
    const record: Record<string, { asked: number; correct: number; lastCorrect: boolean }> = {};
    for (const field of MASTERY_FIELDS) {
      record[field] = { asked: 9, correct: 7, lastCorrect: true };
    }
    table[country.iso3] = record;
  }
  return table;
}

describe('the wire format', () => {
  it('round-trips a saturated 193-country table exactly', () => {
    const table = saturatedTable();
    expect(decodeMastery(encodeMastery(table))).toEqual(table);
  });

  it('stays well under 40 KB at its largest', () => {
    // The estimate belongs in a test, not a comment: it is what justifies one key holding
    // one blob rather than a key per country.
    const bytes = encodeMastery(saturatedTable()).length;
    expect(QUIZ_COUNTRIES.length).toBe(193);
    expect(bytes).toBeLessThan(40 * 1024);
  });

  it('drops countries whose every field fell away, so the blob tracks what was played', () => {
    const encoded = encodeMastery({
      FRA: { name: { asked: 2, correct: 1, lastCorrect: false } },
      DEU: {},
      ITA: { name: { asked: 0, correct: 0, lastCorrect: false } },
    });

    const decoded = decodeMastery(encoded);
    expect(Object.keys(decoded)).toEqual(['FRA']);
  });

  it('pins the key and schema, which a migration would have to change deliberately', () => {
    expect(MASTERY_KEY).toBe('geographyapp:mastery:v1');
    expect(MASTERY_SCHEMA).toBe(1);
  });
});

describe('decodeMastery never throws', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['not json', 'not json'],
    ['an array', '[]'],
    ['a bare number', '42'],
    ['a bare string', '"hello"'],
    ['json null', 'null'],
    ['no version', '{"c":{}}'],
    ['a future version', '{"v":99,"c":{"FRA":{"name":[1,1,1]}}}'],
    ['no countries key', '{"v":1}'],
    ['countries not an object', '{"v":1,"c":[]}'],
  ])('returns an empty table for %s', (_label, raw) => {
    expect(decodeMastery(raw as string | null)).toEqual({});
  });

  it('survives a sweep of garbage without ever throwing', () => {
    const garbage = [
      '{',
      '}',
      '[[[',
      '{"v":',
      ' ',
      '{"v":1,"c":{"FRA":null}}',
      '{"v":1,"c":{"FRA":[1,2,3]}}',
      '{"v":1,"c":{"FRA":{"name":null}}}',
      '{"v":1,"c":{"FRA":{"name":{}}}}',
      '{"v":1,"c":{"FRA":{"name":[]}}}',
      '{"v":true,"c":{}}',
      '{"v":1,"c":"nope"}',
      '{"v":1,"c":{"":{}}}',
    ];

    // Plus a spread of truncated, structurally plausible strings.
    for (let i = 0; i < 40; i++) {
      const full = JSON.stringify({ v: i % 3, c: { X: { name: [i, i - 1, i % 2] } } });
      garbage.push(full.slice(0, 5 + i));
    }

    for (const raw of garbage) {
      expect(() => decodeMastery(raw)).not.toThrow();
      expect(typeof decodeMastery(raw)).toBe('object');
    }
  });
});

describe('decodeMastery validates per field, not per table', () => {
  it('drops only the bad field and keeps the rest of the country', () => {
    // One corrupt entry should cost one entry, never a player's whole history.
    const raw = JSON.stringify({
      v: 1,
      c: { FRA: { name: [4, 2, 1], capital: [1, 5, 0], currency: [3, 3, 1] } },
    });

    const decoded = decodeMastery(raw);
    expect(Object.keys(decoded.FRA).sort()).toEqual(['currency', 'name']);
    expect(decoded.FRA.capital).toBeUndefined();
  });

  it.each([
    ['more correct than asked', [1, 5, 1]],
    ['a negative asked', [-1, 0, 0]],
    ['a zero asked', [0, 0, 0]],
    ['a fractional count', [1.5, 1, 1]],
    ['a negative correct', [3, -1, 1]],
    ['a non-numeric count', ['3', 1, 1]],
    ['a short tuple', [3, 1]],
  ])('rejects %s', (_label, tuple) => {
    const decoded = decodeMastery(JSON.stringify({ v: 1, c: { FRA: { name: tuple } } }));
    expect(decoded).toEqual({});
  });

  it('drops an unknown field key but keeps a known one beside it', () => {
    const decoded = decodeMastery(
      JSON.stringify({ v: 1, c: { FRA: { name: [2, 2, 1], anthem: [2, 2, 1] } } }),
    );
    expect(Object.keys(decoded.FRA)).toEqual(['name']);
  });

  it('keeps an unknown ISO-3, which simply never matches a feature', () => {
    // Rejecting it would mean importing the geometry into a pure module that has no
    // other reason to know about it.
    const decoded = decodeMastery(JSON.stringify({ v: 1, c: { ZZZ: { name: [1, 1, 1] } } }));
    expect(decoded.ZZZ).toBeDefined();
  });
});

describe('mergeTables', () => {
  it('returns the stored table untouched when nothing was recorded first', () => {
    const stored: MasteryTable = { FRA: { name: { asked: 1, correct: 1, lastCorrect: true } } };
    expect(mergeTables(stored, {})).toBe(stored);
  });

  it('sums counters and lets the in-memory last answer win', () => {
    // The read is async; an answer can land before it. Assigning over the top would
    // silently drop that answer.
    const stored: MasteryTable = { FRA: { name: { asked: 3, correct: 3, lastCorrect: true } } };
    const memory: MasteryTable = { FRA: { name: { asked: 1, correct: 0, lastCorrect: false } } };

    expect(mergeTables(stored, memory).FRA.name).toEqual({
      asked: 4,
      correct: 3,
      lastCorrect: false,
    });
  });

  it('carries a country that exists on only one side', () => {
    const merged = mergeTables(
      { FRA: { name: { asked: 1, correct: 1, lastCorrect: true } } },
      { DEU: { capital: { asked: 2, correct: 1, lastCorrect: false } } },
    );
    expect(Object.keys(merged).sort()).toEqual(['DEU', 'FRA']);
  });
});
