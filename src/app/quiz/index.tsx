import { router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { goBack } from "@/navigation/goBack";
import { FieldPicker } from "@/components/quiz/FieldPicker";
import { ModePicker } from "@/components/quiz/ModePicker";
import {
  getInfoSheetLayout,
  MAX_CONTENT_WIDTH,
} from "@/components/infoSheetLayout";
import { quizColors, quizRadii } from "@/components/palette";
import { useWindowSize } from "@/components/useWindowSize";
import { SubregionPicker } from "@/components/quiz/SubregionPicker";
import { countriesIn } from "@/quiz/quizCountries";
import {
  DEFAULT_MODE,
  type FieldId,
  MODE_ASKS_FIELDS,
  newSeed,
  QUIZ_MODE_HINTS,
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
  const [subregions, setSubregions] = useState<string[]>([]);
  const [fields, setFields] = useState<FieldId[]>(["name"]);

  const countryCount = countriesIn(subregions).length;
  // A `locate` round asks one thing of every country and needs no field at all, so the
  // only way to make it unplayable is to select subregions that contain nobody. Both of
  // the typing modes DO need one - this is not only which picker to show, it is also
  // what stops a round starting with nothing ticked and silently falling back to asking
  // the country's name.
  const needsFields = MODE_ASKS_FIELDS[mode];
  const canStart = (!needsFields || fields.length > 0) && countryCount > 0;

  const start = () => {
    if (!canStart) return;
    router.push({
      pathname: "/quiz/play",
      params: toQuizParams({ mode, subregions, fields, seed: newSeed() }),
    });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={[styles.header, centred]}>
        <View style={styles.headerText}>
          <Text testID="quiz-setup-title" style={styles.title}>
            Quiz
          </Text>
          {/* One source for the wording, shared with the mode picker's own rows - two
              copies drifted apart the moment there was a third mode to describe. */}
          <Text testID="quiz-setup-subtitle" style={styles.subtitle}>
            {QUIZ_MODE_HINTS[mode]}
          </Text>
        </View>
        <Pressable
          testID="quiz-setup-close"
          onPress={goBack}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Back to the map"
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
        <Text style={styles.section}>How do you want to play?</Text>
        <ModePicker selected={mode} onChange={setMode} />

        {/*
          Ordinary conditional rendering, and correct here for the same reason it is on
          `/search`: this screen has no map on it, so nothing can be inserted above a
          MapLibre surface. The always-mounted discipline elsewhere in the quiz exists
          only where a view shares a window with that surface.
        */}
        {needsFields ? (
          <>
            <Text style={styles.section}>What do you have to answer?</Text>
            <FieldPicker selected={fields} onChange={setFields} />
          </>
        ) : null}

        <Text style={styles.section}>Which parts of the world?</Text>
        <Text style={styles.sectionNote}>
          Leave everything unselected to play the whole world — all 193 UN
          member states.
        </Text>
        <SubregionPicker selected={subregions} onChange={setSubregions} />
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
            accessibilityLabel={`Start a quiz of ${countryCount} countries`}
          >
            <Text style={styles.startText}>
              {needsFields && fields.length === 0
                ? "Pick at least one fact"
                : `Start — ${countryCount} ${countryCount === 1 ? "country" : "countries"}`}
            </Text>
          </Pressable>
        </View>
      </View>
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
