/**
 * What a quiz round is, and how it survives a trip through the URL.
 *
 * The config crosses a route boundary (`/quiz` -> `/quiz/play`) as router params, which
 * arrive as `string | string[] | undefined` - a single-element array collapses to a bare
 * string, and anything can be missing or garbage if the link was hand-typed. All of that
 * coercion lives here so the play screen can assume a clean `QuizConfig`.
 *
 * Params rather than a context or a store because being deep-linkable is what lets the
 * Maestro flow pin a seed and therefore assert on an actual answer.
 */

/** The facts a player can be asked for. Area is deliberately not among them. */
export type FieldId = 'name' | 'capital' | 'currency' | 'languages' | 'population';

export const ANSWERABLE_FIELDS: readonly FieldId[] = [
  'name',
  'capital',
  'currency',
  'languages',
  'population',
];

/**
 * Fields answered as a set of chips rather than a single value.
 *
 * Exported rather than kept in the component, because the grader has to agree with the
 * input about which fields these are - see `toAnswerInput`.
 */
export const SET_FIELDS: readonly FieldId[] = ['currency', 'languages'];

export function isSetField(field: FieldId): boolean {
  return SET_FIELDS.includes(field);
}

export const FIELD_LABELS: Record<FieldId, string> = {
  name: 'Country',
  capital: 'Capital',
  currency: 'Currency',
  languages: 'Languages',
  population: 'Population',
};

export type QuizConfig = {
  /** Subregion labels, e.g. "Western Europe". Empty means every subregion. */
  subregions: string[];
  fields: FieldId[];
  /** Seeds the shuffle, so the same config replays in the same order. */
  seed: number;
};

export const DEFAULT_FIELDS: FieldId[] = ['name'];

/** Seeds are 31-bit so they survive a round trip through a decimal URL param. */
const SEED_MODULUS = 2 ** 31;

export function newSeed(): number {
  // The one impure function in the quiz modules, called only when a round starts.
  return Math.floor(Math.random() * SEED_MODULUS);
}

function toArray(raw: string | string[] | undefined): string[] {
  if (raw == null) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  // A single param may still carry several values as a comma list, which is what a
  // hand-written deep link tends to look like.
  return list
    .flatMap((entry) => entry.split(','))
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function toQuizParams(config: QuizConfig): {
  subregions: string;
  fields: string;
  seed: string;
} {
  return {
    subregions: config.subregions.join(','),
    fields: config.fields.join(','),
    seed: String(config.seed),
  };
}

/**
 * Coerce whatever expo-router handed us into a usable config.
 *
 * Never throws and never returns something unplayable: unknown fields are dropped, an
 * empty field list falls back to asking the country's name, and a missing or unparsable
 * seed is generated. A deep link with a typo should start a quiz, not a red screen.
 *
 * Subregions are NOT validated here - `quizCountries` owns the catalogue, and an unknown
 * one simply matches no countries.
 */
export function parseQuizParams(
  raw: Record<string, string | string[] | undefined>,
  fallbackSeed: () => number = newSeed,
): QuizConfig {
  const fields = toArray(raw.fields).filter((f): f is FieldId =>
    (ANSWERABLE_FIELDS as readonly string[]).includes(f),
  );

  // `Number('')` is 0, not NaN, so an empty `?seed=` would silently pin every round to
  // seed zero. Blank has to be treated as absent before the numeric parse.
  const rawSeed = (Array.isArray(raw.seed) ? raw.seed[0] : raw.seed)?.trim();
  const parsedSeed = rawSeed ? Number(rawSeed) : NaN;

  return {
    subregions: [...new Set(toArray(raw.subregions))],
    fields: fields.length ? [...new Set(fields)] : [...DEFAULT_FIELDS],
    seed: Number.isFinite(parsedSeed) && parsedSeed >= 0 ? Math.floor(parsedSeed) : fallbackSeed(),
  };
}
