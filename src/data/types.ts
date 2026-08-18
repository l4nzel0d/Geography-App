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
  /** One of six: Africa, Americas, Asia, Europe, Oceania, Antarctic. */
  region: string;
  /** One of 24, e.g. "Western Europe". Empty only for the four Antarctic entries. */
  subregion: string;
  /**
   * mledoze's UN membership flag - what quiz mode filters the country pool on.
   *
   * It is true for 194 records because mledoze counts Vatican City, which is a
   * permanent observer state rather than a member. `quizCountries.ts` excludes it
   * explicitly, so the quiz pool is 193.
   */
  unMember: boolean;
  /**
   * Alternative names a player might type: "Ivory Coast", "Holland", "UK", "DRC".
   * The two-letter cca2 is filtered out by the build, or "fr" would pass for France.
   */
  altSpellings: string[];
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
  /**
   * People per square kilometre, derived from `population` and `area` at runtime.
   * Absent wherever either is missing, or where the area is mledoze's `-1` unknown.
   */
  density?: number;
};
