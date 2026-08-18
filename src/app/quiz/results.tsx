import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { quizColors, quizRadii } from '@/components/quiz/palette';
import { getCountryFacts } from '@/data/countryFacts';
import { FIELD_LABELS, newSeed, toQuizParams } from '@/quiz/quizConfig';
import { takeQuizResult } from '@/quiz/quizResultStore';
import { summarize } from '@/quiz/quizScore';

/**
 * The score, and what you actually got wrong.
 *
 * Its own route with no map: the round is over, and reaching it with `router.replace`
 * unmounts the play screen's MapLibre surface rather than leaving two alive.
 */
export default function QuizResultsScreen() {
  const insets = useSafeAreaInsets();

  // Read once, on mount. The store clears on read, so a back gesture or a dev reload
  // onto this URL finds nothing and bounces to setup rather than showing a stale round.
  const [run] = useState(takeQuizResult);

  if (!run) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <Text testID="quiz-results-empty" style={styles.emptyText}>
          That quiz has already been counted.
        </Text>
        <Pressable
          testID="quiz-results-restart"
          onPress={() => router.replace('/quiz')}
          style={styles.secondary}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>Set up a new quiz</Text>
        </Pressable>
      </View>
    );
  }

  const summary = summarize(run);
  const wrongOnly = run.results.filter((result) => !result.allCorrect);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 16 }]}>
      <ScrollView
        testID="quiz-results"
        style={styles.body}
        contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 24 }]}
      >
        <Text style={styles.title}>Round over</Text>

        <View style={styles.scoreCard}>
          <Text testID="quiz-score-countries" style={styles.scoreBig}>
            {summary.countriesAllCorrect} / {summary.countriesAsked}
          </Text>
          <Text style={styles.scoreLabel}>countries fully correct</Text>
          <Text testID="quiz-score-fields" style={styles.scoreSmall}>
            {summary.fieldsCorrect} of {summary.fieldsAsked} answers right
          </Text>
          {run.endedEarly ? (
            <Text style={styles.endedEarly}>
              Ended after {summary.countriesAsked} of {run.total}
            </Text>
          ) : null}
        </View>

        <View style={styles.perField}>
          {Object.entries(summary.perField).map(([field, tally]) => (
            <View key={field} style={styles.fieldPill}>
              <Text style={styles.fieldPillLabel}>
                {FIELD_LABELS[field as keyof typeof FIELD_LABELS]}
              </Text>
              <Text style={styles.fieldPillValue}>
                {tally.correct}/{tally.asked}
              </Text>
            </View>
          ))}
        </View>

        {/* The list below is every country in the order it was asked, not just the
            misses - seeing the ones you got is half the point of a review. So the
            heading has to say so, or "1 to look at again" reads as a list of one. */}
        <Text testID="quiz-review-heading" style={styles.section}>
          {wrongOnly.length === 0
            ? `Review — all ${summary.countriesAsked} correct`
            : `Review — ${wrongOnly.length} missed`}
        </Text>

        {run.results.map((result, position) => {
          const facts = getCountryFacts(result.iso3);
          return (
            <View
              key={`${result.iso3}-${position}`}
              testID={`quiz-review-${result.iso3}`}
              style={styles.review}
            >
              <View style={styles.reviewHeader}>
                <Text style={styles.flag}>{facts?.flag ?? '🏳️'}</Text>
                <Text style={styles.reviewName}>{facts?.name ?? result.iso3}</Text>
                <Text
                  style={[styles.verdict, result.allCorrect ? styles.ok : styles.bad]}
                >
                  {result.allCorrect ? '✓' : '✗'}
                </Text>
              </View>

              {result.allCorrect
                ? null
                : result.grades
                    .filter((grade) => !grade.correct)
                    .map((grade) => (
                      <View key={grade.field} style={styles.missRow}>
                        <Text style={styles.missField}>{FIELD_LABELS[grade.field]}</Text>
                        <Text style={styles.missAnswer}>{grade.expected}</Text>
                        {grade.given ? (
                          <Text style={styles.missGiven}>you said {grade.given}</Text>
                        ) : (
                          <Text style={styles.missGiven}>left blank</Text>
                        )}
                      </View>
                    ))}
            </View>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          testID="quiz-play-again"
          onPress={() =>
            router.replace({
              pathname: '/quiz/play',
              params: toQuizParams({ ...run.config, seed: newSeed() }),
            })
          }
          style={styles.primary}
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>Play again</Text>
        </Pressable>
        <View style={styles.footerRow}>
          <Pressable
            testID="quiz-change-settings"
            onPress={() => router.replace('/quiz')}
            style={styles.secondary}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Change settings</Text>
          </Pressable>
          <Pressable
            testID="quiz-back-to-map"
            onPress={() => router.dismissAll()}
            style={styles.secondary}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryText}>Back to map</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quizColors.surface },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  emptyText: { color: quizColors.textMuted, fontSize: 15, textAlign: 'center' },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, gap: 12 },
  title: { color: quizColors.text, fontSize: 26, fontWeight: '700' },
  scoreCard: {
    backgroundColor: quizColors.surfaceRaised,
    borderRadius: quizRadii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
    padding: 18,
    alignItems: 'center',
    gap: 2,
  },
  scoreBig: { color: quizColors.accent, fontSize: 40, fontWeight: '700' },
  scoreLabel: {
    color: quizColors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  scoreSmall: { color: quizColors.text, fontSize: 14, marginTop: 8 },
  endedEarly: { color: quizColors.textFaint, fontSize: 12, marginTop: 4 },
  perField: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fieldPill: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: quizRadii.pill,
    backgroundColor: quizColors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
  },
  fieldPillLabel: { color: quizColors.textMuted, fontSize: 12 },
  fieldPillValue: { color: quizColors.text, fontSize: 12, fontWeight: '700' },
  section: { color: quizColors.text, fontSize: 15, fontWeight: '700', marginTop: 10 },
  review: {
    backgroundColor: quizColors.surfaceRaised,
    borderRadius: quizRadii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
    padding: 12,
    gap: 8,
  },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flag: { fontSize: 20 },
  reviewName: { color: quizColors.text, fontSize: 15, fontWeight: '600', flex: 1 },
  verdict: { fontSize: 16, fontWeight: '700' },
  ok: { color: quizColors.correct },
  bad: { color: quizColors.wrong },
  missRow: { gap: 1 },
  missField: {
    color: quizColors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  missAnswer: { color: quizColors.text, fontSize: 14 },
  missGiven: { color: quizColors.textFaint, fontSize: 12 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 8,
    backgroundColor: quizColors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: quizColors.border,
  },
  footerRow: { flexDirection: 'row', gap: 8 },
  primary: {
    backgroundColor: quizColors.accent,
    borderRadius: quizRadii.pill,
    paddingVertical: 13,
    alignItems: 'center',
  },
  primaryText: { color: quizColors.textInverted, fontSize: 15, fontWeight: '700' },
  secondary: {
    flex: 1,
    borderRadius: quizRadii.pill,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
  },
  secondaryText: { color: quizColors.textMuted, fontSize: 13, fontWeight: '600' },
});
