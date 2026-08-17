import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  type LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
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

const OPEN_DURATION = 220;
const CLOSE_DURATION = 200;

/** Slide distance for the first frame, before the card has measured itself. */
const FALLBACK_HEIGHT = 400;

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

  // What is currently on screen. This lags `facts` on close: the card has to keep
  // rendering the country it was showing while it slides back out, and only drops it
  // once the animation reports finished, so stale text can never be read by tests or
  // screen readers afterwards.
  const [visibleFacts, setVisibleFacts] = useState(facts);

  // Measured so the card slides exactly its own height off-screen. `maxHeight: 55%`
  // is 429 dp on a 780 dp-tall phone, so any fixed guess risks leaving a sliver of
  // card on screen at the moment it unmounts.
  const [height, setHeight] = useState(FALLBACK_HEIGHT);

  useEffect(() => {
    if (facts) setVisibleFacts(facts);

    const animation = Animated.timing(slide, {
      toValue: facts ? 1 : 0,
      duration: facts ? OPEN_DURATION : CLOSE_DURATION,
      // Decelerate on the way in, accelerate on the way out.
      easing: facts ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    });

    animation.start(({ finished }) => {
      if (finished && !facts) setVisibleFacts(null);
    });

    // A selection change mid-animation retargets from wherever the card is rather
    // than queueing a second animation behind the first.
    return () => animation.stop();
  }, [facts, slide]);

  if (!visibleFacts) return null;

  const onLayout = (event: LayoutChangeEvent) => {
    const measured = event.nativeEvent.layout.height;
    if (measured > 0) setHeight(measured);
  };

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [height, 0] });

  return (
    <Animated.View
      testID="country-info-sheet"
      onLayout={onLayout}
      // While sliding out the card is still mounted but no longer the user's target -
      // let taps through to the map underneath.
      pointerEvents={facts ? 'auto' : 'none'}
      style={[styles.sheet, { paddingBottom: insets.bottom + 20, transform: [{ translateY }] }]}
    >
      <View style={styles.header}>
        <Text style={styles.flag}>{visibleFacts.flag ?? '🏳️'}</Text>
        <View style={styles.headerText}>
          <Text testID="country-name" style={styles.name}>
            {visibleFacts.name}
          </Text>
          {visibleFacts.official && visibleFacts.official !== visibleFacts.name ? (
            <Text style={styles.official}>{visibleFacts.official}</Text>
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
          value={formatPopulation(visibleFacts.population)}
          note={
            visibleFacts.populationYear ? `World Bank, ${visibleFacts.populationYear}` : undefined
          }
        />
        <Fact
          testID="fact-currencies"
          label={visibleFacts.currencies.length > 1 ? 'Currencies' : 'Currency'}
          value={formatCurrencies(visibleFacts.currencies)}
        />
        <Fact
          testID="fact-languages"
          label={visibleFacts.languages.length > 1 ? 'Official languages' : 'Official language'}
          value={formatLanguages(visibleFacts.languages)}
        />
        <Fact testID="fact-capital" label="Capital" value={formatCapital(visibleFacts.capital)} />
        <Fact
          testID="fact-region"
          label="Region"
          value={formatRegion(visibleFacts.region, visibleFacts.subregion)}
        />
        <Fact testID="fact-area" label="Area" value={formatArea(visibleFacts.area)} />
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
