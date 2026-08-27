/**
 * Every string the app shows, in English.
 *
 * **This object is the schema.** `MessageKey` is `keyof typeof en`, and `ru.ts` is typed
 * `Record<MessageKey, string>` - so a key added here and forgotten there is a compile
 * error, not a half-English menu discovered on a device. That is the whole reason the
 * catalogue is a `const` object in TypeScript rather than JSON.
 *
 * Counted messages do not live here; they need three forms in Russian and are in
 * `en.plurals.ts` / `ru.plurals.ts`.
 *
 * Not in here, deliberately: `testID`s, route paths, `LABEL_FONT`, MapLibre expression
 * fragments, feature property names, and the quiz's URL param keys and values. Those are
 * machine-facing, and translating any of them would break a deep link or a Maestro flow.
 *
 * Country names, capitals and currencies are data rather than UI - they live in
 * `src/data/ru/` and reach the screen through `countryFacts.ts`.
 */
export const en = {
  // ---------------------------------------------------------------- app-level
  'app.name': 'Countries of the World',
  'app.shortName': 'Countries',
  'app.description':
    'A world map you can explore offline: tap any country for its population, currency, capital and area, colour the land by population or density, label every country, search 237 countries, or take a quiz.',

  // ------------------------------------------------------------- generic bits
  'flag.a11y': 'Flag of {code}',
  'flag.codeA11y': 'Country code {code}',

  // ----------------------------------------------------------- the map chrome
  'map.fill.panelTitle': 'Colour the land by',
  'map.fill.a11y': 'Land colouring: {mode}. Choose how countries are coloured',
  'map.fill.flat.label': 'Flat',
  'map.fill.flat.description': 'Plain basemap, no colouring',
  'map.fill.population.label': 'People',
  'map.fill.population.description': 'Colour countries by population',
  'map.fill.density.label': 'Density',
  'map.fill.density.description': 'Colour countries by people per square kilometre',
  'map.fill.mastery.label': 'Mastery',
  'map.fill.mastery.description': 'Colour countries by how well you answer them in quizzes',

  'map.labels.pill': 'Labels',
  'map.labels.panelTitle': 'Label each country with',
  'map.labels.a11y': 'Map labels: {field}. Choose what to show on each country',
  'map.label.none.label': 'None',
  'map.label.none.description': 'No labels on the map',
  'map.label.name.label': 'Name',
  'map.label.name.description': 'Show each country name on the map',
  'map.label.flag.label': 'Flag',
  'map.label.flag.description': 'Show each country flag on the map',
  'map.label.capital.label': 'Capital',
  'map.label.capital.description': 'Show each capital city on the map',
  'map.label.currencies.label': 'Currencies',
  'map.label.currencies.description': 'Show up to three currencies on each country',
  'map.label.population.label': 'Population',
  'map.label.population.description': 'Show each population on the map, rounded',

  'map.language.panelTitle': 'Language',
  'map.language.a11y': 'Language: {language}. Choose the app language',
  'map.language.en': 'English',
  'map.language.ru': 'Русский',

  'map.legend.noData': 'no data',
  'map.legend.population.title': 'People per country',
  'map.legend.density.title': 'People per km²',
  'map.legend.mastery.title': 'Mastery from quizzes',
  'map.legend.mastery.noData': 'not asked yet',

  // -------------------------------------------------------------- info sheet
  'info.close': 'Close country details',
  'info.fact.population': 'Population',
  'info.fact.capital': 'Capital',
  'info.fact.area': 'Area',
  'info.populationSource': 'World Bank, {year}',

  // ------------------------------------------------------------------ search
  'search.open': 'Search for a country',
  'search.back': 'Back to the map',
  'search.placeholder': 'Country name',
  'search.clear': 'Clear the search',
  'search.empty.title': 'No country matches “{query}”.',
  'search.empty.hint': 'Try a shorter spelling — Holland, UK and Ivory Coast all work.',
  'search.result.alias': '{name}, also known as {alias}',

  // -------------------------------------------------------------- quiz setup
  'quiz.open.label': 'Quiz',
  'quiz.open.a11y': 'Start a country quiz',
  'quiz.setup.title': 'Quiz',
  'quiz.setup.close': 'Back to the map',
  'quiz.setup.mode': 'How do you want to play?',
  'quiz.setup.fields': 'What do you have to answer?',
  'quiz.setup.who': 'Who gets asked?',
  'quiz.setup.style': 'How do you answer?',
  'quiz.setup.where': 'Which parts of the world?',
  'quiz.setup.scope.practice':
    'Your {count} weakest countries will be drawn from these regions. Leave everything unselected to draw from all {total}.',
  'quiz.setup.scope.all':
    'Leave everything unselected to play the whole world — all {total} UN member states.',
  'quiz.setup.pickField': 'Pick at least one fact',

  'quiz.mode.facts.label': 'Name the facts',
  'quiz.mode.facts.hint': 'The map zooms to a country and you type what you know about it',
  'quiz.mode.locate.label': 'Find it on the map',
  'quiz.mode.locate.hint': 'You are given a name and have to find the country on the map',
  'quiz.mode.flag.label': 'Name it from the flag',
  'quiz.mode.flag.hint': 'You are shown a flag and type what you know about the country',

  'quiz.style.type.label': 'Type it',
  'quiz.style.type.hint': 'Write the answer out; near-misses and typos still count',
  'quiz.style.choice.label': 'Pick the answer',
  'quiz.style.choice.hint': 'Choose from a short list of nearby countries',
  'quiz.practice.all.label': 'Everything',
  'quiz.practice.all.hint': 'Ask about every country in the regions you pick',
  'quiz.practice.weak.label': 'My weak spots',

  'quiz.setup.progress': 'Your progress',
  'quiz.reset.label': 'Reset mastery',
  'quiz.reset.a11y': 'Reset mastery for every country',
  'quiz.reset.empty':
    'No quiz history yet — play a round and the map will start colouring itself in.',
  'quiz.reset.title': 'Reset mastery?',
  'quiz.reset.message':
    '{subject} will be cleared, and the map’s mastery colours go back to "{noData}". This cannot be undone.',
  'quiz.reset.subjectEmpty': 'Your quiz history',
  'quiz.reset.confirm': 'Reset progress',
  'quiz.reset.cancel': 'Cancel',
  'quiz.region.clear': 'Clear',
  'quiz.region.select': 'Select',
  'quiz.region.all': 'All {count}',
  'quiz.region.toggleA11y': '{action} all of {region}',

  // ---------------------------------------------------------- the quiz round
  'quiz.empty': 'Nothing to ask with those settings.',
  'quiz.end': 'End quiz',
  'quiz.endA11y': 'End the quiz and see your score',
  'quiz.check': 'Check',
  'quiz.next': 'Next',
  'quiz.nextA11y': 'Next country',
  'quiz.checkA11y': 'Check my answers',
  'quiz.checkOneA11y': 'Check my answer',

  'quiz.field.name.label': 'Country',
  'quiz.field.capital.label': 'Capital',
  'quiz.field.currency.label': 'Currency',
  'quiz.field.population.label': 'Population',
  'quiz.field.location.label': 'Location',
  'quiz.field.name.hint': 'Name the highlighted country',
  'quiz.field.capital.hint': 'Name its capital city',
  'quiz.field.currency.hint': 'Name its currencies, up to three',
  'quiz.field.population.hint': 'Guess its population, within 20%',

  'quiz.field.nameNOfM': '{label} — name {required} of {available}',
  'quiz.field.allOf': '{label} — all {available}',
  'quiz.reveal.correctWith': 'Correct — {expected}',
  'quiz.reveal.correct': 'Correct',
  'quiz.reveal.answer': 'Answer: {expected}',
  'quiz.detail.percent': 'You said {given} — {percent}% {direction}',
  'quiz.detail.under': 'under',
  'quiz.detail.over': 'over',
  'quiz.detail.missed': 'Missed: {missed}',
  'quiz.detail.youSaid': 'You said {given}',
  'quiz.placeholder.population': 'e.g. 12,000,000 or 12m',
  'quiz.placeholder.answer': 'Your answer',
  'quiz.chip.placeholder': 'Type an answer, press return to add another',
  'quiz.chip.remove': 'Remove {chip}',
  'quiz.flag.a11y': "The country's flag",
  'quiz.option.a11y': '{label}, option {option}',

  'locate.find': 'Find',
  'locate.ready': 'Ready — press Check',
  'locate.tap': 'Tap it on the map',
  'locate.correct': 'Correct',
  'locate.not': 'Not {name}',
  'locate.nothing': 'Nothing picked',
  'locate.reveal': '{name} is the one in green.',

  'quiz.exit.title': 'Leave quiz?',
  'quiz.exit.message': 'You are on question {index} of {total}.',
  'quiz.exit.score': 'See my score',
  'quiz.exit.discard': 'Discard and leave',
  'quiz.exit.cancel': 'Cancel',

  // ----------------------------------------------------------------- results
  'results.consumed': 'That quiz has already been counted.',
  'results.restart': 'Set up a new quiz',
  'results.title': 'Round over',
  'results.review.allCorrect': 'Review — all {count} correct',
  'results.answersRight': '{correct} of {asked} answers right',
  'results.endedEarly': 'Ended after {asked} of {total}',
  'results.youSaid': 'you said {given}',
  'results.blank': 'left blank',
  'results.playAgain': 'Play again',
  'results.changeSettings': 'Change settings',
  'results.backToMap': 'Back to map',

  // --------------------------------------------------------------- formatting
  'units.km2': 'km²',
  'format.compact.thousand': 'k',
  'format.compact.million': 'm',
  'format.compact.billion': 'b',
} as const;
