import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { goBack } from "@/navigation/goBack";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  getMasterySnapshot,
  resetMastery,
  subscribeToMastery,
} from "@/mastery/masteryStore";
import { buildResetPrompt, type ResetAction } from "@/quiz/resetPrompt";
import { FieldPicker } from "@/components/quiz/FieldPicker";
import { ModePicker } from "@/components/quiz/ModePicker";
import { PracticePicker } from "@/components/quiz/PracticePicker";
import {
  getInfoSheetLayout,
  MAX_CONTENT_WIDTH,
} from "@/components/infoSheetLayout";
import { quizColors, quizRadii } from "@/components/palette";
import { useWindowSize } from "@/components/useWindowSize";
import { SubregionPicker } from "@/components/quiz/SubregionPicker";
import { PRACTICE_ROUND_SIZE } from "@/quiz/practicePool";
import { getLocale } from "@/i18n/locale";
import { countriesIn, QUIZ_COUNTRIES } from "@/quiz/quizCountries";
import { useTranslator } from "@/i18n/useTranslator";
import {
  DEFAULT_MODE,
  type FieldId,
  MODE_ASKS_FIELDS,
  newSeed,
  QUIZ_MODE_HINT_KEYS,
  type QuizMode,
  toQuizParams,
} from "@/quiz/quizConfig";

/**
 * Quiz setup: which subregions are in play, and which facts you have to supply.
 *
 * Deliberately a route of its own with no map on it. A full-screen menu over the live
 * MapLibre surface is exactly the shape of the paint bug in CLAUDE.md; a separate screen
 * cannot hit it, and this one needs no map anyway.
 */
export default function QuizSetupScreen() {
  const insets = useSafeAreaInsets();

  // Subregion checkboxes stretched across a monitor put the tick a whole screen from its
  // label. Capped and centred on desktop; untouched on a phone.
  const centred =
    getInfoSheetLayout(useWindowSize()).tier === "desktop"
      ? styles.centred
      : null;
  const [mode, setMode] = useState<QuizMode>(DEFAULT_MODE);

  /**
   * The translator for the active language.
   *
   * A hook rather than the module-level `t`, because `reactCompiler: true` will
   * memoise a call with no reactive inputs and never recompute it - which is how a
   * language switch left half the chrome in English until something else forced a
   * render. See `useTranslator`.
   */
  const t = useTranslator();
  const [subregions, setSubregions] = useState<string[]>([]);
  const [fields, setFields] = useState<FieldId[]>(["name"]);
  const [practice, setPractice] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);

  /**
   * How much history there is to clear.
   *
   * Subscribed INLINE rather than through a `useMastery()` hook, for the reason
   * `MapScreen` records: with `reactCompiler: true`, moving a subscription out of a
   * component body changes what gets memoised, and the quiz has already been bitten by
   * that once.
   *
   * The screen needs this only for the reset row - nothing else here reads it - but the
   * store is the only thing that knows whether the button has anything to do.
   */
  const [mastery, setMastery] = useState(getMasterySnapshot);
  useEffect(() => subscribeToMastery(setMastery), []);
  const tracked = Object.keys(mastery.scores).length;

  const poolCount = countriesIn(subregions).length;
  // A practice round is capped; a normal one is still the whole filtered pool. `min`
  // rather than the constant, so a two-country subregion says "2 countries", not "10".
  const countryCount = practice
    ? Math.min(PRACTICE_ROUND_SIZE, poolCount)
    : poolCount;
  // A `locate` round asks one thing of every country and needs no field at all, so the
  // only way to make it unplayable is to select subregions that contain nobody. Both of
  // the typing modes DO need one - this is not only which picker to show, it is also
  // what stops a round starting with nothing ticked and silently falling back to asking
  // the country's name.
  const needsFields = MODE_ASKS_FIELDS[mode];
  const canStart = (!needsFields || fields.length > 0) && poolCount > 0;

  const resolveReset = (action: ResetAction) => {
    setConfirmingReset(false);
    if (action === "reset") resetMastery();
  };

  const start = () => {
    if (!canStart) return;
    router.push({
      pathname: "/quiz/play",
      params: toQuizParams({ mode, subregions, fields, practice, seed: newSeed() }),
    });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={[styles.header, centred]}>
        <View style={styles.headerText}>
          <Text testID="quiz-setup-title" style={styles.title}>
            {t('quiz.setup.title')}
          </Text>
          {/* One source for the wording, shared with the mode picker's own rows - two
              copies drifted apart the moment there was a third mode to describe. */}
          <Text testID="quiz-setup-subtitle" style={styles.subtitle}>
            {t(QUIZ_MODE_HINT_KEYS[mode])}
          </Text>
        </View>
        <Pressable
          testID="quiz-setup-close"
          onPress={goBack}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel={t('quiz.setup.close')}
          style={styles.close}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView
        testID="quiz-setup"
        style={styles.body}
        contentContainerStyle={[
          styles.bodyContent,
          centred,
          { paddingBottom: insets.bottom + 120 },
        ]}
      >
        <Text style={styles.section}>{t('quiz.setup.mode')}</Text>
        <ModePicker selected={mode} onChange={setMode} />

        {/*
          Ordinary conditional rendering, and correct here for the same reason it is on
          `/search`: this screen has no map on it, so nothing can be inserted above a
          MapLibre surface. The always-mounted discipline elsewhere in the quiz exists
          only where a view shares a window with that surface.
        */}
        {needsFields ? (
          <>
            <Text style={styles.section}>{t('quiz.setup.fields')}</Text>
            <FieldPicker selected={fields} onChange={setFields} />
          </>
        ) : null}

        <Text style={styles.section}>{t('quiz.setup.who')}</Text>
        <PracticePicker practice={practice} onChange={setPractice} />

        <Text style={styles.section}>{t('quiz.setup.where')}</Text>
        {/*
          The two sections INTERSECT - the regions choose the candidate pool and the
          weak-spot weighting then draws from that - so "practise my weak spots in Africa"
          is a real round. Nothing on screen said so, and the old note was actively
          misleading once practice existed: a practice round over the whole world is ten
          countries drawn from 193, not 193.
        */}
        <Text testID="quiz-setup-scope-note" style={styles.sectionNote}>
          {practice
            ? t("quiz.setup.scope.practice", {
                count: PRACTICE_ROUND_SIZE,
                total: QUIZ_COUNTRIES.length,
              })
            : t("quiz.setup.scope.all", { total: QUIZ_COUNTRIES.length })}
        </Text>
        <SubregionPicker selected={subregions} onChange={setSubregions} />

        {/*
          The one irreversible thing in the app, so it sits at the very end of the scroll -
          past every setting, and nowhere near the Start button in the pinned footer, which
          is the control people actually reach for. The rule above it is what separates a
          destructive action from the settings it is not part of.
        */}
        <View style={styles.dangerZone}>
          <Text style={styles.section}>{t('quiz.setup.progress')}</Text>
          <Text testID="quiz-reset-note" style={styles.sectionNote}>
            {tracked > 0
              ? t.plural("quiz.reset.note", tracked)
              : t("quiz.reset.empty")}
          </Text>
          <Pressable
            testID="quiz-reset"
            onPress={() => setConfirmingReset(true)}
            // Nothing to clear is not a no-op worth offering: a live button that does
            // nothing reads as broken, and the note above already says why it is inert.
            disabled={tracked === 0}
            style={[styles.reset, tracked === 0 && styles.startDisabled]}
            accessibilityRole="button"
            accessibilityState={{ disabled: tracked === 0 }}
            accessibilityLabel={t('quiz.reset.a11y')}
          >
            <Text style={styles.resetText}>{t('quiz.reset.label')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/*
        The bar itself stays full-bleed - it is `position: absolute` with `left: 0` and
        `right: 0`, so a `maxWidth` on it clamps the width while the pin holds it against
        the left edge, leaving a short bar stranded in the corner. Its background and top
        border are also meant to span the window. Only the CONTENT is capped.
      */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={centred}>
          <Pressable
            testID="quiz-start"
            onPress={start}
            disabled={!canStart}
            style={[styles.start, !canStart && styles.startDisabled]}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canStart }}
            accessibilityLabel={t.plural("quiz.setup.startA11y", countryCount)}
          >
            <Text style={styles.startText}>
              {needsFields && fields.length === 0
                ? t("quiz.setup.pickField")
                : t.plural("quiz.setup.start", countryCount)}
            </Text>
          </Pressable>
        </View>
      </View>

      {/*
        A `Modal`, like the leave-mid-round prompt - and here it is simply the shared
        component rather than a workaround: this route has no MapLibre surface on it, so
        the paint bug that forced `Modal` on `/quiz/play` is not in play at all.
      */}
      <ConfirmDialog
        testID="quiz-reset-confirm"
        visible={confirmingReset}
        {...buildResetPrompt({ tracked, t, })}
        onDismiss={() => setConfirmingReset(false)}
        onPress={resolveReset}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /** Desktop only: a readable column instead of the full width of a monitor. */
  centred: { width: "100%", maxWidth: MAX_CONTENT_WIDTH, alignSelf: "center" },
  screen: { flex: 1, backgroundColor: quizColors.surface },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerText: { flex: 1, gap: 4 },
  title: { color: quizColors.text, fontSize: 26, fontWeight: "700" },
  subtitle: { color: quizColors.textMuted, fontSize: 13 },
  close: { padding: 4 },
  closeText: { color: quizColors.textMuted, fontSize: 18 },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, gap: 10 },
  section: {
    color: quizColors.text,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 14,
  },
  sectionNote: { color: quizColors.textFaint, fontSize: 12, marginBottom: 2 },
  dangerZone: {
    marginTop: 24,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: quizColors.border,
    gap: 10,
  },
  /** The same outlined shape as `ConfirmDialog`'s destructive button, deliberately. */
  reset: {
    marginTop: 4,
    borderRadius: quizRadii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.wrong,
    paddingVertical: 12,
    alignItems: "center",
  },
  resetText: { color: quizColors.wrong, fontSize: 15, fontWeight: "600" },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: quizColors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: quizColors.border,
  },
  start: {
    backgroundColor: quizColors.accent,
    borderRadius: quizRadii.pill,
    paddingVertical: 14,
    alignItems: "center",
  },
  startDisabled: { opacity: 0.4 },
  startText: {
    color: quizColors.textInverted,
    fontSize: 15,
    fontWeight: "700",
  },
});
