import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LABEL_FIELDS, type LabelField } from '@/map/mapLabels';

import { quizColors, quizRadii } from './palette';

/**
 * The six things a country can be labelled with.
 *
 * Unpositioned, and **always mounted** - `MapControls` places it and slides it in and
 * out by animating a layout property. It must never be conditionally rendered: a view
 * inserted over the MapLibre surface after the initial mount lays out perfectly and
 * paints nothing at all. This is the same discipline as `ChoroplethLegend`, for the same
 * reason; see CLAUDE.md.
 *
 * So `visible` drives accessibility and hit-testing, not mounting. In tests that means
 * presence proves nothing and RNTL queries need `{ includeHiddenElements: true }`.
 *
 * All six rows are mounted from the first frame and selection only changes their
 * colours - the same reasoning that made `MapModeToggle` a segmented control rather than
 * a list that grows a checkmark.
 */
export function LabelFieldPicker({
  field,
  visible,
  onChange,
}: {
  field: LabelField;
  visible: boolean;
  onChange: (field: LabelField) => void;
}) {
  return (
    <View
      testID="label-field-panel"
      style={styles.card}
      // Parked off-screen when hidden, so it must not absorb touches over the map or be
      // reachable by a screen reader.
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
      accessibilityRole="radiogroup"
    >
      <Text style={styles.title}>Label each country with</Text>

      {LABEL_FIELDS.map((option) => {
        const active = option.field === field;

        return (
          <Pressable
            key={option.field}
            testID={`label-field-${option.field}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, checked: active }}
            accessibilityLabel={option.description}
            onPress={() => onChange(option.field)}
            style={[styles.row, active && styles.rowActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'flex-start',
    padding: 8,
    borderRadius: quizRadii.card,
    gap: 2,
    // Opaque and elevated, like the legend: a translucent card over the map surface did
    // not paint at all.
    backgroundColor: quizColors.surface,
    elevation: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
  },
  title: {
    color: quizColors.textMuted,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 4,
    paddingHorizontal: 8,
  },
  row: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: quizRadii.pill,
    minWidth: 140,
  },
  rowActive: {
    backgroundColor: quizColors.text,
  },
  label: {
    color: quizColors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  labelActive: {
    color: quizColors.textInverted,
  },
});
