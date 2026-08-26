/**
 * The label point source, and the expressions that read it.
 *
 * Two things this suite is really guarding:
 *
 * - **one feature per country**, which is the entire reason a separate point source
 *   exists. Labelling the outlines directly gives France six labels, one of them over
 *   South America.
 * - **expression shape**, walked structurally rather than snapshotted. A malformed
 *   expression passes every other test and then blanks the layer inside the native
 *   renderer, which Jest replaces with a stub. Same reasoning as `choropleth.test.ts`.
 */
import { allCountryFacts } from '@/data/countryFacts';
import { buildLabelGeoJson, labelGeoJson, labelTextFor } from '@/data/labelGeoJson';
import labelPoints from '@/data/labelPoints.json';
import type { CountryFacts } from '@/data/types';
import { MAX_LABEL_ZOOM } from '@/map/labelFit';
import { LOCALES } from '@/i18n/localeTypes';
import { translate } from '@/i18n/t';
import {
  FLAG_ICON_PROPERTY,
  FLAG_ZOOM_PROPERTY,
  flagIconFilter,
  LABEL_FIELD_IDS,
  LABEL_FIELDS,
  type LabelField,
  labelFilter,
  labelTextField,
  RANK_PROPERTY,
  textPropertyFor,
  zoomPropertyFor,
} from '@/map/mapLabels';

const features = labelGeoJson.features;
const propertiesOf = (iso3: string) =>
  features.find((f) => f.properties?.iso3 === iso3)?.properties as
    | Record<string, string | number>
    | undefined;

describe('the label point collection', () => {
  it('carries exactly one feature per country', () => {
    // The whole point of the separate source. A duplicate here is France labelled twice.
    const codes = features.map((f) => f.properties?.iso3);
    expect(new Set(codes).size).toBe(codes.length);
    expect(features.length).toBeGreaterThan(220);
  });

  it('is all points', () => {
    expect(features.every((f) => f.geometry.type === 'Point')).toBe(true);
  });

  it('drops the geometry-only territories that have no facts to show', () => {
    // CYN, SOL and KAS are the pipeline's FACTLESS_ALLOWLIST - they have an outline but
    // no fact record, so a label anchor for them could never draw anything.
    for (const code of ['CYN', 'SOL', 'KAS']) {
      expect(propertiesOf(code)).toBeUndefined();
      expect(labelPoints as Record<string, unknown>).toHaveProperty(code);
    }
  });

  it('anchors France in Europe, not in French Guiana', () => {
    // The bug this whole module exists to avoid. Guiana sits near -53 longitude.
    const [lng, lat] = (
      features.find((f) => f.properties?.iso3 === 'FRA') as GeoJSON.Feature<GeoJSON.Point>
    ).geometry.coordinates;
    expect(lng).toBeGreaterThan(-5);
    expect(lng).toBeLessThan(9);
    expect(lat).toBeGreaterThan(41);
  });
});

describe('label text', () => {
  it('formats population compactly, not with thousands separators', () => {
    expect(propertiesOf('IND')?.tPopulation).toMatch(/^\d+(\.\d)?b$/);
    expect(String(propertiesOf('FRA')?.tPopulation)).not.toContain(',');
  });

  it('shows at most three currencies', () => {
    // Zimbabwe records nine. Joining all of them is a paragraph, not a label.
    const currencies = String(propertiesOf('ZWE')?.tCurrencies);
    expect(currencies.split(', ')).toHaveLength(3);
  });

  it('shows currency names without the code or symbol', () => {
    // formatCurrency's "Brazilian real (BRL, R$)" belongs in the info sheet; three of
    // those would be wider than Brazil.
    const currencies = String(propertiesOf('BRA')?.tCurrencies);
    expect(currencies).toBe('Brazilian real');
    expect(currencies).not.toContain('(');
  });

  it('omits a field entirely rather than carrying a null', () => {
    // Absence is what lets the layer filter split them off with ['has', ...] - the same
    // idiom worldGeoJson.ts uses for the choropleth. A null would render as "null".
    const micronesia = propertiesOf('FSM');
    expect(micronesia).toBeDefined();
    expect(micronesia).not.toHaveProperty('tCurrencies');

    // Vatican has an outline and facts but no World Bank population.
    expect(propertiesOf('VAT')).not.toHaveProperty('tPopulation');
  });

  it('pairs every text property with a usable zoom threshold', () => {
    for (const feature of features) {
      const properties = feature.properties as Record<string, string | number>;
      for (const field of LABEL_FIELD_IDS) {
        if (!(textPropertyFor(field) in properties)) continue;

        const zoom = properties[zoomPropertyFor(field)];
        expect(typeof zoom).toBe('number');
        expect(Number.isFinite(zoom as number)).toBe(true);
        expect(zoom as number).toBeGreaterThanOrEqual(0);
        expect(zoom as number).toBeLessThanOrEqual(MAX_LABEL_ZOOM);
      }
    }
  });

  it('ranks wider countries ahead of narrower ones', () => {
    // symbol-sort-key places the LOWEST value first, so Russia must sort below Monaco.
    expect(Number(propertiesOf('RUS')?.[RANK_PROPERTY])).toBeLessThan(
      Number(propertiesOf('MCO')?.[RANK_PROPERTY]),
    );
  });

  it('drops a country that has nothing to say in any field', () => {
    const facts: Record<string, CountryFacts> = {
      NUL: {
        name: '',
        official: null,
        population: null,
        populationYear: null,
        capital: [],
        area: null,
        flag: null,
        currencies: [],
            translations: {
          ru: {
            name: '',
            official: null,
            capital: [],
                currencies: [],
            region: '',
            subregion: '',
            altSpellings: [],
          },
        },
        region: '',
        subregion: '',
        unMember: false,
        altSpellings: [],
      },
    };
    const built = buildLabelGeoJson(facts, { NUL: { at: [0, 0], w: 1 } });
    expect(built.features).toHaveLength(0);
  });

  it('returns null rather than an empty string for a missing value', () => {
    const facts = allCountryFacts.FSM;
    expect(labelTextFor('currencies', facts)).toBeNull();
    expect(labelTextFor('name', facts)).toBe(facts.name);
  });
});

describe('labelFilter', () => {
  it('matches nothing when no field is selected', () => {
    // The same empty-string idiom the selection layers use. The layer stays mounted.
    expect(labelFilter('none')).toEqual(['==', ['get', 'iso3'], '']);
  });

  it('requires both the text and the fit threshold', () => {
    const filter = labelFilter('capital') as unknown as unknown[];
    expect(filter[0]).toBe('all');
    expect(filter[1]).toEqual(['has', 'tCapital']);
    // ['zoom'] is legal in a filter - "evaluated at integer zoom levels" - which is what
    // lets the fit test be declarative instead of a camera subscription.
    expect(filter[2]).toEqual(['<=', ['get', 'zCapital'], ['zoom']]);
  });

  it('names a property that features actually carry', () => {
    for (const field of LABEL_FIELD_IDS) {
      const filter = labelFilter(field) as unknown as unknown[];
      const has = filter[1] as [string, string];
      expect(features.some((f) => has[1] in (f.properties ?? {}))).toBe(true);
    }
  });
});

describe('labelTextField', () => {
  it('reads the matching text property', () => {
    expect(labelTextField('currencies')).toEqual(['get', 'tCurrencies']);
  });

  it('is still well-formed with no field selected', () => {
    // The layer stays mounted in every mode, and an undefined text-field is a malformed
    // layout property - invisible to Jest, fatal in the native renderer.
    expect(labelTextField('none')).toBe('');
  });
});

describe('the flag layer and the text layer are mutually exclusive', () => {
  /**
   * The single most important property here, and the one nothing else can catch.
   *
   * Two symbol layers share the label source, both stay mounted for ever, and which one draws
   * is expressed entirely through their filters. If both ever matched, flags would sit under
   * country names; if neither did, the picker would silently do nothing. Jest is the only
   * place this is visible - on a device it is just a map that looks wrong.
   */
  const NOTHING = ['==', ['get', 'iso3'], ''];
  const EVERY_FIELD: LabelField[] = ['none', ...LABEL_FIELD_IDS, 'flag'];

  it.each(EVERY_FIELD)('has exactly one live layer for %s', (field) => {
    const textLive = labelFilter(field)[0] === 'all';
    const flagLive = flagIconFilter(field)[0] === 'all';

    expect(textLive).toBe(field !== 'none' && field !== 'flag');
    expect(flagLive).toBe(field === 'flag');
    expect(textLive && flagLive).toBe(false);
  });

  it('turns the text layer off for flags, text-field included', () => {
    expect(labelFilter('flag')).toEqual(NOTHING);
    // Empty rather than undefined: an undefined layout property is malformed, and a malformed
    // one passes Jest and blanks the layer inside the native renderer.
    expect(labelTextField('flag')).toBe('');
  });

  it('requires both the image name and the fit threshold', () => {
    const filter = flagIconFilter('flag') as unknown as unknown[];
    expect(filter[0]).toBe('all');
    expect(filter[1]).toEqual(['has', FLAG_ICON_PROPERTY]);
    expect(filter[2]).toEqual(['<=', ['get', FLAG_ZOOM_PROPERTY], ['zoom']]);
  });

  it('does not collide with the properties of any text field', () => {
    // A shared name would silently overwrite one field with the other in labelGeoJson.
    // Bare arrows, not point-free: `map` would pass the index as the locale argument.
    // Checked in every locale, because the suffix is what could newly collide.
    for (const locale of LOCALES) {
      expect(LABEL_FIELD_IDS.map((field) => textPropertyFor(field, locale))).not.toContain(
        FLAG_ICON_PROPERTY,
      );
      expect(LABEL_FIELD_IDS.map((field) => zoomPropertyFor(field, locale))).not.toContain(
        FLAG_ZOOM_PROPERTY,
      );
    }
  });
});

describe('the flag anchor', () => {
  it('names an image, not a country', () => {
    // `flag-fr`, not `fr` and not `France`: a style's images share one namespace, so the
    // prefix is what keeps a two-letter code from colliding with a future non-flag icon.
    expect(propertiesOf('FRA')?.[FLAG_ICON_PROPERTY]).toBe('flag-fr');
  });

  it('gives every flagged country a threshold inside the zoom range', () => {
    const flagged = features.filter((f) => FLAG_ICON_PROPERTY in (f.properties ?? {}));
    expect(flagged.length).toBeGreaterThan(220);

    for (const feature of flagged) {
      const properties = feature.properties as Record<string, unknown>;
      expect(properties[FLAG_ICON_PROPERTY]).toMatch(/^flag-[a-z]{2}$/);
      expect(properties[FLAG_ZOOM_PROPERTY]).toBeLessThanOrEqual(MAX_LABEL_ZOOM);
      expect(properties[FLAG_ZOOM_PROPERTY]).toBeGreaterThanOrEqual(0);
    }
  });

  it('appears earlier than the name it replaces', () => {
    // The density property, not a magic number: a 20 dp flag clears the fit test where 66 dp
    // of "Uzbekistan" does not, so a flag round is visibly busier than a name one.
    const uzb = propertiesOf('UZB') ?? {};
    expect(uzb[FLAG_ZOOM_PROPERTY]).toBeLessThan(uzb[zoomPropertyFor('name')] as number);
  });

  it('omits the flag entirely for a record that has none', () => {
    /*
      Built from a fixture rather than read off `labelGeoJson`, because the one flagless record
      upstream - BES, the Caribbean Netherlands - has no outline at 1:50m and therefore no
      label anchor either, so the real data cannot exercise this. The property under test is
      the idiom, not that country: absent rather than null, which is what lets the layer split
      it off with `['has', ...]` exactly as Micronesia is split off the currency field.
    */
    const flagless: Record<string, CountryFacts> = {
      NUL: { ...allCountryFacts.FRA, flag: '' },
    };
    const built = buildLabelGeoJson(flagless, { NUL: { at: [0, 0], w: 1 } });

    expect(built.features).toHaveLength(1);
    expect(built.features[0].properties).not.toHaveProperty(FLAG_ICON_PROPERTY);
    expect(built.features[0].properties).not.toHaveProperty(FLAG_ZOOM_PROPERTY);
    // Still labelled, just not with a flag - the country did not stop existing.
    expect(built.features[0].properties).toHaveProperty(textPropertyFor('name'));
  });
});

describe('the field catalogue', () => {
  it('offers none, the flag and every text field, none first', () => {
    expect(LABEL_FIELDS[0].field).toBe('none');
    // Spelled out rather than derived from LABEL_FIELD_IDS, which it used to be: `flag` is a
    // LabelField and deliberately NOT a LabelFieldId, so the two lists no longer line up.
    expect(LABEL_FIELDS.map((option) => option.field)).toEqual([
      'none',
      'name',
      'flag',
      'capital',
      'currencies',
      'population',
    ]);
  });

  it('keeps the flag out of the TEXT field list', () => {
    // The whole point of the split, and the thing a tidy-up would undo: everything that
    // iterates LABEL_FIELD_IDS - labelTextFor's exhaustive switch, the text layer's
    // text-field - is about a string, and a flag is an icon.
    expect(LABEL_FIELD_IDS).not.toContain('flag');
    expect(LABEL_FIELDS.some((option) => option.field === 'flag')).toBe(true);
  });

  it('gives every option a distinct label and a screen-reader description', () => {
    // The table carries message keys, so this checks the words they resolve to - a row
    // pointed at another row's key would otherwise look fine.
    const labels = LABEL_FIELDS.map((option) => translate('en', option.labelKey));
    expect(new Set(labels).size).toBe(labels.length);
    expect(
      LABEL_FIELDS.every((option) => translate('en', option.descriptionKey).length > 10),
    ).toBe(true);
  });

  it('has a distinct Russian label and description for every option too', () => {
    const labels = LABEL_FIELDS.map((option) => translate('ru', option.labelKey));
    expect(new Set(labels).size).toBe(labels.length);
    expect(
      LABEL_FIELDS.every((option) => translate('ru', option.descriptionKey).length > 10),
    ).toBe(true);
  });
});
