import { useEffect, useRef, useState } from 'react';
import { Animated, type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CHOROPLETH_RAMPS, POPULATION_RAMP } from '@/map/choropleth';
import type { LabelField } from '@/map/mapLabels';
import type { FillMode } from '@/map/WorldMap';

import { ChoroplethLegend } from './ChoroplethLegend';
import { LabelFieldPicker } from './LabelFieldPicker';
import { MapLabelPill } from './MapLabelPill';
import { MapModeToggle } from './MapModeToggle';
import { QuizLaunchButton } from './quiz/QuizLaunchButton';
import { SearchLaunchButton } from './search/SearchLaunchButton';

type MapControlsProps = {
  fillMode: FillMode;
  onFillModeChange: (mode: FillMode) => void;
  labelField: LabelField;
  onLabelFieldChange: (field: LabelField) => void;
};

/** Height of the toggle before it has measured itself, for the first frame only. */
const TOGGLE_FALLBACK_HEIGHT = 40;

/** Same, for the top-right pill row. */
const PILL_ROW_FALLBACK_HEIGHT = 36;

/** Where the label picker parks when hidden - far enough right to clear any screen. */
const OFFSCREEN_RIGHT = -240;

/** Gap between the toggle and the legend. */
const GAP = 8;

/** Where the legend parks when hidden - far enough left to clear any screen. */
const OFFSCREEN_LEFT = -200;

const SLIDE_DURATION = 800;

/**
 * Shorter than the legend's 800ms. The legend slides as a side effect of choosing a fill
 * mode, where a leisurely reveal reads as polish; this one is the direct answer to a tap
 * on the pill, and anything slower than a few frames reads as an unresponsive button.
 */
const PICKER_SLIDE_DURATION = 220;

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
export function MapControls({
  fillMode,
  onFillModeChange,
  labelField,
  onLabelFieldChange,
}: MapControlsProps) {
  const insets = useSafeAreaInsets();
  const [toggleHeight, setToggleHeight] = useState(TOGGLE_FALLBACK_HEIGHT);
  const [pillRowHeight, setPillRowHeight] = useState(PILL_ROW_FALLBACK_HEIGHT);
  const [pickerOpen, setPickerOpen] = useState(false);

  const top = insets.top + 12;
  const left = insets.left + 16;
  const right = insets.right + 16;
  const showLegend = fillMode !== 'flat';

  // The legend outlives the mode that opened it: on the way back to `flat` it goes on
  // showing the ramp it was showing and slides out with it, rather than blanking on
  // the first frame of an 800ms animation. Same reasoning as `CountryInfoSheet`'s
  // `visibleFacts`. Population is only the seed for the very first render, before any
  // ramp has been chosen.
  const [visibleRamp, setVisibleRamp] = useState(POPULATION_RAMP);

  useEffect(() => {
    if (fillMode !== 'flat') setVisibleRamp(CHOROPLETH_RAMPS[fillMode]);
  }, [fillMode]);

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

  // Same mechanism as the legend, and every part of it is load-bearing for the same
  // reason: always mounted, and slid by animating `right` - a LAYOUT property, on the JS
  // thread - so each frame commits through the shadow tree and supplies the re-layout
  // that makes the view paint at all. A transform or an opacity change does not.
  const pickerSlide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(pickerSlide, {
      toValue: pickerOpen ? 1 : 0,
      duration: PICKER_SLIDE_DURATION,
      useNativeDriver: false,
    }).start();
  }, [pickerOpen, pickerSlide]);

  const onToggleLayout = (event: LayoutChangeEvent) =>
    setToggleHeight(event.nativeEvent.layout.height);

  const onPillRowLayout = (event: LayoutChangeEvent) =>
    setPillRowHeight(event.nativeEvent.layout.height);

  return (
    <>
      <View style={[styles.anchor, { top, left }]} onLayout={onToggleLayout}>
        <MapModeToggle mode={fillMode} onChange={onFillModeChange} />
      </View>

      {/* Top-right: the one corner free in both orientations once the toggle has the
          left and the info sheet has the bottom/right edge. Mounted from the first
          frame like everything else layered over the map surface.

          Search and quiz share one ROW. Growing this row DOWNWARD would push it into the
          portrait Greenland tap at 19%,13%; growing it leftward is free, because the
          nearest coordinate tap is Russia at 81%,20%, some 80 dp further down. Keep any
          future control the same height as these two. */}
      <View
        style={[styles.anchor, styles.topRight, { top, right }]}
        onLayout={onPillRowLayout}
      >
        <MapLabelPill
          field={labelField}
          expanded={pickerOpen}
          onPress={() => setPickerOpen((open) => !open)}
        />
        <SearchLaunchButton />
        <QuizLaunchButton />
      </View>

      {/* Closed by default, which is what keeps every existing Maestro percentage tap
          valid: it only covers the map while open. Mounted from the first frame
          regardless - see LabelFieldPicker's docstring. */}
      <Animated.View
        style={[
          styles.anchor,
          {
            top: top + pillRowHeight + GAP,
            right: pickerSlide.interpolate({
              inputRange: [0, 1],
              outputRange: [OFFSCREEN_RIGHT, right],
            }),
            opacity: pickerSlide,
          },
        ]}
      >
        <LabelFieldPicker
          field={labelField}
          visible={pickerOpen}
          onChange={(field) => {
            onLabelFieldChange(field);
            setPickerOpen(false);
          }}
        />
      </Animated.View>

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
        <ChoroplethLegend ramp={visibleRamp} visible={showLegend} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'absolute',
    alignItems: 'flex-start',
  },
  // Search and quiz sit side by side. A row, never a column: see the note at the anchor.
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
