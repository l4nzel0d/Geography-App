/**
 * The path prefix this bundle was built to live under.
 *
 * Empty on native and in the English web build; `/ru` in the Russian one, where
 * `app.config.js` sets `experiments.baseUrl`. `babel-preset-expo` inlines
 * `process.env.EXPO_BASE_URL` at build time, so this is a constant by the time it runs -
 * there is no runtime lookup and no way for it to disagree with the URLs expo-router
 * generates, which come from the same value.
 *
 * **This, and not `EXPO_PUBLIC_LOCALE`, is what the web locale is derived from.** The two
 * are not equally safe. `baseUrl` is a Metro `customTransformOptions` entry and therefore
 * part of the transform cache key, so the two exports get separate cache entries;
 * `EXPO_PUBLIC_*` is Babel-inlined but is in **no** cache key at all. Reading the public
 * var in app code would let a second export in the same working tree reuse the first
 * export's cached transform and quietly inline the wrong language - a build that succeeds
 * and is wrong, which is precisely the shape of the stale-Gradle-bundle bug in CLAUDE.md.
 * `EXPO_PUBLIC_LOCALE` stays an input to `app.config.js` and nothing else.
 */
export const BASE_URL: string = process.env.EXPO_BASE_URL ?? '';

/**
 * Prefix a root-relative URL with the base.
 *
 * Needed only for URLs written by hand - the MapLibre worker, the flag images, and the
 * links in `+html.tsx`. Anything Metro resolves (`require`d assets, the bundle itself) and
 * anything expo-router generates is already prefixed.
 *
 * Getting this wrong does not fail online, which is what makes it dangerous: the English
 * deploy serves `/flags/ru.svg` and a page at `/ru/` will happily load it. But that URL is
 * **outside the `/ru/` service worker's scope**, so no worker handles it and the Russian
 * PWA loses its flags and its map worker the moment it goes offline - against the one hard
 * requirement this project has.
 */
export function withBaseUrl(path: string): string {
  return `${BASE_URL}${path}`;
}
