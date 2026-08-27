import {
  ANSWERABLE_FIELDS,
  DEFAULT_FIELDS,
  DEFAULT_MODE,
  type FieldId,
  type QuizConfig,
  QUIZ_MODES,
  type QuizMode,
} from './quizConfig';

/**
 * What the quiz setup screen remembers between launches, and every guard on the way back in.
 *
 * Pure: no storage, no platform. `setupPrefsStorage.ts` and its `.web.ts` sibling own the
 * I/O; this owns the shape, so the interesting half is testable without either - the same
 * split `masteryCodec.ts` makes, for the same reason.
 *
 * **Nothing here ever throws.** These are preferences, not data: a corrupt blob must
 * degrade to "the defaults", never to a red screen on the way into the quiz.
 */

/**
 * Everything the setup screen decides, and nothing a round decides.
 *
 * A `Pick` rather than a hand-written type, so renaming or removing a key on `QuizConfig`
 * is a compile error here rather than a preference that silently stops being restored.
 *
 * **`seed` and `only` are excluded BY THE TYPE, not by a runtime delete**, which is the
 * strongest way to state the rule:
 *
 * - `seed` is generated per round by `start()`. Persisting one would replay the identical
 *   question order on every launch, which reads as the app being broken rather than as a
 *   preference being honoured.
 * - `only` is INVISIBLE state. The setup screen has no control that shows or clears it, so
 *   a stored `only` would quietly start a three-country round with nothing on screen to
 *   explain why, and no way to undo it. Invisible state must not persist.
 */
export type QuizSetupPrefs = Pick<
  QuizConfig,
  'mode' | 'subregions' | 'fields' | 'practice' | 'choice'
>;

/**
 * One key for the whole object.
 *
 * The version is in **both** the key and the payload, exactly as `MASTERY_KEY` is: the
 * payload's is what a future migration switches on, the key's is the cheap "different shape
 * entirely" escape.
 */
export const SETUP_PREFS_KEY = 'geographyapp:quizSetup:v1';
export const SETUP_PREFS_SCHEMA = 1;

/**
 * What a fresh install plays.
 *
 * Deliberately identical to what the screen's `useState` initialisers used to hold, so
 * landing persistence changed nothing at all for a player who has never opened the quiz.
 */
export const DEFAULT_SETUP_PREFS: QuizSetupPrefs = {
  mode: DEFAULT_MODE,
  subregions: [],
  fields: [...DEFAULT_FIELDS],
  practice: false,
  choice: false,
};

/** How many subregions are worth storing. There are 24; this is a bound, not a limit. */
const MAX_SUBREGIONS = 32;

type WirePayload = {
  v: number;
  mode: QuizMode;
  subregions: string[];
  fields: FieldId[];
  practice: boolean;
  choice: boolean;
};

/**
 * Named keys, NOT the positional tuples `masteryCodec.ts` uses.
 *
 * That file packs its fields because it writes the same shape 1158 times over and the size
 * is the whole point. This writes five keys once per tap on a picker, so readability wins
 * and there is nothing to buy by compressing it. A deliberate divergence, recorded here
 * because the obvious instinct is to make the two consistent.
 */
export function encodeSetupPrefs(prefs: QuizSetupPrefs): string {
  return JSON.stringify({
    v: SETUP_PREFS_SCHEMA,
    mode: prefs.mode,
    subregions: prefs.subregions,
    fields: prefs.fields,
    practice: prefs.practice,
    choice: prefs.choice,
  } satisfies WirePayload);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The subset of `raw` that is a real, deduped list of `FieldId`s.
 *
 * A field REMOVED from the app - as `languages` was - is dropped here rather than restored
 * as a checkbox that no longer exists. The same discipline as `decodeMastery`'s
 * `isMasteryField` check, and for the same reason: a stale preference should stop counting,
 * not corrupt what is around it.
 */
function decodeFields(raw: unknown): FieldId[] | null {
  if (!Array.isArray(raw)) return null;

  const fields = raw.filter((field): field is FieldId =>
    (ANSWERABLE_FIELDS as readonly string[]).includes(field as string),
  );

  return [...new Set(fields)];
}

/**
 * A deduped list of subregion names, capped.
 *
 * The names themselves are NOT checked against the catalogue, the rule `parseQuizParams`
 * already follows: `quizCountries` owns that list, and importing it here would pull
 * `countries.geo.json` into a module that is purely about coercing a blob. The setup screen
 * filters with `knownSubregions` instead, where the catalogue already lives - which matters
 * more here than for a URL, since an unknown name would otherwise leave every checkbox
 * clear AND Start disabled with nothing on screen saying why.
 */
function decodeSubregions(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;

  const names = raw.filter((name): name is string => typeof name === 'string' && name.length > 0);
  return [...new Set(names)].slice(0, MAX_SUBREGIONS);
}

/**
 * Whatever was on disk, as the subset of preferences it actually described.
 *
 * **Returns a `Partial`, not a filled value**, and that is the whole design. It is
 * `loadLocale`'s "null and 'en' are different answers" argument applied per field: the
 * decoder has to be able to say "I have nothing for `mode`" distinctly from "`mode` is
 * `facts`", or a corrupt field cannot be told from a deliberate choice. `mergeSetupPrefs` is
 * then the single place a default is ever applied.
 *
 * Validation is per field, deliberately: one unrecognised value should cost one setting, not
 * the player's whole configuration.
 */
export function decodeSetupPrefs(raw: string | null | undefined): Partial<QuizSetupPrefs> {
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (!isPlainObject(parsed)) return {};

  // A `switch` is where a v2 migration lands. Until then anything else is not ours.
  if (parsed.v !== SETUP_PREFS_SCHEMA) return {};

  const prefs: Partial<QuizSetupPrefs> = {};

  // The exact line `parseQuizParams` uses, so a mode the app no longer has resolves the same
  // way in both places.
  const mode = QUIZ_MODES.find((candidate) => candidate === parsed.mode);
  if (mode) prefs.mode = mode;

  // `fields` is PRESENT whenever the stored value was an array, even when filtering emptied
  // it, and absent only when it was not an array at all. That distinction is what lets
  // `mergeSetupPrefs` supply `DEFAULT_FIELDS` for a missing key without overwriting a
  // deliberate empty selection - see its docstring.
  const fields = decodeFields(parsed.fields);
  if (fields) prefs.fields = fields;

  const subregions = decodeSubregions(parsed.subregions);
  if (subregions) prefs.subregions = subregions;

  // Booleans are matched exactly. Unlike `parseQuizParams`, which has to read a hand-typed
  // URL, we are our own writer here - so there is no reason to accept `'1'` or `'true'`, and
  // accepting anything truthy would mean a stored `'no'` turned a setting on.
  if (parsed.practice === true) prefs.practice = true;
  else if (parsed.practice === false) prefs.practice = false;

  if (parsed.choice === true) prefs.choice = true;
  else if (parsed.choice === false) prefs.choice = false;

  return prefs;
}

/**
 * Fill in whatever the stored value did not describe.
 *
 * The one place `DEFAULT_SETUP_PREFS` is applied, so "what happens when this is missing" is
 * answered once rather than at every reader.
 *
 * **An empty `fields` survives.** A player can untick every fact, and `canStart` already
 * handles that by disabling Start with a label that says so. Coming back to a screen that
 * had silently re-ticked "Country" would be worse than one that is honest about what was
 * left - and it would start a name round nobody configured, which is the failure
 * `MODE_ASKS_FIELDS` exists to prevent.
 */
export function mergeSetupPrefs(stored: Partial<QuizSetupPrefs>): QuizSetupPrefs {
  return {
    mode: stored.mode ?? DEFAULT_SETUP_PREFS.mode,
    subregions: stored.subregions ?? [...DEFAULT_SETUP_PREFS.subregions],
    fields: stored.fields ?? [...DEFAULT_SETUP_PREFS.fields],
    practice: stored.practice ?? DEFAULT_SETUP_PREFS.practice,
    choice: stored.choice ?? DEFAULT_SETUP_PREFS.choice,
  };
}
