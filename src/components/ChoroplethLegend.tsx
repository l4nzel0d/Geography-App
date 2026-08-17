import { StyleSheet, Text, View } from 'react-native';

import { type ChoroplethRamp, NO_DATA_COLOR, NO_DATA_LABEL } from '@/map/choropleth';

/** Labels sit under the strip, spread across it: first stop, middle stop, last stop. */
const axisLabelsOf = (ramp: ChoroplethRamp) => [
  ramp.stops[0],
  ramp.stops[Math.floor(ramp.stops.length / 2)],
  ramp.stops[ramp.stops.length - 1],
];

/**
 * Key for whichever choropleth ramp is showing.
 *
 * Stepped rather than a smooth gradient: `expo-linear-gradient` is not installed and
 * adding it would mean a native rebuild, and a strip of discrete swatches is the more
 * honest reading of a scale defined by discrete stops anyway. The map interpolates
 * between them, so treat this as a key to the decades, not a pixel-exact match.
 *
 * Unpositioned, and **always mounted** - `MapControls` places it and slides it in and
 * out. It must not be conditionally rendered; see the note there and in CLAUDE.md.
 * `visible` therefore drives accessibility and hit-testing rather than mounting.
 *
 * **Switching ramps swaps `ramp`, it does not mount a second legend.** Every ramp
 * carries the same number of stops (pinned in `choropleth.test.ts`), so React updates
 * these swatches in place rather than inserting new views over the MapLibre surface -
 * which is the one thing that reliably never paints.
 */
export function ChoroplethLegend({ ramp, visible }: { ramp: ChoroplethRamp; visible: boolean }) {
  return (
    <View
      testID="choropleth-legend"
      style={styles.card}
      // Parked off-screen when hidden, so it must not absorb touches or be reachable
      // by a screen reader.
      pointerEvents="none"
      accessibilityElementsHidden={!visible}
      importantForAccessibility={visible ? 'yes' : 'no-hide-descendants'}
    >
      <Text style={styles.title}>{ramp.title}</Text>

      <View style={styles.strip}>
        {ramp.stops.map((stop) => (
          <View key={stop.label} style={[styles.swatch, { backgroundColor: stop.color }]} />
        ))}
      </View>

      <View style={[styles.axis, { width: SWATCH_WIDTH * ramp.stops.length }]}>
        {axisLabelsOf(ramp).map((stop) => (
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
