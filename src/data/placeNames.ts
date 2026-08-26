import { DEFAULT_LOCALE, type Locale } from '@/i18n/localeTypes';

import ruPlaces from './ru/places.json';

/**
 * Display names for the six regions and 24 subregions.
 *
 * **The English strings stay the identifiers everywhere else.** A subregion crosses the
 * URL as `?subregions=Western Europe`, is the key `countriesIn` filters on, and is what
 * `.maestro/quiz.yaml` types into a deep link - so translating it in place would break
 * every existing link and every pinned flow. Only the *label* is translated, and only at
 * the moment it is drawn.
 *
 * That is the same split `FieldId` and `QuizMode` already make: the value is machine-
 * facing, the words about it are not.
 */

const PLACE_NAMES: Record<Locale, { regions: Record<string, string>; subregions: Record<string, string> }> = {
  en: { regions: {}, subregions: {} },
  ru: ruPlaces,
};

/** The region's name in this locale, falling back to the English identifier. */
export function regionLabel(region: string, locale: Locale = DEFAULT_LOCALE): string {
  return PLACE_NAMES[locale]?.regions[region] ?? region;
}

/** The subregion's name in this locale, falling back to the English identifier. */
export function subregionLabel(subregion: string, locale: Locale = DEFAULT_LOCALE): string {
  return PLACE_NAMES[locale]?.subregions[subregion] ?? subregion;
}
