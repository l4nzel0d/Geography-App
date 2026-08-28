import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  type DimensionValue,
  Easing,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getCountryFacts } from '@/data/countryFacts';

import {
  formatArea,
  formatCapital,
  formatCurrencies,
  formatPopulation,
} from './formatters';
import { CountryFlag } from './CountryFlag';
import { FlagLightbox } from './FlagLightbox';
import { flagLetters } from './flagEmoji';
import { getInfoSheetLayout, PORTRAIT_MAX_HEIGHT_FRACTION } from './infoSheetLayout';
import { dismissDrag, dragProgress, shouldCaptureDrag, shouldDismiss } from './sheetDismiss';
import { useTranslator } from '@/i18n/useTranslator';
import { getLocale, subscribeToLocale } from '@/i18n/locale';

type CountryInfoSheetProps = {
  iso3: string | null;
  onClose: () => void;
  /**
   * The card's measured height, reported on every layout.
   *
   * Only the portrait camera needs it: `getMapFocusRect` has to know how much of the
   * bottom this card actually covers, and the card is content-height, so a fraction of
   * the screen is only right when the cap happens to bind. Optional because nothing else
   * that renders this cares.
   */
  onMeasured?: (height: number) => void;
};

const OPEN_DURATION = 220;
const CLOSE_DURATION = 200;

/** Slide distance for the first frame, before the card has measured itself. */
const FALLBACK_SIZE = { width: 360, height: 400 };


/**
 * Info card for the selected country: a bottom sheet in portrait, a right-hand side
 * panel in landscape. It slides in along whichever edge it is docked to.
 *
 * Hand-rolled on React Native's `Animated` rather than pulling in a bottom-sheet
 * dependency: the interaction is a simple show/hide, and this keeps the native
 * dependency surface (and therefore the rebuild surface) unchanged.
 */
export function CountryInfoSheet({ iso3, onClose, onMeasured }: CountryInfoSheetProps) {
  const t = useTranslator();

  const insets = useSafeAreaInsets();
  const { landscape, panelWidth, tier } = getInfoSheetLayout(useWindowDimensions());

  /**
   * A big window is not a stretched phone. At 1920 the phone type sizes leave the card
   * looking like a mobile screenshot pasted onto a monitor, so the desktop tier scales
   * the type and the spacing up to match its wider column. Keyed on available ROOM, not
   * on pointer type, so an Android tablet in landscape gets it too - which is right.
   */
  const desktop = tier === 'desktop';
  /**
   * The language, read as a real value rather than left implicit.
   *
   * `getCountryFacts` defaults its locale to the singleton, which `reactCompiler: true`
   * cannot see - it would be free to memoise this call on `iso3` alone and leave an open
   * card in the old language after a switch. Passing the locale explicitly makes the
   * dependency something the compiler can track.
   *
   * Subscribed inline for the same reason every other subscription in this app is; see
   * the note in `MapScreen`.
   */
  const [locale, setActiveLocale] = useState(getLocale);
  useEffect(() => subscribeToLocale(setActiveLocale), []);

  const facts = getCountryFacts(iso3, locale);
  const slide = useRef(new Animated.Value(0)).current;

  // What is currently on screen. This lags `facts` on close: the card has to keep
  // rendering the country it was showing while it slides back out, and only drops it
  // once the animation reports finished, so stale text can never be read by tests or
  // screen readers afterwards.
  const [visibleFacts, setVisibleFacts] = useState(facts);

  /**
   * Is the flag showing full size?
   *
   * Closed again by the effect below, on every change of selection - see the note there.
   */
  const [flagOpen, setFlagOpen] = useState(false);

  // Measured so the card slides exactly its own size off-screen along whichever axis
  // it travels. `maxHeight: 55%` is 429 dp on a 780 dp-tall phone, so any fixed guess
  // risks leaving a sliver of card on screen at the moment it unmounts.
  const [size, setSize] = useState(FALLBACK_SIZE);

  // Read inside the pan responder, which is memoised - a ref keeps it seeing the
  // current values without tearing the responder down and rebuilding it mid-gesture.
  const factsAtTop = useRef(true);
  const dragState = useRef({ landscape, extent: FALLBACK_SIZE.height, onClose });
  dragState.current = { landscape, extent: landscape ? size.width : size.height, onClose };

  useEffect(() => {
    if (facts) setVisibleFacts(facts);

    // The enlarged flag belongs to the country that was selected when it was opened, so a
    // change of selection closes it. That covers both halves of the same hazard: picking a
    // different country while the flag is up, and clearing the selection - on the web
    // Escape reaches `useDismissKey` in `MapScreen`, and without this the flag would sit
    // there through the card's whole close animation before going with it.
    setFlagOpen(false);

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

  const springBack = useCallback(() => {
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, bounciness: 0 }).start();
  }, [slide]);

  /**
   * Drag the card toward its docked edge to dismiss it - down in portrait, right in
   * landscape.
   *
   * It claims the gesture in the *capture* phase, which is what lets it win against
   * the facts list underneath: in portrait both want vertical drags, and a responder
   * granted the normal way would go to the ScrollView first and never reach here.
   * `shouldCaptureDrag` only captures when that list is already scrolled to the top,
   * so a drag inside a scrolled list still scrolls it.
   *
   * Memoised, and everything that changes between renders (orientation, measured
   * size, `onClose`) is read through `dragState` - rebuilding the responder while a
   * finger is down would drop the drag half way.
   */
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          shouldCaptureDrag(gesture, {
            landscape: dragState.current.landscape,
            factsAtTop: factsAtTop.current,
          }),

        // Take over from any open/close animation still running.
        onPanResponderGrant: () => slide.stopAnimation(),

        onPanResponderMove: (_event, gesture) => {
          const { landscape: isLandscape, extent } = dragState.current;
          const { distance } = dismissDrag(gesture, isLandscape);
          slide.setValue(dragProgress(distance, extent));
        },

        onPanResponderRelease: (_event, gesture) => {
          const { landscape: isLandscape, extent, onClose: close } = dragState.current;
          const drag = dismissDrag(gesture, isLandscape);

          // Closing is left to the parent clearing the selection, which runs the same
          // close animation as the ✕ button - from wherever the drag left the card.
          if (shouldDismiss({ ...drag, extent })) close();
          else springBack();
        },

        // A phone call or a system gesture stealing the touch must not leave the card
        // stranded half off-screen.
        onPanResponderTerminate: () => springBack(),
      }),
    [slide, springBack],
  );

  if (!visibleFacts) return null;

  const onLayout = ({ nativeEvent }: LayoutChangeEvent) => {
    const { width, height } = nativeEvent.layout;
    if (width > 0 && height > 0) {
      setSize({ width, height });
      // The camera reserves space for this card when framing a searched country, and a
      // fraction of the screen is a poor guess for something that is content-height.
      onMeasured?.(height);
    }
  };

  // Off-screen is down in portrait and out to the right in landscape.
  const travel = slide.interpolate({
    inputRange: [0, 1],
    outputRange: [landscape ? size.width : size.height, 0],
  });

  return (
    <Animated.View
      testID="country-info-sheet"
      onLayout={onLayout}
      {...pan.panHandlers}
      // While sliding out the card is still mounted but no longer the user's target -
      // let taps through to the map underneath.
      pointerEvents={facts ? 'auto' : 'none'}
      style={[
        styles.sheet,
        landscape ? styles.sheetLandscape : styles.sheetPortrait,
        desktop && styles.sheetDesktop,
        landscape
          ? {
              width: panelWidth ?? undefined,
              paddingTop: insets.top + 16,
              paddingBottom: insets.bottom + 20,
              paddingRight: insets.right + 20,
              transform: [{ translateX: travel }],
            }
          : { paddingBottom: insets.bottom + 20, transform: [{ translateY: travel }] },
      ]}
    >
      {/* Decorative grab handle: the affordance for the drag, on the edge the card
          travels toward. Hidden from screen readers, which have the ✕ button. */}
      <View
        testID="drag-handle"
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={landscape ? styles.handleLandscape : styles.handlePortrait}
      />

      <View style={[styles.header, desktop && styles.headerDesktop]}>
        {/*
          Tap the flag to see it full size. A tap is safe inside the card's PanResponder:
          `shouldCaptureDrag` wants 8 dp of movement along the dismiss axis before it
          claims anything, which is why the ✕ beside it already works.

          Inert for a record with no flag at all - BES alone, where `flagLetters` returns
          null and `CountryFlag` draws the white-flag glyph. There is nothing to enlarge,
          so there is no control either, rather than a button that opens an empty frame.
        */}
        {flagLetters(visibleFacts.flag) ? (
          <Pressable
            testID="open-flag-lightbox"
            onPress={() => setFlagOpen(true)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('info.flag.open')}
            style={styles.flagButton}
          >
            <CountryFlag flag={visibleFacts.flag} />
          </Pressable>
        ) : (
          <CountryFlag flag={visibleFacts.flag} />
        )}
        <View style={styles.headerText}>
          <Text testID="country-name" style={[styles.name, desktop && styles.nameDesktop]}>
            {visibleFacts.name}
          </Text>
          {visibleFacts.official && visibleFacts.official !== visibleFacts.name ? (
            <Text style={[styles.official, desktop && styles.officialDesktop]}>
              {visibleFacts.official}
            </Text>
          ) : null}
        </View>
        <Pressable
          testID="close-info-sheet"
          onPress={onClose}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel={t('info.close')}
          style={styles.close}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <ScrollView
        style={landscape ? styles.bodyLandscape : styles.body}
        contentContainerStyle={[styles.bodyContent, desktop && styles.bodyContentDesktop]}
        // Portrait dismisses along the axis this list scrolls on, so the card may
        // only take the drag while the list is at the top. See `shouldCaptureDrag`.
        scrollEventThrottle={16}
        onScroll={({ nativeEvent }: NativeSyntheticEvent<NativeScrollEvent>) => {
          factsAtTop.current = nativeEvent.contentOffset.y <= 0;
        }}
      >
        <Fact
          testID="fact-population"
          label={t('info.fact.population')}
          value={formatPopulation(visibleFacts.population)}
          note={
            visibleFacts.populationYear
              ? t('info.populationSource', { year: visibleFacts.populationYear })
              : undefined
          }
        />
        <Fact
          testID="fact-currencies"
          label={t.plural('info.fact.currencies', visibleFacts.currencies.length)}
          value={formatCurrencies(visibleFacts.currencies)}
        />
        <Fact
          testID="fact-capital"
          label={t('info.fact.capital')}
          value={formatCapital(visibleFacts.capital)}
        />
        <Fact testID="fact-area" label={t('info.fact.area')} value={formatArea(visibleFacts.area)} />
      </ScrollView>

      {/*
        Where this sits in the tree is irrelevant - a `Modal` is its own Android window and
        a portal on the web, so it is not laid out inside the card and the card's
        `pointerEvents` while sliding out does not reach it. See `ConfirmDialog`.
      */}
      <FlagLightbox
        visible={flagOpen}
        flag={visibleFacts.flag}
        name={visibleFacts.name}
        onDismiss={() => setFlagOpen(false)}
      />
    </Animated.View>
  );
}

/**
 * One labelled fact.
 *
 * Reads the tier itself rather than taking it as a prop. Threading it through every call
 * site is exactly the kind of thing that gets half-done - it already did, leaving three
 * of five facts at phone sizes on a monitor - and there is no case where one fact should
 * be sized differently from its neighbours. `useWindowDimensions` is a single shared
 * resize subscription, so asking per fact costs nothing measurable.
 */
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
  const desktop = getInfoSheetLayout(useWindowDimensions()).tier === 'desktop';

  return (
    <View testID={testID} style={styles.fact}>
      <Text style={[styles.factLabel, desktop && styles.factLabelDesktop]}>{label}</Text>
      <Text style={[styles.factValue, desktop && styles.factValueDesktop]}>{value}</Text>
      {note ? <Text style={styles.factNote}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    backgroundColor: '#12263a',
    paddingHorizontal: 20,
    paddingTop: 16,
    borderColor: '#2c4a63',
  },
  // Docked to the bottom edge, spanning the width.
  sheetPortrait: {
    left: 0,
    right: 0,
    bottom: 0,
    // Shared with `getMapFocusRect`, which treats this as the height of the map the
    // camera must keep clear. The cast is needed because a template literal widens to
    // `string`, which is not a `DimensionValue`.
    maxHeight: `${PORTRAIT_MAX_HEIGHT_FRACTION * 100}%` as DimensionValue,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // Docked to the right edge, spanning the height. `width` comes from
  // getInfoSheetLayout; paddingTop is overridden with the status-bar inset.
  sheetLandscape: {
    top: 0,
    bottom: 0,
    right: 0,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  // Portrait: a pill across the top, the edge the card slides down from.
  handlePortrait: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#3d5c76',
    marginTop: -6,
    marginBottom: 10,
  },
  // Landscape: the card slides out to the right, so the handle turns to match and
  // sits against the left edge, clear of the header text.
  handleLandscape: {
    position: 'absolute',
    left: 7,
    top: '50%',
    width: 4,
    height: 40,
    borderRadius: 2,
    backgroundColor: '#3d5c76',
    transform: [{ translateY: -20 }],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 12,
  },
  headerText: { flex: 1 },
  // `cursor` is a real ViewStyle property in RN 0.86 and a no-op on native; it is what
  // tells a desktop browser the flag is a control rather than decoration.
  flagButton: { cursor: 'pointer' },
  name: { color: '#f6f7f2', fontSize: 22, fontWeight: '700' },
  official: { color: '#8fa9bd', fontSize: 13, marginTop: 2 },
  close: { padding: 4 },
  closeText: { color: '#8fa9bd', fontSize: 18 },
  // Portrait: the sheet is only as tall as its content, up to maxHeight.
  body: { flexGrow: 0 },
  // Landscape: the panel is full-height, so the facts take the room left under the
  // header and scroll within it.
  bodyLandscape: { flex: 1 },
  bodyContent: { gap: 14, paddingBottom: 8 },

  /*
   * The desktop tier. Only sizes and spacing - no layout branch, no second component,
   * so there is exactly one info card and it cannot drift from itself. Every value here
   * is the phone value scaled to suit a 380-480 dp column rather than a 280-360 one.
   */
  sheetDesktop: { paddingHorizontal: 28 },
  headerDesktop: { gap: 16, paddingBottom: 18 },
  nameDesktop: { fontSize: 28 },
  officialDesktop: { fontSize: 15, marginTop: 4 },
  bodyContentDesktop: { gap: 20, paddingBottom: 12 },
  factLabelDesktop: { fontSize: 12, letterSpacing: 1 },
  factValueDesktop: { fontSize: 20 },
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
