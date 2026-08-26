import type { PluralForms } from './plural';

/**
 * The messages whose wording depends on a count, in English.
 *
 * Separate from `en.ts` because these are a different shape: English needs two forms and
 * Russian needs three, so a single string cannot carry either. `PluralKey` is
 * `keyof typeof enPlurals`, and `ru.plurals.ts` is typed against it exactly as `ru.ts` is
 * typed against `en.ts`.
 *
 * `{count}` is injected by `tPlural` and does not need passing as a param.
 *
 * **Only genuinely count-dependent messages belong here.** `All {count}` and
 * `Review — all {count} correct` read the same at every count in both languages and stayed
 * ordinary messages; putting them here would mean three identical strings to keep in sync.
 *
 * Two of these are *labels* rather than sentences - `info.fact.currencies` and
 * `info.fact.languages` - pluralised on how many entries the country has. They are the
 * reason `CountryInfoSheet` had hand-rolled ternaries in the first place.
 */
export const enPlurals = {
  'quiz.setup.start': {
    one: 'Start — {count} country',
    other: 'Start — {count} countries',
  },
  'quiz.setup.startA11y': {
    one: 'Start a quiz of {count} country',
    other: 'Start a quiz of {count} countries',
  },
  'quiz.subregion.count': {
    one: '{subregion}, {count} country',
    other: '{subregion}, {count} countries',
  },
  'quiz.practice.weak.hint': {
    one: '{count} country you get wrong most often. Countries you have never been asked count as weak.',
    other:
      '{count} countries you get wrong most often. Countries you have never been asked count as weak.',
  },
  'quiz.reset.note': {
    one: 'Quizzes have taught the map about {count} country. Resetting clears that for every country.',
    other:
      'Quizzes have taught the map about {count} countries. Resetting clears that for every country.',
  },
  'quiz.reset.subject': {
    one: 'Your quiz history for {count} country',
    other: 'Your quiz history for {count} countries',
  },
  'info.fact.currencies': {
    one: 'Currency',
    other: 'Currencies',
  },
  'info.fact.languages': {
    one: 'Official language',
    other: 'Official languages',
  },
  'results.countriesFullyCorrect': {
    one: 'country fully correct',
    other: 'countries fully correct',
  },
  'results.review.missed': {
    one: 'Review — {count} missed',
    other: 'Review — {count} missed',
  },
  /**
   * The count is in the label deliberately, and not left to the review heading above it.
   * The footer is pinned while that list scrolls, so the heading is usually off screen by
   * the time this button is pressed - and 3 versus 87 is the one fact worth having before
   * committing to another round. `quiz.setup.start` names its length for the same reason.
   *
   * The tempting English `one` form is "Retry the one I got wrong", with no `{count}` at
   * all. Do not: Russian's `one` covers 1, 21, 31 and 101, so a countless `one` is simply
   * wrong there, and the pair would be structurally different for nothing.
   */
  'results.retryMissed': {
    one: 'Retry {count} country I got wrong',
    other: 'Retry {count} countries I got wrong',
  },
} as const satisfies Record<string, PluralForms>;
