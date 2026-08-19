import { Pressable, StyleSheet, Text, View } from 'react-native';

import { quizColors, quizRadii } from './palette';

/**
 * The list of choices behind a `MapOptionPill` - fill mode on the left, label field on
 * the right.
 *
 * Unpositioned, and **always mounted**. `MapControls` places it and slides it in and out
 * by animating a layout property. It must never be conditionally rendered: a view
 * inserted over the MapLibre surface after the initial mount lays out perfectly, with
 * entirely correct bounds, and paints nothing at all. This is the project's most
 * expensive bug; see `MapControls.tsx` and CLAUDE.md.
 *
 * So `visible` drives accessibility and hit-testing, never mounting. In tests that means
 * presence proves nothing, and RNTL queries need `{ includeHiddenElements: true }` to
 * find the parked panel at all.
 *
 * Every row is mounted from the first frame and selection only changes colours - the same
 * reasoning that kept all three fill modes mounted when they were a segmented control.
 */
export function MapOptionPanel<T extends string>({
  testID,
  optionTestIdPrefix,
  title,
  options,
  selected,
  visible,
  onChange,
}: {
  testID: string;
  /** Row testIDs are `${optionTestIdPrefix}-${id}`, e.g. `mode-density`. */
  optionTestIdPrefix: string;
  title: string;
  options: readonly { id: T; label: string; description: string }[];
  selected: T;
  visible: boolean;
  onChange: (id: T) => void;
}) {
  return (
    <View
      testID={testID}
      style={styles.card}
      // Parked off-screen when hidden, so it must not absorb touches meant for the map
      // or be reachable by a screen reader.
      pointerEvents={visible ? 'auto' : 'none'}
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
      accessibilityRole="radiogroup"
    >
      <Text style={styles.title}>{title}</Text>

      {options.map((option) => {
        const active = option.id === selected;

        return (
          <Pressable
            key={option.id}
            testID={`${optionTestIdPrefix}-${option.id}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, checked: active }}
            accessibilityLabel={option.description}
            onPress={() => onChange(option.id)}
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
    // Opaque and elevated, like the legend. Elevation also puts an open panel over the
    // legend, which shares the top-left column - a menu covering a key while it is open
    // is ordinary, and the alternative is pushing the legend down into a Maestro tap.
    backgroundColor: quizColors.surface,
    elevation: 8,
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
