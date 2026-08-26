/**
 * The three quiz screens' wiring.
 *
 * What Jest can see here is our own plumbing - config -> questions -> camera -> grade ->
 * result. What it cannot see is whether any of it PAINTS, which is what
 * `.maestro/quiz.yaml` exists for.
 *
 * RNTL v14 made `render` and `fireEvent` async; they must be awaited.
 */
import {
  act,
  fireEvent,
  render as rtlRender,
  screen,
  within,
} from '@testing-library/react-native';
import { BackHandler } from 'react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { FLAG_ASSETS } from '@/components/flagAssets';
import { flagLetters } from '@/components/flagEmoji';
import QuizPlayScreen from '@/app/quiz/play';
import QuizResultsScreen from '@/app/quiz/results';
import QuizSetupScreen from '@/app/quiz/index';
import { getCountryBounds } from '@/map/countryBounds';
import { mapColors } from '@/map/offlineStyle';
import { CURRENCIES_REQUIRED } from '@/quiz/gradeAnswer';
import { buildQuiz } from '@/quiz/quizBuilder';
import { parseQuizParams } from '@/quiz/quizConfig';
import { setQuizResult } from '@/quiz/quizResultStore';
import {
  __resetMasteryStore,
  getMasterySnapshot,
  publishMastery,
  recordResult,
} from '@/mastery/masteryStore';
import { PRACTICE_ROUND_SIZE } from '@/quiz/practicePool';

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

  describe('choosing a mode', () => {
    it('offers all three, and starts on facts', async () => {
      await render(<QuizSetupScreen />);

      expect(screen.getByTestId('mode-facts')).toBeTruthy();
      expect(screen.getByTestId('mode-locate')).toBeTruthy();
      expect(screen.getByTestId('mode-flag')).toBeTruthy();
      expect(screen.getByTestId('field-picker')).toBeTruthy();
    });

    it('keeps the field picker for a flag round, which asks the same facts', async () => {
      await render(<QuizSetupScreen />);
      await fireEvent.press(screen.getByTestId('mode-flag'));

      expect(screen.getByTestId('field-picker')).toBeTruthy();
      expect(screen.getByTestId('quiz-setup-subtitle')).toHaveTextContent(/flag/);
    });

    it('cannot start a flag round with no field selected', async () => {
      // The trap: gating the picker on `mode === 'facts'` also ungates `canStart`, so a
      // flag round with nothing ticked becomes startable and `parseQuizParams` quietly
      // falls back to asking the country's name - a round nobody configured.
      await render(<QuizSetupScreen />);
      await fireEvent.press(screen.getByTestId('mode-flag'));
      await fireEvent.press(screen.getByTestId('field-name'));
      await fireEvent.press(screen.getByTestId('quiz-start'));

      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByTestId('quiz-start')).toHaveTextContent(/Pick at least one fact/);
    });

    it('starts a flag round with the ticked fields in the params', async () => {
      await render(<QuizSetupScreen />);
      await fireEvent.press(screen.getByTestId('mode-flag'));
      await fireEvent.press(screen.getByTestId('field-capital'));
      await fireEvent.press(screen.getByTestId('quiz-start'));

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/quiz/play',
        params: expect.objectContaining({ mode: 'flag', fields: 'name,capital' }),
      });
    });

    it('drops the field picker for a locate round, which asks no facts', async () => {
      await render(<QuizSetupScreen />);
      await fireEvent.press(screen.getByTestId('mode-locate'));

      expect(screen.queryByTestId('field-picker')).toBeNull();
      expect(screen.getByTestId('quiz-setup-subtitle')).toHaveTextContent(/find the country/);
    });

    it('starts a locate round with no field selected at all', async () => {
      await render(<QuizSetupScreen />);
      await fireEvent.press(screen.getByTestId('mode-locate'));
      // The one thing that makes a facts round unstartable does not apply here.
      await fireEvent.press(screen.getByTestId('quiz-start'));

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/quiz/play',
        params: expect.objectContaining({ mode: 'locate' }),
      });
    });

    it('keeps the ticked fields when the mode is switched back', async () => {
      await render(<QuizSetupScreen />);
      await fireEvent.press(screen.getByTestId('field-capital'));
      await fireEvent.press(screen.getByTestId('mode-locate'));
      await fireEvent.press(screen.getByTestId('mode-facts'));
      await fireEvent.press(screen.getByTestId('quiz-start'));

      expect(mockPush).toHaveBeenCalledWith({
        pathname: '/quiz/play',
        params: expect.objectContaining({ mode: 'facts', fields: 'name,capital' }),
      });
    });

    describe('who gets asked', () => {
      it('starts on everything, so nothing changes for an existing player', async () => {
        await render(<QuizSetupScreen />);
        await fireEvent.press(screen.getByTestId('quiz-start'));

        expect(mockPush).toHaveBeenCalledWith({
          pathname: '/quiz/play',
          params: expect.objectContaining({ practice: '0' }),
        });
      });

      it('sends a weak-spots round through as a param', async () => {
        await render(<QuizSetupScreen />);
        await fireEvent.press(screen.getByTestId('practice-weak'));
        await fireEvent.press(screen.getByTestId('quiz-start'));

        expect(mockPush).toHaveBeenCalledWith({
          pathname: '/quiz/play',
          params: expect.objectContaining({ practice: '1' }),
        });
      });

      it('caps the button count at the practice round size', async () => {
        // The whole world is 193; a practice round is ten of them, and the button has to
        // say what the player is actually about to get.
        await render(<QuizSetupScreen />);
        expect(screen.getByTestId('quiz-start')).toHaveTextContent(/193 countries/);

        await fireEvent.press(screen.getByTestId('practice-weak'));
        expect(screen.getByTestId('quiz-start')).toHaveTextContent(
          new RegExp(`${PRACTICE_ROUND_SIZE} countries`),
        );
      });

      it('does not cap below the pool, so a small subregion says its real size', async () => {
        await render(<QuizSetupScreen />);
        await fireEvent.press(screen.getByTestId('practice-weak'));
        await fireEvent.press(screen.getByTestId('subregion-Australia and New Zealand'));

        expect(screen.getByTestId('quiz-start')).toHaveTextContent(/2 countries/);
      });

      it('explains that the two sections intersect, rather than leaving it a guess', async () => {
        // The old note said "all 193 UN member states", which is wrong the moment
        // practice is on: it is ten drawn from 193.
        await render(<QuizSetupScreen />);
        expect(screen.getByTestId('quiz-setup-scope-note')).toHaveTextContent(
          /all 193 UN member states/,
        );

        await fireEvent.press(screen.getByTestId('practice-weak'));
        expect(screen.getByTestId('quiz-setup-scope-note')).toHaveTextContent(
          new RegExp(`Your ${PRACTICE_ROUND_SIZE} weakest countries will be drawn from these regions`),
        );
      });

      it('scopes weak spots to the chosen regions, rather than ignoring them', async () => {
        // The two are composable on purpose - "practise my weak spots in Africa" is a
        // real round - so both must reach the play screen together.
        await render(<QuizSetupScreen />);
        await fireEvent.press(screen.getByTestId('practice-weak'));
        await fireEvent.press(screen.getByTestId('subregion-Western Europe'));
        await fireEvent.press(screen.getByTestId('quiz-start'));

        expect(mockPush).toHaveBeenCalledWith({
          pathname: '/quiz/play',
          params: expect.objectContaining({
            practice: '1',
            subregions: 'Western Europe',
          }),
        });
      });

      it('combines with a mode, rather than replacing one', async () => {
        // Practice is about WHO is asked; the mode is about HOW. Both travel.
        await render(<QuizSetupScreen />);
        await fireEvent.press(screen.getByTestId('mode-locate'));
        await fireEvent.press(screen.getByTestId('practice-weak'));
        await fireEvent.press(screen.getByTestId('quiz-start'));

        expect(mockPush).toHaveBeenCalledWith({
          pathname: '/quiz/play',
          params: expect.objectContaining({ mode: 'locate', practice: '1' }),
        });
      });
    });
  });

  /**
   * The one irreversible thing in the app.
   *
   * What is checked here is our wiring - that the button reflects the store, that nothing
   * is cleared without a confirmation, and that confirming really does empty the table.
   * That the card PAINTS is `Modal`'s business and `.maestro/mastery.yaml`'s to prove.
   */
  describe('resetting mastery', () => {
    const dialog = () => screen.queryByTestId('quiz-reset-confirm');

    /** Two countries with history, published so the screen's first snapshot has them. */
    const seedHistory = () => {
      for (const iso3 of ['FRA', 'DEU']) {
        recordResult({
          iso3,
          grades: [
            { field: 'name', correct: true, how: 'exact', given: 'x', expected: 'x' },
          ],
          allCorrect: true,
        });
      }
      publishMastery();
    };

    beforeEach(() => {
      __resetMasteryStore();
    });

    afterEach(() => {
      __resetMasteryStore();
    });

    it('is inert, and says why, when there is nothing to clear', async () => {
      await render(<QuizSetupScreen />);

      expect(screen.getByTestId('quiz-reset').props.accessibilityState.disabled).toBe(true);
      expect(screen.getByTestId('quiz-reset-note').props.children).toContain(
        'No quiz history yet',
      );
    });

    it('counts what a round taught the map', async () => {
      seedHistory();
      await render(<QuizSetupScreen />);

      expect(screen.getByTestId('quiz-reset').props.accessibilityState.disabled).toBe(false);
      expect(screen.getByTestId('quiz-reset-note').props.children).toContain('2 countries');
    });

    it('asks before clearing anything', async () => {
      seedHistory();
      await render(<QuizSetupScreen />);
      expect(dialog()).toBeNull();

      await fireEvent.press(screen.getByTestId('quiz-reset'));

      expect(await screen.findByTestId('quiz-reset-confirm')).toBeTruthy();
      expect(screen.getByText('Reset mastery?')).toBeTruthy();
      // Naming the count is the whole reason the screen subscribes to the store. Scoped
      // to the card, because the note behind it says the same number.
      expect(
        within(screen.getByTestId('quiz-reset-confirm')).getByText(/2 countries/),
      ).toBeTruthy();
      expect(getMasterySnapshot().scores).toHaveProperty('FRA');
    });

    it('keeps the history when the dialog is cancelled', async () => {
      seedHistory();
      await render(<QuizSetupScreen />);
      await fireEvent.press(screen.getByTestId('quiz-reset'));

      await fireEvent.press(await screen.findByTestId('quiz-reset-confirm-cancel'));

      expect(dialog()).toBeNull();
      expect(Object.keys(getMasterySnapshot().scores)).toHaveLength(2);
    });

    it('keeps the history when the scrim behind the card is tapped', async () => {
      seedHistory();
      await render(<QuizSetupScreen />);
      await fireEvent.press(screen.getByTestId('quiz-reset'));

      await fireEvent.press(await screen.findByTestId('quiz-reset-confirm-scrim'));

      expect(dialog()).toBeNull();
      expect(Object.keys(getMasterySnapshot().scores)).toHaveLength(2);
    });

    it('never gives the scrim a button role, which nests buttons on the web', async () => {
      // react-native-web maps accessibilityRole="button" onto a real <button>, and the
      // card's own actions are descendants of the scrim - so the role produced nested
      // buttons, invalid HTML that React reports as an error. Guards `ConfirmDialog` for
      // every screen that uses it, not just this one.
      seedHistory();
      await render(<QuizSetupScreen />);
      await fireEvent.press(screen.getByTestId('quiz-reset'));

      const scrim = await screen.findByTestId('quiz-reset-confirm-scrim');
      expect(scrim.props.accessibilityRole).toBeUndefined();
      expect(scrim.props.role).toBeUndefined();
      // The buttons inside it keep theirs; that is the pair that cannot both be a button.
      expect(screen.getByTestId('quiz-reset-confirm-reset').props.accessibilityRole).toBe(
        'button',
      );
    });

    it('clears every country when it is confirmed, and says so on the spot', async () => {
      seedHistory();
      await render(<QuizSetupScreen />);
      await fireEvent.press(screen.getByTestId('quiz-reset'));

      await fireEvent.press(await screen.findByTestId('quiz-reset-confirm-reset'));

      expect(dialog()).toBeNull();
      expect(getMasterySnapshot().scores).toEqual({});
      // The screen subscribes, so the note and the button follow without a remount - which
      // is the same notification the map behind this screen is relying on.
      expect(screen.getByTestId('quiz-reset-note').props.children).toContain(
        'No quiz history yet',
      );
      expect(screen.getByTestId('quiz-reset').props.accessibilityState.disabled).toBe(true);
    });
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

  describe('what the round teaches the map', () => {
    // Mastery is recorded per ANSWER, in `check()`, not at the end of the round. That is
    // what makes an abandoned round still count, and what stops the last checked answer
    // being lost when a player checks the final question and then backs out.
    beforeEach(() => {
      __resetMasteryStore();
    });

    afterEach(() => {
      __resetMasteryStore();
    });

    it('records nothing until an answer is actually checked', async () => {
      soloRound();
      await render(<QuizPlayScreen />);

      await act(async () => {
        publishMastery();
      });
      expect(getMasterySnapshot().scores).toEqual({});
    });

    it('records a correct answer against the country it was asked about', async () => {
      const questions = soloRound();
      await render(<QuizPlayScreen />);

      await fireEvent.changeText(
        screen.getByTestId('quiz-input-name'),
        questions[0].facts.name,
      );
      await fireEvent.press(screen.getByTestId('quiz-submit'));

      await act(async () => {
        publishMastery();
      });

      expect(getMasterySnapshot().scores[questions[0].iso3]).toBeGreaterThan(0);
    });

    it('records a wrong answer as a zero rather than as nothing', async () => {
      // "Never asked" and "always wrong" have to stay distinguishable: the first is grey
      // on the map, the second is the red end of the ramp.
      const questions = soloRound();
      await render(<QuizPlayScreen />);

      await fireEvent.changeText(screen.getByTestId('quiz-input-name'), 'Narnia');
      await fireEvent.press(screen.getByTestId('quiz-submit'));

      await act(async () => {
        publishMastery();
      });

      expect(getMasterySnapshot().scores[questions[0].iso3]).toBe(0);
    });

    it('records a blank answer, which is a real "no idea" rather than a non-event', async () => {
      const questions = soloRound();
      await render(<QuizPlayScreen />);

      await fireEvent.press(screen.getByTestId('quiz-submit'));

      await act(async () => {
        publishMastery();
      });

      expect(getMasterySnapshot().scores).toHaveProperty(questions[0].iso3);
    });

    it('records once per question, not once per press of an already-graded Check', async () => {
      const questions = soloRound();
      await render(<QuizPlayScreen />);

      await fireEvent.changeText(screen.getByTestId('quiz-input-name'), 'Narnia');
      await fireEvent.press(screen.getByTestId('quiz-submit'));
      // The second press is Next, and `check` early-returns while a result stands.
      await fireEvent.press(screen.getByTestId('quiz-submit'));

      await act(async () => {
        publishMastery();
      });

      // One wrong answer out of one is exactly 0; a double count would still be 0, so
      // assert the shape of the table rather than the score.
      expect(Object.keys(getMasterySnapshot().scores)).toEqual([questions[0].iso3]);
    });

    it('publishes when the screen unmounts, so leaving a round still teaches the map', async () => {
      // Discarding a round throws away the SCORE, not what you learned - and unmount is
      // the one event that covers finishing, ending early, discarding and backing out.
      const questions = soloRound();
      const view = await render(<QuizPlayScreen />);

      await fireEvent.changeText(screen.getByTestId('quiz-input-name'), 'Narnia');
      await fireEvent.press(screen.getByTestId('quiz-submit'));

      expect(getMasterySnapshot().scores).toEqual({});

      await act(async () => {
        view.unmount();
      });

      expect(getMasterySnapshot().scores).toHaveProperty(questions[0].iso3);
    });
  });

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

describe('the play screen in locate mode', () => {
  /**
   * The delayed reveal is the whole shape of this mode, so the clock is ours.
   *
   * Every advance is generously past `REVEAL_DELAY_MS` rather than equal to it - the
   * assertion is "the reveal happened", never "it happened at exactly 700 ms", so tuning
   * the delay must not turn these red.
   */
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  const PAST_THE_DELAY = 2000;

  /** A two-country round, so the answer is knowable without pinning the shuffle. */
  const locateRound = () => {
    mockSearchParams = {
      mode: 'locate',
      subregions: 'Australia and New Zealand',
      fields: 'name',
      seed: '1',
    };
    return buildQuiz(parseQuizParams(mockSearchParams));
  };

  const cameraProps = () => screen.getByTestId('map-camera').props;
  const selectionFilter = () => screen.getByTestId('layer-country-selected').props.filter;
  const selectionPaint = () =>
    screen.getByTestId('layer-country-selected').props.paint['fill-color'];
  const revealFilter = () => screen.getByTestId('layer-country-reveal').props.filter;
  const revealPaint = () => screen.getByTestId('layer-country-reveal').props.paint['fill-color'];

  const matching = (iso3: string) => ['==', ['get', 'iso3'], iso3];
  /** The empty string matches nothing, which is how "no selection" is expressed. */
  const MATCHES_NOTHING = matching('');

  /**
   * A synthetic country press. One candidate, so `pickCountry` short-circuits before it
   * needs a coordinate - the resolution logic has its own tests.
   */
  const tapCountry = (iso3: string) =>
    fireEvent(screen.getByTestId('source-countries'), 'press', {
      stopPropagation: jest.fn(),
      nativeEvent: { features: [{ properties: { iso3, name: iso3 } }] },
    });

  const settle = async () => {
    await act(async () => {
      jest.advanceTimersByTime(PAST_THE_DELAY);
    });
  };

  it('names the country and paints nothing, because the map is the question', async () => {
    const [first] = locateRound();
    await render(<QuizPlayScreen />);

    expect(screen.getByTestId('locate-prompt')).toHaveTextContent(first.facts.name);
    // Painting `first.iso3` here would hand the player the answer.
    expect(selectionFilter()).toEqual(MATCHES_NOTHING);
    expect(revealFilter()).toEqual(MATCHES_NOTHING);
  });

  it('opens on the world view by issuing no camera stop at all', async () => {
    locateRound();
    await render(<QuizPlayScreen />);

    // `WorldMap`'s own default IS the whole world, so the round needs to ask for nothing.
    // A `center` here would mean the camera had been aimed somewhere - and the only
    // somewhere worth aiming at is the answer.
    expect(cameraProps().center).toBeUndefined();
  });

  it('highlights the country that was tapped', async () => {
    locateRound();
    await render(<QuizPlayScreen />);
    await tapCountry('NZL');

    expect(selectionFilter()).toEqual(matching('NZL'));
    expect(selectionPaint()).toBe(mapColors.quizTarget);
  });

  it('never names the pick before it is checked', async () => {
    // The spoiler: "Your pick - New Zealand" under a prompt reading "Find New Zealand"
    // answers the question, and lets the player retap until the two agree. The map
    // highlight is the only thing allowed to say which country is selected.
    const [first] = locateRound();
    await render(<QuizPlayScreen />);
    await tapCountry(first.iso3);

    expect(screen.getByTestId('locate-pick')).not.toHaveTextContent(first.facts.name);
    expect(screen.getByTestId('locate-pick')).toHaveTextContent(/Check/);
  });

  it('names the pick once there is nothing left to spoil', async () => {
    const [first] = locateRound();
    const wrong = first.iso3 === 'AUS' ? 'NZL' : 'AUS';
    await render(<QuizPlayScreen />);
    await tapCountry(wrong);
    await fireEvent.press(screen.getByTestId('quiz-submit'));

    expect(screen.getByTestId('locate-verdict')).toHaveTextContent(
      wrong === 'AUS' ? /Australia/ : /New Zealand/,
    );
  });

  it('marks a correct pick green and leaves the camera exactly where it was', async () => {
    const [first] = locateRound();
    await render(<QuizPlayScreen />);
    await tapCountry(first.iso3);
    await fireEvent.press(screen.getByTestId('quiz-submit'));

    expect(selectionPaint()).toBe(mapColors.quizCorrect);
    expect(screen.getByTestId('locate-verdict')).toHaveTextContent(/Correct/);

    // Nothing to show them: they found it. The camera must not move, now or later.
    await settle();
    expect(cameraProps().center).toBeUndefined();
  });

  it('reddens a wrong pick at once and reveals the answer a beat later', async () => {
    const [first] = locateRound();
    const wrong = first.iso3 === 'AUS' ? 'NZL' : 'AUS';
    await render(<QuizPlayScreen />);
    await tapCountry(wrong);
    await fireEvent.press(screen.getByTestId('quiz-submit'));

    // Immediately: the pick is wrong, and the answer is still hidden.
    expect(selectionFilter()).toEqual(matching(wrong));
    expect(selectionPaint()).toBe(mapColors.quizWrong);
    expect(revealFilter()).toEqual(MATCHES_NOTHING);
    expect(cameraProps().center).toBeUndefined();

    await settle();

    // After the delay: the answer is green and the camera has gone to it.
    expect(revealFilter()).toEqual(matching(first.iso3));
    expect(revealPaint()).toBe(mapColors.quizCorrect);
    expect(cameraProps().center).toEqual([expect.any(Number), expect.any(Number)]);
    expect(cameraProps().zoom).toBeGreaterThan(0);
    expect(screen.getByTestId('locate-verdict')).toHaveTextContent(/in green/);
  });

  it('drops the reveal when the player presses Next inside the delay', async () => {
    const [first] = locateRound();
    const wrong = first.iso3 === 'AUS' ? 'NZL' : 'AUS';
    await render(<QuizPlayScreen />);
    await tapCountry(wrong);
    await fireEvent.press(screen.getByTestId('quiz-submit'));
    // Next, before the timer fires. Yanking the camera afterwards would land them
    // somewhere they did not ask to be, on a question they have already moved on to.
    await fireEvent.press(screen.getByTestId('quiz-submit'));
    await settle();

    expect(cameraProps().center).toBeUndefined();
    expect(revealFilter()).toEqual(MATCHES_NOTHING);
  });

  it('stops taking taps once the answer is checked', async () => {
    const [first] = locateRound();
    const wrong = first.iso3 === 'AUS' ? 'NZL' : 'AUS';
    await render(<QuizPlayScreen />);
    await tapCountry(wrong);
    await fireEvent.press(screen.getByTestId('quiz-submit'));
    await tapCountry(first.iso3);

    // Still the wrong pick: the answer is committed, and re-tapping must not rewrite it.
    expect(selectionFilter()).toEqual(matching(wrong));
  });

  it('clears the pick and the reveal for the next question', async () => {
    const [first, second] = locateRound();
    const wrong = first.iso3 === 'AUS' ? 'NZL' : 'AUS';
    await render(<QuizPlayScreen />);
    await tapCountry(wrong);
    await fireEvent.press(screen.getByTestId('quiz-submit'));
    await settle();
    await fireEvent.press(screen.getByTestId('quiz-submit'));

    expect(screen.getByTestId('locate-prompt')).toHaveTextContent(second.facts.name);
    expect(selectionFilter()).toEqual(MATCHES_NOTHING);
    expect(revealFilter()).toEqual(MATCHES_NOTHING);
    // The camera stop is NOT withdrawn - see the note in play.tsx. It stays put, which
    // is exactly where the previous reveal left the player.
    expect(cameraProps().center).toEqual([expect.any(Number), expect.any(Number)]);
  });

  it('hands a finished locate round to the score screen', async () => {
    const [first] = locateRound();
    await render(<QuizPlayScreen />);
    await tapCountry(first.iso3);
    await fireEvent.press(screen.getByTestId('quiz-submit'));
    await fireEvent.press(screen.getByTestId('quiz-end'));

    expect(mockReplace).toHaveBeenCalledWith('/quiz/results');
  });
});

describe('the play screen in flag mode', () => {
  /**
   * No fake timers here, unlike the locate block: this mode has no delayed reveal. It is
   * `facts` mode with the stimulus swapped, so everything below the stage - the fields,
   * the grading, the Check/Next button - is the facts behaviour and is asserted as such.
   */
  const flagRound = (fields = 'name,capital') => {
    mockSearchParams = {
      mode: 'flag',
      subregions: 'Australia and New Zealand',
      fields,
      seed: '1',
    };
    return buildQuiz(parseQuizParams(mockSearchParams));
  };

  it('mounts no map at all, which is what buys the stage ordinary rendering', async () => {
    // The most important assertion in this mode. `FlagStage` renders like any other
    // component - no always-mounted rows, no parked views - and that is only safe
    // because there is no MapLibre surface in this tree to insert anything above.
    flagRound();
    await render(<QuizPlayScreen />);

    expect(screen.queryByTestId('world-map')).toBeNull();
    expect(screen.queryByTestId('map-camera')).toBeNull();
    expect(screen.getByTestId('quiz-flag-stage')).toBeTruthy();
  });

  it('shows the flag, the panel and the progress from the first frame', async () => {
    flagRound();
    await render(<QuizPlayScreen />);

    expect(screen.getByTestId('quiz-flag-stage')).toBeTruthy();
    expect(screen.getByTestId('quiz-panel')).toBeTruthy();
    expect(screen.getByTestId('quiz-progress')).toHaveTextContent(/1 \/ 2/);
    expect(screen.getByTestId('quiz-input-name')).toBeTruthy();
    expect(screen.getByTestId('quiz-input-capital')).toBeTruthy();
  });

  /**
   * The bundled SVG the stage should be showing.
   *
   * Asserted on the `source` rather than on any text: the flag stopped being an emoji
   * glyph and became a real image, which is what deleted a whole class of layout bug -
   * see `CountryFlag`.
   */
  const assetFor = (flag: string | null) => FLAG_ASSETS[flagLetters(flag)!.toLowerCase()];

  /** `expo-image` normalises `source` into an array, so unwrap before comparing. */
  const shownFlag = () => {
    const source = screen.getByTestId('country-flag-image').props.source;
    return Array.isArray(source) ? source[0] : source;
  };

  it('shows the flag of the country being asked about', async () => {
    const [first] = flagRound();
    await render(<QuizPlayScreen />);

    expect(shownFlag()).toBe(assetFor(first.facts.flag));
  });

  it('never names the country, before or after checking', async () => {
    // Before: it is the answer. After: `facts` mode does not name it either when the
    // round did not ask for the name - a capital-only round reveals the capital and
    // nothing else - and this mode is a copy of that one, not an improvement on it.
    const [first] = flagRound('capital');
    await render(<QuizPlayScreen />);

    expect(screen.queryByText(first.facts.name)).toBeNull();

    await fireEvent.press(screen.getByTestId('quiz-submit'));
    expect(screen.queryByText(first.facts.name)).toBeNull();
  });

  it('grades a typed answer exactly as a facts round does', async () => {
    const [first] = flagRound('name');
    await render(<QuizPlayScreen />);
    await fireEvent.changeText(screen.getByTestId('quiz-input-name'), first.facts.name);
    await fireEvent.press(screen.getByTestId('quiz-submit'));

    expect(screen.getByTestId('quiz-reveal-name')).toHaveTextContent(/Correct/);
    expect(screen.getByTestId('quiz-submit')).toHaveTextContent(/Next/);
  });

  it('moves to the next country with a clean panel and a new flag', async () => {
    const [first, second] = flagRound('name');
    await render(<QuizPlayScreen />);
    await fireEvent.changeText(screen.getByTestId('quiz-input-name'), first.facts.name);
    await fireEvent.press(screen.getByTestId('quiz-submit'));
    await fireEvent.press(screen.getByTestId('quiz-submit'));

    expect(screen.getByTestId('quiz-progress')).toHaveTextContent(/2 \/ 2/);
    expect(shownFlag()).toBe(assetFor(second.facts.flag));
    expect(screen.getByTestId('quiz-input-name').props.value).toBe('');
  });

  it('hands a finished flag round to the score screen', async () => {
    flagRound('name');
    await render(<QuizPlayScreen />);
    await fireEvent.press(screen.getByTestId('quiz-submit'));
    await fireEvent.press(screen.getByTestId('quiz-end'));

    expect(mockReplace).toHaveBeenCalledWith('/quiz/results');
  });
});

describe('the results screen', () => {
  const run = {
    config: {
      mode: 'facts' as const,
      subregions: [],
      fields: ['name' as const],
      seed: 1,
      practice: false,
    },
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
