import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { FillMode } from '@/map/WorldMap';

type MapModeToggleProps = {
  mode: FillMode;
  onChange: (mode: FillMode) => void;
};

/**
 * The three ways of colouring the land, in the order they escalate: no data, one
 * number, then that number against area.
 *
 * Short labels because this sits over the map in the top-left of a phone screen -
 * the `accessibilityLabel` carries the full sentence for a screen reader.
 */
const OPTIONS: readonly { mode: FillMode; label: string; description: string }[] = [
  { mode: 'flat', label: 'Flat', description: 'Plain basemap, no colouring' },
  { mode: 'population', label: 'People', description: 'Colour countries by population' },
  { mode: 'density', label: 'Density', description: 'Colour countries by people per square kilometre' },
];

/**
 * Switches the land between the flat basemap and the choropleth ramps.
 *
 * A segmented control rather than a cycling pill: with three modes a single pill
 * cannot show where you are without also claiming to be where you are going, and
 * every segment being visible is what makes density discoverable at all.
 *
 * All three segments are mounted from the first frame - like everything else layered
 * over the MapLibre surface, see CLAUDE.md - and selection only changes their colours.
 * Labelled rather than iconified because no icon set is wired up, and text is what the
 * Maestro flows can assert on.
 */
export function MapModeToggle({ mode, onChange }: MapModeToggleProps) {
  return (
    <View testID="toggle-fill-mode" style={styles.group} accessibilityRole="radiogroup">
      {OPTIONS.map((option) => {
        const active = mode === option.mode;

        return (
          <Pressable
            key={option.mode}
            testID={`mode-${option.mode}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: active, checked: active }}
            accessibilityLabel={option.description}
            onPress={() => onChange(option.mode)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text style={[styles.label, active && styles.labelActive]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    padding: 3,
    gap: 3,
    borderRadius: 999,
    // Opaque, like the legend card: translucency over the map surface did not paint.
    backgroundColor: '#12263a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2c4a63',
  },
  segment: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  segmentActive: {
    backgroundColor: '#f6f7f2',
  },
  label: {
    color: '#8fa9bd',
    fontSize: 13,
    fontWeight: '600',
  },
  labelActive: {
    color: '#12263a',
  },
});
