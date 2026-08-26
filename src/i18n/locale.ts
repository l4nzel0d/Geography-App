import { coerceLocale, DEFAULT_LOCALE, type Locale } from './localeTypes';
import { loadLocale, saveLocale } from './localeStorage';

/**
 * The active language at runtime, and how the screens hear about it.
 *
 * A module singleton with subscribe/notify, modelled directly on `mastery/masteryStore.ts`
 * and `search/pendingCountry.ts` - not a React context. `_layout.tsx` has no providers at
 * all, and keeping it that way is what lets `MapScreen.test.tsx`, `SearchScreen.test.tsx`
 * and `QuizScreens.test.tsx` render their screens bare, with no provider and no router
 * mock.
 *
 * ## Two deliberate differences from `masteryStore`
 *
 * **No write debounce.** `recordResult` fires up to 193 times a round, so it needed one.
 * `setLocale` fires at most once per tap on a pill, so it writes straight through.
 *
 * **The startup read notifies only when it actually disagrees.** `masteryStore` notifies
 * unconditionally because its first frame is an empty table and re-folding it is the point.
 * Here the common case is that storage agrees with the device, and a notify one frame after
 * mount would re-render the map's layers for nothing.
 *
 * ## There is a `.web.ts` sibling with the same four exports
 *
 * On the web the language is a property of the deployment rather than a piece of state -
 * `/` is one bundle and `/ru` is another - so `setLocale` there is a document navigation
 * and `subscribeToLocale` never fires. Every call site is written against this signature
 * and none of them knows which world it is in, which is what keeps the count of
 * `Platform.OS` checks in `src/` at zero.
 */

type Listener = (locale: Locale) => void;

const listeners = new Set<Listener>();

/**
 * The device's own language, used until storage says otherwise.
 *
 * `Intl` rather than `expo-localization`, and that is worth a sentence: the module would
 * work, but it is a **native dependency**, so it costs an `app.json` edit, an
 * `expo prebuild` and a full rebuild - for one string that Hermes already has. Hermes on
 * Android delegates `Intl` to the platform's ICU, so this is `java.util.Locale.getDefault()`
 * with extra steps, and `formatters.ts` has been calling `Intl.NumberFormat` in production
 * since the first release.
 *
 * Wrapped anyway: a runtime without `Intl` should give an English app, not a crash on the
 * first frame.
 */
function deviceLocale(): Locale {
  try {
    return coerceLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return DEFAULT_LOCALE;
  }
}

let locale: Locale = deviceLocale();

/**
 * The active language.
 *
 * Safe to call at module scope: it is seeded synchronously from the device before any
 * component renders, so nothing ever sees an undefined locale or has to wait for storage.
 */
export function getLocale(): Locale {
  return locale;
}

/** Returns an unsubscribe function, shaped for a bare `useEffect` return. */
export function subscribeToLocale(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of [...listeners]) listener(locale);
}

/** Switch language, persist it, and tell every mounted screen. A no-op if unchanged. */
export function setLocale(next: Locale): void {
  if (next === locale) return;

  locale = next;
  void saveLocale(next);
  notify();
}

/**
 * Kicked off at module import, so the read starts on the app's first frame.
 *
 * Silent when there is nothing stored (a fresh install, where the device default already
 * stands) or when the stored value agrees with it, which is the overwhelmingly common case.
 * Only a player who has actually overridden their device language pays a re-render here.
 */
void loadLocale().then((stored) => {
  if (!stored || stored === locale) return;

  locale = stored;
  notify();
});

/** Tests only. There is no user-facing reset. */
export function __resetLocale(next: Locale = DEFAULT_LOCALE): void {
  locale = next;
  listeners.clear();
}
