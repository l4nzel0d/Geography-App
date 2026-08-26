export type Currency = {
  code: string;
  name: string;
  symbol: string | null;
};

/**
 * The half of a record that has a different value in each language.
 *
 * Only the fields that are actually words. `population`, `area`, `flag` and `unMember` are
 * the same fact in every language and stay on the record itself, which is what keeps a
 * localized view ~250 small objects rather than a second copy of everything.
 *
 * `capital`, `languages` and `currencies` are **parallel to their English siblings, by
 * index**. The build asserts the lengths match; see `russianIntegrityProblems`.
 */
export type LocalizedFacts = {
  name: string;
  official: string | null;
  capital: string[];
  languages: string[];
  /** Currency NAMES only - the code and symbol are not language-dependent. */
  currencies: string[];
  region: string;
  subregion: string;
  /** Alternative names in this language: "Голландия", "Бирма", "США". */
  altSpellings: string[];
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
  /**
   * ISO-639-3 codes, in the same order as `languages`.
   *
   * The record keeps only the English names, so this is the one stable identifier a
   * language has here - and the key the Russian dictionary joins on.
   */
  languageCodes: string[];
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
  /**
   * The same record in every other language the app ships.
   *
   * English is the record itself rather than an entry here, so every existing reader is
   * unchanged and `allCountryFacts` still means what it always did.
   */
  translations: { ru: LocalizedFacts };
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
  /**
   * How well the player knows this country, 0-100, folded on by `masteryGeoJson.ts`.
   *
   * Absent - not null, and not 0 - for a country that has never been asked, which is what
   * lets the mastery ramp split it off with `['has','mastery']` into the grey no-data
   * colour. "Never seen it" and "always get it wrong" are different things and the map
   * has to be able to say which. Unlike the two above, this one CHANGES at runtime; see
   * the note on `countries` in `worldMapProps.ts`.
   */
  mastery?: number;
};
