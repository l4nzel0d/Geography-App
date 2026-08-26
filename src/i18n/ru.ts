import type { MessageKey } from './t';

/**
 * The same catalogue, in Russian.
 *
 * Typed `Record<MessageKey, string>` rather than inferred, so **a key missing here is a
 * compile error** and an extra one is too. That check is the reason this file is
 * TypeScript: `npm run typecheck` is the gate, and `catalogue.test.ts` only has to look
 * for the things a type cannot see (empty values, an untranslated English string, a
 * placeholder that got dropped in translation).
 *
 * ## Two constraints that shaped the wording
 *
 * **Width.** `MapControls` has ~379 dp between the safe areas at 411 dp, shared by two
 * rows, and every `map.fill.*.label` / `map.label.*.label` is a pill in the left one.
 * Russian is longer than English, so these are chosen short on purpose - `Знание` rather
 * than `Владение материалом`, and `Тест` for `quiz.open.label` rather than `Викторина`,
 * which alone would push the top-right row into the left one. `chromeWidth.test.ts` is
 * what stops that regressing; CLAUDE.md records the overlap actually shipping once.
 *
 * **Not spoiling the answer.** `quiz.flag.a11y` and the `locate.*` pre-check strings exist
 * specifically so a screen reader or a find-in-page cannot name the country before it has
 * been guessed. The Russian must keep that property, which is why `locate.ready` says
 * "готово" and not the country's name.
 */
export const ru: Record<MessageKey, string> = {
  // ---------------------------------------------------------------- app-level
  'app.name': 'Страны мира',
  'app.shortName': 'Страны',
  'app.description':
    'Карта мира, которая работает офлайн: нажмите на любую страну, чтобы увидеть её население, валюту, языки, столицу и площадь, раскрасьте сушу по населению или плотности, подпишите каждую страну, найдите любую из 237 стран или пройдите тест.',

  // ------------------------------------------------------------- generic bits
  'flag.a11y': 'Флаг страны {code}',
  'flag.codeA11y': 'Код страны {code}',

  // ----------------------------------------------------------- the map chrome
  'map.fill.panelTitle': 'Раскрасить сушу по',
  'map.fill.a11y': 'Раскраска суши: {mode}. Выберите, как раскрасить страны',
  'map.fill.flat.label': 'Обычная',
  'map.fill.flat.description': 'Обычная карта, без раскраски',
  'map.fill.population.label': 'Люди',
  'map.fill.population.description': 'Раскрасить страны по населению',
  'map.fill.density.label': 'Плотность',
  'map.fill.density.description': 'Раскрасить страны по числу людей на квадратный километр',
  'map.fill.mastery.label': 'Знание',
  'map.fill.mastery.description': 'Раскрасить страны по тому, насколько хорошо вы отвечаете о них в тестах',

  'map.labels.pill': 'Метки',
  'map.labels.panelTitle': 'Подписывать страны',
  'map.labels.a11y': 'Подписи на карте: {field}. Выберите, что показывать на каждой стране',
  'map.label.none.label': 'Нет',
  'map.label.none.description': 'Без подписей на карте',
  'map.label.name.label': 'Название',
  'map.label.name.description': 'Показывать название каждой страны',
  'map.label.flag.label': 'Флаг',
  'map.label.flag.description': 'Показывать флаг каждой страны',
  'map.label.capital.label': 'Столица',
  'map.label.capital.description': 'Показывать столицу каждой страны',
  'map.label.languages.label': 'Языки',
  'map.label.languages.description': 'Показывать до трёх официальных языков каждой страны',
  'map.label.currencies.label': 'Валюты',
  'map.label.currencies.description': 'Показывать до трёх валют каждой страны',
  'map.label.population.label': 'Население',
  'map.label.population.description': 'Показывать население каждой страны, округлённо',

  'map.language.panelTitle': 'Язык',
  'map.language.a11y': 'Язык: {language}. Выберите язык приложения',
  'map.language.en': 'English',
  'map.language.ru': 'Русский',

  'map.legend.noData': 'нет данных',
  'map.legend.population.title': 'Людей в стране',
  'map.legend.density.title': 'Людей на км²',
  'map.legend.mastery.title': 'Знание по тестам',
  'map.legend.mastery.noData': 'ещё не спрашивали',

  // -------------------------------------------------------------- info sheet
  'info.close': 'Закрыть сведения о стране',
  'info.fact.population': 'Население',
  'info.fact.capital': 'Столица',
  'info.fact.area': 'Площадь',
  'info.populationSource': 'Всемирный банк, {year}',

  // ------------------------------------------------------------------ search
  'search.open': 'Найти страну',
  'search.back': 'Назад к карте',
  'search.placeholder': 'Название страны',
  'search.clear': 'Очистить поиск',
  'search.empty.title': 'По запросу «{query}» ничего не найдено.',
  'search.empty.hint': 'Попробуйте написать проще — Голландия, Бирма и Персия тоже работают.',
  'search.result.alias': '{name}, также известна как {alias}',

  // -------------------------------------------------------------- quiz setup
  'quiz.open.label': 'Тест',
  'quiz.open.a11y': 'Начать тест по странам',
  'quiz.setup.title': 'Тест',
  'quiz.setup.close': 'Назад к карте',
  'quiz.setup.mode': 'Как вы хотите играть?',
  'quiz.setup.fields': 'Что нужно назвать?',
  'quiz.setup.who': 'О ком спрашивать?',
  'quiz.setup.where': 'Какие части света?',
  'quiz.setup.scope.practice':
    'Ваши {count} самых слабых стран будут взяты из этих регионов. Не выбирайте ничего, чтобы брать из всех {total}.',
  'quiz.setup.scope.all':
    'Не выбирайте ничего, чтобы играть по всему миру — все {total} государств — членов ООН.',
  'quiz.setup.pickField': 'Выберите хотя бы один факт',

  'quiz.mode.facts.label': 'Назвать факты',
  'quiz.mode.facts.hint': 'Карта приближает страну, а вы вводите всё, что о ней знаете',
  'quiz.mode.locate.label': 'Найти на карте',
  'quiz.mode.locate.hint': 'Вам дают название, а вы ищете страну на карте',
  'quiz.mode.flag.label': 'Узнать по флагу',
  'quiz.mode.flag.hint': 'Вам показывают флаг, а вы вводите всё, что знаете о стране',

  'quiz.practice.all.label': 'Все страны',
  'quiz.practice.all.hint': 'Спрашивать о каждой стране в выбранных регионах',
  'quiz.practice.weak.label': 'Мои слабые места',

  'quiz.setup.progress': 'Ваш прогресс',
  'quiz.reset.label': 'Сбросить прогресс',
  'quiz.reset.a11y': 'Сбросить прогресс по всем странам',
  'quiz.reset.empty':
    'Истории тестов пока нет — сыграйте раунд, и карта начнёт раскрашиваться.',
  'quiz.reset.title': 'Сбросить прогресс?',
  'quiz.reset.message':
    '{subject} будет очищена, и цвета знания на карте вернутся к «{noData}». Это нельзя отменить.',
  'quiz.reset.subjectEmpty': 'Ваша история тестов',
  'quiz.reset.confirm': 'Сбросить',
  'quiz.reset.cancel': 'Отмена',
  'quiz.region.clear': 'Снять',
  'quiz.region.select': 'Выбрать',
  'quiz.region.all': 'Все {count}',
  'quiz.region.toggleA11y': '{action} весь регион {region}',

  // ---------------------------------------------------------- the quiz round
  'quiz.empty': 'С такими настройками не о чем спрашивать.',
  'quiz.end': 'Закончить',
  'quiz.endA11y': 'Закончить тест и посмотреть результат',
  'quiz.check': 'Проверить',
  'quiz.next': 'Дальше',
  'quiz.nextA11y': 'Следующая страна',
  'quiz.checkA11y': 'Проверить мои ответы',
  'quiz.checkOneA11y': 'Проверить мой ответ',

  'quiz.field.name.label': 'Страна',
  'quiz.field.capital.label': 'Столица',
  'quiz.field.currency.label': 'Валюта',
  'quiz.field.languages.label': 'Языки',
  'quiz.field.population.label': 'Население',
  'quiz.field.location.label': 'Расположение',
  'quiz.field.name.hint': 'Назовите выделенную страну',
  'quiz.field.capital.hint': 'Назовите её столицу',
  'quiz.field.currency.hint': 'Назовите её валюты, до трёх',
  'quiz.field.languages.hint': 'Назовите три её официальных языка',
  'quiz.field.population.hint': 'Угадайте её население с точностью до 20%',

  'quiz.field.nameNOfM': '{label} — назовите {required} из {available}',
  'quiz.field.allOf': '{label} — все {available}',
  'quiz.reveal.correctWith': 'Верно — {expected}',
  'quiz.reveal.correct': 'Верно',
  'quiz.reveal.answer': 'Ответ: {expected}',
  'quiz.detail.percent': 'Вы ответили {given} — на {percent}% {direction}',
  'quiz.detail.under': 'меньше',
  'quiz.detail.over': 'больше',
  'quiz.detail.missed': 'Пропущено: {missed}',
  'quiz.detail.youSaid': 'Вы ответили {given}',
  'quiz.placeholder.population': 'например, 12 000 000 или 12 млн',
  'quiz.placeholder.answer': 'Ваш ответ',
  'quiz.chip.placeholder': 'Введите ответ, нажмите ввод, чтобы добавить ещё',
  'quiz.chip.remove': 'Убрать {chip}',
  'quiz.flag.a11y': 'Флаг страны',

  'locate.find': 'Найдите',
  'locate.ready': 'Готово — нажмите Проверить',
  'locate.tap': 'Нажмите на неё на карте',
  'locate.correct': 'Верно',
  'locate.not': 'Это не {name}',
  'locate.nothing': 'Ничего не выбрано',
  'locate.reveal': '{name} — та, что выделена зелёным.',

  'quiz.exit.title': 'Выйти из теста?',
  'quiz.exit.message': 'Вы на вопросе {index} из {total}.',
  'quiz.exit.score': 'Посмотреть результат',
  'quiz.exit.discard': 'Выйти без результата',
  'quiz.exit.cancel': 'Отмена',

  // ----------------------------------------------------------------- results
  'results.consumed': 'Этот тест уже засчитан.',
  'results.restart': 'Настроить новый тест',
  'results.title': 'Тест окончен',
  'results.review.allCorrect': 'Разбор — все {count} верно',
  'results.answersRight': 'Верных ответов: {correct} из {asked}',
  'results.endedEarly': 'Закончено на {asked} из {total}',
  'results.youSaid': 'вы ответили {given}',
  'results.blank': 'без ответа',
  'results.playAgain': 'Играть ещё',
  'results.changeSettings': 'Изменить настройки',
  'results.backToMap': 'К карте',

  // --------------------------------------------------------------- formatting
  'units.km2': 'км²',
  // A leading NO-BREAK SPACE, because Russian writes "47 млн" with a space and the label
  // must never wrap between the number and its unit. Noto Sans covers U+00A0.
  'format.compact.thousand': '\u00A0тыс.',
  'format.compact.million': '\u00A0млн',
  'format.compact.billion': '\u00A0млрд',
};
