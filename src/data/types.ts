export type Currency = {
  code: string;
  name: string;
  symbol: string | null;
};

export type CountryFacts = {
  name: string;
  official: string | null;
  /** Null for the handful of territories the World Bank does not report on. */
  population: number | null;
  /** The year `population` refers to, e.g. "2025". */
  populationYear: string | null;
  capital: string[];
  /** Square kilometres. */
  area: number | null;
  flag: string | null;
  currencies: Currency[];
  languages: string[];
};

/** Properties carried on each feature in `countries.geo.json`. */
export type CountryFeatureProperties = {
  iso3: string;
  name: string;
  /**
   * Folded in at runtime by `worldGeoJson.ts` so the choropleth can paint from it.
   * Absent - not null - for the territories the World Bank does not report on.
   */
  population?: number;
};
