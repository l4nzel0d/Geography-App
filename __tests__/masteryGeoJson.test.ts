import { MASTERY_PROPERTY, toMasteryPercent, withMastery } from '@/data/masteryGeoJson';
import type { CountryFeatureProperties } from '@/data/types';
import { worldGeoJson } from '@/data/worldGeoJson';

const propertiesOf = (collection: GeoJSON.FeatureCollection, iso3: string) =>
  collection.features.find(
    (f) => (f.properties as CountryFeatureProperties | null)?.iso3 === iso3,
  )?.properties as CountryFeatureProperties;

describe('withMastery', () => {
  it('returns the very same collection when nothing has been recorded', () => {
    // A fresh install must hand `<GeoJSONSource data>` the same module constant it has
    // always had, so nothing is re-uploaded to the renderer until something is played.
    expect(withMastery(worldGeoJson, {})).toBe(worldGeoJson);
  });

  it('passes every geometry through by reference', () => {
    // The load-bearing one. Losing this duplicates 1.6 MB of coordinates on every publish.
    const folded = withMastery(worldGeoJson, { FRA: 0.5, DEU: 0.9 });

    folded.features.forEach((feature, index) => {
      expect(feature.geometry).toBe(worldGeoJson.features[index].geometry);
    });
  });

  it('leaves an unscored feature completely untouched, same object', () => {
    const folded = withMastery(worldGeoJson, { FRA: 0.5 });

    const index = worldGeoJson.features.findIndex(
      (f) => (f.properties as CountryFeatureProperties | null)?.iso3 === 'DEU',
    );
    expect(folded.features[index]).toBe(worldGeoJson.features[index]);
  });

  it('omits the property entirely for a never-asked country', () => {
    // Absence, not null and not zero - this is what `['has','mastery']` splits on.
    const folded = withMastery(worldGeoJson, { FRA: 0.5 });
    expect(propertiesOf(folded, 'DEU')).not.toHaveProperty(MASTERY_PROPERTY);
  });

  it('writes an integer percent in [0, 100]', () => {
    const folded = withMastery(worldGeoJson, { FRA: 0.5, DEU: 0, ITA: 0.999 });

    for (const iso3 of ['FRA', 'DEU', 'ITA']) {
      const value = propertiesOf(folded, iso3).mastery as number;
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(100);
    }

    expect(propertiesOf(folded, 'FRA').mastery).toBe(50);
  });

  it('keeps a zero score as a real value rather than dropping it', () => {
    // "Always gets it wrong" must paint at the weak end of the ramp, not fall into the
    // grey never-asked bucket.
    const folded = withMastery(worldGeoJson, { DEU: 0 });
    expect(propertiesOf(folded, 'DEU').mastery).toBe(0);
  });

  it('carries population and density through unchanged', () => {
    const folded = withMastery(worldGeoJson, { FRA: 0.4 });
    const before = propertiesOf(worldGeoJson, 'FRA');
    const after = propertiesOf(folded, 'FRA');

    expect(after.population).toBe(before.population);
    expect(after.density).toBe(before.density);
    expect(after.name).toBe(before.name);
  });

  it('ignores a score for an ISO-3 no feature carries', () => {
    // The codec deliberately keeps unknown codes rather than importing the geometry to
    // validate them; this is where they harmlessly go nowhere.
    expect(() => withMastery(worldGeoJson, { ZZZ: 0.5 })).not.toThrow();
  });

  it('ignores a non-finite score rather than poisoning the paint expression', () => {
    const folded = withMastery(worldGeoJson, { FRA: NaN, DEU: Infinity });
    expect(propertiesOf(folded, 'FRA')).not.toHaveProperty(MASTERY_PROPERTY);
    expect(propertiesOf(folded, 'DEU')).not.toHaveProperty(MASTERY_PROPERTY);
  });

  it('passes a feature with null properties straight through', () => {
    const collection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: null, geometry: { type: 'Point', coordinates: [0, 0] } }],
    };

    const folded = withMastery(collection, { FRA: 0.5 });
    expect(folded.features[0]).toBe(collection.features[0]);
  });

  it('produces a new collection identity so the source knows to re-upload', () => {
    const folded = withMastery(worldGeoJson, { FRA: 0.5 });
    expect(folded).not.toBe(worldGeoJson);
    expect(folded.features).toHaveLength(worldGeoJson.features.length);
  });
});

describe('toMasteryPercent', () => {
  it.each([
    [0, 0],
    [0.005, 1],
    [0.5, 50],
    [0.999, 100],
  ])('turns %p into %p', (score, percent) => {
    expect(toMasteryPercent(score)).toBe(percent);
  });
});
