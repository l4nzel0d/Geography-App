import { formatCurrency, formatPopulation } from '@/components/formatters';
import type { CountryFacts } from '@/data/types';

import { getLocale } from '@/i18n/locale';
import type { Locale } from '@/i18n/localeTypes';

import { currencyAliases, nameAliases, NAME_INDEX_BY_LOCALE } from './answerAliases';
import { allowedEdits, editDistance } from './editDistance';
import { normalizeText, russianStem } from './normalizeText';
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
 * Zimbabwe lists 9 currencies, and "name all 9" is a wall rather than a question. It only
 * bites there - every other country has one or two, so `min(3, n)` is simply `n` for 192
 * of the 193 and the whole set is still required of them.
 */
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
 * that for the last one - they type "euro" and hit Check. Dropping that text marked a
 * fully correct answer as blank, which read as the currency field being ignored
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
  /**
   * Fold inflection before comparing, for the languages where a noun changes shape.
   *
   * Passed only for the SET fields - see `russianStem`. Country names deliberately do not
   * get it: there the confusable guard is doing safety work, and a looser comparison on
   * the one field where a near miss means a *different country* is the wrong trade.
   */
  stem?: (text: string) => string,
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

  // Ranked as an alias rather than a typo, because it is not one: "рублей" is the right
  // word in the wrong case, and the player knew the answer.
  if (stem) {
    const stemmed = stem(guess);
    if (stemmed && normalized.some((candidate) => stem(candidate) === stemmed)) return 'alias';
  }

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
 * Grade a set answer - currencies, entered as chips.
 *
 * `required` is how many distinct correct entries are needed: all of them for all but
 * Zimbabwe, which lists nine currencies, where naming all nine is not a quiz question but
 * a wall. See `CURRENCIES_REQUIRED`.
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
  /** Inflection folding for this language, or nothing. See `matchesText`. */
  stem?: (text: string) => string,
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
        // Stemming is offered only on the SECOND pass, alongside fuzzy matching. An
        // inflected form is a weaker match than a spelled-out one, and letting it compete
        // in the exact pass would let "рублей" consume the entry that a later chip
        // matches outright - the same greedy-consumption bug the two passes exist to stop.
        const how = matchesText(
          given[i],
          acceptedFor(item),
          undefined,
          undefined,
          exactPass ? undefined : stem,
        );
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
 * Magnitude words, by the multiplier they mean.
 *
 * Both languages are accepted in either round, deliberately and for the same reason the
 * alias lists are a superset: nobody typing "68m" into a Russian round has misunderstood
 * the question, and a player switching languages mid-session should not have their muscle
 * memory marked wrong.
 *
 * The Russian abbreviations are matched WITHOUT their full stops, because the `.` is
 * stripped along with the spaces below - "1,4 млрд." and "1.4 млрд" are the same answer.
 *
 * The bare letters `т` and `м` are in for the same reason `k` and `m` are: they are what
 * someone reaches for on a number keypad. `м` is a prefix of `млн` and `т` of `тыс`, which
 * costs nothing - every pattern is anchored, so the alternation is an exact match and
 * never a prefix one. There is no single-letter form for billions: `м` is spent.
 */
const MAGNITUDES: readonly [RegExp, number][] = [
  [/^(?:k|т|тыс|тысяч|тысячи|тысяча)$/, 1e3],
  [/^(?:m|mn|mil|million|м|млн|миллион|миллиона|миллионов)$/, 1e6],
  [/^(?:b|bn|billion|млрд|миллиард|миллиарда|миллиардов)$/, 1e9],
];

/**
 * Read a population out of whatever the player typed.
 *
 * People write big numbers in every shape there is - "68,000,000", "68 million", "68m",
 * "1.4bn", "68 млн", "1,4 млрд" - and rejecting any of them would be marking presentation,
 * not knowledge.
 *
 * **What a comma means is decided by the round's language, and nothing else.** In English
 * it groups thousands; in Russian it is the decimal point, and "1,4 млрд" is how a Russian
 * speaker writes 1.4 billion. Reading it the English way turned that answer into fourteen
 * billion - ten times the right figure, marked wrong, with the panel echoing back a number
 * the player never typed.
 *
 * The one shape that survives both readings is a number with SEVERAL commas: "68,000,000"
 * cannot be a decimal, because a decimal has one point. So Russian treats a lone comma as
 * the decimal separator and any further one as grouping, which keeps an English-habit
 * answer working in a Russian round without costing the native one.
 *
 * What that leaves ambiguous is exactly one case - a single comma with a full group of
 * three digits after it and no magnitude word, "1,400". Russian reads it as 1.4, which is
 * what a Russian speaker means by it; anyone meaning fourteen hundred can write "1400" or
 * "1 400", and both parse. It is unresolvable in general, so it is settled per language
 * rather than guessed at per number.
 *
 * The full stop stays a decimal point in both, because it is not ambiguous in either: no
 * one writing Russian groups thousands with it, and "1.4 млрд" is a shape players type.
 */
export function parsePopulation(
  input: string | undefined,
  locale: Locale = getLocale(),
): number | null {
  if (!input) return null;

  // Trailing separators go first, so "1 400," is a whole number rather than a lone comma,
  // and "68 млрд." keeps the abbreviation the MAGNITUDES patterns expect.
  const trimmed = input.toLowerCase().replace(/[,\s _.]+$/g, '');

  const decimalComma = locale === 'ru' && (trimmed.match(/,/g)?.length ?? 0) === 1;
  const text = (decimalComma ? trimmed.replace(',', '.') : trimmed.replace(/,/g, '')).replace(
    /[\s _]/g,
    '',
  );

  const match = text.match(/^(\d+(?:\.\d+)?)\s*([a-zа-я]*)\.?$/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return null;

  const suffix = match[2].replace(/\.$/, '');
  if (!suffix) return value;

  const magnitude = MAGNITUDES.find(([pattern]) => pattern.test(suffix));
  // An unrecognised word is a rejection, not a silent multiplier of one: "68 people" is
  // not an answer, and treating it as 68 would mark a wild guess correct.
  return magnitude ? value * magnitude[1] : null;
}

export function gradeNumeric(
  field: FieldId,
  input: string | undefined,
  expected: number,
  tolerance = POPULATION_TOLERANCE,
  locale: Locale = getLocale(),
): FieldGrade {
  // Both figures go straight onto the answer panel, so they follow the app's language -
  // Russian groups with a thin space, not a comma. `formatPopulation` is the same
  // formatter the info sheet uses, so a population never reads two ways in one session.
  //
  // The locale is threaded rather than left ambient because it decides how the ANSWER is
  // read as well as how it is written back: the two must agree, or the panel echoes a
  // figure the player did not type.
  const expectedLabel = formatPopulation(expected, locale);
  const value = parsePopulation(input, locale);

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
    given: formatPopulation(value),
    expected: expectedLabel,
    percentOff,
  };
}

/**
 * How this language folds inflection, or nothing if it does not need to.
 *
 * English nouns barely inflect for this purpose - "dollar"/"dollars" is one edit and the
 * typo budget already covers it - so it gets no stemmer and its behaviour is byte-for-byte
 * what it always was.
 */
function stemFor(locale: Locale): ((text: string) => string) | undefined {
  return locale === 'ru' ? russianStem : undefined;
}

export function gradeField(
  iso3: string,
  facts: CountryFacts,
  field: FieldId,
  answers: AnswerInput,
  locale: Locale = getLocale(),
): FieldGrade {
  const raw = answers[field];
  const asString = Array.isArray(raw) ? raw.join(' ') : raw;

  switch (field) {
    case 'name':
      return gradeSingle(field, asString, nameAliases(iso3, facts, locale), {
        // The index for THIS language. Handing it the English one in a Russian round makes
        // the confusable guard blind, and "австрия" scores a point for Австралия.
        reserved: NAME_INDEX_BY_LOCALE[locale],
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
        currencyAliases(facts, locale),
        (name) => byName.get(name) ?? name,
        stemFor(locale),
      );
    }

    case 'population':
      return gradeNumeric(field, asString, facts.population ?? 0, POPULATION_TOLERANCE, locale);
  }
}

export function gradeQuestion(
  question: { iso3: string; facts: CountryFacts; fields: FieldId[] },
  answers: AnswerInput,
  locale: Locale = getLocale(),
): QuestionResult {
  const grades = question.fields.map((field) =>
    gradeField(question.iso3, question.facts, field, answers, locale),
  );
  return {
    iso3: question.iso3,
    grades,
    allCorrect: grades.length > 0 && grades.every((g) => g.correct),
  };
}

export { isBlank };
