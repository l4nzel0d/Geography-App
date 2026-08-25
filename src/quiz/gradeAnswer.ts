import { formatCurrency } from '@/components/formatters';
import type { CountryFacts } from '@/data/types';

import { currencyAliases, languageAliases, nameAliases, NAME_INDEX } from './answerAliases';
import { allowedEdits, editDistance } from './editDistance';
import { normalizeText } from './normalizeText';
import { ANSWERABLE_FIELDS, type FieldId, type GradedField, isSetField } from './quizConfig';

/**
 * Marking one country's answers.
 *
 * Forgiving about spelling, unforgiving about being a different country.
 */

/** The population band. Being within a fifth of the truth means you knew the size. */
export const POPULATION_TOLERANCE = 0.2;

/**
 * How many entries a set field needs, when the country has more than that.
 *
 * Three for both, and for the same reason: Zimbabwe lists 15 official languages and 9
 * currencies, and "name all 9" is a wall rather than a question. It only bites there -
 * every other country has one or two currencies, so `min(3, n)` is simply `n` for 192 of
 * the 193 and the whole set is still required of them.
 */
export const LANGUAGES_REQUIRED = 3;
export const CURRENCIES_REQUIRED = 3;

export type MatchKind = 'exact' | 'alias' | 'fuzzy' | 'partial' | 'wrong' | 'blank';

export type FieldGrade = {
  /**
   * `GradedField`, not `FieldId`: a `locate` round grades the country's location, which
   * is answered by tapping and so is never one of the typed fields. See `gradeLocation`.
   */
  field: GradedField;
  correct: boolean;
  how: MatchKind;
  /** What the player gave, ready to display. */
  given: string;
  /** The canonical answer, for the reveal line. */
  expected: string;
  /** Set fields only. */
  missed?: string[];
  /** Population only. Signed: -0.31 means 31% under. */
  percentOff?: number | null;
};

export type QuestionResult = {
  iso3: string;
  grades: FieldGrade[];
  allCorrect: boolean;
};

/** What the player typed for each field: a string, or chips for the set fields. */
export type AnswerInput = Partial<Record<FieldId, string | string[]>>;

/**
 * What the panel is holding: a text box per field, plus committed chips for the set
 * fields. A set field has BOTH - the chips already entered, and whatever is still
 * sitting in its input.
 */
export type RawAnswers = {
  text: Partial<Record<FieldId, string>>;
  chips: Partial<Record<FieldId, string[]>>;
};

/**
 * Fold the panel's state into something gradeable.
 *
 * **The trailing draft counts.** A chip is committed by pressing return, and nobody does
 * that for the last one - they type "French" and hit Check. Dropping that text marked a
 * fully correct answer as blank, which read as the languages field being ignored
 * entirely. So an uncommitted input is treated as one more chip.
 */
export function toAnswerInput({ text, chips }: RawAnswers): AnswerInput {
  const input: AnswerInput = {};

  for (const field of ANSWERABLE_FIELDS) {
    const draft = text[field]?.trim() ?? '';

    if (!isSetField(field)) {
      if (draft) input[field] = draft;
      continue;
    }

    const committed = chips[field] ?? [];
    // Case-insensitive, matching ChipInput's own duplicate rule, so committing a chip
    // and leaving the same word in the box does not count twice.
    const isDuplicate = committed.some((chip) => chip.toLowerCase() === draft.toLowerCase());
    const all = draft && !isDuplicate ? [...committed, draft] : committed;
    if (all.length) input[field] = all;
  }

  return input;
}

function isBlank(input: string | string[] | undefined): boolean {
  if (input == null) return true;
  return Array.isArray(input) ? input.filter((s) => s.trim()).length === 0 : !input.trim();
}

/**
 * Does `input` match any of `accepted`, allowing for accents, punctuation and a typo?
 *
 * `reserved` is the confusable guard and it is load-bearing. Plain edit distance accepts
 * "Gambia" for Zambia - one edit on a six-letter target, comfortably inside the budget.
 * So a FUZZY match (never an exact or alias one) is rejected outright if the thing typed
 * is itself the name of some other country. Answering "Gambia" is a wrong answer, not a
 * misspelled right one.
 */
export function matchesText(
  input: string,
  accepted: readonly string[],
  reserved?: ReadonlyMap<string, string>,
  ownIso3?: string,
): MatchKind | null {
  const guess = normalizeText(input);
  if (!guess) return null;

  const normalized = accepted.map(normalizeText).filter(Boolean);
  if (normalized.length === 0) return null;

  // The player's own spelling, exactly as the dataset's primary name.
  if (guess === normalized[0]) return 'exact';
  if (normalized.includes(guess)) return 'alias';

  // Naming a different country outright is wrong, however close the spelling.
  const claimed = reserved?.get(guess);
  if (claimed && claimed !== ownIso3) return null;

  for (const candidate of normalized) {
    const budget = allowedEdits(candidate.length);
    if (budget > 0 && editDistance(guess, candidate, budget) <= budget) return 'fuzzy';
  }

  return null;
}

export function gradeSingle(
  field: FieldId,
  input: string | undefined,
  accepted: readonly string[],
  options: { reserved?: ReadonlyMap<string, string>; ownIso3?: string } = {},
): FieldGrade {
  const expected = accepted[0] ?? '';
  const given = (input ?? '').trim();

  if (!given) {
    return { field, correct: false, how: 'blank', given: '', expected };
  }

  const how = matchesText(given, accepted, options.reserved, options.ownIso3);
  return {
    field,
    correct: how !== null,
    how: how ?? 'wrong',
    given,
    expected,
  };
}

/**
 * Grade a set answer - languages and currencies, entered as chips.
 *
 * `required` is how many distinct correct entries are needed: all of them for
 * currencies, the first three for languages (Zimbabwe lists fifteen, and demanding all
 * fifteen is not a quiz question, it is a wall).
 *
 * Two passes, exact before fuzzy, and it matters: with one greedy pass a loosely spelled
 * chip can consume the expected item that some later chip matches exactly, and a fully
 * correct answer marks wrong.
 */
export function gradeSet(
  field: FieldId,
  chips: string[] | undefined,
  expectedItems: readonly string[],
  required: number,
  aliasesFor?: Map<string, string[]>,
  /**
   * How to write an expected item out for the player, when that differs from the string
   * being matched against. Currencies are matched on the bare name - "Chinese yuan" -
   * but revealed in full, "Chinese yuan (CNY, ¥)".
   */
  displayFor: (item: string) => string = (item) => item,
): FieldGrade {
  const given = (chips ?? []).map((c) => c.trim()).filter(Boolean);
  const target = Math.min(required, expectedItems.length);
  const expectedLabel = expectedItems.map(displayFor).join(', ');

  if (given.length === 0) {
    return {
      field,
      correct: false,
      how: 'blank',
      given: '',
      expected: expectedLabel,
      missed: expectedItems.map(displayFor),
    };
  }

  const unmatched = new Set(expectedItems);
  const spent = new Set<number>();
  const acceptedFor = (item: string) => aliasesFor?.get(item) ?? [item];

  for (const exactPass of [true, false]) {
    for (const item of [...unmatched]) {
      for (let i = 0; i < given.length; i++) {
        if (spent.has(i)) continue;
        const how = matchesText(given[i], acceptedFor(item));
        if (how === null) continue;
        if (exactPass && how === 'fuzzy') continue;
        unmatched.delete(item);
        spent.add(i);
        break;
      }
    }
  }

  const matched = expectedItems.length - unmatched.size;
  const correct = matched >= target;

  return {
    field,
    correct,
    how: correct ? 'exact' : matched > 0 ? 'partial' : 'wrong',
    given: given.join(' · '),
    expected: expectedLabel,
    missed: [...unmatched].map(displayFor),
  };
}

/**
 * Read a population out of whatever the player typed.
 *
 * People write big numbers in every shape there is - "68,000,000", "68 million", "68m",
 * "1.4bn" - and rejecting any of them would be marking presentation, not knowledge.
 */
export function parsePopulation(input: string | undefined): number | null {
  if (!input) return null;

  const text = input.toLowerCase().replace(/[,\s_]/g, '');
  const match = text.match(/^(\d+(?:\.\d+)?)(k|m|mn|mil|million|b|bn|billion)?$/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;

  const multiplier =
    match[2] == null
      ? 1
      : match[2] === 'k'
        ? 1e3
        : match[2].startsWith('b')
          ? 1e9
          : 1e6;

  return value * multiplier;
}

export function gradeNumeric(
  field: FieldId,
  input: string | undefined,
  expected: number,
  tolerance = POPULATION_TOLERANCE,
): FieldGrade {
  const expectedLabel = expected.toLocaleString('en-US');
  const value = parsePopulation(input);

  if (value == null) {
    return {
      field,
      correct: false,
      how: 'blank',
      given: (input ?? '').trim(),
      expected: expectedLabel,
      percentOff: null,
    };
  }

  const percentOff = (value - expected) / expected;
  return {
    field,
    // Inclusive at the edge: exactly 20% out is within a 20% band.
    correct: Math.abs(percentOff) <= tolerance,
    how: Math.abs(percentOff) <= tolerance ? 'exact' : 'wrong',
    given: value.toLocaleString('en-US'),
    expected: expectedLabel,
    percentOff,
  };
}

export function gradeField(
  iso3: string,
  facts: CountryFacts,
  field: FieldId,
  answers: AnswerInput,
): FieldGrade {
  const raw = answers[field];
  const asString = Array.isArray(raw) ? raw.join(' ') : raw;

  switch (field) {
    case 'name':
      return gradeSingle(field, asString, nameAliases(iso3, facts), {
        reserved: NAME_INDEX,
        ownIso3: iso3,
      });

    case 'capital':
      // Several countries have more than one capital - South Africa has three - and
      // naming any of them is knowing the answer.
      return gradeSingle(field, asString, facts.capital.length ? facts.capital : ['']);

    case 'currency': {
      // Matched on the bare name, revealed with its code and symbol - the same shape the
      // info sheet uses, via the same formatter.
      const byName = new Map(facts.currencies.map((c) => [c.name, formatCurrency(c)]));
      return gradeSet(
        field,
        Array.isArray(raw) ? raw : raw ? [raw] : [],
        facts.currencies.map((c) => c.name),
        CURRENCIES_REQUIRED,
        currencyAliases(facts),
        (name) => byName.get(name) ?? name,
      );
    }

    case 'languages':
      return gradeSet(
        field,
        Array.isArray(raw) ? raw : raw ? [raw] : [],
        facts.languages,
        LANGUAGES_REQUIRED,
        languageAliases(facts),
      );

    case 'population':
      return gradeNumeric(field, asString, facts.population ?? 0);
  }
}

export function gradeQuestion(
  question: { iso3: string; facts: CountryFacts; fields: FieldId[] },
  answers: AnswerInput,
): QuestionResult {
  const grades = question.fields.map((field) =>
    gradeField(question.iso3, question.facts, field, answers),
  );
  return {
    iso3: question.iso3,
    grades,
    allCorrect: grades.length > 0 && grades.every((g) => g.correct),
  };
}

export { isBlank };
