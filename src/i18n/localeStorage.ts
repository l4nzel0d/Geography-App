import AsyncStorage from '@react-native-async-storage/async-storage';

import { coerceLocale, type Locale } from './localeTypes';

/**
 * Remembering the language across a cold start.
 *
 * Mirrors `mastery/masteryStorage.ts` exactly, down to the never-rejects contract: one
 * key, both functions swallow their failures, and there is a `.web.ts` sibling because
 * AsyncStorage 2.2.0's web path reaches straight for `window.localStorage` with no guard
 * while `web.output: "static"` renders every route in Node, where there is no window.
 *
 * A file-extension split, not a `Platform.OS` check - there are still zero of those in
 * `src/`.
 */

export const LOCALE_KEY = 'geo.locale.v1';

/**
 * The stored language, or null if the player has never chosen one.
 *
 * **Null and `'en'` are different answers**, which is why this is not typed `Locale`. Null
 * means "no preference recorded", and the store answers that with the device's own
 * language; `'en'` means someone on a Russian phone deliberately asked for English, and
 * that must survive a restart. Collapsing the two would make the switcher useless for
 * exactly the people most likely to need it.
 */
export async function loadLocale(): Promise<Locale | null> {
  try {
    const stored = await AsyncStorage.getItem(LOCALE_KEY);
    return stored ? coerceLocale(stored) : null;
  } catch {
    return null;
  }
}

/** Persist the choice. Never rejects - a failed write costs a preference, not a session. */
export async function saveLocale(locale: Locale): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // Deliberately swallowed, as in masteryStorage.
  }
}
