import { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCountryFacts } from '@/data/countryFacts';

import {
  formatArea,
  formatCapital,
  formatCurrencies,
  formatLanguages,
  formatPopulation,
  formatRegion,
} from './formatters';

type CountryInfoSheetProps = {
  iso3: string | null;
  onClose: () => void;
};

/**
 * Slide-up info card for the selected country.
 *
 * Hand-rolled on React Native's `Animated` rather than pulling in a bottom-sheet
 * dependency: the interaction is a simple show/hide, and this keeps the native
 * dependency surface (and therefore the rebuild surface) unchanged.
 */
export function CountryInfoSheet({ iso3, onClose }: CountryInfoSheetProps) {
  const insets = useSafeAreaInsets();
  const facts = getCountryFacts(iso3);
  const slide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: facts ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [facts, slide]);

  // Keep the card mounted while it animates out, but drop it once nothing is
  // selected so stale text can never be read by tests or screen readers.
  if (!facts) return null;

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });

  return (
    <Animated.View
      testID="country-info-sheet"
      style={[styles.sheet, { paddingBottom: insets.bottom + 20, transform: [{ translateY }] }]}
    >
      <View style={styles.header}>
        <Text style={styles.flag}>{facts.flag ?? '🏳️'}</Text>
        <View style={styles.headerText}>
          <Text testID="country-name" style={styles.name}>
            {facts.name}
          </Text>
          {facts.official && facts.official !== facts.name ? (
            <Text style={styles.official}>{facts.official}</Text>
          ) : null}
        </View>
        <Pressable
          testID="close-info-sheet"
          onPress={onClose}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel="Close country details"
          style={styles.close}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        <Fact
          testID="fact-population"
          label="Population"
          value={formatPopulation(facts.population)}
          note={facts.populationYear ? `World Bank, ${facts.populationYear}` : undefined}
        />
        <Fact
          testID="fact-currencies"
          label={facts.currencies.length > 1 ? 'Currencies' : 'Currency'}
          value={formatCurrencies(facts.currencies)}
        />
        <Fact
          testID="fact-languages"
          label={facts.languages.length > 1 ? 'Official languages' : 'Official language'}
          value={formatLanguages(facts.languages)}
        />
        <Fact testID="fact-capital" label="Capital" value={formatCapital(facts.capital)} />
        <Fact
          testID="fact-region"
          label="Region"
          value={formatRegion(facts.region, facts.subregion)}
        />
        <Fact testID="fact-area" label="Area" value={formatArea(facts.area)} />
      </ScrollView>
    </Animated.View>
  );
}

function Fact({
  label,
  value,
  note,
  testID,
}: {
  label: string;
  value: string;
  note?: string;
  testID: string;
}) {
  return (
    <View testID={testID} style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
      {note ? <Text style={styles.factNote}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '55%',
    backgroundColor: '#12263a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: '#2c4a63',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
  },
  flag: { fontSize: 34 },
  headerText: { flex: 1 },
  name: { color: '#f6f7f2', fontSize: 22, fontWeight: '700' },
  official: { color: '#8fa9bd', fontSize: 13, marginTop: 2 },
  close: { padding: 4 },
  closeText: { color: '#8fa9bd', fontSize: 18 },
  body: { flexGrow: 0 },
  bodyContent: { gap: 14, paddingBottom: 8 },
  fact: { gap: 2 },
  factLabel: {
    color: '#8fa9bd',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  factValue: { color: '#f6f7f2', fontSize: 16 },
  factNote: { color: '#6d879b', fontSize: 11 },
});
