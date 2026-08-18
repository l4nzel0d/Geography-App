import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { quizColors, quizRadii } from '@/components/palette';
import { useKeyboardHeight } from '@/components/quiz/useKeyboardHeight';
import { CountryResultRow } from '@/components/search/CountryResultRow';
import { searchCountries } from '@/search/countrySearch';
import { selectCountry } from '@/search/pendingCountry';

/**
 * Find a country by name.
 *
 * A route of its own, with no map on it. That is the whole design: a results list that
 * appears as you type is precisely the shape of the bug CLAUDE.md spends a section on - a
 * view inserted over a live MapLibre surface after the first mount lays out perfectly and
 * never paints. The quiz solved the same problem by making its panel a flex sibling;
 * here there is no map to sit over, so the bug is unreachable rather than worked around.
 *
 * Which also means the opposite rule applies on this screen: **normal conditional
 * rendering is correct here.** The always-mounted slots in `ChipInput`, the `display:
 * 'none'` rows in `AnswerField` and the parked `ChoroplethLegend` exist only because
 * those views share a window with the map surface. Copying that discipline here would
 * mount 237 rows forever for no reason at all.
 */
export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardHeight();
  const input = useRef<TextInput>(null);

  const results = useMemo(() => searchCountries(query), [query]);

  /**
   * `autoFocus` alone is occasionally lost to the stack's push animation on Android, and
   * a search screen without a keyboard is a search screen that looks broken. Re-asserting
   * it on the next frame costs nothing when it already worked.
   */
  useEffect(() => {
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  /** Stable, so `CountryResultRow`'s `memo` is worth having. */
  const choose = useCallback((iso3: string) => {
    // Announce first, navigate second: MapScreen is still mounted underneath, so it
    // highlights the country and starts the camera fly while this screen slides away.
    selectCountry(iso3);
    // Otherwise the IME lingers over the map for a beat after the transition.
    Keyboard.dismiss();
    router.back();
  }, []);

  return (
    <View
      testID="country-search"
      style={[
        styles.screen,
        {
          paddingTop: insets.top + 8,
          // The app is edge-to-edge, so Android does not resize the window for the IME
          // and `KeyboardAvoidingView`'s Android path assumes it does. `insets.bottom` is
          // added because the reported height stops at the top of the navigation bar.
          paddingBottom: keyboardHeight > 0 ? keyboardHeight + insets.bottom : insets.bottom,
        },
      ]}
    >
      <View style={styles.header}>
        <Pressable
          testID="country-search-cancel"
          onPress={() => router.back()}
          style={styles.cancel}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to the map"
        >
          <Text style={styles.cancelLabel}>←</Text>
        </Pressable>

        <View style={styles.field}>
          <TextInput
            ref={input}
            testID="country-search-input"
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            autoFocus
            placeholder="Country name"
            placeholderTextColor={quizColors.textFaint}
            /**
             * Without this, LANDSCAPE is unusable.
             *
             * When Android decides a text field has little vertical room - which is every
             * landscape phone - the IME takes over the entire screen with its own
             * "extract" editor: a white full-screen field and a SEARCH button, with this
             * screen and its results list nowhere to be seen. Verified on the emulator
             * before the prop was added.
             */
            disableFullscreenUI
            // Autocorrect would quietly rewrite "Chad" and "Niue" into English words.
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            returnKeyType="search"
            accessibilityLabel="Country name"
          />

          {/* `clearButtonMode` is iOS-only, so the button is ours. */}
          {query ? (
            <Pressable
              testID="country-search-clear"
              onPress={() => setQuery('')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear the search"
            >
              <Text style={styles.clear}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <FlatList
        data={results}
        keyExtractor={(result) => result.iso3}
        renderItem={({ item }) => <CountryResultRow result={item} onPress={choose} />}
        // Required. Without it the first tap on a row only dismisses the keyboard and
        // the row never fires - which reads exactly like a dead list.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.list}
        initialNumToRender={12}
        ListEmptyComponent={
          <View testID="country-search-empty" style={styles.empty}>
            <Text style={styles.emptyTitle}>No country matches “{query.trim()}”.</Text>
            <Text style={styles.emptyHint}>
              Try a shorter spelling — Holland, UK and Ivory Coast all work.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: quizColors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  cancel: { paddingVertical: 4 },
  cancelLabel: { color: quizColors.text, fontSize: 22 },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: quizColors.field,
    borderRadius: quizRadii.field,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
    paddingHorizontal: 12,
  },
  input: { flex: 1, color: quizColors.text, fontSize: 16, paddingVertical: 10 },
  clear: { color: quizColors.textMuted, fontSize: 15 },
  list: { paddingBottom: 16, paddingHorizontal: 4 },
  empty: { paddingHorizontal: 20, paddingTop: 32, gap: 8 },
  emptyTitle: { color: quizColors.text, fontSize: 16 },
  emptyHint: { color: quizColors.textMuted, fontSize: 14, lineHeight: 20 },
});
