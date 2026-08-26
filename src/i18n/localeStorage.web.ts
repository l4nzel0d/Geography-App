import type { Locale } from './localeTypes';

/**
 * The same two functions, doing nothing.
 *
 * On the web the locale is not a preference but a **property of the deployment**: `/` is
 * the English bundle and `/ru` is the Russian one, each a separate static export. There is
 * nothing to remember, because the URL already says it - and remembering would be actively
 * wrong, silently overriding the language somebody was explicitly sent a link to.
 *
 * This file exists so the web bundle never imports the AsyncStorage native module, exactly
 * as `masteryStorage.web.ts` does. Both stay `async` so the two platforms present an
 * identical signature and `locale.ts` never has to know which one it got.
 */

export const LOCALE_KEY = 'geo.locale.v1';

export async function loadLocale(): Promise<Locale | null> {
  return null;
}

export async function saveLocale(_locale: Locale): Promise<void> {
  // Nothing to do: see above.
}
