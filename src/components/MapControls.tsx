import { useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FillMode } from '@/map/WorldMap';

import { MapModeToggle } from './MapModeToggle';
import { PopulationLegend } from './PopulationLegend';

type MapControlsProps = {
  fillMode: FillMode;
  onFillModeChange: (mode: FillMode) => void;
};

/** Height of the toggle before it has measured itself, for the first frame only. */
const TOGGLE_FALLBACK_HEIGHT = 40;

/** Gap between the toggle and the legend. */
const GAP = 8;

/**
 * The map's only chrome, stacked in the top-left corner.
 *
 * Top-left is the one corner free in both orientations: the info sheet docks to the
 * bottom in portrait and to the right edge in landscape (see `infoSheetLayout.ts`).
 *
 * **The toggle and the legend are anchored separately rather than stacked in one
 * container, and that is load-bearing** - see the note in CLAUDE.md. A single
 * shrink-wrapped absolute container measured itself to the toggle alone and Android
 * clipped the legend away entirely; making that container full-screen instead stopped
 * the whole overlay from painting. One shrink-wrapped absolute box per control is the
 * shape that actually renders over the MapLibre surface, so the legend's offset is
 * derived from the toggle's measured height instead of from layout flow.
 */
export function MapControls({ fillMode, onFillModeChange }: MapControlsProps) {
  const insets = useSafeAreaInsets();
  const [toggleHeight, setToggleHeight] = useState(TOGGLE_FALLBACK_HEIGHT);

  const top = insets.top + 12;
  const left = insets.left + 16;

  const onToggleLayout = (event: LayoutChangeEvent) =>
    setToggleHeight(event.nativeEvent.layout.height);

  return (
    <>
      <View style={[styles.anchor, { top, left }]} onLayout={onToggleLayout}>
        <MapModeToggle mode={fillMode} onChange={onFillModeChange} />
      </View>

      {fillMode === 'population' && (
        <View style={[styles.anchor, { top: top + toggleHeight + GAP, left }]}>
          <PopulationLegend />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    alignItems: 'flex-start',
  },
});
