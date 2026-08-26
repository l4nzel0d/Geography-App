import {
  type CountryRecord,
  type FieldRecord,
  isMasteryField,
  type MasteryTable,
} from './masteryScore';

/**
 * The wire format for the mastery table, and every guard on the way back in.
 *
 * Pure: no storage, no platform. `masteryStorage.ts` and its `.web.ts` sibling own the
 * I/O; this owns the shape, so the interesting half is testable without either.
 *
 * **Nothing here ever throws.** What is stored is a cache of something the player can
 * regenerate by playing, and a corrupt blob must degrade to "no history", never to a red
 * screen on launch.
 */

/**
 * One key for the whole table, not one per country.
 *
 * There is no partial-read case - the choropleth needs every country's score on the first
 * frame - and 193 keys would be 193 round trips into SQLite for a payload that is 39 KB
 * even when every country has been asked every field. Measured, not guessed; the size is
 * pinned in `masteryCodec.test.ts`.
 *
 * The version is in **both** the key and the payload on purpose: the payload's is what a
 * future migration switches on, the key's is the cheap "different shape entirely" escape.
 */
export const MASTERY_KEY = 'geographyapp:mastery:v1';
export const MASTERY_SCHEMA = 1;

/** `[asked, correct, lastCorrect]`. Positional, because this is written 1158 times. */
type WireField = [number, number, 0 | 1];
type WirePayload = { v: number; c: Record<string, Record<string, WireField>> };

export function encodeMastery(table: MasteryTable): string {
  const countries: Record<string, Record<string, WireField>> = {};

  for (const [iso3, record] of Object.entries(table)) {
    const fields: Record<string, WireField> = {};
    let any = false;

    for (const [field, entry] of Object.entries(record)) {
      if (!entry || entry.asked <= 0) continue;
      fields[field] = [entry.asked, entry.correct, entry.lastCorrect ? 1 : 0];
      any = true;
    }

    // A country whose every field fell away carries no information; dropping it here is
    // what keeps the blob proportional to what was actually played.
    if (any) countries[iso3] = fields;
  }

  return JSON.stringify({ v: MASTERY_SCHEMA, c: countries } satisfies WirePayload);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * A counter that can be trusted to reach `masteryOf` without poisoning it.
 *
 * `asked` a positive safe integer, `correct` a safe integer within `[0, asked]`. Anything
 * outside that - `NaN`, `-1`, `1.5`, `Infinity`, or more correct answers than questions -
 * means the entry is not describing anything real.
 */
function decodeField(raw: unknown): FieldRecord | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;

  const [asked, correct, last] = raw as unknown[];
  if (typeof asked !== 'number' || !Number.isSafeInteger(asked) || asked <= 0) return null;
  if (typeof correct !== 'number' || !Number.isSafeInteger(correct)) return null;
  if (correct < 0 || correct > asked) return null;

  return { asked, correct, lastCorrect: last === 1 || last === true };
}

/**
 * Whatever was on disk, as a usable table. Returns `{}` rather than throwing, always.
 *
 * Validation is **per field**, deliberately: one bad entry should cost one entry, not a
 * player's whole history. An unknown ISO-3 is KEPT rather than rejected - checking it
 * would mean importing the geometry into a module that has no other reason to know about
 * it, and an unknown code simply never matches a feature and never reaches the map.
 */
export function decodeMastery(raw: string | null | undefined): MasteryTable {
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }

  if (!isPlainObject(parsed)) return {};

  // A `switch` is where a v2 migration lands. Until then anything else is not ours.
  if (parsed.v !== MASTERY_SCHEMA) return {};
  if (!isPlainObject(parsed.c)) return {};

  const table: MasteryTable = {};

  for (const [iso3, rawRecord] of Object.entries(parsed.c)) {
    if (!isPlainObject(rawRecord)) continue;

    const record: CountryRecord = {};
    let any = false;

    for (const [field, rawField] of Object.entries(rawRecord)) {
      if (!isMasteryField(field)) continue;

      const entry = decodeField(rawField);
      if (!entry) continue;

      record[field] = entry;
      any = true;
    }

    if (any) table[iso3] = record;
  }

  return table;
}

/**
 * Combine what was on disk with what is already in memory.
 *
 * The load is async, and a deep link straight onto `/quiz/play` could record an answer
 * before it lands. Assigning the loaded table over the top would silently drop that
 * answer, so counters are SUMMED and the in-memory `lastCorrect` wins - it is by
 * definition the more recent of the two.
 */
export function mergeTables(stored: MasteryTable, memory: MasteryTable): MasteryTable {
  if (Object.keys(memory).length === 0) return stored;

  const merged: MasteryTable = { ...stored };

  for (const [iso3, record] of Object.entries(memory)) {
    const base = merged[iso3];
    if (!base) {
      merged[iso3] = record;
      continue;
    }

    const combined: CountryRecord = { ...base };
    for (const [field, entry] of Object.entries(record)) {
      if (!entry || !isMasteryField(field)) continue;

      const existing = combined[field];
      combined[field] = existing
        ? {
            asked: existing.asked + entry.asked,
            correct: existing.correct + entry.correct,
            lastCorrect: entry.lastCorrect,
          }
        : entry;
    }

    merged[iso3] = combined;
  }

  return merged;
}
