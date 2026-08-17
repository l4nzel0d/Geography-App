import { StyleSheet, Text, View } from 'react-native';

import { NO_DATA_COLOR, NO_DATA_LABEL, POPULATION_STOPS } from '@/map/choropleth';

/** Labels sit under the strip, spread across it: first stop, middle stop, last stop. */
const AXIS_LABELS = [
  POPULATION_STOPS[0],
  POPULATION_STOPS[Math.floor(POPULATION_STOPS.length / 2)],
  POPULATION_STOPS[POPULATION_STOPS.length - 1],
];

/**
 * Key for the population choropleth.
 *
 * Stepped rather than a smooth gradient: `expo-linear-gradient` is not installed and
 * adding it would mean a native rebuild, and a strip of discrete swatches is the more
 * honest reading of a scale defined by discrete stops anyway. The map interpolates
 * between them, so treat this as a key to the decades, not a pixel-exact match.
 *
 * Unpositioned - `MapControls` places it.
 */
export function PopulationLegend() {
  return (
    <View testID="population-legend" style={styles.card}>
      <Text style={styles.title}>People per country</Text>

      <View style={styles.strip}>
        {POPULATION_STOPS.map((stop) => (
          <View key={stop.label} style={[styles.swatch, { backgroundColor: stop.color }]} />
        ))}
      </View>

      <View style={styles.axis}>
        {AXIS_LABELS.map((stop) => (
          <Text key={stop.label} style={styles.axisLabel}>
            {stop.label}
          </Text>
        ))}
      </View>

      <View style={styles.noData}>
        <View style={[styles.noDataSwatch, { backgroundColor: NO_DATA_COLOR }]} />
        <Text style={styles.axisLabel}>{NO_DATA_LABEL}</Text>
      </View>
    </View>
  );
}

const SWATCH_WIDTH = 24;

const styles = StyleSheet.create({
  card: {
    alignSelf: 'flex-start',
    padding: 10,
    borderRadius: 12,
    // Opaque, not translucent, and lifted with elevation: a translucent card here
    // did not paint at all over the MapLibre surface, while the opaque toggle pill
    // beside it painted fine. See CLAUDE.md.
    backgroundColor: '#12263a',
    elevation: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2c4a63',
  },
  title: {
    color: '#8fa9bd',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  strip: {
    flexDirection: 'row',
    borderRadius: 3,
    overflow: 'hidden',
  },
  swatch: {
    width: SWATCH_WIDTH,
    height: 10,
  },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: SWATCH_WIDTH * POPULATION_STOPS.length,
    marginTop: 3,
  },
  axisLabel: {
    color: '#8fa9bd',
    fontSize: 10,
  },
  noData: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  noDataSwatch: {
    width: 14,
    height: 10,
    borderRadius: 2,
  },
});
