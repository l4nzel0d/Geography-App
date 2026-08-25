/**
 * How the quiz screen splits between the map and the panel.
 *
 * The interesting case is `locate`, whose panel is content-height in portrait. That is
 * expressed as a NULL panel height - the play screen spreads it as
 * `height: panelHeight ?? undefined` - and it is easy to "tidy" back into a number,
 * which is what puts the Check button at the foot of a facts-sized box again.
 */
import {
  getQuizPanelLayout,
  LOCATE_PORTRAIT_HEIGHT,
  PORTRAIT_MAX_FRACTION,
  PORTRAIT_MIN_FRACTION,
} from '@/quiz/quizPanelLayout';

const PORTRAIT = { width: 411, height: 914 };
const LANDSCAPE = { width: 914, height: 411 };

describe('a facts round', () => {
  it('gives the panel a share of the height that grows with the field count', () => {
    const one = getQuizPanelLayout(PORTRAIT, 1).panelHeight!;
    const four = getQuizPanelLayout(PORTRAIT, 4).panelHeight!;

    expect(four).toBeGreaterThan(one);
    expect(one / PORTRAIT.height).toBeGreaterThanOrEqual(PORTRAIT_MIN_FRACTION);
    expect(four / PORTRAIT.height).toBeLessThanOrEqual(PORTRAIT_MAX_FRACTION);
  });

  it('leaves the rest to the map', () => {
    const layout = getQuizPanelLayout(PORTRAIT, 2);
    expect(layout.mapViewport.height).toBe(PORTRAIT.height - layout.panelHeight!);
  });
});

describe('a locate round', () => {
  it('asks for no explicit panel height in portrait', () => {
    // Null, not a small number: the panel is exactly as tall as its content, so the
    // button sits under the last line on every screen size rather than being pushed to
    // the bottom of a box sized for answer fields that do not exist.
    expect(getQuizPanelLayout(PORTRAIT, 0, true).panelHeight).toBeNull();
  });

  it('still leaves the camera a viewport to fit a country into', () => {
    // An estimate, and the only consumer of LOCATE_PORTRAIT_HEIGHT - see the note there.
    expect(getQuizPanelLayout(PORTRAIT, 0, true).mapViewport).toEqual({
      width: PORTRAIT.width,
      height: PORTRAIT.height - LOCATE_PORTRAIT_HEIGHT,
    });
  });

  it('gives the map more room than a facts round does', () => {
    expect(getQuizPanelLayout(PORTRAIT, 0, true).mapViewport.height).toBeGreaterThan(
      getQuizPanelLayout(PORTRAIT, 1).mapViewport.height,
    );
  });

  it('is left alone in landscape, where the panel is a width', () => {
    // The gap this fixes is a portrait one; landscape docks the panel to the side and
    // stretches it, which it should keep doing.
    expect(getQuizPanelLayout(LANDSCAPE, 0, true)).toEqual(getQuizPanelLayout(LANDSCAPE, 0));
  });

  it('ignores the field count entirely', () => {
    // A locate round carries whatever fields the player had ticked for facts mode, and
    // none of them may reach the layout.
    expect(getQuizPanelLayout(PORTRAIT, 5, true)).toEqual(getQuizPanelLayout(PORTRAIT, 0, true));
  });
});
