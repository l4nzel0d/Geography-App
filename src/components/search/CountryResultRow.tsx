import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { CountrySearchResult } from '@/search/countrySearch';

import { CountryFlag } from '../CountryFlag';
import { FLAG_SIZES } from '../flagSizes';
import { quizColors, quizRadii } from '../palette';
import { useTranslator } from '@/i18n/useTranslator';
import { getLocale } from '@/i18n/locale';
import { subregionLabel } from '@/data/placeNames';

type CountryResultRowProps = {
  result: CountrySearchResult;
  onPress: (iso3: string) => void;
};

/**
 * One country in the results list.
 *
 * Memoised because the list re-renders on every keystroke and most rows survive it
 * unchanged - `onPress` is hoisted to a stable callback by the screen for the same
 * reason.
 *
 * When the hit came from an alias the row says so ("Holland" under "Netherlands").
 * Offering the Netherlands for "holland" with no explanation reads like a bug, and the
 * line is also the only place alias support is discoverable at all.
 */
export const CountryResultRow = memo(function CountryResultRow({
  result,
  onPress,
}: CountryResultRowProps) {
  const t = useTranslator();

  const { iso3, name, flag, subregion, matchedAs } = result;

  // The dataset leaves `subregion` empty for the four Antarctic records, and an empty
  // Text still takes a line's height.
  const detail = matchedAs ?? subregionLabel(subregion, getLocale());

  return (
    <Pressable
      testID={`country-result-${iso3}`}
      onPress={() => onPress(iso3)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={
        matchedAs ? t('search.result.alias', { name, alias: matchedAs }) : name
      }
    >
      {/*
        Shared with the info sheet, so a platform that cannot draw flag emoji gets a real
        image here too rather than a bare country code. See flagEmoji.ts.

        The fixed slot is what keeps the names down the list starting at one x-position:
        a flag's width is its own now, so this column would otherwise run from Nepal's
        17 dp to Qatar's 44, and a scrolling list of ragged names reads as broken rather
        than as varied.
      */}
      <View style={styles.flagSlot}>
        <CountryFlag flag={flag} size="sm" />
      </View>

      <View style={styles.text}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        {detail ? (
          <Text style={matchedAs ? styles.alias : styles.subregion} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: quizRadii.field,
  },
  rowPressed: { backgroundColor: quizColors.surfaceRaised },
  flagSlot: { width: FLAG_SIZES.sm.maxWidth, alignItems: 'center' },
  text: { flex: 1 },
  name: { color: quizColors.text, fontSize: 16 },
  subregion: { color: quizColors.textMuted, fontSize: 13, marginTop: 2 },
  // The alias is the reason this row is here at all, so it reads as a highlight rather
  // than as the greyed-out afterthought the subregion is.
  alias: { color: quizColors.accent, fontSize: 13, marginTop: 2 },
});
