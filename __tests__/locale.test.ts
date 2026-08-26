import { coerceLocale, DEFAULT_LOCALE, LOCALES } from '@/i18n/localeTypes';
import { LOCALE_KEY } from '@/i18n/localeStorage';

/**
 * The locale singleton.
 *
 * Structured exactly like `masteryStore.test.ts`, and for the same reason: the module
 * seeds itself from the device and kicks off an async read at import, so each test needs a
 * fresh module registry rather than a shared instance - **and the storage mock has to be
 * required from inside the same `isolateModules` block**, or the store reads a different
 * object than the test seeded.
 */

type Store = typeof import('@/i18n/locale');

type StorageMock = {
  __reset(): void;
  __seed(key: string, value: string): void;
  __raw(key: string): string | null;
  __writes(): number;
  __failNextWrite(): void;
  __failNextRead(): void;
};

/**
 * Pin what the device says before the module reads it.
 *
 * `Intl.DateTimeFormat` rather than a mocked module, because that is genuinely what
 * `deviceLocale()` calls - the whole point of that choice was avoiding a native dependency
 * for this one string.
 */
function withDeviceLocale(tag: string | null, run: () => void): void {
  const real = Intl.DateTimeFormat;

  Object.defineProperty(Intl, 'DateTimeFormat', {
    configurable: true,
    writable: true,
    value:
      tag === null
        ? () => {
            throw new Error('no Intl on this runtime');
          }
        : () => ({ resolvedOptions: () => ({ locale: tag }) }),
  });

  try {
    run();
  } finally {
    Object.defineProperty(Intl, 'DateTimeFormat', {
      configurable: true,
      writable: true,
      value: real,
    });
  }
}

function isolate(device: string | null, stored?: string): { store: Store; mock: StorageMock } {
  let store!: Store;
  let mock!: StorageMock;

  withDeviceLocale(device, () => {
    jest.isolateModules(() => {
      mock = (require('@react-native-async-storage/async-storage') as { default: StorageMock })
        .default;
      mock.__reset();
      if (stored !== undefined) mock.__seed(LOCALE_KEY, stored);
      store = require('@/i18n/locale') as Store;
    });
  });

  return { store, mock };
}

/** Let the load promise the module started at import settle. */
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function freshStore(device: string | null, stored?: string) {
  const isolated = isolate(device, stored);
  await settle();
  return isolated;
}

describe('coerceLocale', () => {
  it('takes the language subtag, however the tag is spelled', () => {
    expect(coerceLocale('ru')).toBe('ru');
    expect(coerceLocale('ru-RU')).toBe('ru');
    // Android's `java.util.Locale.toString()` uses an underscore, and it is not worth
    // finding out the hard way which one Hermes hands back.
    expect(coerceLocale('ru_RU')).toBe('ru');
    expect(coerceLocale('RU')).toBe('ru');
    expect(coerceLocale('en-GB')).toBe('en');
  });

  it('never throws, and falls back to English', () => {
    for (const raw of [null, undefined, '', 'xx', 'de-DE', '  ', '-']) {
      expect(LOCALES).toContain(coerceLocale(raw));
      expect(coerceLocale(raw)).toBe(DEFAULT_LOCALE);
    }
  });
});

describe('the locale store', () => {
  it('starts on the device language, synchronously, before storage has answered', () => {
    const { store } = isolate('ru-RU');
    expect(store.getLocale()).toBe('ru');
  });

  it('falls back to English on a runtime with no Intl', () => {
    const { store } = isolate(null);
    expect(store.getLocale()).toBe(DEFAULT_LOCALE);
  });

  it('lets a stored choice override the device', async () => {
    const { store } = await freshStore('ru-RU', 'en');
    expect(store.getLocale()).toBe('en');
  });

  /**
   * The load-bearing asymmetry with `masteryStore`, which notifies unconditionally.
   *
   * The overwhelmingly common cases are a fresh install and a device that already agrees,
   * and a notify one frame after mount would re-render the map's layers for nothing.
   */
  it('does not notify when storage agrees with the device', async () => {
    const { store } = isolate('ru-RU', 'ru');
    const listener = jest.fn();
    store.subscribeToLocale(listener);

    await settle();

    expect(listener).not.toHaveBeenCalled();
    expect(store.getLocale()).toBe('ru');
  });

  it('does not notify when nothing is stored at all', async () => {
    const { store } = isolate('ru-RU');
    const listener = jest.fn();
    store.subscribeToLocale(listener);

    await settle();

    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies exactly once when a stored choice disagrees', async () => {
    const { store } = isolate('ru-RU', 'en');
    const listener = jest.fn();
    store.subscribeToLocale(listener);

    await settle();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith('en');
  });

  it('notifies and persists on a real change', async () => {
    const { store, mock } = await freshStore('en-US');
    const listener = jest.fn();
    store.subscribeToLocale(listener);

    store.setLocale('ru');
    await settle();

    expect(store.getLocale()).toBe('ru');
    expect(listener).toHaveBeenCalledWith('ru');
    expect(mock.__raw(LOCALE_KEY)).toBe('ru');
  });

  /** No debounce, unlike mastery: this fires once per tap, so it writes straight through. */
  it('writes on every change rather than debouncing', async () => {
    const { store, mock } = await freshStore('en-US');
    const before = mock.__writes();

    store.setLocale('ru');
    store.setLocale('en');
    await settle();

    expect(mock.__writes()).toBe(before + 2);
  });

  it('is a no-op when set to the language already active', async () => {
    const { store, mock } = await freshStore('en-US');
    const listener = jest.fn();
    store.subscribeToLocale(listener);
    const before = mock.__writes();

    store.setLocale('en');
    await settle();

    expect(listener).not.toHaveBeenCalled();
    expect(mock.__writes()).toBe(before);
  });

  it('stops calling a listener that unsubscribed', async () => {
    const { store } = await freshStore('en-US');
    const listener = jest.fn();
    const unsubscribe = store.subscribeToLocale(listener);

    unsubscribe();
    store.setLocale('ru');

    expect(listener).not.toHaveBeenCalled();
  });

  /** A failed write costs a preference, never a session. */
  it('swallows a write that fails', async () => {
    const { store, mock } = await freshStore('en-US');
    mock.__failNextWrite();

    expect(() => store.setLocale('ru')).not.toThrow();
    await settle();

    expect(store.getLocale()).toBe('ru');
  });

  it('swallows a read that fails and keeps the device language', async () => {
    let store!: Store;

    withDeviceLocale('ru-RU', () => {
      jest.isolateModules(() => {
        const mock = (
          require('@react-native-async-storage/async-storage') as { default: StorageMock }
        ).default;
        mock.__reset();
        mock.__failNextRead();
        store = require('@/i18n/locale') as Store;
      });
    });

    await settle();

    expect(store.getLocale()).toBe('ru');
  });
});
