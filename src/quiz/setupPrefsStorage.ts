import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  decodeSetupPrefs,
  encodeSetupPrefs,
  type QuizSetupPrefs,
  SETUP_PREFS_KEY,
} from './setupPrefs';

/**
 * Reading and writing the quiz setup preferences on a device.
 *
 * The whole module is I/O; everything interesting about the shape lives in `setupPrefs.ts`,
 * which is pure and is where the tests are. Modelled on `i18n/localeStorage.ts`, down to the
 * never-rejects contract.
 *
 * **There is a `.web.ts` sibling, and it is not optional** - see its docstring for why it
 * takes the `masteryStorage.web.ts` shape rather than the locale's. A file-extension split,
 * not a `Platform.OS` check; there are still zero of those in `src/`.
 */

/**
 * Whatever was stored, as the subset of preferences it described. Never rejects.
 *
 * Returns the `Partial` the codec produced rather than a merged value, so the caller can
 * still tell "nothing was stored" from "everything stored was rejected". A read that fails
 * means no preferences, which is exactly what a fresh install has.
 */
export async function loadSetupPrefs(): Promise<Partial<QuizSetupPrefs>> {
  try {
    return decodeSetupPrefs(await AsyncStorage.getItem(SETUP_PREFS_KEY));
  } catch {
    return {};
  }
}

/**
 * Persist the preferences. Never rejects.
 *
 * A failed write costs the player one re-pick on their next launch. Surfacing it as an
 * unhandled rejection while they are choosing a round would cost them the round.
 */
export async function saveSetupPrefs(prefs: QuizSetupPrefs): Promise<void> {
  try {
    await AsyncStorage.setItem(SETUP_PREFS_KEY, encodeSetupPrefs(prefs));
  } catch {
    // Deliberately swallowed - see above.
  }
}
