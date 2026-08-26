import type { QuestionResult } from '@/quiz/gradeAnswer';
import { ANSWERABLE_FIELDS, type GradedField, LOCATION_FIELD } from '@/quiz/quizConfig';

/**
 * How well you know a country, from how you have answered it in quizzes.
 *
 * Pure, and imports nothing but types and the field catalogue - no storage, no React, no
 * clock. **There are no dates anywhere in this feature.** The model is a weakness score,
 * not spaced repetition: what is stored is counters, and what is computed from them
 * depends only on those counters. `Date.now()` does not appear anywhere in `src/` and
 * this is not the file to change that.
 */

/** One field of one country: how often it was asked, and how the last attempt went. */
export type FieldRecord = { asked: number; correct: number; lastCorrect: boolean };

/** Everything recorded about one country, keyed by the field that was graded. */
export type CountryRecord = Partial<Record<GradedField, FieldRecord>>;

/** The whole history, keyed by ISO 3166-1 alpha-3 - the app's single source of identity. */
export type MasteryTable = Record<string, CountryRecord>;

/** Every field a grade can be about: the five typed facts, plus the tapped location. */
export const MASTERY_FIELDS: readonly GradedField[] = [...ANSWERABLE_FIELDS, LOCATION_FIELD];

const MASTERY_FIELD_SET = new Set<string>(MASTERY_FIELDS);

export function isMasteryField(field: string): field is GradedField {
  return MASTERY_FIELD_SET.has(field);
}

/**
 * One phantom wrong answer, applied to the PRACTICE score only - never to the map's.
 *
 * It shrinks a thin record toward weak, so a country proven once is still worth revisiting
 * more often than one proven nine times. That is a real thing worth having, and it is why
 * the prior still exists.
 *
 * **It used to be applied to the displayed score too, and that was a mistake.** It made a
 * country you had answered correctly read 50%, and demanded NINE consecutive correct
 * answers before one reached the green band - unreachable across 193 countries, so the map
 * sat permanently orange whatever the player did. The error was conceptual: it conflated
 * "you are mediocre at this" with "we have not asked you much", and those are different.
 * The map already says the second one with the grey `not asked yet` band, so the colour
 * never has to hedge; the sampler has no such band, so this is where the hedge belongs.
 */
export const MASTERY_PRIOR = 1;

/** How much a wrong LAST answer discounts an otherwise good record. */
export const RECENCY_WEIGHT = 0.4;

/**
 * Whether an entry describes something that really happened.
 *
 * Mirrors `decodeField` in `masteryCodec.ts`, which is the guard that matters for data
 * coming off disk. This one catches the rest: a record built in memory, or one whose
 * counters would arithmetic into a plausible-looking number rather than an obvious
 * failure. `asked: Infinity` is the instructive case - it divides to a finite 0, which
 * would paint a country as "always wrong" on the strength of a corrupt counter.
 */
function usableEntry(entry: FieldRecord | undefined): entry is FieldRecord {
  if (!entry) return false;
  if (!Number.isSafeInteger(entry.asked) || entry.asked <= 0) return false;
  if (!Number.isSafeInteger(entry.correct) || entry.correct < 0) return false;
  return entry.correct <= entry.asked;
}

/**
 * The one formula, with the prior as its only variable.
 *
 * Both scores are this: the map passes 0 and gets honest accuracy, the practice sampler
 * passes `MASTERY_PRIOR` and gets a version that treats a thin record with suspicion.
 * Written once so the ONLY difference between what is painted and what is practised is
 * visible in a single parameter, rather than as two formulas free to drift.
 *
 * Fields are POOLED rather than averaged as per-field rates, which weights the score by how
 * often you were actually asked - the honest reading of "how well do I know this country".
 * The recency discount is then proportional to how many of the fields you know about it you
 * got wrong last time, so missing the capital of a country you also answer the name and
 * currency for costs `0.4 * 1/3`, not the lot.
 */
function scoreWith(record: CountryRecord | undefined, prior: number): number | null {
  if (!record) return null;

  let asked = 0;
  let correct = 0;
  let fields = 0;
  let lastWrong = 0;

  for (const field of MASTERY_FIELDS) {
    const entry = record[field];
    if (!usableEntry(entry)) continue;

    asked += entry.asked;
    correct += entry.correct;
    fields += 1;
    if (!entry.lastCorrect) lastWrong += 1;
  }

  if (fields === 0) return null;

  const accuracy = correct / (asked + prior);
  const recency = 1 - RECENCY_WEIGHT * (lastWrong / fields);
  const mastery = accuracy * recency;

  // A non-finite score would poison `interpolate` exactly like a null population would,
  // and it would do it inside the native renderer where nothing surfaces the reason. The
  // codec guards the counters on the way in; this is the belt to that braces.
  if (!Number.isFinite(mastery)) return null;

  return Math.min(Math.max(mastery, 0), 1);
}

/**
 * How well the player knows this country, in [0, 1] - or `null` if never asked.
 *
 * **This is what the map paints, and it carries no prior.** Everything you have been asked
 * about a country, answered right, is 100% - however few times that was. The colour reports
 * what the evidence actually says, and says nothing about how much evidence there is.
 *
 * **`null`, never `0`.** A country you have never seen and a country you always get wrong
 * are completely different things, and the map has to be able to tell them apart. The null
 * travels all the way to the paint expression as an ABSENT feature property, which is what
 * lets `['has','mastery']` split it off into the grey no-data colour - the same discipline
 * `densityOf` -> `withChoroplethValues` -> `logRampFillColor` already runs for the
 * territories the World Bank does not report on.
 *
 * That grey band is precisely why no prior is needed here: "we have not asked you much" has
 * its own colour, so the number never has to hedge on its behalf. See `MASTERY_PRIOR`,
 * which still hedges - for the sampler, where there is no grey band to lean on.
 */
export function masteryOf(record: CountryRecord | undefined): number | null {
  return scoreWith(record, 0);
}

/**
 * The same score, discounted for how thin the record is - what the practice sampler weighs.
 *
 * Deliberately disagrees with `masteryOf`: a country answered right once is 100% on the map
 * and 0.5 here, so it still resurfaces in practice while being honestly shown as known. One
 * lucky guess should not retire a country forever, and this is the only place that concern
 * belongs.
 */
export function practiceMasteryOf(record: CountryRecord | undefined): number | null {
  return scoreWith(record, MASTERY_PRIOR);
}

function scoresBy(
  table: MasteryTable,
  score: (record: CountryRecord) => number | null,
): Record<string, number> {
  const scores: Record<string, number> = {};

  for (const [iso3, record] of Object.entries(table)) {
    const value = score(record);
    if (value != null) scores[iso3] = value;
  }

  return scores;
}

/**
 * Every country's display score, ready to fold onto the outlines.
 *
 * Countries with no usable record are **omitted entirely** rather than carrying null - see
 * `masteryOf`, and `withMastery`, which relies on it.
 */
export function masteryScores(table: MasteryTable): Record<string, number> {
  return scoresBy(table, masteryOf);
}

/**
 * Every country's practice score, for `pickWeakSpots`.
 *
 * Omits never-asked countries for the same reason, and it matters just as much here:
 * `practiceWeight` reads an absent score as maximally weak, which is what makes a country
 * you have never seen the likeliest thing a practice round shows you.
 */
export function practiceScores(table: MasteryTable): Record<string, number> {
  return scoresBy(table, practiceMasteryOf);
}

/**
 * Fold one graded question into the table, returning a NEW table.
 *
 * Countries other than this one are carried through **by reference**, so recording an
 * answer costs one small object rather than a copy of the history.
 *
 * A blank answer counts as asked-and-wrong: `gradeAnswer` already reports `how: 'blank'`
 * with `correct: false`, it is genuine evidence of weakness, and locate mode explicitly
 * sanctions checking with nothing picked as the "no idea, show me" move.
 */
export function applyResult(table: MasteryTable, result: QuestionResult): MasteryTable {
  if (result.grades.length === 0) return table;

  const previous = table[result.iso3];
  const record: CountryRecord = { ...previous };

  for (const grade of result.grades) {
    if (!isMasteryField(grade.field)) continue;

    const entry = record[grade.field];
    record[grade.field] = {
      asked: (entry?.asked ?? 0) + 1,
      correct: (entry?.correct ?? 0) + (grade.correct ? 1 : 0),
      lastCorrect: grade.correct,
    };
  }

  return { ...table, [result.iso3]: record };
}
