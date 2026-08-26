/**
 * What a locale is, and how an untrusted string becomes one.
 *
 * Split out from `locale.ts` so the pure parts - the union, the list, the coercion - can
 * be imported by the web sibling, by `localePath.ts` and by the string catalogues without
 * dragging in either platform's storage. `locale.ts` and `locale.web.ts` are the two files
 * Metro chooses between; everything here is shared by both.
 */

export const LOCALES = ['en', 'ru'] as const;

export type Locale = (typeof LOCALES)[number];

/**
 * `satisfies` rather than a `: Locale` annotation, so this keeps the literal type `'en'`.
 *
 * Not a style point: `Exclude<Locale, typeof DEFAULT_LOCALE>` is how `countryFacts.ts`
 * narrows to "a locale that actually has a translation block", and with the wider
 * annotation that exclusion collapses to `never`.
 */
export const DEFAULT_LOCALE = 'en' satisfies Locale;

/**
 * The language subtag of a BCP-47 tag, or of anything close enough to one.
 *
 * Deliberately forgiving in exactly the way `parseQuizParams` is: this is fed by
 * `Intl.DateTimeFormat().resolvedOptions().locale`, by AsyncStorage and by a URL, none of
 * which is under our control, and none of which is worth throwing over. Anything
 * unrecognised is `DEFAULT_LOCALE`.
 *
 * `ru-RU`, `ru_RU` and `RU` all mean Russian; a bare region subtag never reaches us
 * because we only ever compare the first segment.
 */
export function coerceLocale(raw: string | null | undefined): Locale {
  if (!raw) return DEFAULT_LOCALE;

  // Underscores as well as hyphens: Android's `java.util.Locale.toString()` uses `ru_RU`,
  // and it is not worth finding out the hard way which one Hermes hands back.
  const language = raw.split(/[-_]/)[0]?.toLowerCase();

  return LOCALES.find((locale) => locale === language) ?? DEFAULT_LOCALE;
}

/**
 * Build one value per locale, eagerly.
 *
 * Every derived structure in this app that depends on the language - the facts tables, the
 * quiz pool, the name index, the search index - is a module constant whose referential
 * stability something downstream relies on. Materialising all of them up front is what
 * makes each locale's value permanently identity-stable: a lazily built table would hand
 * out a fresh object the first time each locale was asked for, and switching language
 * would then look like a data change to everything holding one.
 *
 * `Object.fromEntries` cannot express this without a double cast, which is the only reason
 * this is a function rather than one line at each site.
 */
export function byLocale<T>(build: (locale: Locale) => T): Record<Locale, T> {
  const table = {} as Record<Locale, T>;
  for (const locale of LOCALES) table[locale] = build(locale);
  return table;
}
