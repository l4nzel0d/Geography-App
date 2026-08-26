import { LOCALES } from '@/i18n/localeTypes';
import { labelGeoJson } from '@/data/labelGeoJson';
import { labelFilter, labelTextField, textPropertyFor, zoomPropertyFor } from '@/map/mapLabels';

/**
 * Russian map labels.
 *
 * The design being pinned here is that **both languages ride on the same features**, so a
 * language switch changes only the layer's expressions and never replaces
 * `<GeoJSONSource data>` - the one operation CLAUDE.md calls the riskiest unproven thing in
 * the app. If these properties ever move onto a second collection, that guarantee is gone.
 */
const propertiesOf = (iso3: string) =>
  labelGeoJson.features.find((f) => f.properties?.iso3 === iso3)?.properties as
    | Record<string, string | number>
    | undefined;

describe('the label source', () => {
  it('carries both languages on one feature', () => {
    const france = propertiesOf('FRA')!;
    expect(france.tName).toBe('France');
    expect(france.tNameRu).toBe('Франция');
    expect(france.tCapital).toBe('Paris');
    expect(france.tCapitalRu).toBe('Париж');
  });

  it('leaves the English properties unsuffixed, so nothing existing moved', () => {
    expect(textPropertyFor('name')).toBe('tName');
    expect(textPropertyFor('name', 'en')).toBe('tName');
    expect(textPropertyFor('name', 'ru')).toBe('tNameRu');
    expect(zoomPropertyFor('capital', 'ru')).toBe('zCapitalRu');
  });

  it('formats a Russian population with Russian magnitude words', () => {
    expect(String(propertiesOf('IND')?.tPopulationRu)).toMatch(/млрд$/);
    expect(String(propertiesOf('FRA')?.tPopulationRu)).toMatch(/млн$/);
  });

  it('computes the fit threshold from each language|s own text', () => {
    // Russian names are USUALLY longer, and Cyrillic is measured a little wider - so most
    // countries need a higher zoom before their Russian label fits.
    //
    // It is not monotone, though, and that is worth stating rather than asserting away:
    // "Чехия" is shorter than "Czechia" and "Чад" than "Chad", so a handful of thresholds
    // go the other way. What matters is that each is derived from its own string, which
    // is exactly what one shared threshold could not do.
    let higher = 0;
    let lower = 0;

    for (const feature of labelGeoJson.features) {
      const properties = feature.properties as Record<string, string | number>;
      if (!('zName' in properties) || !('zNameRu' in properties)) continue;

      const ru = Number(properties.zNameRu);
      const en = Number(properties.zName);
      if (ru > en) higher += 1;
      else if (ru < en) lower += 1;
    }

    // Measured on today's data: 144 need more room, 41 need less. Pinned as an ordering
    // rather than as those numbers, which would break on any translation edit.
    expect(higher).toBeGreaterThan(100);
    expect(higher).toBeGreaterThan(lower * 3);
  });

  it('keeps the flag anchor language-neutral', () => {
    const france = propertiesOf('FRA')!;
    expect(france.tFlag).toBe('flag-fr');
    expect(france).not.toHaveProperty('tFlagRu');
  });

  it('pairs every localized text property with its own threshold', () => {
    for (const feature of labelGeoJson.features) {
      const properties = feature.properties as Record<string, string | number>;
      for (const locale of LOCALES) {
        for (const field of ['name', 'capital', 'currencies', 'population'] as const) {
          if (!(textPropertyFor(field, locale) in properties)) continue;
          expect(typeof properties[zoomPropertyFor(field, locale)]).toBe('number');
        }
      }
    }
  });
});

describe('the layer expressions', () => {
  it('reads the locale|s own properties', () => {
    expect(labelTextField('name', 'ru')).toEqual(['get', 'tNameRu']);
    expect(labelFilter('capital', 'ru')).toEqual([
      'all',
      ['has', 'tCapitalRu'],
      ['<=', ['get', 'zCapitalRu'], ['zoom']],
    ]);
  });

  it('still matches nothing for none and flag in either language', () => {
    for (const locale of LOCALES) {
      expect(labelFilter('none', locale)).toEqual(['==', ['get', 'iso3'], '']);
      expect(labelFilter('flag', locale)).toEqual(['==', ['get', 'iso3'], '']);
      expect(labelTextField('none', locale)).toBe('');
    }
  });
});
