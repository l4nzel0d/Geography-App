import { flagLetters } from '@/components/flagEmoji';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/i18n/localeTypes';
import { formatCompactNumber, formatLabelList } from '@/components/formatters';
import { getFlagMinZoom, getLabelMinZoom, glyphRatioFor, LABEL_FONT_SIZE } from '@/map/labelFit';
import {
  FLAG_ICON_PROPERTY,
  FLAG_IMAGE_PREFIX,
  FLAG_ZOOM_PROPERTY,
  LABEL_FIELD_IDS,
  type LabelFieldId,
  RANK_PROPERTY,
  textPropertyFor,
  zoomPropertyFor,
} from '@/map/mapLabels';

import { allCountryFacts, factsFor } from './countryFacts';
import labelPoints from './labelPoints.json';
import type { CountryFacts } from './types';

/**
 * One label anchor per country, carrying every field's text and its fit threshold.
 *
 * A **separate point source** from the outlines, and that is the whole reason this file
 * exists. MapLibre places a polygon symbol at the pole of inaccessibility - a good
 * anchor - but it places **one per polygon**, so France would be labelled six times, once
 * over French Guiana, and Kiribati once per atoll. Collision does not help; those anchors
 * are thousands of kilometres apart. `scripts/build-label-points.mjs` picks one point per
 * country instead, inside its largest landmass.
 *
 * Follows `worldGeoJson.ts`'s idioms exactly:
 *
 * - built once at module scope, so the object handed to `<GeoJSONSource data>` is
 *   referentially stable and MapLibre never re-uploads it;
 * - a field a country has no value for is **absent, not null**, which is what lets the
 *   layer filter split it off with `['has', ...]`;
 * - derived here rather than emitted into a committed file, keeping `countryFacts.json`
 *   the single source of truth for the text and `labelPoints.json` for the geometry.
 */

type LabelPoint = { at: [number, number]; w: number };

const points = labelPoints as unknown as Record<string, LabelPoint>;

/**
 * The text for one field, or null when the country has nothing to say for it.
 *
 * Capital, languages and currencies all go through `formatLabelList` so they truncate the
 * same way - three entries. Only South Africa has three capitals; the cap matters for
 * Zimbabwe's fifteen languages.
 *
 * Currencies use the bare `name`, deliberately not `formatCurrency`: "Brazilian real
 * (BRL, R$)" is an info-sheet string and three of those would be wider than Brazil.
 */
export function labelTextFor(
  field: LabelFieldId,
  facts: CountryFacts,
  locale: Locale = DEFAULT_LOCALE,
): string | null {
  switch (field) {
    case 'name':
      return facts.name || null;
    case 'capital':
      return formatLabelList(facts.capital);
    case 'languages':
      return formatLabelList(facts.languages);
    case 'currencies':
      return formatLabelList(facts.currencies.map((currency) => currency.name));
    case 'population':
      return facts.population == null ? null : formatCompactNumber(facts.population, locale);
  }
}

/**
 * Build the label points.
 *
 * `facts` is the DEFAULT locale's table; every other locale is reached through
 * `factsFor`, so one pass writes `tName` **and** `tNameRu` onto the same feature. See the
 * long note on `textPropertyFor` for why both languages share one source rather than
 * getting a collection each.
 *
 * The `locales` parameter exists so a test can build a single-language collection and
 * assert what is absent; the app always passes all of them.
 */
export function buildLabelGeoJson(
  facts: Record<string, CountryFacts>,
  anchors: Record<string, LabelPoint>,
  locales: readonly Locale[] = [DEFAULT_LOCALE],
): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = [];

  for (const [iso3, anchor] of Object.entries(anchors)) {
    const countryFacts = facts[iso3];
    // The three geometry-only entries in the pipeline's FACTLESS_ALLOWLIST - Northern
    // Cyprus, Somaliland and Siachen Glacier. Nothing to label them with.
    if (!countryFacts) continue;

    const properties: Record<string, string | number> = {
      iso3,
      // `symbol-sort-key` places the LOWEST value first, and we want the widest country
      // to win a collision, so this is negated. Ties are broken by source order, which is
      // alphabetical and therefore stable between runs.
      [RANK_PROPERTY]: -anchor.w,
    };

    let hasAny = false;
    for (const locale of locales) {
      // Each locale reads its OWN facts table, so the Russian text comes from the Russian
      // record rather than from a translation applied here.
      const localeFacts = locale === DEFAULT_LOCALE ? countryFacts : factsFor(locale)[iso3];
      if (!localeFacts) continue;

      for (const field of LABEL_FIELD_IDS) {
        const text = labelTextFor(field, localeFacts, locale);
        if (text == null) continue;

        properties[textPropertyFor(field, locale)] = text;
        // Per locale, not shared: a Russian name is materially longer, so it needs a
        // higher zoom before it fits over the same country.
        properties[zoomPropertyFor(field, locale)] = getLabelMinZoom(
          text,
          anchor.w,
          LABEL_FONT_SIZE,
          glyphRatioFor(locale),
        );
        hasAny = true;
      }
    }

    /*
      The flag, which is an ICON rather than text and so sits outside the loop above.

      `flag` is deliberately not a `LabelFieldId` - see `mapLabels.ts` - so `labelTextFor`'s
      exhaustive switch, `LABEL_FIELD_IDS` and the text layer all stay about strings, and this
      is the one place that has to know a flag exists at all.

      `countryFacts.json` has no ISO-2 field: it stores the flag as a regional-indicator emoji
      pair, and `flagLetters` is the repo's only decoder for it. Absent rather than null, as
      everywhere else here, so `['has', ...]` drops the single record with no flag upstream
      (BES) exactly as it drops Micronesia from the currency field.
    */
    const iso2 = flagLetters(countryFacts.flag);
    if (iso2) {
      properties[FLAG_ICON_PROPERTY] = `${FLAG_IMAGE_PREFIX}${iso2.toLowerCase()}`;
      properties[FLAG_ZOOM_PROPERTY] = getFlagMinZoom(anchor.w);
      hasAny = true;
    }

    // A country with nothing to say in any field would be an anchor that can never draw.
    if (!hasAny) continue;

    features.push({
      type: 'Feature',
      properties,
      geometry: { type: 'Point', coordinates: anchor.at },
    });
  }

  return { type: 'FeatureCollection', features };
}

/**
 * Built with an EXPLICIT locale, never the ambient one.
 *
 * This is a module constant, so it is computed at import - before any test's `beforeEach`
 * and before storage has answered. Reading `getLocale()` here would bake whatever language
 * the machine happened to be in at import time into the map's labels, which is how a
 * Russian-locale developer's machine silently produced Russian map labels in an English
 * test run.
 */
export const labelGeoJson = buildLabelGeoJson(allCountryFacts, points, LOCALES);
