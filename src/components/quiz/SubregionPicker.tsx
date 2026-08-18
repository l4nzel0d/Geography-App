import { Pressable, StyleSheet, Text, View } from 'react-native';

import { REGIONS } from '@/quiz/quizCountries';

import { quizColors, quizRadii } from '../palette';

type SubregionPickerProps = {
  selected: string[];
  onChange: (subregions: string[]) => void;
};

/**
 * The 24 subregions, grouped under their region.
 *
 * Each row carries its country count, because "Eastern Africa" meaning 17 questions and
 * "Australia and New Zealand" meaning 2 is the single most useful thing to know when
 * choosing - a round is every country in the selection.
 */
export function SubregionPicker({ selected, onChange }: SubregionPickerProps) {
  const chosen = new Set(selected);

  const toggle = (subregion: string) => {
    const next = new Set(chosen);
    if (next.has(subregion)) next.delete(subregion);
    else next.add(subregion);
    onChange([...next]);
  };

  const toggleRegion = (subregions: string[]) => {
    const allOn = subregions.every((s) => chosen.has(s));
    const next = new Set(chosen);
    for (const subregion of subregions) {
      if (allOn) next.delete(subregion);
      else next.add(subregion);
    }
    onChange([...next]);
  };

  return (
    <View testID="subregion-picker" style={styles.container}>
      {REGIONS.map((region) => {
        const names = region.subregions.map((s) => s.subregion);
        const allOn = names.every((s) => chosen.has(s));

        return (
          <View key={region.region} style={styles.region}>
            <View style={styles.regionHeader}>
              <Text style={styles.regionName}>{region.region}</Text>
              <Pressable
                testID={`region-toggle-${region.region}`}
                onPress={() => toggleRegion(names)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`${allOn ? 'Clear' : 'Select'} all of ${region.region}`}
              >
                <Text style={styles.regionAction}>{allOn ? 'Clear' : `All ${region.count}`}</Text>
              </Pressable>
            </View>

            <View style={styles.rows}>
              {region.subregions.map((bucket) => {
                const active = chosen.has(bucket.subregion);
                return (
                  <Pressable
                    key={bucket.subregion}
                    testID={`subregion-${bucket.subregion}`}
                    onPress={() => toggle(bucket.subregion)}
                    style={[styles.chip, active && styles.chipActive]}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={`${bucket.subregion}, ${bucket.count} countries`}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {bucket.subregion}
                    </Text>
                    <Text style={[styles.count, active && styles.countActive]}>{bucket.count}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 18 },
  region: { gap: 8 },
  regionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  regionName: {
    color: quizColors.textMuted,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  regionAction: { color: quizColors.accent, fontSize: 12, fontWeight: '600' },
  rows: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: quizRadii.pill,
    backgroundColor: quizColors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
  },
  chipActive: { backgroundColor: quizColors.accent, borderColor: quizColors.accent },
  chipText: { color: quizColors.text, fontSize: 13 },
  chipTextActive: { color: quizColors.textInverted, fontWeight: '600' },
  count: { color: quizColors.textFaint, fontSize: 11 },
  countActive: { color: quizColors.textInverted, opacity: 0.7 },
});
