import { en } from './en';
import { enPlurals } from './en.plurals';
import { getLocale } from './locale';
import { DEFAULT_LOCALE, type Locale } from './localeTypes';
import { type PluralForms, selectPluralForm } from './plural';
import { ru } from './ru';
import { ruPlurals } from './ru.plurals';

/**
 * Looking a string up.
 *
 * Two shapes, and which one to use is not a style choice:
 *
 * - **Components call the free `t` / `tPlural`**, which read the locale singleton. They
 *   re-render because their *route* subscribes to it (see `locale.ts`), so the strings are
 *   current without a single component taking a locale prop or a context.
 * - **Pure modules take a `Translator`**, built by `translatorFor(locale)`. `exitPrompt.ts`
 *   is the case that matters: its whole value is that the dialog's wording and button list
 *   are decided somewhere Jest can read, and a module that reaches for a global singleton
 *   is not that. The impurity stays at the call site, where it already is.
 *
 * Interpolation is `{name}` and one `replace` - no ICU parser and no dependency. A param
 * that was never passed leaves its placeholder **visible on screen**, which is deliberate:
 * a silently empty string is a bug you ship, and `catalogue.test.ts` asserts the two
 * catalogues use the same placeholders in every message so a translation cannot drop one.
 */

export type MessageKey = keyof typeof en;
export type PluralKey = keyof typeof enPlurals;
export type Params = Record<string, string | number>;

/** Callable, with `.plural` alongside, so a pure module can be handed one value. */
export type Translator = {
  (key: MessageKey, params?: Params): string;
  plural(key: PluralKey, count: number, params?: Params): string;
  locale: Locale;
};

const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, ru };

const PLURALS: Record<Locale, Record<PluralKey, PluralForms>> = {
  en: enPlurals,
  ru: ruPlurals,
};

const PLACEHOLDER = /\{(\w+)\}/g;

function interpolate(template: string, params?: Params): string {
  if (!params) return template;

  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    return value === undefined ? whole : String(value);
  });
}

/** The message for one key in one locale. Pure - the unit under test. */
export function translate(locale: Locale, key: MessageKey, params?: Params): string {
  // The `?? en[key]` is not dead code: `ru.ts` is typed to make a gap impossible at
  // compile time, but this also runs against whatever shipped, and an English word is a
  // better failure than `undefined` rendered into a label.
  const template = MESSAGES[locale][key] ?? en[key];
  return interpolate(template, params);
}

/** The counted message for one key, in the form `count` takes in this locale. */
export function translatePlural(
  locale: Locale,
  key: PluralKey,
  count: number,
  params?: Params,
): string {
  const forms = PLURALS[locale][key] ?? enPlurals[key];
  // `count` is injected rather than required as a param: every one of these messages needs
  // it, and passing it twice is exactly the kind of thing that goes stale.
  return interpolate(selectPluralForm(locale, forms, count), { ...params, count });
}

const translators = new Map<Locale, Translator>();

/**
 * A bound translator for one locale, for pure modules and for tests.
 *
 * Memoised so a translator handed into a memoised component is referentially stable - the
 * same reason `quizCamera`'s stop is `useMemo`'d in `MapScreen`.
 */
export function translatorFor(locale: Locale = DEFAULT_LOCALE): Translator {
  const cached = translators.get(locale);
  if (cached) return cached;

  const translator = ((key: MessageKey, params?: Params) =>
    translate(locale, key, params)) as Translator;

  translator.plural = (key, count, params) => translatePlural(locale, key, count, params);
  translator.locale = locale;

  translators.set(locale, translator);
  return translator;
}

/** The message for one key, in the language the app is currently in. */
export function t(key: MessageKey, params?: Params): string {
  return translate(getLocale(), key, params);
}

/** The counted message for one key, in the language the app is currently in. */
export function tPlural(key: PluralKey, count: number, params?: Params): string {
  return translatePlural(getLocale(), key, count, params);
}
