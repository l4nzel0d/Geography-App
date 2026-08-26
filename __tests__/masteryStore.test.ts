import { encodeMastery, MASTERY_KEY } from '@/mastery/masteryCodec';
import type { QuestionResult } from '@/quiz/gradeAnswer';
import type { GradedField } from '@/quiz/quizConfig';

/**
 * The store is a module singleton that kicks off an async read at import, so each test
 * needs a fresh module registry rather than a shared instance.
 *
 * **The storage mock must be required from INSIDE the same `isolateModules` block.** A
 * fresh registry gives the store its own instance of the mock, so a seed or a write count
 * taken from a top-level import would be a different object entirely - the store would
 * read an empty store and the test would count zero writes, both silently.
 */
type Store = typeof import('@/mastery/masteryStore');

type StorageMock = {
  __reset(): void;
  __seed(key: string, value: string): void;
  __raw(key: string): string | null;
  __writes(): number;
  __failNextWrite(): void;
  __failNextRead(): void;
};

/** Set up storage, then import the store fresh against it. Both come from one registry. */
function isolate(seed?: (mock: StorageMock) => void): { store: Store; mock: StorageMock } {
  let store!: Store;
  let mock!: StorageMock;

  jest.isolateModules(() => {
    mock = (require('@react-native-async-storage/async-storage') as { default: StorageMock })
      .default;
    mock.__reset();
    seed?.(mock);
    store = require('@/mastery/masteryStore') as Store;
  });

  return { store, mock };
}

/** Let the load promise the module started at import settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function freshStore(seed?: (mock: StorageMock) => void) {
  const isolated = isolate(seed);
  await settle();
  return isolated;
}

const result = (iso3: string, field: GradedField, correct: boolean): QuestionResult => ({
  iso3,
  grades: [{ field, correct, how: correct ? 'exact' : 'wrong', given: 'x', expected: 'y' }],
  allCorrect: correct,
});

const seeded = (table: Parameters<typeof encodeMastery>[0]) => (mock: StorageMock) =>
  mock.__seed(MASTERY_KEY, encodeMastery(table));

afterEach(() => {
  jest.useRealTimers();
});

describe('subscription', () => {
  it('notifies a subscriber on publish and stops after unsubscribe', async () => {
    const { store } = await freshStore();
    const seen: number[] = [];

    const unsubscribe = store.subscribeToMastery((s) => seen.push(s.version));

    store.recordResult(result('FRA', 'name', true));
    store.publishMastery();
    expect(seen).toHaveLength(1);

    unsubscribe();
    store.recordResult(result('DEU', 'name', true));
    store.publishMastery();
    expect(seen).toHaveLength(1);
  });

  it('does NOT notify on recordResult - only on publish', async () => {
    // This is the assertion that protects the explore map. `/quiz/play` is PUSHED over
    // MapScreen, so its MapLibre surface stays mounted for the whole round; notifying per
    // answer would re-fold the outlines and re-upload 1.6 MB of geometry up to 193 times.
    const { store } = await freshStore();
    const listener = jest.fn();
    store.subscribeToMastery(listener);

    for (let i = 0; i < 20; i++) store.recordResult(result('FRA', 'name', i % 2 === 0));

    expect(listener).not.toHaveBeenCalled();

    store.publishMastery();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when nothing was recorded, so a double-mount costs nothing', async () => {
    const { store } = await freshStore();
    const listener = jest.fn();
    store.subscribeToMastery(listener);

    store.publishMastery();
    store.publishMastery();

    expect(listener).not.toHaveBeenCalled();
    expect(store.getMasterySnapshot().version).toBe(0);
  });
});

describe('the snapshot', () => {
  it('keeps a stable identity between publishes, so the map memo does not re-fold', async () => {
    const { store } = await freshStore();

    const before = store.getMasterySnapshot();
    expect(store.getMasterySnapshot()).toBe(before);

    store.recordResult(result('FRA', 'name', true));
    store.publishMastery();

    const after = store.getMasterySnapshot();
    expect(after).not.toBe(before);
    expect(after.version).toBe(before.version + 1);
    expect(store.getMasterySnapshot()).toBe(after);
  });

  it('carries both score maps, which disagree for a thin record', async () => {
    // The map paints `scores`; `pickWeakSpots` weighs `practiceScores`. A country answered
    // right once is fully known on the map and still worth practising.
    const { store } = await freshStore();

    store.recordResult(result('FRA', 'name', true));
    store.publishMastery();

    const { scores, practiceScores } = store.getMasterySnapshot();
    expect(scores.FRA).toBe(1);
    expect(practiceScores.FRA).toBeCloseTo(0.5, 10);
  });

  it('omits a country that has never been asked', async () => {
    const { store } = await freshStore();

    store.recordResult(result('FRA', 'name', true));
    store.publishMastery();

    const { scores } = store.getMasterySnapshot();
    expect(scores.FRA).toBeGreaterThan(0);
    expect(scores).not.toHaveProperty('DEU');
  });
});

describe('persistence', () => {
  it('coalesces a burst of answers into a single write', async () => {
    const { store, mock } = await freshStore();
    jest.useFakeTimers();

    for (let i = 0; i < 10; i++) store.recordResult(result('FRA', 'name', true));
    expect(mock.__writes()).toBe(0);

    jest.runOnlyPendingTimers();
    expect(mock.__writes()).toBe(1);
  });

  it('flushes immediately on publish rather than waiting for the debounce', async () => {
    const { store, mock } = await freshStore();
    jest.useFakeTimers();

    store.recordResult(result('FRA', 'name', true));
    expect(mock.__writes()).toBe(0);

    store.publishMastery();
    expect(mock.__writes()).toBe(1);
  });

  it('reloads what a previous session wrote', async () => {
    const { store } = await freshStore(
      seeded({ FRA: { name: { asked: 4, correct: 4, lastCorrect: true } } }),
    );

    expect(store.getMasterySnapshot().scores.FRA).toBeGreaterThan(0.5);
  });

  it('does not write straight back what it just read', async () => {
    // A cold start with existing history should cost one read and no write at all.
    const { mock } = await freshStore(
      seeded({ FRA: { name: { asked: 2, correct: 2, lastCorrect: true } } }),
    );

    expect(mock.__writes()).toBe(0);
  });

  it('merges an answer recorded before the read landed, rather than losing it', async () => {
    // The read is async and a deep link straight onto /quiz/play could grade a question
    // first. Assigning the loaded table over the top would silently lose that answer.
    const { store, mock } = isolate(
      seeded({ FRA: { name: { asked: 3, correct: 3, lastCorrect: true } } }),
    );

    store.recordResult(result('FRA', 'name', false));
    await settle();
    store.publishMastery();

    expect(JSON.parse(mock.__raw(MASTERY_KEY) as string).c.FRA.name).toEqual([4, 3, 0]);
  });

  it('survives a failed write without throwing', async () => {
    const { store, mock } = await freshStore();

    mock.__failNextWrite();
    store.recordResult(result('FRA', 'name', true));

    expect(() => store.publishMastery()).not.toThrow();
    await settle();
    // The score is still correct in memory; only the write was lost.
    expect(store.getMasterySnapshot().scores.FRA).toBeGreaterThan(0);
  });

  it('starts empty when the stored blob is corrupt', async () => {
    const { store } = await freshStore((mock) => mock.__seed(MASTERY_KEY, 'not json at all'));
    expect(store.getMasterySnapshot().scores).toEqual({});
  });

  it('starts empty when the read itself fails', async () => {
    const { store } = await freshStore((mock) => mock.__failNextRead());
    expect(store.getMasterySnapshot().scores).toEqual({});
  });
});

describe('resetting', () => {
  it('clears every country, in memory and on disk', async () => {
    const { store, mock } = await freshStore(
      seeded({
        FRA: { name: { asked: 4, correct: 4, lastCorrect: true } },
        DEU: { capital: { asked: 2, correct: 0, lastCorrect: false } },
      }),
    );
    expect(Object.keys(store.getMasterySnapshot().scores)).toHaveLength(2);

    store.resetMastery();

    expect(store.getMasterySnapshot().scores).toEqual({});
    expect(store.getMasterySnapshot().practiceScores).toEqual({});
    expect(JSON.parse(mock.__raw(MASTERY_KEY) as string).c).toEqual({});
  });

  it('notifies even though nothing was recorded, which publish would not', async () => {
    // The trap: `publishMastery` returns early when nothing is dirty, and a reset records
    // nothing. Without an unconditional notify the map keeps painting deleted scores.
    const { store } = await freshStore(
      seeded({ FRA: { name: { asked: 4, correct: 4, lastCorrect: true } } }),
    );
    const seen: number[] = [];
    store.subscribeToMastery((s) => seen.push(s.version));

    store.publishMastery();
    expect(seen).toHaveLength(0);

    const before = store.getMasterySnapshot().version;
    store.resetMastery();

    expect(seen).toHaveLength(1);
    expect(store.getMasterySnapshot().version).toBe(before + 1);
  });

  it('keeps listeners subscribed, unlike the test-only reset', async () => {
    const { store } = await freshStore();
    const seen: number[] = [];
    store.subscribeToMastery((s) => seen.push(s.version));

    store.resetMastery();
    store.recordResult(result('FRA', 'name', true));
    store.publishMastery();

    expect(seen).toHaveLength(2);
    expect(store.getMasterySnapshot().scores.FRA).toBeGreaterThan(0);
  });

  it('writes immediately, so a pending round write cannot resurrect the table', async () => {
    const { store, mock } = await freshStore();
    jest.useFakeTimers();

    store.recordResult(result('FRA', 'name', true));
    store.resetMastery();
    expect(JSON.parse(mock.__raw(MASTERY_KEY) as string).c).toEqual({});

    // The debounce from the record above must have been cancelled, not merely outrun.
    jest.runOnlyPendingTimers();
    expect(JSON.parse(mock.__raw(MASTERY_KEY) as string).c).toEqual({});
    expect(mock.__writes()).toBe(1);
  });

  it('is not undone by a cold-start read that had not landed yet', async () => {
    const { store } = isolate(
      seeded({ FRA: { name: { asked: 3, correct: 3, lastCorrect: true } } }),
    );

    store.resetMastery();
    await settle();

    expect(store.getMasterySnapshot().scores).toEqual({});
  });
});
