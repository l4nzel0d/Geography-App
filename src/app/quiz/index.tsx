import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FieldPicker } from '@/components/quiz/FieldPicker';
import { quizColors, quizRadii } from '@/components/palette';
import { SubregionPicker } from '@/components/quiz/SubregionPicker';
import { countriesIn } from '@/quiz/quizCountries';
import { type FieldId, newSeed, toQuizParams } from '@/quiz/quizConfig';

/**
 * Quiz setup: which subregions are in play, and which facts you have to supply.
 *
 * Deliberately a route of its own with no map on it. A full-screen menu over the live
 * MapLibre surface is exactly the shape of the paint bug in CLAUDE.md; a separate screen
 * cannot hit it, and this one needs no map anyway.
 */
export default function QuizSetupScreen() {
  const insets = useSafeAreaInsets();
  const [subregions, setSubregions] = useState<string[]>([]);
  const [fields, setFields] = useState<FieldId[]>(['name']);

  const countryCount = countriesIn(subregions).length;
  const canStart = fields.length > 0 && countryCount > 0;

  const start = () => {
    if (!canStart) return;
    router.push({
      pathname: '/quiz/play',
      params: toQuizParams({ subregions, fields, seed: newSeed() }),
    });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text testID="quiz-setup-title" style={styles.title}>
            Quiz
          </Text>
          <Text style={styles.subtitle}>
            The map zooms to a country. You type what you know about it.
          </Text>
        </View>
        <Pressable
          testID="quiz-setup-close"
          onPress={() => router.back()}
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
        contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 120 }]}
      >
        <Text style={styles.section}>What do you have to answer?</Text>
        <FieldPicker selected={fields} onChange={setFields} />

        <Text style={styles.section}>Which parts of the world?</Text>
        <Text style={styles.sectionNote}>
          Leave everything unselected to play the whole world — all 193 UN member states.
        </Text>
        <SubregionPicker selected={subregions} onChange={setSubregions} />
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
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
            {fields.length === 0
              ? 'Pick at least one fact'
              : `Start — ${countryCount} ${countryCount === 1 ? 'country' : 'countries'}`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quizColors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerText: { flex: 1, gap: 4 },
  title: { color: quizColors.text, fontSize: 26, fontWeight: '700' },
  subtitle: { color: quizColors.textMuted, fontSize: 13 },
  close: { padding: 4 },
  closeText: { color: quizColors.textMuted, fontSize: 18 },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, gap: 10 },
  section: {
    color: quizColors.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 14,
  },
  sectionNote: { color: quizColors.textFaint, fontSize: 12, marginBottom: 2 },
  footer: {
    position: 'absolute',
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
    alignItems: 'center',
  },
  startDisabled: { opacity: 0.4 },
  startText: { color: quizColors.textInverted, fontSize: 15, fontWeight: '700' },
});
