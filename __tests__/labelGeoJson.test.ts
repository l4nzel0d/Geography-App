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
import {
  LABEL_FIELD_IDS,
  LABEL_FIELDS,
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

  it('shows at most three languages', () => {
    // Zimbabwe records 15. Joining all of them is a paragraph, not a label.
    const languages = String(propertiesOf('ZWE')?.tLanguages);
    expect(languages.split(', ')).toHaveLength(3);
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
        languages: [],
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
    expect(labelTextField('languages')).toEqual(['get', 'tLanguages']);
  });

  it('is still well-formed with no field selected', () => {
    // The layer stays mounted in every mode, and an undefined text-field is a malformed
    // layout property - invisible to Jest, fatal in the native renderer.
    expect(labelTextField('none')).toBe('');
  });
});

describe('the field catalogue', () => {
  it('offers none plus every text field, none first', () => {
    expect(LABEL_FIELDS[0].field).toBe('none');
    expect(LABEL_FIELDS.map((option) => option.field).slice(1)).toEqual([...LABEL_FIELD_IDS]);
  });

  it('gives every option a distinct label and a screen-reader description', () => {
    const labels = LABEL_FIELDS.map((option) => option.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(LABEL_FIELDS.every((option) => option.description.length > 10)).toBe(true);
  });
});
