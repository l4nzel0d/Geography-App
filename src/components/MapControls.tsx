import { useEffect, useRef, useState } from 'react';
import { Animated, type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTranslator } from '@/i18n/useTranslator';
import { CHOROPLETH_RAMPS, FILL_MODES, POPULATION_RAMP } from '@/map/choropleth';
import { LABEL_FIELDS, type LabelField } from '@/map/mapLabels';
import type { FillMode } from '@/map/WorldMap';

import { ChoroplethLegend } from './ChoroplethLegend';
import { LocaleToggleButton } from './LocaleToggleButton';
import { MapOptionPanel } from './MapOptionPanel';
import { MapOptionPill } from './MapOptionPill';
import { QuizLaunchButton } from './quiz/QuizLaunchButton';
import { SearchLaunchButton } from './search/SearchLaunchButton';

type MapControlsProps = {
  fillMode: FillMode;
  onFillModeChange: (mode: FillMode) => void;
  labelField: LabelField;
  onLabelFieldChange: (field: LabelField) => void;
};

/** Height of a pill before it has measured itself, for the first frame only. */
const PILL_FALLBACK_HEIGHT = 36;

/** Gap between a pill and whatever hangs below it. */
const GAP = 8;

/** Where the legend parks when hidden - far enough left to clear any screen. */
const OFFSCREEN_LEFT = -200;

/** Where the option panels park when hidden. */
const OFFSCREEN_PANEL = -240;

const SLIDE_DURATION = 800;

/**
 * Shorter than the legend's 800ms. The legend slides as a side effect of choosing a fill
 * mode, where a leisurely reveal reads as polish; a panel is the direct answer to a tap
 * on its pill, and anything slower than a few frames reads as an unresponsive button.
 */
const PANEL_SLIDE_DURATION = 220;

/** Which option panel is open. Only ever one - see the note in the component. */
type OpenPanel = 'fill' | 'labels' | null;

/**
 * The map's chrome: two option pills, the choropleth legend, and the two launch buttons.
 *
 * ## Why both settings are pills rather than always-visible controls
 *
 * The fill mode was a three-segment control in the top-left until the label picker
 * arrived. Measured on the 411 dp-wide emulator there are 379 dp between the safe areas,
 * and the segmented group (~206 dp) plus the top-right row (~187 dp idle, ~216 dp with
 * "Currencies" selected) came to 393-422 dp. They overlapped on screen. Collapsing the
 * fill control to a pill frees ~130 dp and leaves both rows comfortable at any phone
 * width, at the cost of one tap to change fill mode.
 *
 * What that trades away is the segmented control's best property - every mode visible at
 * once, which is what made density discoverable. The panel keeps them all visible one tap
 * in, and the pill now states the current mode in words rather than only by colour.
 *
 * ## Where things ended up
 *
 * Both appearance settings are pills in the **top-left row**, and both panels open
 * downward from it on the left. Search and quiz keep the top-right row, which is back to
 * exactly the two buttons it held before labels arrived.
 *
 * - **Neither row may grow downward.** The portrait Greenland tap in `tap-country.yaml`
 *   is at 19%,13% - about 74,110 dp - a little below the left row, and the legend already
 *   occupies the space under it. The nearest tap to the right row is Russia at 81%,20%.
 * - **Both panels are closed by default**, which is what keeps every existing Maestro
 *   percentage tap valid: they only cover the map while open.
 * - Only one panel is open at a time, so the left column never has two menus in it.
 *
 * ## The rule that governs all of it
 *
 * **The legend and both panels are mounted from startup and never conditionally
 * rendered, and they are moved on and off screen by animating `left`/`right` - a layout
 * property - on the JS thread. All of that is load-bearing; see CLAUDE.md.** A view
 * inserted over the MapLibre surface *after* the initial mount is never drawn: it sits in
 * the hierarchy with perfectly correct bounds and paints nothing until a full re-layout
 * rebuilds the tree. Mounting up front gives the same stable insertion order as the
 * pills, which never had the bug, and animating a layout property supplies the re-layout
 * that a transform or an opacity change does not.
 */
export function MapControls({
  fillMode,
  onFillModeChange,
  labelField,
  onLabelFieldChange,
}: MapControlsProps) {
  const t = useTranslator();

  const insets = useSafeAreaInsets();
  const [pillHeight, setPillHeight] = useState(PILL_FALLBACK_HEIGHT);

  /**
   * One slot, not two booleans. The panels are opaque menus on a phone-sized map, and
   * opening the second while the first is up leaves almost none of the map visible.
   */
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);

  const top = insets.top + 12;
  const left = insets.left + 16;
  const right = insets.right + 16;
  const showLegend = fillMode !== 'flat';

  const currentFill = FILL_MODES.find((option) => option.mode === fillMode) ?? FILL_MODES[0];
  const currentLabel =
    LABEL_FIELDS.find((option) => option.field === labelField) ?? LABEL_FIELDS[0];

  // The legend outlives the mode that opened it: on the way back to `flat` it goes on
  // showing the ramp it was showing and slides out with it, rather than blanking on
  // the first frame of an 800ms animation. Same reasoning as `CountryInfoSheet`'s
  // `visibleFacts`. Population is only the seed for the very first render, before any
  // ramp has been chosen.
  const [visibleRamp, setVisibleRamp] = useState(POPULATION_RAMP);

  useEffect(() => {
    if (fillMode !== 'flat') setVisibleRamp(CHOROPLETH_RAMPS[fillMode]);
  }, [fillMode]);

  // Not `useNativeDriver`: the point is to drive a layout property through the shadow
  // tree so a real layout pass happens on every frame.
  const legendSlide = useRef(new Animated.Value(showLegend ? 1 : 0)).current;
  const fillSlide = useRef(new Animated.Value(0)).current;
  const labelSlide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(legendSlide, {
      toValue: showLegend ? 1 : 0,
      duration: SLIDE_DURATION,
      useNativeDriver: false,
    }).start();
  }, [showLegend, legendSlide]);

  useEffect(() => {
    Animated.timing(fillSlide, {
      toValue: openPanel === 'fill' ? 1 : 0,
      duration: PANEL_SLIDE_DURATION,
      useNativeDriver: false,
    }).start();
  }, [openPanel, fillSlide]);

  useEffect(() => {
    Animated.timing(labelSlide, {
      toValue: openPanel === 'labels' ? 1 : 0,
      duration: PANEL_SLIDE_DURATION,
      useNativeDriver: false,
    }).start();
  }, [openPanel, labelSlide]);

  const onPillLayout = (event: LayoutChangeEvent) =>
    setPillHeight(event.nativeEvent.layout.height);

  const toggle = (panel: Exclude<OpenPanel, null>) =>
    setOpenPanel((open) => (open === panel ? null : panel));

  const belowPills = top + pillHeight + GAP;

  return (
    <>
      {/* Both map-appearance settings sit together on the left, in ONE row, and both
          open downward from it. Keeping them side by side is what makes them read as a
          pair rather than as two unrelated controls at opposite ends of the screen.

          Growing this row RIGHTWARD is what the collapse to pills bought: at ~186 dp for
          both pills it clears the top-right row by a wide margin. Growing it DOWNWARD is
          what must not happen - the portrait Greenland tap in `tap-country.yaml` is at
          19%,13%, a little under it. Keep any future control the same height, and never
          put it on a second line. */}
      <View style={[styles.anchor, styles.row, { top, left }]} onLayout={onPillLayout}>
        <MapOptionPill
          testID="toggle-fill-mode"
          label={t(currentFill.labelKey)}
          active={fillMode !== 'flat'}
          expanded={openPanel === 'fill'}
          accessibilityLabel={t('map.fill.a11y', { mode: t(currentFill.labelKey) })}
          onPress={() => toggle('fill')}
        />
        <MapOptionPill
          testID="toggle-label-field"
          label={labelField === 'none' ? t('map.labels.pill') : t(currentLabel.labelKey)}
          active={labelField !== 'none'}
          expanded={openPanel === 'labels'}
          accessibilityLabel={t('map.labels.a11y', { field: t(currentLabel.labelKey) })}
          onPress={() => toggle('labels')}
        />
      </View>

      {/* Top-right: the launch buttons, back to the two they were before labels arrived.
          Mounted from the first frame like everything else layered over the map surface.
          The nearest coordinate tap is Russia at 81%,20%, some 80 dp further down. */}
      <View style={[styles.anchor, styles.row, { top, right }]}>
        <SearchLaunchButton />
        <QuizLaunchButton />
        {/* The language toggle joins this row rather than the left one, which is already
            the tighter of the two - both its pills carry a word that changes with the
            selection. `chromeWidth.test.ts` measures both rows in both languages against
            the 379 dp budget, and Russian clears it by ~24 dp. */}
        <LocaleToggleButton />
      </View>

      {/* Both panels share the left column with the legend and cover it while open.
          That is why they are the more elevated: a menu temporarily over a key is
          ordinary, and the alternative - parking the legend below a panel's full height -
          would push it into the Greenland tap permanently. */}
      <Animated.View
        style={[
          styles.anchor,
          styles.panel,
          {
            top: belowPills,
            left: fillSlide.interpolate({
              inputRange: [0, 1],
              outputRange: [OFFSCREEN_PANEL, left],
            }),
            opacity: fillSlide,
          },
        ]}
      >
        <MapOptionPanel
          testID="fill-mode-panel"
          optionTestIdPrefix="mode"
          title={t('map.fill.panelTitle')}
          options={FILL_MODES.map((option) => ({
            id: option.mode,
            label: t(option.labelKey),
            description: t(option.descriptionKey),
          }))}
          selected={fillMode}
          visible={openPanel === 'fill'}
          onChange={(mode) => {
            onFillModeChange(mode);
            setOpenPanel(null);
          }}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.anchor,
          styles.panel,
          {
            top: belowPills,
            left: labelSlide.interpolate({
              inputRange: [0, 1],
              outputRange: [OFFSCREEN_PANEL, left],
            }),
            opacity: labelSlide,
          },
        ]}
      >
        <MapOptionPanel
          testID="label-field-panel"
          optionTestIdPrefix="label-field"
          title={t('map.labels.panelTitle')}
          options={LABEL_FIELDS.map((option) => ({
            id: option.field,
            label: t(option.labelKey),
            description: t(option.descriptionKey),
          }))}
          selected={labelField}
          visible={openPanel === 'labels'}
          onChange={(field) => {
            onLabelFieldChange(field);
            setOpenPanel(null);
          }}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.anchor,
          {
            top: belowPills,
            left: legendSlide.interpolate({
              inputRange: [0, 1],
              outputRange: [OFFSCREEN_LEFT, left],
            }),
            opacity: legendSlide,
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
  // Both anchored groups lay their pills out side by side. A row, never a column: see
  // the note at the top-left group.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // Above the legend, which shares the left column.
  panel: {
    zIndex: 2,
  },
});
