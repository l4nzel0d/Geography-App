import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { getLocale, setLocale, subscribeToLocale } from '@/i18n/locale';
import { LOCALES, type Locale } from '@/i18n/localeTypes';
import { t } from '@/i18n/t';

import { quizColors, quizRadii } from './palette';

/**
 * Switching the app's language, from the map's top-right row.
 *
 * ## A toggle, not a third pill-and-panel
 *
 * Fill mode and labels are pills that open a panel because each has four to seven options.
 * There are two languages, so a panel would be a menu with one alternative in it - and,
 * more to the point, it would not fit: `chromeWidth.test.ts` measures the Russian chrome at
 * 355 of the 379 dp available at 411 dp, and that is *with* this button compact and
 * two characters wide. A third full-size pill overflows the row, which is the bug CLAUDE.md
 * records actually shipping once.
 *
 * ## It shows the language you would switch TO
 *
 * The convention for a two-state language toggle, and the one that makes it obvious the
 * control does something. The `accessibilityLabel` spells it out in words, because "EN"
 * alone read aloud says nothing about which direction it goes.
 *
 * ## The web has no state to change
 *
 * `/` and `/ru` are two separate static exports, so `setLocale` there is a document
 * navigation and `subscribeToLocale` never fires - see `locale.web.ts`. This component is
 * written against the native signature and does not know the difference, which is what
 * keeps the count of `Platform.OS` checks in `src/` at zero.
 */
export function LocaleToggleButton() {
  /**
   * Subscribed inline rather than through a `useLocale()` hook.
   *
   * `app.json` sets `reactCompiler: true`, and CLAUDE.md records that moving a
   * subscription into a hook changed what the compiler memoised and failed
   * `.maestro/quiz.yaml` 0/3. Same shape as `MapScreen`'s mastery subscription.
   */
  const [locale, setActiveLocale] = useState(getLocale);
  useEffect(() => subscribeToLocale(setActiveLocale), []);

  // Two locales, so "the other one" is unambiguous. With a third this becomes a panel.
  const next: Locale = LOCALES.find((candidate) => candidate !== locale) ?? locale;

  return (
    <Pressable
      testID="toggle-language"
      onPress={() => setLocale(next)}
      style={styles.pill}
      accessibilityRole="button"
      accessibilityLabel={t('map.language.a11y', { language: t(`map.language.${next}`) })}
    >
      <Text style={styles.label}>{next.toUpperCase()}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    // 10 rather than the 14 every other pill uses. Those four dp a side are what the row
    // does not have in Russian; see `chromeWidth.test.ts`.
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: quizRadii.pill,
    // Opaque, like every other piece of chrome over the map surface. See CLAUDE.md.
    backgroundColor: quizColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
  },
  label: { color: quizColors.accent, fontSize: 13, fontWeight: '700' },
});
