import Constants from 'expo-constants';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DATA_CREDITS, labelText, SOFTWARE_CREDITS, type Credit } from '@/about/credits';
import { getInfoSheetLayout, MAX_CONTENT_WIDTH } from '@/components/infoSheetLayout';
import { quizColors, quizRadii } from '@/components/palette';
import { useWindowSize } from '@/components/useWindowSize';
import { useTranslator } from '@/i18n/useTranslator';
import type { Translator } from '@/i18n/t';
import { goBack } from '@/navigation/goBack';

/**
 * Who the app is built from, and under what terms.
 *
 * Three of the sources here require credit as a condition of use - ODbL for the country
 * facts, CC BY for the population figures, OFL for the bundled typeface - and until this
 * screen existed the app credited none of them anywhere a player could see. The map's own
 * attribution control is deliberately off (`attribution={false}`), and correctly so: there
 * is no tile server to attribute. The obligation is ours, and this is where it is met.
 *
 * A route of its own with no map on it, so the paint bug is out of reach entirely and
 * **ordinary conditional rendering is correct here** - the always-mounted discipline in
 * the map's chrome exists only for views sharing a window with a live MapLibre surface.
 */
export default function AboutScreen() {
  const t = useTranslator();
  const insets = useSafeAreaInsets();

  // Same treatment as `/search` and `/quiz`: a readable column on a monitor, the full
  // width on a phone. `useWindowSize`, never `useWindowDimensions` - the first render of
  // this route is HTML produced in Node by the static export and has to hydrate to match.
  const centred =
    getInfoSheetLayout(useWindowSize()).tier === 'desktop' ? styles.centred : null;

  // Read from the manifest rather than hardcoded, so it cannot drift from `app.json`.
  // Absent in some hosts (a bare Jest render, a stripped web manifest), and a missing
  // version is worth no line at all rather than the word "Version" trailing off.
  const version = Constants.expoConfig?.version;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={[styles.header, centred]}>
        <View style={styles.headerText}>
          <Text testID="about-title" style={styles.title}>
            {t('about.title')}
          </Text>
        </View>
        <Pressable
          testID="about-close"
          onPress={goBack}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel={t('about.close')}
          style={styles.close}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView
        testID="about"
        style={styles.body}
        contentContainerStyle={[
          styles.bodyContent,
          centred,
          { paddingBottom: insets.bottom + 32 },
        ]}
      >
        {/* The app's own identity. `app.name` and `app.description` already existed for
            the web manifest, so this section needed no new wording in either language. */}
        <Text testID="about-app-name" style={styles.appName}>
          {t('app.name')}
        </Text>
        {version ? (
          <Text testID="about-version" style={styles.version}>
            {t('about.version', { version })}
          </Text>
        ) : null}
        <Text style={styles.description}>{t('app.description')}</Text>

        <Text style={styles.intro}>{t('about.intro')}</Text>

        <Text style={styles.section}>{t('about.section.data')}</Text>
        {DATA_CREDITS.map((credit) => (
          <CreditRow key={credit.id} credit={credit} t={t} />
        ))}

        <Text style={styles.section}>{t('about.section.software')}</Text>
        {SOFTWARE_CREDITS.map((credit) => (
          <CreditRow key={credit.id} credit={credit} t={t} />
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * One credit.
 *
 * Every label goes through `labelText`, which is what decides whether a string is an
 * identifier rendered verbatim ("ODbL 1.0") or a description rendered through the
 * catalogue ("Public domain"). See the note in `credits.ts`.
 */
function CreditRow({ credit, t }: { credit: Credit; t: Translator }) {
  return (
    <View testID={`about-credit-${credit.id}`} style={styles.credit}>
      {/* Wraps rather than truncating: "world-countries (mledoze)" beside "ODbL 1.0"
          overflows a narrow phone, and a clipped licence name is the one thing on this
          screen that must stay legible. */}
      <View style={styles.creditHead}>
        <Text style={styles.creditName}>{labelText(credit.name, t)}</Text>
        <Text style={styles.creditLicence}>{labelText(credit.licence, t)}</Text>
      </View>
      <Text style={styles.creditRole}>{t(credit.roleKey)}</Text>
      {credit.noticeKey ? (
        <Text style={styles.creditNotice}>{t(credit.noticeKey)}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Desktop only: a readable column instead of the full width of a monitor. */
  centred: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
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
  close: { padding: 4 },
  closeText: { color: quizColors.textMuted, fontSize: 18 },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, gap: 10 },
  appName: { color: quizColors.text, fontSize: 20, fontWeight: '700', marginTop: 4 },
  version: { color: quizColors.textFaint, fontSize: 13, marginTop: -6 },
  description: { color: quizColors.textMuted, fontSize: 14, lineHeight: 20 },
  intro: {
    color: quizColors.textFaint,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  section: {
    color: quizColors.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 18,
  },
  credit: {
    backgroundColor: quizColors.surfaceRaised,
    borderRadius: quizRadii.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  creditHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  creditName: { color: quizColors.text, fontSize: 15, fontWeight: '600' },
  creditLicence: {
    color: quizColors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    backgroundColor: quizColors.field,
    borderRadius: quizRadii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  creditRole: { color: quizColors.textMuted, fontSize: 13, lineHeight: 18 },
  creditNotice: { color: quizColors.textFaint, fontSize: 12, lineHeight: 17 },
});
