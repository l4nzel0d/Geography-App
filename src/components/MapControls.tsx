import { useEffect, useRef, useState } from 'react';
import { Animated, type LayoutChangeEvent, StyleSheet, View } from 'react-native';
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

/** Where the legend parks when hidden - far enough left to clear any screen. */
const OFFSCREEN_LEFT = -200;

const SLIDE_DURATION = 800;

/**
 * The map's only chrome, stacked in the top-left corner.
 *
 * Top-left is the one corner free in both orientations: the info sheet docks to the
 * bottom in portrait and to the right edge in landscape (see `infoSheetLayout.ts`).
 *
 * **The legend is mounted from startup and never conditionally rendered, and it is
 * moved on and off screen by animating `left` - a layout property - on the JS thread.
 * All three of those are load-bearing; see CLAUDE.md.** A view inserted over the
 * MapLibre surface *after* the initial mount is never drawn: it sits in the hierarchy
 * with perfectly correct bounds and paints nothing until a full re-layout (rotating
 * the device) rebuilds the tree. Mounting it up front gives it the same stable
 * insertion order as the toggle, and animating a layout property supplies the
 * re-layout that a transform or an opacity change does not.
 */
export function MapControls({ fillMode, onFillModeChange }: MapControlsProps) {
  const insets = useSafeAreaInsets();
  const [toggleHeight, setToggleHeight] = useState(TOGGLE_FALLBACK_HEIGHT);

  const top = insets.top + 12;
  const left = insets.left + 16;
  const showLegend = fillMode === 'population';

  // Not `useNativeDriver`: the point is to drive `left` through the shadow tree so a
  // real layout pass happens on every frame.
  const slide = useRef(new Animated.Value(showLegend ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: showLegend ? 1 : 0,
      duration: SLIDE_DURATION,
      useNativeDriver: false,
    }).start();
  }, [showLegend, slide]);

  const onToggleLayout = (event: LayoutChangeEvent) =>
    setToggleHeight(event.nativeEvent.layout.height);

  return (
    <>
      <View style={[styles.anchor, { top, left }]} onLayout={onToggleLayout}>
        <MapModeToggle mode={fillMode} onChange={onFillModeChange} />
      </View>

      <Animated.View
        style={[
          styles.anchor,
          {
            top: top + toggleHeight + GAP,
            left: slide.interpolate({
              inputRange: [0, 1],
              outputRange: [OFFSCREEN_LEFT, left],
            }),
            opacity: slide,
          },
        ]}
      >
        <PopulationLegend visible={showLegend} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    alignItems: 'flex-start',
  },
});
