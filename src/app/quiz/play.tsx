import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { goBack } from '@/navigation/goBack';
import { quizScreenBox } from '@/quiz/quizScreenBox';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { quizColors } from '@/components/palette';
import { FlagStage } from '@/components/quiz/FlagStage';
import { LocatePanel } from '@/components/quiz/LocatePanel';
import { QuizPanel, type PanelAnswers } from '@/components/quiz/QuizPanel';
import { useKeyboardHeight } from '@/components/quiz/useKeyboardHeight';
import { getWorldFitZoom } from '@/map/cameraFit';
import { getCountryBounds } from '@/map/countryBounds';
import { mapColors } from '@/map/offlineStyle';
import {
  type CameraPose,
  getCountryCameraStop,
  getFlightDuration,
  type MapCameraStop,
} from '@/map/quizCamera';
import { INITIAL_CENTER, WorldMap } from '@/map/WorldMap';
import { buildExitPrompt, type ExitAction } from '@/quiz/exitPrompt';
import { gradeQuestion, type QuestionResult, toAnswerInput } from '@/quiz/gradeAnswer';
import { gradeLocation } from '@/quiz/gradeLocation';
import { buildQuiz } from '@/quiz/quizBuilder';
import { type FieldId, MODE_USES_MAP, parseQuizParams } from '@/quiz/quizConfig';
import { getQuizPanelLayout } from '@/quiz/quizPanelLayout';
import { setQuizResult } from '@/quiz/quizResultStore';

/**
 * The round itself: map on one side, answer panel on the other.
 *
 * Quiz mode zooms further in than explore mode, because a country framed at zoom 8 on a
 * 400dp screen shows about a degree of longitude - which leaves Liechtenstein a few
 * pixels of yellow. The geometry is rounded to 3dp (~110m), so 10 is the honest ceiling.
 */
const QUIZ_MAX_ZOOM = 10;

/**
 * Every camera move is a `fly` whose duration is computed from how far it travels.
 *
 * Both halves of that replaced a flat 900 ms `ease`, and they are one change rather than
 * two. A fixed duration is wrong in both directions at once - a crawl between two
 * neighbours, a blur across an ocean - and lengthening it only picks which half to be
 * wrong about. But time alone cannot fix the long case either: `ease` interpolates the
 * centre linearly at the starting scale, so at zoom 8 the ground tears past however many
 * seconds you give it. Zooming out on the way is what makes a long move readable, and
 * that is what `fly` is.
 *
 * **This reverses the note that used to sit here** - "'ease', not 'fly': fly arcs out to
 * a great height and back, which is slow over a long round and telegraphs roughly where
 * on the globe you are heading". The first objection was real and is what `MAX_FLIGHT_MS`
 * and a quiz-tuned `FLIGHT_SPEED` answer; a fly at a fixed 900 ms had to cover the
 * distance AND the arc in the time of a short hop, which is precisely the jank. The
 * second does not survive contact: the country is on screen the moment you arrive, so
 * seeing which continent it is on a beat earlier gives nothing away.
 */
const FLY = 'fly' as const;

/**
 * How long a wrong `locate` guess sits red before the map goes to the answer.
 *
 * Long enough to read as a verdict on the country you picked rather than as part of the
 * camera move, short enough not to feel like a stall. The whole reveal is skipped if the
 * player presses Next inside it - they have moved on, and yanking the camera afterwards
 * would land them somewhere they did not ask to be.
 */
const REVEAL_DELAY_MS = 700;

const EMPTY_ANSWERS: PanelAnswers = { text: {}, chips: {} };

export default function QuizPlayScreen() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  // `useWindowDimensions` stays INLINE here, not tucked inside a hook: it is what
  // re-renders this screen on rotation, and moving it changes what the React Compiler
  // memoises - which silently strands the panel in its portrait layout. See quizScreenBox.
  const screen = quizScreenBox(useWindowDimensions());
  const keyboardHeight = useKeyboardHeight();

  // Params are only read once: re-parsing on every render would hand `buildQuiz` a new
  // seed the moment expo-router hands back a differently-shaped params object.
  const [config] = useState(() => parseQuizParams(params as Record<string, string | string[]>));
  const [questions] = useState(() => buildQuiz(config));

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<PanelAnswers>(EMPTY_ANSWERS);
  const [result, setResult] = useState<QuestionResult | null>(null);
  const [history, setHistory] = useState<QuestionResult[]>([]);

  const { mode } = config;
  const locate = mode === 'locate';

  /**
   * Whether this round puts a MapLibre surface on screen.
   *
   * **Constant for the life of the screen**, and that is the whole basis for `FlagStage`
   * rendering like an ordinary component: `config` is parsed once into state and never
   * re-read, so the ternary below is decided on the first frame and never flips. Nothing
   * is ever inserted above a map surface here because in a flag round there is no map
   * surface at all.
   *
   * Three things would break that, and none of them is worth what it would cost:
   * making the mode switchable mid-round (a "show me on the map" button would insert a
   * surface UNDER an already-mounted tree, a novel variant of the bug); mounting
   * `WorldMap` with `display: 'none'` to "keep the tree stable", which mounts the surface
   * and pays a full MapLibre init for nothing; or re-parsing the params on render, which
   * is already forbidden because it would reseed `buildQuiz`.
   */
  const showsMap = MODE_USES_MAP[mode];

  /** `locate` only: the country the player has tapped, cleared with each question. */
  const [picked, setPicked] = useState<string | null>(null);

  /**
   * `locate` only, and deliberately TWO pieces of state written by the same timer.
   *
   * `answerShown` says the answer is now painted green, and is cleared with each
   * question. `revealStop` is the camera, and is **never withdrawn** - handing the map a
   * stop and then taking it away turns the native `Camera`'s stop prop from
   * `{center, zoom, ...}` into `{}`, a real prop change pushed into a renderer Jest
   * replaces with a stub. Leaving the last stop in place is also exactly the behaviour
   * this mode wants: the camera stays where the reveal left it, and the next question
   * starts from there rather than snapping back to the world.
   */
  const [answerShown, setAnswerShown] = useState(false);
  const [revealStop, setRevealStop] = useState<MapCameraStop | undefined>(undefined);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const question = questions[index];
  // A `locate` round has no answer fields: in portrait its panel is content-height and
  // the map keeps everything else, which is most of the screen and the half that mode is
  // actually played in.
  const layout = getQuizPanelLayout(screen, config.fields.length, mode);

  /**
   * Where the map is looking before any stop is issued: `WorldMap`'s own default.
   *
   * The starting point of the first flight of a round, and of every `locate` reveal
   * until one has already happened.
   */
  const launchPose: CameraPose = {
    center: INITIAL_CENTER,
    zoom: getWorldFitZoom(layout.mapViewport.width),
  };

  /** Frame one country in the map's box. Memoised per ISO-3 inside `getCountryBounds`. */
  const poseFor = (iso3: string): CameraPose | null => {
    const bounds = getCountryBounds(iso3);
    if (!bounds) return null;

    return getCountryCameraStop({
      bbox: bounds.bbox,
      viewport: layout.mapViewport,
      minZoom: getWorldFitZoom(layout.mapViewport.width),
      maxZoom: QUIZ_MAX_ZOOM,
    });
  };

  /**
   * The camera stop.
   *
   * `Camera` is memoised and rebuilds its animation from these props, so a freshly
   * allocated object every render would re-fire the fly on every keystroke. The
   * dependency list is deliberately just the question, its position and the map's box -
   * typing, adding a chip and opening the keyboard must not move the map.
   *
   * `index` joins the list because the flight's DURATION depends on where it starts,
   * which is the previous question's country. It changes in lockstep with `question`, so
   * it adds no re-fires.
   */
  const camera = useMemo(() => {
    // No map, no camera. Worth an early return rather than leaving it to the caller:
    // without it a flag round walks `getCountryBounds` - which clusters a country's
    // polygons, and Canada has 141 of them - once per question, to build a stop that
    // nothing will ever read.
    if (!showsMap) return undefined;

    // `locate` mode drives the camera from `revealStop` instead: framing the country
    // being asked about is precisely the answer, so the map must not move to it. The
    // round therefore opens on `WorldMap`'s own default view - the whole world - and
    // moves only to reveal a country the player missed.
    if (locate) return undefined;

    const to = question ? poseFor(question.iso3) : null;
    if (!to) return undefined;

    /**
     * Where the flight starts, so its length is knowable.
     *
     * Derived rather than tracked: in `facts` mode the camera was last sent to the
     * PREVIOUS question's country, which is a pure function of the question list. A
     * player who pans or zooms mid-question makes this an estimate - the map is only
     * read-only for SELECTION - and the cost of being wrong is a move paced for a
     * journey slightly longer or shorter than the real one, never a wrong destination.
     */
    const previous = index > 0 ? poseFor(questions[index - 1].iso3) : null;
    const from = previous ?? launchPose;

    return {
      ...to,
      duration: getFlightDuration({ from, to, viewport: layout.mapViewport }),
      easing: FLY,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, question, index, layout.mapViewport.width, layout.mapViewport.height]);

  const finish = (results: QuestionResult[], endedEarly: boolean) => {
    setQuizResult({ config, results, total: questions.length, endedEarly });
    // `replace`, not `push`: it tears down this screen and with it the second MapLibre
    // surface, and it stops the back gesture landing mid-quiz on a finished round.
    router.replace('/quiz/results');
  };

  /** Drop a reveal that has not fired yet. Idempotent, and safe to call in cleanup. */
  const cancelReveal = () => {
    if (revealTimer.current) clearTimeout(revealTimer.current);
    revealTimer.current = null;
  };

  // The round can end - or the screen be left - inside the delay.
  useEffect(() => cancelReveal, []);

  /**
   * Show where the country actually was, a beat after the wrong guess turned red.
   *
   * The stop is computed NOW rather than in the timer so it is fitted to the map box the
   * player is looking at, and so a rotation mid-delay cannot leave the arithmetic reading
   * a viewport that no longer exists.
   */
  const scheduleReveal = (iso3: string) => {
    const to = poseFor(iso3);
    if (!to) return;

    /**
     * The last place we SENT the camera, which in `locate` mode is a rougher estimate
     * than in `facts`: hunting for a country is panning and zooming, and none of that is
     * reported back to us. It is still the right shape - the first reveal of a round
     * really does start from the world view - and the error only makes one flight a
     * little fast or a little slow. Tracking the true pose would mean a camera-change
     * event from both `WorldMap` implementations, and a ref written on every pan.
     */
    const from = revealStop ?? launchPose;
    const duration = getFlightDuration({ from, to, viewport: layout.mapViewport });

    cancelReveal();
    revealTimer.current = setTimeout(() => {
      revealTimer.current = null;
      setAnswerShown(true);
      // A fresh object every time, which is what re-fires the animation on both
      // renderers - see the note on `camera` in worldMapProps.ts.
      setRevealStop({ ...to, duration, easing: FLY });
    }, REVEAL_DELAY_MS);
  };

  const check = () => {
    if (!question || result) return;

    if (locate) {
      // One tap, one right answer, `===`. Nothing in `gradeAnswer`'s spelling tolerance
      // has anything to say about an ISO-3 code that came out of `pickCountry`.
      const graded = gradeLocation(question, picked);
      setResult(graded);
      // A correct guess leaves the camera exactly where the player put it: they found
      // the country, so there is nothing to show them.
      if (!graded.allCorrect) scheduleReveal(question.iso3);
      return;
    }

    // `toAnswerInput` folds each set field's uncommitted text in as a final chip. Merging
    // the two maps directly would let `chips` shadow `text` and silently drop whatever
    // the player typed without pressing return - which read as the field being ignored.
    setResult(gradeQuestion(question, toAnswerInput(answers)));
  };

  const next = () => {
    if (!result) return;
    // Pressing Next inside the delay is a decision to skip the reveal.
    cancelReveal();

    const completed = [...history, result];
    setHistory(completed);
    setResult(null);
    setAnswers(EMPTY_ANSWERS);
    setPicked(null);
    setAnswerShown(false);

    if (index + 1 >= questions.length) finish(completed, false);
    else setIndex(index + 1);
  };

  const end = () => {
    cancelReveal();
    finish(result ? [...history, result] : history, true);
  };

  /**
   * Leaving mid-round asks first.
   *
   * A round is a lot of typing to lose to one edge swipe, and back used to throw it away
   * silently. `predictiveBackGestureEnabled` is false in `app.json`, so on Android the
   * swipe and the hardware button are the same plain back press and both arrive here.
   *
   * `BackHandler` rather than `usePreventRemove`: expo-router's own root handler is a
   * `hardwareBackPress` listener, and RN calls those in REVERSE registration order, so a
   * subscription added when this screen mounts runs first and `true` stops the pop dead.
   * `usePreventRemove` would work too, but it lives at `expo-router/react-navigation` and
   * needs navigator context at render time - which is exactly what `QuizLaunchButton` and
   * `pendingCountry.ts` say this app avoids so its screens stay renderable bare in Jest.
   *
   * Two effects, not one. The listener must be registered ONCE for the whole round - a
   * subscription rebuilt on every keystroke is churn, and the round's state changes on
   * every one - so the handler is reached through a ref that the render-tracking effect
   * keeps current. Writing that ref in an effect rather than during render is what keeps
   * it safe under the React Compiler, which `app.json` has switched on.
   */
  const [confirmingExit, setConfirmingExit] = useState(false);
  const handleBackRef = useRef<() => boolean>(() => false);

  useEffect(() => {
    handleBackRef.current = () => {
      // The "nothing to ask" state has no round to protect; let back behave normally.
      if (!question) return false;

      // Belt and braces. The dialog is a `Modal`, so it holds window focus and Android
      // routes back to its own `onRequestClose` instead of here - but if that ever stops
      // being true, back must close the card rather than stack a second one behind it.
      setConfirmingExit((open) => !open);
      return true;
    };
  });

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () =>
      handleBackRef.current()
    );
    return () => subscription.remove();
  }, []);

  const exit = (action: ExitAction) => {
    setConfirmingExit(false);
    // `cancel` is the no-op: closing the card IS staying in the round.
    if (action === 'score') end();
    else if (action === 'discard') goBack();
  };

  if (!question) {
    return (
      <View style={styles.empty}>
        <Text testID="quiz-empty" style={styles.emptyText}>
          Nothing to ask with those settings.
        </Text>
      </View>
    );
  }

  // Yellow while the question is open, then the verdict. The map says the same thing the
  // panel does, so a glance is enough. In `locate` mode the country wearing this is the
  // player's PICK rather than the question - which is why a wrong answer needs a second
  // highlight for where the country actually was.
  const selectionColor = !result
    ? mapColors.quizTarget
    : result.allCorrect
      ? mapColors.quizCorrect
      : mapColors.quizWrong;

  return (
    <View
      testID="quiz-play"
      style={[
        styles.screen,
        layout.landscape ? styles.screenLandscape : styles.screenPortrait,
        // Edge-to-edge means the window does NOT shrink for the keyboard, so the space
        // it covers has to be given back by hand or the panel sits behind it. The map
        // absorbs the loss; see useKeyboardHeight.
        //
        // `+ insets.bottom` is not belt and braces: measured on the emulator, the IME's
        // reported height stops at the top of the navigation bar, so reserving it alone
        // leaves the Check button 56px under the keyboard.
        {
          paddingTop: insets.top,
          paddingBottom: keyboardHeight > 0 ? keyboardHeight + insets.bottom : 0,
        },
      ]}
    >
      {/*
        The map and the panel are SIBLINGS, sized to complementary halves - nothing is
        positioned over the MapLibre surface. See CLAUDE.md: a view inserted above that
        surface after the first mount lays out correctly and never paints, and this panel
        grows a chip every time the player names a language.
      */}
      {showsMap ? (
        <View style={styles.map}>
          <WorldMap
            // The two map modes run it in opposite directions: `facts` paints the country
            // it is asking about, `locate` must not - that is the answer - so it paints
            // whatever the player has tapped instead, and nothing at all until they do.
            selectedIso3={locate ? picked : question.iso3}
            selectionColor={selectionColor}
            revealIso3={locate && answerShown ? question.iso3 : null}
            camera={locate ? revealStop : camera}
            maxZoom={QUIZ_MAX_ZOOM}
            // `facts` mode passes no handler at all, which makes the map read-only:
            // tapping the answer out of it would rather defeat the question. `locate` is
            // the opposite - the tap IS the answer - but only until it has been checked.
            onSelect={locate && !result ? setPicked : undefined}
          />
        </View>
      ) : (
        // The stimulus for a `flag` round, in the slot the map would have had. It never
        // names the country - not even once graded - which is exactly what `facts` mode
        // does when the round did not ask for the name. See FlagStage.
        <FlagStage flag={question.facts.flag} compact={keyboardHeight > 0} />
      )}

      <View
        style={[
          // `flexShrink` so that when the keyboard takes half the screen the panel gives
          // way rather than overflowing - its body scrolls instead.
          styles.panelSlot,
          layout.landscape
            ? { width: layout.panelWidth ?? undefined }
            : { height: layout.panelHeight ?? undefined },
          { paddingBottom: keyboardHeight > 0 ? 0 : insets.bottom + 12 },
        ]}
      >
        {locate ? (
          <LocatePanel
            question={question}
            picked={picked}
            result={result}
            answerShown={answerShown}
            onCheck={check}
            onNext={next}
            index={index}
            total={questions.length}
            onEnd={end}
            landscape={layout.landscape}
          />
        ) : (
          <QuizPanel
            configuredFields={config.fields as FieldId[]}
            question={question}
            answers={answers}
            onChangeText={(field, value) =>
              setAnswers((prev) => ({ ...prev, text: { ...prev.text, [field]: value } }))
            }
            onChangeChips={(field, chips) =>
              setAnswers((prev) => ({ ...prev, chips: { ...prev.chips, [field]: chips } }))
            }
            result={result}
            onCheck={check}
            onNext={next}
            index={index}
            total={questions.length}
            onEnd={end}
            landscape={layout.landscape}
          />
        )}
      </View>

      {/*
        Hosted in its own window by `Modal`, so this is NOT a view inserted above the
        MapLibre surface - see ConfirmDialog. Its position in this tree is irrelevant.
      */}
      <ConfirmDialog
        testID="quiz-exit"
        visible={confirmingExit}
        {...buildExitPrompt({
          index,
          total: questions.length,
          // The open question counts once checked: `end` would score it too.
          graded: history.length + (result ? 1 : 0),
        })}
        onDismiss={() => setConfirmingExit(false)}
        onPress={exit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: mapColors.ocean },
  screenPortrait: { flexDirection: 'column' },
  screenLandscape: { flexDirection: 'row' },
  // minHeight so the country stays at least glanceable when the keyboard is up.
  map: { flex: 1, minHeight: 96 },
  panelSlot: { flexShrink: 1 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: quizColors.surface,
  },
  emptyText: { color: quizColors.textMuted, fontSize: 15 },
});
