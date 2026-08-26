/**
 * Dynamic config, layered over `app.json`.
 *
 * `app.json` is still the source of truth for everything static; this file exists for one
 * reason, which is that the web target ships **twice** - English at `/` and Russian at
 * `/ru` - and the second build needs `experiments.baseUrl` set.
 *
 * With `EXPO_PUBLIC_LOCALE` unset, `baseUrl` is `undefined` and this resolves to exactly
 * the config `app.json` already described. **Every native build takes that path**, so
 * `expo run:android`, `expo prebuild` and the release build are unchanged - which is what
 * lets a web-only feature land without a native rebuild.
 *
 * The one trap worth naming: do not export `EXPO_PUBLIC_LOCALE` in your shell. It would
 * silently give a native build a `/ru` base URL, and every `require`d asset would resolve
 * under a path that does not exist inside an APK.
 */
const LOCALE = process.env.EXPO_PUBLIC_LOCALE === 'ru' ? 'ru' : 'en';

/**
 * Where each locale's static export is deployed. Must agree with
 * `LOCALE_PATH_PREFIX` in `src/i18n/localePath.ts`, which is what the app's own links use.
 */
const BASE_URL = { en: undefined, ru: '/ru' };

module.exports = ({ config }) => ({
  ...config,
  experiments: {
    ...config.experiments,
    // `getBaseUrlFromExpoConfig` in @expo/cli reads this and trims trailing slashes;
    // absent resolves to '', which is what every native and English build gets.
    baseUrl: BASE_URL[LOCALE],
  },
});
