import { DEFAULT_SETUP_PREFS, mergeSetupPrefs, type QuizSetupPrefs } from './setupPrefs';
import { loadSetupPrefs, saveSetupPrefs as persist } from './setupPrefsStorage';

/**
 * The player's last quiz setup, held in memory and written through to disk.
 *
 * Modelled on `mastery/masteryStore.ts` and `i18n/locale.ts` - a module singleton read at
 * import, so screens stay renderable bare in Jest with no context and no provider.
 *
 * **There is deliberately no subscribe/notify.** The setup screen is the only reader and the
 * only writer, and a listener set with exactly one subscriber is machinery for nothing. That
 * is the one place this diverges from both modules it is modelled on, and it is why the
 * screen gets `whenSetupPrefsReady()` instead: it needs to know when the disk read landed,
 * not to be told about changes it made itself.
 *
 * **There is also no write debounce**, unlike `masteryStore`. That store batches because
 * `recordResult` fires up to 193 times a round; this is written once per tap on a picker,
 * which is the call `setLocale` already makes without one.
 */

let prefs: QuizSetupPrefs = { ...DEFAULT_SETUP_PREFS };

/**
 * Whether anything has been written since this module loaded.
 *
 * The same guard as `masteryStore`'s `cleared` flag, for the same race: the import-time read
 * is async, and a player who reaches the setup screen and taps a picker before it resolves
 * would otherwise have their choice undone by a value that is now stale. Once we are our own
 * most recent writer, the disk has nothing left to tell us.
 */
let written = false;

const ready: Promise<void> = loadSetupPrefs()
  .then((stored) => {
    if (written) return;
    prefs = mergeSetupPrefs(stored);
  })
  // `loadSetupPrefs` already swallows its own failures; this is the belt to that braces, so
  // an unexpected rejection at import can never become an unhandled one.
  .catch(() => {});

/**
 * The current preferences, synchronously.
 *
 * Returns the defaults until the disk read lands, which is what lets the setup screen seed
 * `useState` with it directly. In practice the read has resolved long before anyone taps the
 * Quiz pill; `whenSetupPrefsReady` covers the case where it has not.
 */
export function getSetupPrefs(): QuizSetupPrefs {
  return prefs;
}

/** Record the choice and write it through. Never rejects - a failed write costs a preference. */
export function saveSetupPrefs(next: QuizSetupPrefs): void {
  written = true;
  prefs = next;
  void persist(next);
}

/**
 * Resolves once the import-time read has been applied, or discarded.
 *
 * The setup screen awaits this to pick up preferences that landed after it mounted. It never
 * rejects, so a caller needs no `catch` of its own.
 */
export function whenSetupPrefsReady(): Promise<void> {
  return ready;
}

/**
 * Test-only rewind.
 *
 * Puts the module back to its defaults and forgets that anything was written. It does NOT
 * re-run the import-time read - Jest gives a fresh module registry per file, so a suite that
 * needs a different stored value sets it on the AsyncStorage mock and re-imports.
 */
export function __resetSetupPrefs(): void {
  prefs = { ...DEFAULT_SETUP_PREFS };
  written = false;
}
