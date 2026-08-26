/**
 * An in-memory AsyncStorage, so the mastery store can be tested without a device.
 *
 * Hand-rolled rather than the package's own `jest/async-storage-mock`, for two reasons the
 * store's tests need: writes are COUNTED, so a test can prove the debounce coalesces a
 * burst into one write, and `failNextWrite()` can inject a rejection, so a test can prove
 * a failed write never surfaces.
 *
 * A root `__mocks__/<package>` directory is picked up automatically for node_modules
 * packages - the same way `__mocks__/@maplibre/maplibre-react-native.tsx` already works,
 * with no `jest.mock` call anywhere.
 */
const store = new Map<string, string>();

let writes = 0;
let reads = 0;
let failWrite = false;
let failRead = false;

const AsyncStorageMock = {
  async getItem(key: string): Promise<string | null> {
    reads += 1;
    if (failRead) {
      failRead = false;
      throw new Error('mock read failure');
    }
    return store.has(key) ? (store.get(key) as string) : null;
  },

  async setItem(key: string, value: string): Promise<void> {
    writes += 1;
    if (failWrite) {
      failWrite = false;
      throw new Error('mock write failure');
    }
    store.set(key, value);
  },

  async removeItem(key: string): Promise<void> {
    store.delete(key);
  },

  async clear(): Promise<void> {
    store.clear();
  },

  // -- test helpers, not part of the real API --

  __reset(): void {
    store.clear();
    writes = 0;
    reads = 0;
    failWrite = false;
    failRead = false;
  },
  __seed(key: string, value: string): void {
    store.set(key, value);
  },
  __raw(key: string): string | null {
    return store.get(key) ?? null;
  },
  __writes(): number {
    return writes;
  },
  __reads(): number {
    return reads;
  },
  __failNextWrite(): void {
    failWrite = true;
  },
  __failNextRead(): void {
    failRead = true;
  },
};

export default AsyncStorageMock;
