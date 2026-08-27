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
    expect(getQuizPanelLayout(PORTRAIT, 0, 'locate').panelHeight).toBeNull();
  });

  it('still leaves the camera a viewport to fit a country into', () => {
    // An estimate, and the only consumer of LOCATE_PORTRAIT_HEIGHT - see the note there.
    expect(getQuizPanelLayout(PORTRAIT, 0, 'locate').mapViewport).toEqual({
      width: PORTRAIT.width,
      height: PORTRAIT.height - LOCATE_PORTRAIT_HEIGHT,
    });
  });

  it('gives the map more room than a facts round does', () => {
    expect(getQuizPanelLayout(PORTRAIT, 0, 'locate').mapViewport.height).toBeGreaterThan(
      getQuizPanelLayout(PORTRAIT, 1).mapViewport.height,
    );
  });

  it('is left alone in landscape, where the panel is a width', () => {
    // The gap this fixes is a portrait one; landscape docks the panel to the side and
    // stretches it, which it should keep doing.
    expect(getQuizPanelLayout(LANDSCAPE, 0, 'locate')).toEqual(getQuizPanelLayout(LANDSCAPE, 0));
  });

  it('ignores the field count entirely', () => {
    // A locate round carries whatever fields the player had ticked for facts mode, and
    // none of them may reach the layout.
    expect(getQuizPanelLayout(PORTRAIT, 5, 'locate')).toEqual(
      getQuizPanelLayout(PORTRAIT, 0, 'locate'),
    );
  });
});

describe('a flag round', () => {
  /**
   * The highest-value test in this file, and the one worth reading the reason for.
   *
   * A flag round has no map either, so folding it in with `locate` looks like the tidy
   * move. It is not: `QuizPanel`'s body `ScrollView` resolves its own `flex: 1` against
   * the slot, so given the locate branch's auto height every answer field collapses to
   * nothing - which looks exactly like the fields failing to render.
   */
  it('splits the screen exactly as a facts round does', () => {
    expect(getQuizPanelLayout(PORTRAIT, 3, 'flag')).toEqual(getQuizPanelLayout(PORTRAIT, 3));
    expect(getQuizPanelLayout(PORTRAIT, 3, 'flag').panelHeight).toEqual(expect.any(Number));
  });

  it('grows the panel with the field count, which a locate round ignores', () => {
    expect(getQuizPanelLayout(PORTRAIT, 5, 'flag').panelHeight!).toBeGreaterThan(
      getQuizPanelLayout(PORTRAIT, 1, 'flag').panelHeight!,
    );
  });

  it('is left alone in landscape', () => {
    expect(getQuizPanelLayout(LANDSCAPE, 3, 'flag')).toEqual(getQuizPanelLayout(LANDSCAPE, 3));
  });
});

describe('a choice round', () => {
  /**
   * Four full-width buttons per field where a typed round has one input.
   *
   * It still takes the `facts` branch, and that is the trap the flag round already
   * documents above: a definite `panelHeight` is what `QuizPanel`'s body `ScrollView`
   * resolves its `flex: 1` against, and the buttons collapse without one just as the
   * inputs do.
   */
  it('gives the panel more room than the same round typed', () => {
    expect(getQuizPanelLayout(PORTRAIT, 2, 'facts', true).panelHeight!).toBeGreaterThan(
      getQuizPanelLayout(PORTRAIT, 2, 'facts', false).panelHeight!,
    );
  });

  it('still hands the panel a definite height', () => {
    expect(getQuizPanelLayout(PORTRAIT, 2, 'facts', true).panelHeight).toEqual(expect.any(Number));
    expect(getQuizPanelLayout(PORTRAIT, 4, 'flag', true).panelHeight).toEqual(expect.any(Number));
  });

  it('still leaves the map its share, however many fields there are', () => {
    const layout = getQuizPanelLayout(PORTRAIT, 4, 'facts', true);

    expect(layout.panelHeight! / PORTRAIT.height).toBeLessThanOrEqual(PORTRAIT_MAX_FRACTION);
    expect(layout.mapViewport.height).toBe(PORTRAIT.height - layout.panelHeight!);
  });

  it('changes nothing about a typed round', () => {
    // The default has to reproduce today's numbers exactly, or every existing pinned
    // layout moves for a feature that is switched off.
    expect(getQuizPanelLayout(PORTRAIT, 3, 'facts', false)).toEqual(
      getQuizPanelLayout(PORTRAIT, 3, 'facts'),
    );
    expect(getQuizPanelLayout(LANDSCAPE, 3, 'facts', true)).toEqual(
      getQuizPanelLayout(LANDSCAPE, 3, 'facts'),
    );
  });

  it('is ignored by a locate round, which has no fields to offer buttons for', () => {
    expect(getQuizPanelLayout(PORTRAIT, 3, 'locate', true)).toEqual(
      getQuizPanelLayout(PORTRAIT, 3, 'locate'),
    );
  });
});
