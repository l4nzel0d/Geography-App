import { getInfoSheetLayout, type WindowSize } from '@/components/infoSheetLayout';

/**
 * How the quiz screen splits between the map and the answer panel.
 *
 * The panel is a flex SIBLING of the map, not an overlay. That is a deliberate choice
 * and the reason this module returns a `mapViewport`: a view inserted over the MapLibre
 * surface after the first mount is laid out correctly and never painted (see CLAUDE.md),
 * and the quiz panel grows a chip every time the player types a language. Splitting the
 * screen makes that whole class of bug impossible instead of working around it.
 *
 * The happy side effect is that the camera needs no padding arithmetic: the map really
 * is `mapViewport` big, so framing a country is just a fit to that box.
 */

/** Share of the screen the panel takes in portrait, per field it has to show. */
const PORTRAIT_HEIGHT_PER_FIELD = 0.1;

/** Space for the progress row, the button and the panel's own padding. */
const PORTRAIT_HEIGHT_BASE = 0.24;

export const PORTRAIT_MIN_FRACTION = 0.34;

/**
 * The map keeps at least this much of the screen. A quiz where you cannot see the
 * country is not a quiz, so the panel scrolls before the map gives up more room.
 */
export const PORTRAIT_MAX_FRACTION = 0.58;

/**
 * What a `locate` panel costs in portrait - an ESTIMATE, and only for the camera.
 *
 * That panel is content-height on screen: a prompt, one status line and a button, none
 * of which grows. So it is given no explicit height at all, which is what keeps the
 * button sitting directly under the last line instead of being pushed to the foot of a
 * facts-sized box - a gap that got wider the taller the screen was.
 *
 * The one thing that still needs a number is `mapViewport`, which the reveal camera fits
 * a country into. Being a few dp out there costs a marginally roomier frame, and
 * `CONTEXT_MARGIN` already spends 12% on exactly that. Measuring it for real would mean
 * threading an `onLayout` up into the camera's inputs and re-firing the fly whenever it
 * settled, which is the same trade `getMapFocusRect` refuses for the info sheet.
 */
export const LOCATE_PORTRAIT_HEIGHT = 220;

export type QuizPanelLayout = {
  landscape: boolean;
  /** Landscape only; null in portrait, where the panel spans the width. */
  panelWidth: number | null;
  /**
   * Portrait only; null in landscape, where the panel spans the height - and null in a
   * portrait `locate` round too, where "no explicit height" is the answer rather than a
   * missing one. The play screen spreads it as `height: panelHeight ?? undefined`, so
   * null lands as an auto height and the panel sizes to its content.
   */
  panelHeight: number | null;
  /** What is left for the map, in dp. Feeds `getCountryCameraStop`. */
  mapViewport: { width: number; height: number };
};

export function getQuizPanelLayout(
  screen: WindowSize,
  fieldCount: number,
  /** A `locate` round: no answer fields, and a content-height panel in portrait. */
  locate = false,
): QuizPanelLayout {
  const { landscape, panelWidth } = getInfoSheetLayout(screen);

  if (landscape) {
    return {
      landscape: true,
      panelWidth,
      panelHeight: null,
      mapViewport: { width: Math.max(0, screen.width - (panelWidth ?? 0)), height: screen.height },
    };
  }

  if (locate) {
    return {
      landscape: false,
      panelWidth: null,
      panelHeight: null,
      mapViewport: {
        width: screen.width,
        height: Math.max(0, screen.height - LOCATE_PORTRAIT_HEIGHT),
      },
    };
  }

  const preferred = PORTRAIT_HEIGHT_BASE + Math.max(0, fieldCount) * PORTRAIT_HEIGHT_PER_FIELD;
  const fraction = Math.min(PORTRAIT_MAX_FRACTION, Math.max(PORTRAIT_MIN_FRACTION, preferred));
  const panelHeight = Math.round(screen.height * fraction);

  return {
    landscape: false,
    panelWidth: null,
    panelHeight,
    mapViewport: { width: screen.width, height: Math.max(0, screen.height - panelHeight) },
  };
}
