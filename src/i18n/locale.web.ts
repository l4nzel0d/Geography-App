import { BASE_URL } from './baseUrl';
import { localeHref, LOCALE_PATH_PREFIX } from './localePath';
import { DEFAULT_LOCALE, LOCALES, type Locale } from './localeTypes';

/**
 * The active language on the web, which is fixed for the life of the document.
 *
 * `/` and `/ru` are **two separate static exports**, each with its own bundle, its own
 * pre-rendered HTML and its own service worker. So the language is not state here: it was
 * decided at build time, it is baked into every string in this bundle, and the only way to
 * change it is to load the other one.
 *
 * That is why this file exists rather than a `Platform.OS` branch inside `locale.ts`. Every
 * call site is written against the native signature - `getLocale`, `setLocale`,
 * `subscribeToLocale` - and here `subscribeToLocale` compiles to a dead effect and
 * `setLocale` to a navigation. No caller knows the difference.
 */

/**
 * Derived from the base URL, deliberately **not** from `EXPO_PUBLIC_LOCALE`.
 *
 * `baseUrl` is part of Metro's transform cache key and the public env var is not, so
 * reading the var here would let the second of the two exports inherit the first one's
 * inlined value. See the long note in `baseUrl.ts`.
 */
export const LOCALE: Locale =
  LOCALES.find((locale) => LOCALE_PATH_PREFIX[locale] === BASE_URL) ?? DEFAULT_LOCALE;

export function getLocale(): Locale {
  return LOCALE;
}

/**
 * Never fires - the locale cannot change without a document navigation, which takes the
 * whole React tree with it. Present so screens can subscribe unconditionally.
 */
export function subscribeToLocale(_listener: (locale: Locale) => void): () => void {
  return () => {};
}

/**
 * Load the other language's build, on the same page.
 *
 * A **document** navigation, not `router.replace`: the two locales are two different
 * bundles, and a client-side route change would keep this one and only rewrite the address
 * bar - the URL would say Russian and every string would stay English.
 *
 * The path and query come along, so switching mid-round keeps the seed and lands on the
 * same question. `localeHref` is pure and tested; this function is the one line that is not.
 */
export function setLocale(next: Locale): void {
  if (next === LOCALE || typeof window === 'undefined') return;

  window.location.assign(localeHref(next, window.location.pathname + window.location.search));
}

/** Tests only, and a no-op: the web locale is a build constant. Mirrors the native export. */
export function __resetLocale(_next: Locale = DEFAULT_LOCALE): void {}
