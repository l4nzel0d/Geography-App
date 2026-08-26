import { __resetLocale } from '@/i18n/locale';

/**
 * Pin the language for every test.
 *
 * **This is not boilerplate.** The locale singleton seeds itself from the device via
 * `Intl.DateTimeFormat().resolvedOptions().locale`, and under Jest that is the machine
 * running the suite - which on a Russian-locale Windows box is `ru-RU`. Without this the
 * whole suite renders in Russian on some developers' machines and English on others, and
 * every existing assertion about English wording fails for a reason that looks nothing
 * like the actual cause.
 *
 * English is the pin because that is what the ~40 existing suites assert. A test that
 * wants Russian says so explicitly - `translatorFor('ru')` for pure modules, or
 * `setLocale('ru')` inside the test for a rendered screen.
 *
 * `beforeEach` rather than a one-off: Jest gives each test FILE a fresh module registry,
 * but not each test, so a `setLocale('ru')` in one test would otherwise leak into the next
 * one in the same file.
 */
/*
  Pinned TWICE, and both are load-bearing.

  `setupFilesAfterEnv` runs before the test file is required, so this top-level call is
  what covers everything evaluated at COLLECTION time - a `describe` body that builds a
  fixture with `getCountryFacts('FRA')` reads the locale long before any `beforeEach`
  fires, and on a ru-RU machine that fixture came back as Франция.
*/
__resetLocale('en');

/** And again per test, so a `setLocale('ru')` inside one cannot leak into the next. */
beforeEach(() => {
  __resetLocale('en');
});
