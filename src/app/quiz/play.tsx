import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Dimensions, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { quizColors } from '@/components/palette';
import { QuizPanel, type PanelAnswers } from '@/components/quiz/QuizPanel';
import { useKeyboardHeight } from '@/components/quiz/useKeyboardHeight';
import { getWorldFitZoom } from '@/map/cameraFit';
import { getCountryBounds } from '@/map/countryBounds';
import { mapColors } from '@/map/offlineStyle';
import { getCountryCameraStop } from '@/map/quizCamera';
import { WorldMap } from '@/map/WorldMap';
import { gradeQuestion, type QuestionResult, toAnswerInput } from '@/quiz/gradeAnswer';
import { buildQuiz } from '@/quiz/quizBuilder';
import { type FieldId, parseQuizParams } from '@/quiz/quizConfig';
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

const CAMERA_DURATION = 900;

const EMPTY_ANSWERS: PanelAnswers = { text: {}, chips: {} };

export default function QuizPlayScreen() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  // The split is measured from the SCREEN, not the window, so the map's box - and
  // therefore the camera stop - cannot change while someone is typing. The keyboard is
  // handled separately, as padding, because edge-to-edge means the window never resizes
  // for it anyway. `useWindowDimensions` is still subscribed to: it is what re-renders
  // this component on rotation.
  useWindowDimensions();
  const screen = Dimensions.get('screen');
  const keyboardHeight = useKeyboardHeight();

  // Params are only read once: re-parsing on every render would hand `buildQuiz` a new
  // seed the moment expo-router hands back a differently-shaped params object.
  const [config] = useState(() => parseQuizParams(params as Record<string, string | string[]>));
  const [questions] = useState(() => buildQuiz(config));

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<PanelAnswers>(EMPTY_ANSWERS);
  const [result, setResult] = useState<QuestionResult | null>(null);
  const [history, setHistory] = useState<QuestionResult[]>([]);

  const question = questions[index];
  const layout = getQuizPanelLayout(screen, config.fields.length);

  /**
   * The camera stop.
   *
   * `Camera` is memoised and rebuilds its animation from these props, so a freshly
   * allocated object every render would re-fire the fly on every keystroke. The
   * dependency list is deliberately just the country and the map's box - typing, adding
   * a chip and opening the keyboard must not move the map.
   */
  const camera = useMemo(() => {
    const bounds = question ? getCountryBounds(question.iso3) : null;
    if (!bounds) return undefined;

    const { center, zoom } = getCountryCameraStop({
      bbox: bounds.bbox,
      viewport: layout.mapViewport,
      minZoom: getWorldFitZoom(layout.mapViewport.width),
      maxZoom: QUIZ_MAX_ZOOM,
    });

    // 'ease', not 'fly': fly arcs out to a great height and back, which is slow over a
    // long round and telegraphs roughly where on the globe you are heading.
    return { center, zoom, duration: CAMERA_DURATION, easing: 'ease' as const };
  }, [question, layout.mapViewport.width, layout.mapViewport.height]);

  const finish = (results: QuestionResult[], endedEarly: boolean) => {
    setQuizResult({ config, results, total: questions.length, endedEarly });
    // `replace`, not `push`: it tears down this screen and with it the second MapLibre
    // surface, and it stops the back gesture landing mid-quiz on a finished round.
    router.replace('/quiz/results');
  };

  const check = () => {
    if (!question || result) return;
    // `toAnswerInput` folds each set field's uncommitted text in as a final chip. Merging
    // the two maps directly would let `chips` shadow `text` and silently drop whatever
    // the player typed without pressing return - which read as the field being ignored.
    setResult(gradeQuestion(question, toAnswerInput(answers)));
  };

  const next = () => {
    if (!result) return;
    const completed = [...history, result];
    setHistory(completed);
    setResult(null);
    setAnswers(EMPTY_ANSWERS);

    if (index + 1 >= questions.length) finish(completed, false);
    else setIndex(index + 1);
  };

  const end = () => finish(result ? [...history, result] : history, true);

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
  // panel does, so a glance is enough.
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
      <View style={styles.map}>
        <WorldMap
          selectedIso3={question.iso3}
          selectionColor={selectionColor}
          camera={camera}
          maxZoom={QUIZ_MAX_ZOOM}
          // No `onSelect`: tapping the answer out of the map would rather defeat it.
        />
      </View>

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
      </View>
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
