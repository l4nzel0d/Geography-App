import { LOCALES, type Locale } from './localeTypes';

/**
 * Rewriting a URL path from one locale's tree to another's.
 *
 * Pure, and separate from `locale.web.ts`, so it can be unit-tested with no DOM - the same
 * reason `quizCamera.ts` does the Mercator arithmetic itself rather than handing MapLibre a
 * bounds.
 *
 * Preserving the path and query is the whole point, and it is worth the file: the entire
 * quiz config lives in the URL, so switching language mid-round round-trips the seed, the
 * mode and the field list and lands the player on the same question in the other language.
 * Dropping them and going to the other tree's root would silently bin the round.
 */

/** Where each locale's static export is deployed. English is the root. */
export const LOCALE_PATH_PREFIX: Record<Locale, string> = { en: '', ru: '/ru' };

/**
 * The locale a path is currently in, judged by its first segment.
 *
 * Matched at a **segment boundary**, so a future `/rugby` route would not be mistaken for
 * Russian. There is no such route today; the guard costs one character and removes the
 * need to think about it again.
 */
function prefixOf(pathname: string): { locale: Locale; rest: string } {
  for (const locale of LOCALES) {
    const prefix = LOCALE_PATH_PREFIX[locale];
    if (!prefix) continue;

    if (pathname === prefix) return { locale, rest: '/' };
    if (pathname.startsWith(`${prefix}/`)) return { locale, rest: pathname.slice(prefix.length) };
  }

  return { locale: 'en', rest: pathname || '/' };
}

/**
 * The same page in `target`'s tree, query and fragment intact.
 *
 * Idempotent: a path already in the target locale comes back unchanged, so a stray double
 * call cannot produce `/ru/ru/search`.
 *
 * The root case returns the bare prefix (`/ru`, not `/ru/`) because `vercel.json` sets
 * `trailingSlash: false` - emitting the slash would cost every language switch a redirect.
 */
export function localeHref(target: Locale, url: string): string {
  const cut = url.search(/[?#]/);
  const pathname = cut === -1 ? url : url.slice(0, cut);
  const suffix = cut === -1 ? '' : url.slice(cut);

  const { rest } = prefixOf(pathname);
  const prefix = LOCALE_PATH_PREFIX[target];

  // `rest` is always rooted, so `/` collapses to the bare prefix and everything else
  // concatenates. For English the prefix is empty and this is a no-op that returns `rest`.
  const path = rest === '/' ? prefix || '/' : `${prefix}${rest}`;

  return `${path}${suffix}`;
}
