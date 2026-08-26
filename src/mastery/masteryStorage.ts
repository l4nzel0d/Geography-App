import AsyncStorage from '@react-native-async-storage/async-storage';

import { decodeMastery, encodeMastery, MASTERY_KEY } from './masteryCodec';
import type { MasteryTable } from './masteryScore';

/**
 * Reading and writing the mastery table on a device.
 *
 * The whole module is I/O; everything interesting about the shape lives in
 * `masteryCodec.ts`, which is pure and is where the tests are.
 *
 * **There is a `.web.ts` sibling, and it is not optional.** AsyncStorage 2.2.0's web
 * implementation reaches straight for `window.localStorage` with no guard, and
 * `web.output: "static"` renders every route in Node, where there is no window. Metro
 * picks the platform by file extension, so the web build never imports this file at all -
 * the same split `useWindowSize`, `keyboardPlay` and `mapFlagImages` already use, and NOT
 * a `Platform.OS` check (there are still zero of those in `src/`).
 */

/** Whatever was stored, or an empty table. Never rejects. */
export async function loadMastery(): Promise<MasteryTable> {
  try {
    return decodeMastery(await AsyncStorage.getItem(MASTERY_KEY));
  } catch {
    // A read that fails means no history, which is exactly what a fresh install has.
    return {};
  }
}

/**
 * Persist the table. Never rejects.
 *
 * A failed write costs the player some history they can regenerate by playing. Surfacing
 * it as an unhandled rejection mid-round would cost them the round.
 */
export async function saveMastery(table: MasteryTable): Promise<void> {
  try {
    await AsyncStorage.setItem(MASTERY_KEY, encodeMastery(table));
  } catch {
    // Deliberately swallowed - see above.
  }
}
