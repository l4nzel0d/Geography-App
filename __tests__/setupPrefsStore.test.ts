import {
  DEFAULT_SETUP_PREFS,
  encodeSetupPrefs,
  decodeSetupPrefs,
  mergeSetupPrefs,
  type QuizSetupPrefs,
  SETUP_PREFS_KEY,
} from '@/quiz/setupPrefs';

/**
 * The store starts an async read at import, so each test needs a fresh module registry.
 *
 * **The storage mock must be required from INSIDE the same `isolateModules` block**, for
 * the reason `masteryStore.test.ts` spells out: a fresh registry gives the store its own
 * instance of the mock, so a seed taken from a top-level import would be a different object
 * and the store would silently read an empty one.
 */
type Store = typeof import('@/quiz/setupPrefsStore');

type StorageMock = {
  __reset(): void;
  __seed(key: string, value: string): void;
  __raw(key: string): string | null;
  __writes(): number;
  __failNextWrite(): void;
  __failNextRead(): void;
};

function isolate(seed?: (mock: StorageMock) => void): { store: Store; mock: StorageMock } {
  let store!: Store;
  let mock!: StorageMock;

  jest.isolateModules(() => {
    mock = (require('@react-native-async-storage/async-storage') as { default: StorageMock })
      .default;
    mock.__reset();
    seed?.(mock);
    store = require('@/quiz/setupPrefsStore') as Store;
  });

  return { store, mock };
}

const STORED: QuizSetupPrefs = {
  mode: 'flag',
  subregions: ['Polynesia'],
  fields: ['capital'],
  practice: true,
  choice: true,
};

const seeded = (prefs: QuizSetupPrefs) => (mock: StorageMock) =>
  mock.__seed(SETUP_PREFS_KEY, encodeSetupPrefs(prefs));

/** What is actually on disk, decoded back into prefs. */
const onDisk = (mock: StorageMock): QuizSetupPrefs =>
  mergeSetupPrefs(decodeSetupPrefs(mock.__raw(SETUP_PREFS_KEY)));

describe('hydration', () => {
  it('reads the defaults synchronously before the disk answers', () => {
    const { store } = isolate(seeded(STORED));
    // Deliberately not awaited: this is the frame the setup screen seeds its state in.
    expect(store.getSetupPrefs()).toEqual(DEFAULT_SETUP_PREFS);
  });

  it('holds the stored prefs once the read lands', async () => {
    const { store } = isolate(seeded(STORED));
    await store.whenSetupPrefsReady();
    expect(store.getSetupPrefs()).toEqual(STORED);
  });

  it('stays on the defaults when nothing was stored', async () => {
    const { store } = isolate();
    await store.whenSetupPrefsReady();
    expect(store.getSetupPrefs()).toEqual(DEFAULT_SETUP_PREFS);
  });

  it('stays on the defaults when the blob is corrupt', async () => {
    const { store } = isolate((mock) => mock.__seed(SETUP_PREFS_KEY, 'not json at all'));
    await store.whenSetupPrefsReady();
    expect(store.getSetupPrefs()).toEqual(DEFAULT_SETUP_PREFS);
  });

  it('never rejects when the read itself fails', async () => {
    const { store } = isolate((mock) => {
      mock.__seed(SETUP_PREFS_KEY, encodeSetupPrefs(STORED));
      mock.__failNextRead();
    });
    await expect(store.whenSetupPrefsReady()).resolves.toBeUndefined();
    expect(store.getSetupPrefs()).toEqual(DEFAULT_SETUP_PREFS);
  });

  it('does NOT undo a write that landed before the read resolved', async () => {
    // The race the store's `written` flag exists for. A player who taps a picker in the
    // first frames must not have their choice reverted by a value that is now stale.
    const { store } = isolate(seeded(STORED));

    const chosen: QuizSetupPrefs = { ...DEFAULT_SETUP_PREFS, mode: 'locate' };
    store.saveSetupPrefs(chosen);

    await store.whenSetupPrefsReady();
    expect(store.getSetupPrefs()).toEqual(chosen);
  });
});

describe('writing', () => {
  it('writes through immediately, with no debounce to wait on', async () => {
    const { store, mock } = isolate();
    await store.whenSetupPrefsReady();

    store.saveSetupPrefs(STORED);

    // One tap, one write - the call `setLocale` makes. `masteryStore` batches because it
    // is written up to 193 times a round; this is not.
    expect(mock.__writes()).toBe(1);
    expect(onDisk(mock)).toEqual(STORED);
  });

  it('makes the new value readable at once', async () => {
    const { store } = isolate();
    await store.whenSetupPrefsReady();

    store.saveSetupPrefs(STORED);
    expect(store.getSetupPrefs()).toEqual(STORED);
  });

  it('never rejects when the write fails', async () => {
    const { store, mock } = isolate();
    await store.whenSetupPrefsReady();
    mock.__failNextWrite();

    expect(() => store.saveSetupPrefs(STORED)).not.toThrow();
    // The in-memory value still moved: a failed write costs the next launch, not this one.
    expect(store.getSetupPrefs()).toEqual(STORED);
    await Promise.resolve();
  });
});

describe('__resetSetupPrefs', () => {
  it('rewinds to the defaults and forgets that anything was written', async () => {
    const { store } = isolate();
    await store.whenSetupPrefsReady();

    store.saveSetupPrefs(STORED);
    store.__resetSetupPrefs();

    expect(store.getSetupPrefs()).toEqual(DEFAULT_SETUP_PREFS);
  });
});
