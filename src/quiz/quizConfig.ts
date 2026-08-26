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

/**
 * How a round is played.
 *
 * - `facts` - the map zooms to a country and you type what you know about it.
 * - `locate` - you are given a country's name and have to find it on the map.
 * - `flag` - you are shown a country's flag and type the same facts as `facts`.
 *
 * Mutually exclusive rather than fields you can combine, because they use the map in
 * incompatible ways: `facts` paints the country and asks about it, `locate` must NOT
 * paint it since that is the answer, and `flag` does not put a map on screen at all.
 */
export type QuizMode = 'facts' | 'locate' | 'flag';

export const QUIZ_MODES: readonly QuizMode[] = ['facts', 'locate', 'flag'];

export const DEFAULT_MODE: QuizMode = 'facts';

export const QUIZ_MODE_LABELS: Record<QuizMode, string> = {
  facts: 'Name the facts',
  locate: 'Find it on the map',
  flag: 'Name it from the flag',
};

/** What each mode asks of you - the picker's subtitle, and the setup screen's. */
export const QUIZ_MODE_HINTS: Record<QuizMode, string> = {
  facts: 'The map zooms to a country and you type what you know about it',
  locate: 'You are given a name and have to find the country on the map',
  flag: 'You are shown a flag and type what you know about the country',
};

/**
 * Whether the round puts a MapLibre surface on `/quiz/play`.
 *
 * A `Record` rather than a `mode === 'flag'` test at the call site, and for a stronger
 * reason than the labels above: a fourth mode fails to COMPILE until someone answers
 * this, and it is the one question on that screen that must never be answered by
 * accident. `false` is what earns a flag round ordinary conditional rendering - see
 * CLAUDE.md on views inserted above the map surface, and `FlagStage`'s own docstring.
 */
export const MODE_USES_MAP: Record<QuizMode, boolean> = {
  facts: true,
  locate: true,
  flag: false,
};

/**
 * Whether the round asks the player to type facts, and so needs a field selection.
 *
 * Not just which picker to show: it also decides whether an empty selection may start a
 * round. Without it a flag round with every field unticked is startable, and
 * `parseQuizParams` quietly falls back to asking the country's name - a round the player
 * did not configure.
 */
export const MODE_ASKS_FIELDS: Record<QuizMode, boolean> = {
  facts: true,
  locate: false,
  flag: true,
};

/** The facts a player can be asked to type. Area is deliberately not among them. */
export type FieldId = 'name' | 'capital' | 'currency' | 'languages' | 'population';

/**
 * The one thing you answer by tapping rather than typing.
 *
 * Deliberately **not** a `FieldId`. Everything that iterates `ANSWERABLE_FIELDS` - the
 * field picker, `toAnswerInput`, the `fields=` param parser, `gradeField`'s exhaustive
 * switch - is about facts you type into a box, and location is none of those. Keeping it
 * out of that union means none of them need a case for it, and no deep link can smuggle
 * `fields=location` into a facts round.
 *
 * It is still a `GradedField`, because a finished round's results are a mix of both and
 * the score screen renders them from one list.
 */
export const LOCATION_FIELD = 'location';

/** Anything a result line can be about: a typed fact, or the tapped location. */
export type GradedField = FieldId | typeof LOCATION_FIELD;

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

export const FIELD_LABELS: Record<GradedField, string> = {
  name: 'Country',
  capital: 'Capital',
  currency: 'Currency',
  languages: 'Languages',
  population: 'Population',
  location: 'Location',
};

export type QuizConfig = {
  mode: QuizMode;
  /** Subregion labels, e.g. "Western Europe". Empty means every subregion. */
  subregions: string[];
  /** Which facts to ask for. Ignored entirely in `locate` mode. */
  fields: FieldId[];
  /** Seeds the shuffle, so the same config replays in the same order. */
  seed: number;
  /**
   * Draw the round from the player's weakest countries rather than the whole pool.
   *
   * A flag rather than a fourth `QuizMode`, and deliberately: `MODE_USES_MAP` and
   * `MODE_ASKS_FIELDS` are exhaustive records precisely so a new mode fails to COMPILE
   * until someone answers "does it show a map?" - and practice has no answer, because it
   * is orthogonal. `practice` x `facts | locate | flag` are all coherent rounds.
   *
   * **This is the one part of a config the seed does not pin.** Selection reads the
   * mastery table, which lives on the device and changes as you play, so "Play again" on
   * a practice round re-selects against the updated table and gives a different ten. That
   * is right for practice - and it is a real break from the rule that a seeded round
   * replays identically, which every other round in the app still obeys.
   */
  practice: boolean;
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
  mode: QuizMode;
  subregions: string;
  fields: string;
  seed: string;
  practice: string;
} {
  return {
    mode: config.mode,
    // Always emitted, rather than omitted when false, so nothing depends on how
    // expo-router treats an absent versus an empty param.
    practice: config.practice ? '1' : '0',
    subregions: config.subregions.join(','),
    // Carried even in `locate` mode, where nothing reads it: "Change settings" pops back
    // to a setup screen that still has these ticked, and "Play again" round-trips the
    // whole config through the URL. Dropping them would silently clear the player's
    // facts selection the moment they tried the other mode.
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

  // Anything unrecognised falls back to `facts`, which is what every link written before
  // modes existed says by omission.
  const rawMode = (Array.isArray(raw.mode) ? raw.mode[0] : raw.mode)?.trim();
  const mode = QUIZ_MODES.find((candidate) => candidate === rawMode) ?? DEFAULT_MODE;

  // Absent or unrecognised is `false`, which is what every link written before practice
  // existed says by omission - the same rule `mode` follows.
  const rawPractice = (Array.isArray(raw.practice) ? raw.practice[0] : raw.practice)?.trim();
  const practice = rawPractice === '1' || rawPractice === 'true';

  return {
    mode,
    practice,
    subregions: [...new Set(toArray(raw.subregions))],
    fields: fields.length ? [...new Set(fields)] : [...DEFAULT_FIELDS],
    seed: Number.isFinite(parsedSeed) && parsedSeed >= 0 ? Math.floor(parsedSeed) : fallbackSeed(),
  };
}
