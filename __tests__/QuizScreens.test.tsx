/**
 * The three quiz screens' wiring.
 *
 * What Jest can see here is our own plumbing - config -> questions -> camera -> grade ->
 * result. What it cannot see is whether any of it PAINTS, which is what
 * `.maestro/quiz.yaml` exists for.
 *
 * RNTL v14 made `render` and `fireEvent` async; they must be awaited.
 */
import { fireEvent, render as rtlRender, screen } from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import QuizPlayScreen from '@/app/quiz/play';
import QuizResultsScreen from '@/app/quiz/results';
import QuizSetupScreen from '@/app/quiz/index';
import { getCountryBounds } from '@/map/countryBounds';
import { mapColors } from '@/map/offlineStyle';
import { CURRENCIES_REQUIRED } from '@/quiz/gradeAnswer';
import { buildQuiz } from '@/quiz/quizBuilder';
import { parseQuizParams } from '@/quiz/quizConfig';
import { setQuizResult } from '@/quiz/quizResultStore';

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

/**
 * The params the play screen will see, and the navigations it performs.
 *
 * All prefixed `mock` because `jest.mock` is hoisted above these declarations and Jest
 * only lets a hoisted factory close over names that start that way.
 */
let mockSearchParams: Record<string, string> = {};

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockDismissAll = jest.fn();
const mockBack = jest.fn();
/** Defaults to true in `beforeEach`: the setup screen is normally still on the stack. */
const mockCanGoBack = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
    dismissAll: () => mockDismissAll(),
    back: () => mockBack(),
    canGoBack: () => mockCanGoBack(),
  },
  useLocalSearchParams: () => mockSearchParams,
}));

const render = (ui: React.ReactElement) =>
  rtlRender(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);

/**
 * The Android back press.
 *
 * `BackHandler` is REAL under jest-expo - it is not in the RN jest preset's mock list -
 * but the module Jest resolves is `BackHandler.ios.js`, whose `addEventListener` is a stub
 * that stores nothing and returns `{ remove: emptyFunction }`. So the press is delivered
 * by invoking the handler the screen registered, and the `remove` it hands back is wrapped
 * below so unsubscribing can be asserted at all.
 *
 * The consequence is worth stating plainly: these tests prove OUR wiring, not that Android
 * routes a back press to it. `.maestro/quiz.yaml` is what proves that.
 */
const addBackListener = jest.spyOn(BackHandler, 'addEventListener');

const backRegistrations = () =>
  addBackListener.mock.calls.filter(([event]) => event === 'hardwareBackPress');

/** The last handler registered wins, which is the rule RN applies at runtime. */
const pressBack = () => {
  const registered = backRegistrations();
  const handler = registered[registered.length - 1]?.[1];
  if (!handler) throw new Error('nothing registered a hardwareBackPress handler');
  return handler({} as never);
};

beforeEach(() => {
  // The iOS stub returns a shared no-op `remove`, so wrap it to make unsubscribing
  // observable without reimplementing the module.
  addBackListener.mockClear();
  addBackListener.mockImplementation(() => ({ remove: jest.fn() }));
  mockSearchParams = {};
  mockPush.mockClear();
  mockReplace.mockClear();
  mockDismissAll.mockClear();
  mockBack.mockClear();
  mockCanGoBack.mockReset().mockReturnValue(true);
});

describe('the setup screen', () => {
  it('offers every askable field and every subregion', async () => {
    await render(<QuizSetupScreen />);

    for (const field of ['name', 'capital', 'currency', 'languages', 'population']) {
      expect(screen.getByTestId(`field-${field}`)).toBeTruthy();
    }
    expect(screen.getByTestId('subregion-Western Europe')).toBeTruthy();
    // Area is not a quiz field and must not appear as one.
    expect(screen.queryByTestId('field-area')).toBeNull();
  });

  it('defaults to the whole world', async () => {
    await render(<QuizSetupScreen />);
    // Regex, not a string: v14's toHaveTextContent matches the whole concatenated
    // label exactly, and this node also contains the word "Start".
    expect(screen.getByTestId('quiz-start')).toHaveTextContent(/193 countries/);
  });

  it('narrows the count as subregions are chosen', async () => {
    await render(<QuizSetupScreen />);
    await fireEvent.press(screen.getByTestId('subregion-Western Europe'));

    expect(screen.getByTestId('quiz-start')).toHaveTextContent(/8 countries/);
  });

  it('cannot start with no field selected', async () => {
    await render(<QuizSetupScreen />);
    // 'name' is on by default; turning it off leaves nothing to ask.
    await fireEvent.press(screen.getByTestId('field-name'));
    await fireEvent.press(screen.getByTestId('quiz-start'));

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByTestId('quiz-start')).toHaveTextContent(/Pick at least one fact/);
  });

  it('starts with the chosen config in the params', async () => {
    await render(<QuizSetupScreen />);
    await fireEvent.press(screen.getByTestId('subregion-Western Europe'));
    await fireEvent.press(screen.getByTestId('field-capital'));
    await fireEvent.press(screen.getByTestId('quiz-start'));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/quiz/play',
      params: expect.objectContaining({
        subregions: 'Western Europe',
        fields: 'name,capital',
        seed: expect.any(String),
      }),
    });
  });

  it('selects a whole region at once', async () => {
    await render(<QuizSetupScreen />);
    await fireEvent.press(screen.getByTestId('region-toggle-Oceania'));

    expect(screen.getByTestId('quiz-start')).toHaveTextContent(/14 countries/);
  });
});

describe('the play screen', () => {
  /** A one-country round, so the expected answer is knowable without a fixed seed. */
  const soloRound = (fields = 'name') => {
    mockSearchParams = { subregions: 'Australia and New Zealand', fields, seed: '1' };
    const questions = buildQuiz(parseQuizParams(mockSearchParams));
    return questions;
  };

  const cameraProps = () => screen.getByTestId('map-camera').props;
  const selectionPaint = () =>
    screen.getByTestId('layer-country-selected').props.paint['fill-color'];

  it('shows the map, the panel and the progress from the first frame', async () => {
    soloRound();
    await render(<QuizPlayScreen />);

    expect(screen.getByTestId('world-map')).toBeTruthy();
    expect(screen.getByTestId('quiz-panel')).toBeTruthy();
    expect(screen.getByTestId('quiz-progress')).toHaveTextContent(/1 \/ 2/);
  });

  it('highlights the country being asked, in the question colour', async () => {
    const questions = soloRound();
    await render(<QuizPlayScreen />);

    expect(screen.getByTestId('layer-country-selected').props.filter).toEqual([
      '==',
      ['get', 'iso3'],
      questions[0].iso3,
    ]);
    expect(selectionPaint()).toBe(mapColors.quizTarget);
  });

  it('frames the camera on that country', async () => {
    const questions = soloRound();
    await render(<QuizPlayScreen />);

    const bounds = getCountryBounds(questions[0].iso3)!;
    const [lng, lat] = cameraProps().center;
    expect(lng).toBeGreaterThanOrEqual(bounds.bbox[0]);
    expect(lng).toBeLessThanOrEqual(bounds.bbox[2]);
    expect(lat).toBeGreaterThan(bounds.bbox[1]);
    expect(lat).toBeLessThan(bounds.bbox[3]);
    expect(Number.isFinite(cameraProps().zoom)).toBe(true);
  });

  it('never attaches a press handler - the map is not the answer sheet', async () => {
    soloRound();
    await render(<QuizPlayScreen />);
    expect(screen.getByTestId('world-map').props.onPress).toBeUndefined();
  });

  it('turns the country green and says so when the answer is right', async () => {
    const questions = soloRound();
    await render(<QuizPlayScreen />);

    await fireEvent.changeText(screen.getByTestId('quiz-input-name'), questions[0].facts.name);
    await fireEvent.press(screen.getByTestId('quiz-submit'));

    expect(selectionPaint()).toBe(mapColors.quizCorrect);
    expect(screen.getByTestId('quiz-reveal-name')).toHaveTextContent(/Correct/);
    expect(screen.getByTestId('quiz-submit')).toHaveTextContent(/Next/);
  });

  it('turns it red and reveals the answer when it is wrong', async () => {
    const questions = soloRound();
    await render(<QuizPlayScreen />);

    await fireEvent.changeText(screen.getByTestId('quiz-input-name'), 'Narnia');
    await fireEvent.press(screen.getByTestId('quiz-submit'));

    expect(selectionPaint()).toBe(mapColors.quizWrong);
    expect(screen.getByTestId('quiz-reveal-name')).toHaveTextContent(
      new RegExp(questions[0].facts.name),
    );
  });

  it('advances to the next country, clearing the answer and moving the camera', async () => {
    const questions = soloRound();
    await render(<QuizPlayScreen />);
    const firstCenter = cameraProps().center;

    await fireEvent.changeText(screen.getByTestId('quiz-input-name'), 'Narnia');
    await fireEvent.press(screen.getByTestId('quiz-submit'));
    await fireEvent.press(screen.getByTestId('quiz-submit'));

    expect(screen.getByTestId('quiz-progress')).toHaveTextContent(/2 \/ 2/);
    expect(screen.getByTestId('quiz-input-name').props.value).toBe('');
    expect(cameraProps().center).not.toEqual(firstCenter);
    expect(selectionPaint()).toBe(mapColors.quizTarget);
    expect(screen.getByTestId('layer-country-selected').props.filter[2]).toBe(questions[1].iso3);
  });

  it('counts a language typed but never committed as a chip', async () => {
    // The bug this pins: a chip is only committed on return, and nobody presses return
    // for the last word. That text used to live inside ChipInput and never reach the
    // grader, so the round reported "left blank" no matter what had been typed.
    mockSearchParams = { subregions: 'Western Europe', fields: 'languages', seed: '5' };
    const questions = buildQuiz(parseQuizParams(mockSearchParams));
    const firstLanguage = questions[0].facts.languages[0];

    await render(<QuizPlayScreen />);
    await fireEvent.changeText(screen.getByTestId('quiz-input-languages-input'), firstLanguage);
    await fireEvent.press(screen.getByTestId('quiz-submit'));

    // The country may well need three languages, so one is not necessarily a pass. What
    // matters is that the one typed was COUNTED: it must no longer be listed as missed.
    expect(screen.getByTestId('quiz-detail-languages')).toHaveTextContent(/Missed:/);
    expect(screen.getByTestId('quiz-detail-languages')).not.toHaveTextContent(
      new RegExp(firstLanguage),
    );
  });

  it('combines committed chips with the trailing draft', async () => {
    mockSearchParams = { subregions: 'Western Europe', fields: 'languages', seed: '5' };
    const questions = buildQuiz(parseQuizParams(mockSearchParams));
    const languages = questions[0].facts.languages;

    await render(<QuizPlayScreen />);
    const input = screen.getByTestId('quiz-input-languages-input');

    // Commit all but the last by pressing return, then leave the last one sitting there.
    for (const language of languages.slice(0, Math.min(2, languages.length - 1))) {
      await fireEvent.changeText(input, language);
      await fireEvent(input, 'submitEditing');
    }
    await fireEvent.changeText(input, languages[Math.min(2, languages.length - 1)]);
    await fireEvent.press(screen.getByTestId('quiz-submit'));

    expect(screen.getByTestId('quiz-reveal-languages')).toHaveTextContent(/Correct/);
  });

  it('names the currencies back when a correct answer covered the whole set', async () => {
    // "Correct" alone wastes the moment: the grader accepts a head noun, so someone who
    // typed "yen" would never be shown "Japanese yen".
    mockSearchParams = { subregions: 'Eastern Asia', fields: 'currency', seed: '11' };
    const questions = buildQuiz(parseQuizParams(mockSearchParams));
    const first = questions[0];
    const currencies = first.facts.currencies.map((c) => c.name);

    await render(<QuizPlayScreen />);
    await fireEvent.changeText(screen.getByTestId('quiz-input-currency-input'), currencies[0]);
    for (const name of currencies.slice(1)) {
      await fireEvent.changeText(screen.getByTestId('quiz-input-currency-input'), name);
      await fireEvent(screen.getByTestId('quiz-input-currency-input'), 'submitEditing');
    }
    await fireEvent.press(screen.getByTestId('quiz-submit'));

    const reveal = screen.getByTestId('quiz-reveal-currency');
    expect(reveal).toHaveTextContent(/Correct/);
    expect(reveal).toHaveTextContent(new RegExp(currencies[0]));
  });

  it('names the real population back on a correct answer, not the guess', async () => {
    // Population is accepted anywhere within 20%, so "Correct" alone tells the player
    // their figure was the right size without ever telling them what the figure is -
    // and the number is the thing they came to learn. Answering 10% under proves the
    // reveal carries the TRUE population rather than echoing what was typed.
    mockSearchParams = { subregions: 'Eastern Asia', fields: 'population', seed: '11' };
    const questions = buildQuiz(parseQuizParams(mockSearchParams));
    const actual = questions[0].facts.population as number;
    const guess = Math.round(actual * 0.9);

    await render(<QuizPlayScreen />);
    await fireEvent.changeText(screen.getByTestId('quiz-input-population'), String(guess));
    await fireEvent.press(screen.getByTestId('quiz-submit'));

    const reveal = screen.getByTestId('quiz-reveal-population');
    expect(reveal).toHaveTextContent(/Correct/);
    // Regexes, not bare strings: a string argument is matched EXACTLY, so asserting the
    // number that way fails against "Correct - 1,406,585,000" and the negative assertion
    // below would pass for free.
    expect(reveal).toHaveTextContent(new RegExp(actual.toLocaleString('en-US')));
    expect(reveal).not.toHaveTextContent(new RegExp(guess.toLocaleString('en-US')));
  });

  it('tells you up front how many of the set are wanted', async () => {
    // Without this the player is guessing at the target rather than the answer. The
    // wording has to follow the cap: "name 3 of 9" when it bites, "all 2" when it does
    // not, and a bare label when there is only one.
    mockSearchParams = { subregions: 'Eastern Africa', fields: 'currency', seed: '2' };
    const questions = buildQuiz(parseQuizParams(mockSearchParams));
    const available = questions[0].facts.currencies.length;

    await render(<QuizPlayScreen />);
    const row = screen.getByTestId('quiz-field-currency', { includeHiddenElements: true });

    if (available > CURRENCIES_REQUIRED) {
      expect(row).toHaveTextContent(new RegExp(`name ${CURRENCIES_REQUIRED} of ${available}`));
    } else if (available > 1) {
      expect(row).toHaveTextContent(new RegExp(`all ${available}`));
    } else {
      expect(row).not.toHaveTextContent(/name \d+ of/);
    }
  });

  it('keeps the row set constant across countries with different data', async () => {
    // The paint-bug guard. Micronesia has no currency, so a naive implementation would
    // mount one fewer row for it - inserting a view into a tree that sits beside a live
    // MapLibre surface is the thing CLAUDE.md says never to do.
    mockSearchParams = { subregions: 'Micronesia', fields: 'name,currency', seed: '3' };
    await render(<QuizPlayScreen />);

    const rowCount = () =>
      screen.getAllByTestId(/^quiz-field-/, { includeHiddenElements: true }).length;
    const first = rowCount();

    await fireEvent.press(screen.getByTestId('quiz-submit'));
    await fireEvent.press(screen.getByTestId('quiz-submit'));

    expect(rowCount()).toBe(first);
    expect(first).toBe(2);
  });

  it('hides rather than unmounts a field the country cannot be asked', async () => {
    mockSearchParams = { subregions: 'Micronesia', fields: 'name,currency', seed: '3' };
    await render(<QuizPlayScreen />);

    // Whichever country is first, both rows exist; one may be hidden.
    const currency = screen.getByTestId('quiz-field-currency', { includeHiddenElements: true });
    expect(currency).toBeTruthy();
    expect(typeof currency.props.accessibilityElementsHidden).toBe('boolean');
  });

  describe('leaving mid-round', () => {
    const dialog = () => screen.queryByTestId('quiz-exit');

    it('asks before letting a back press throw the round away', async () => {
      soloRound();
      await render(<QuizPlayScreen />);
      expect(dialog()).toBeNull();

      // `true` is what stops expo-router's own root back handler popping the screen: RN
      // calls hardwareBackPress subscriptions in reverse registration order and stops at
      // the first that claims the press.
      expect(pressBack()).toBe(true);
      await screen.findByTestId('quiz-exit');

      expect(screen.getByText('Leave quiz?')).toBeTruthy();
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('says where in the round you are', async () => {
      soloRound();
      await render(<QuizPlayScreen />);
      await fireEvent.press(screen.getByTestId('quiz-submit')); // check
      await fireEvent.press(screen.getByTestId('quiz-submit')); // next

      pressBack();

      expect(await screen.findByText('You are on question 2 of 2.')).toBeTruthy();
    });

    it('stays put when the dialog is cancelled', async () => {
      soloRound();
      await render(<QuizPlayScreen />);
      pressBack();

      await fireEvent.press(await screen.findByTestId('quiz-exit-cancel'));

      expect(dialog()).toBeNull();
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockReplace).not.toHaveBeenCalled();
      expect(screen.getByTestId('quiz-panel')).toBeTruthy();
    });

    it('stays put when the scrim behind the card is tapped', async () => {
      soloRound();
      await render(<QuizPlayScreen />);
      pressBack();

      await fireEvent.press(await screen.findByTestId('quiz-exit-scrim'));

      expect(dialog()).toBeNull();
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('discards the round and pops back to the setup screen', async () => {
      soloRound();
      await render(<QuizPlayScreen />);
      pressBack();

      await fireEvent.press(await screen.findByTestId('quiz-exit-discard'));

      expect(mockBack).toHaveBeenCalledTimes(1);
      // Discarding must not leave a score behind for the results screen to find.
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('offers a score once a question has been checked, and scores it', async () => {
      soloRound();
      await render(<QuizPlayScreen />);
      await fireEvent.press(screen.getByTestId('quiz-submit')); // check question 1

      pressBack();
      await fireEvent.press(await screen.findByTestId('quiz-exit-score'));

      // The same destination the panel's "End quiz" button reaches.
      expect(mockReplace).toHaveBeenCalledWith('/quiz/results');
      expect(mockBack).not.toHaveBeenCalled();
    });

    it('does not offer a score before anything has been checked', async () => {
      soloRound();
      await render(<QuizPlayScreen />);
      pressBack();

      await screen.findByTestId('quiz-exit');
      expect(screen.queryByTestId('quiz-exit-score')).toBeNull();
      expect(screen.getByTestId('quiz-exit-discard')).toBeTruthy();
    });

    it('registers one handler for the whole round, and removes it on unmount', async () => {
      soloRound();
      const view = await render(<QuizPlayScreen />);
      const before = backRegistrations().length;

      // Typing and grading must not churn the subscription - it is registered once.
      await fireEvent.changeText(screen.getByTestId('quiz-input-name'), 'Aus');
      await fireEvent.press(screen.getByTestId('quiz-submit'));
      expect(backRegistrations().length).toBe(before);
      expect(before).toBe(1);

      const subscription = addBackListener.mock.results[before - 1].value;
      await view.unmount();
      expect(subscription.remove).toHaveBeenCalledTimes(1);
    });

    it('lets back behave normally when there is no round to protect', async () => {
      // No such subregion, so nothing is askable and the screen is the empty state.
      // There is no round to lose, so back must pop as it always did.
      mockSearchParams = { subregions: 'Nowhere', fields: 'name', seed: '1' };
      await render(<QuizPlayScreen />);

      expect(screen.getByTestId('quiz-empty')).toBeTruthy();
      expect(pressBack()).toBe(false);
      expect(dialog()).toBeNull();
    });
  });

  it('ends early, storing what was answered so far', async () => {
    soloRound();
    await render(<QuizPlayScreen />);

    await fireEvent.press(screen.getByTestId('quiz-end'));

    expect(mockReplace).toHaveBeenCalledWith('/quiz/results');
  });

  it('finishes on the last question rather than running off the end', async () => {
    soloRound();
    await render(<QuizPlayScreen />);

    for (let i = 0; i < 2; i++) {
      await fireEvent.press(screen.getByTestId('quiz-submit')); // check
      await fireEvent.press(screen.getByTestId('quiz-submit')); // next
    }

    expect(mockReplace).toHaveBeenCalledWith('/quiz/results');
  });
});

describe('the results screen', () => {
  const run = {
    config: { subregions: [], fields: ['name' as const], seed: 1 },
    total: 3,
    endedEarly: true,
    results: [
      {
        iso3: 'FRA',
        allCorrect: true,
        grades: [
          { field: 'name' as const, correct: true, how: 'exact' as const, given: 'France', expected: 'France' },
        ],
      },
      {
        iso3: 'JPN',
        allCorrect: false,
        grades: [
          { field: 'name' as const, correct: false, how: 'wrong' as const, given: 'China', expected: 'Japan' },
        ],
      },
    ],
  };

  it('scores the round both ways', async () => {
    setQuizResult(run);
    await render(<QuizResultsScreen />);

    expect(screen.getByTestId('quiz-score-countries')).toHaveTextContent(/1 \/ 2/);
    expect(screen.getByTestId('quiz-score-fields')).toHaveTextContent(/1 of 2 answers right/);
  });

  it('says it was ended early, and out of how many', async () => {
    setQuizResult(run);
    await render(<QuizResultsScreen />);
    expect(screen.getByTestId('quiz-results')).toHaveTextContent(/Ended after 2 of 3/);
  });

  it('lists every country asked, with the answer for the ones missed', async () => {
    setQuizResult(run);
    await render(<QuizResultsScreen />);

    expect(screen.getByTestId('quiz-review-FRA')).toBeTruthy();
    const japan = screen.getByTestId('quiz-review-JPN');
    expect(japan).toHaveTextContent(/Japan/);
    expect(japan).toHaveTextContent(/you said China/);
    // The heading has to describe the list, which includes the correct ones.
    expect(screen.getByTestId('quiz-review-heading')).toHaveTextContent(/1 missed/);
  });

  it('bounces to setup when there is no round to show', async () => {
    // The store clears on read, so arriving here twice - a back gesture, a dev reload -
    // must not render a stale score.
    setQuizResult(run);
    await render(<QuizResultsScreen />);
    mockReplace.mockClear();

    await render(<QuizResultsScreen />);
    expect(screen.getByTestId('quiz-results-empty')).toBeTruthy();
  });

  it('replays the same config with a fresh seed', async () => {
    setQuizResult(run);
    await render(<QuizResultsScreen />);
    await fireEvent.press(screen.getByTestId('quiz-play-again'));

    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/quiz/play',
      params: expect.objectContaining({ fields: 'name' }),
    });
  });

  it('returns to the map', async () => {
    setQuizResult(run);
    await render(<QuizResultsScreen />);
    await fireEvent.press(screen.getByTestId('quiz-back-to-map'));

    expect(mockDismissAll).toHaveBeenCalled();
  });

  it('pops back to the setup screen rather than building a new one', async () => {
    // "Change settings" has to land on the setup screen the player already filled in.
    // `/quiz` was pushed and only `/quiz/play` was replaced, so it is still mounted with
    // its subregions and fields; navigating to '/quiz' would mount a SECOND, empty one
    // and silently discard every choice they just made. Popping is also what the back
    // gesture does, and the two should not disagree.
    setQuizResult(run);
    await render(<QuizResultsScreen />);
    mockReplace.mockClear();
    await fireEvent.press(screen.getByTestId('quiz-change-settings'));

    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('falls back to a fresh setup when there is nothing to pop to', async () => {
    // `/quiz/play` is deep-linkable, so a round can be played without `/quiz` ever
    // having been on the stack. `back()` would then do nothing at all.
    mockCanGoBack.mockReturnValue(false);
    setQuizResult(run);
    await render(<QuizResultsScreen />);
    mockReplace.mockClear();
    await fireEvent.press(screen.getByTestId('quiz-change-settings'));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/quiz');
  });
});
