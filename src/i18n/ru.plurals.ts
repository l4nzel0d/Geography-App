import type { PluralForms } from './plural';
import type { PluralKey } from './t';

/**
 * The counted messages in Russian, where every one of them needs three forms.
 *
 * Typed `Record<PluralKey, ...>` with all three forms **required**, so the compiler - not a
 * reviewer - is what stops a Russian message shipping with only the English pair. That is
 * the single most likely way to get "11 страна" onto a screen.
 *
 *     1, 21, 101  ->  one    страна
 *     2, 3, 4     ->  few    страны
 *     0, 5..20    ->  many   стран
 *
 * `other` is required by `PluralForms` as the always-available fallback; in Russian it is
 * the `many` form, which is what a count with no matching rule should read as.
 *
 * `info.fact.currencies` and `info.fact.languages` are section *headings*, not counted
 * phrases, so their `many` deliberately keeps the nominative plural (`Валюты`, not
 * `Валют`) - a bare genitive reads as a fragment above a list.
 */
export const ruPlurals: Record<PluralKey, Required<PluralForms>> = {
  'quiz.setup.start': {
    one: 'Начать — {count} страна',
    few: 'Начать — {count} страны',
    many: 'Начать — {count} стран',
    other: 'Начать — {count} стран',
  },
  'quiz.setup.startA11y': {
    one: 'Начать тест из {count} страны',
    few: 'Начать тест из {count} стран',
    many: 'Начать тест из {count} стран',
    other: 'Начать тест из {count} стран',
  },
  'quiz.subregion.count': {
    one: '{subregion}, {count} страна',
    few: '{subregion}, {count} страны',
    many: '{subregion}, {count} стран',
    other: '{subregion}, {count} стран',
  },
  'quiz.practice.weak.hint': {
    one: '{count} страна, в которой вы чаще всего ошибаетесь. Страны, о которых вас ни разу не спрашивали, считаются слабыми.',
    few: '{count} страны, в которых вы чаще всего ошибаетесь. Страны, о которых вас ни разу не спрашивали, считаются слабыми.',
    many: '{count} стран, в которых вы чаще всего ошибаетесь. Страны, о которых вас ни разу не спрашивали, считаются слабыми.',
    other:
      '{count} стран, в которых вы чаще всего ошибаетесь. Страны, о которых вас ни разу не спрашивали, считаются слабыми.',
  },
  'quiz.reset.note': {
    one: 'Тесты рассказали карте о {count} стране. Сброс очистит это для всех стран.',
    few: 'Тесты рассказали карте о {count} странах. Сброс очистит это для всех стран.',
    many: 'Тесты рассказали карте о {count} странах. Сброс очистит это для всех стран.',
    other: 'Тесты рассказали карте о {count} странах. Сброс очистит это для всех стран.',
  },
  'quiz.reset.subject': {
    one: 'Ваша история тестов по {count} стране',
    few: 'Ваша история тестов по {count} странам',
    many: 'Ваша история тестов по {count} странам',
    other: 'Ваша история тестов по {count} странам',
  },
  'info.fact.currencies': {
    one: 'Валюта',
    few: 'Валюты',
    many: 'Валюты',
    other: 'Валюты',
  },
  'info.fact.languages': {
    one: 'Официальный язык',
    few: 'Официальные языки',
    many: 'Официальные языки',
    other: 'Официальные языки',
  },
  'results.countriesFullyCorrect': {
    one: 'страна полностью верно',
    few: 'страны полностью верно',
    many: 'стран полностью верно',
    other: 'стран полностью верно',
  },
  'results.review.missed': {
    one: 'Разбор — {count} ошибка',
    few: 'Разбор — {count} ошибки',
    many: 'Разбор — {count} ошибок',
    other: 'Разбор — {count} ошибок',
  },
};
