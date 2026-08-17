import { Pressable, StyleSheet, Text } from 'react-native';

import type { FillMode } from '@/map/WorldMap';

type MapModeToggleProps = {
  mode: FillMode;
  onChange: (mode: FillMode) => void;
};

/**
 * Switches the land between the flat basemap and the population choropleth.
 *
 * Unpositioned - `MapControls` places it. Labelled rather than iconified because no
 * icon set is wired up, and text is what the Maestro flow can assert on.
 */
export function MapModeToggle({ mode, onChange }: MapModeToggleProps) {
  const active = mode === 'population';

  return (
    <Pressable
      testID="toggle-fill-mode"
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel="Colour countries by population"
      onPress={() => onChange(active ? 'flat' : 'population')}
      style={[styles.pill, active && styles.pillActive]}
    >
      <Text style={[styles.label, active && styles.labelActive]}>Population</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#12263a',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2c4a63',
  },
  pillActive: {
    backgroundColor: '#f6f7f2',
    borderColor: '#f6f7f2',
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
