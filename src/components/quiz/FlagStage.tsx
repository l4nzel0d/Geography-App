import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { CountryFlag } from '@/components/CountryFlag';
import { FLAG_SIZES, type FlagSize } from '@/components/flagSizes';

import { quizColors, quizRadii } from '../palette';

type FlagStageProps = {
  /** The flag emoji from `countryFacts.json`. Every quiz country has one. */
  flag: string | null;
  /**
   * The on-screen keyboard is up, so the flag stands down to make room.
   *
   * See `FLAG_STAGE_MIN_HEIGHT` below for why this is not simply letting it shrink.
   */
  compact: boolean;
};

/**
 * The question, in a `flag` round: a country's flag and nothing else.
 *
 * ## Nothing here names the country, at any point
 *
 * Not before the answer is checked, for the obvious reason, and **not after it either** -
 * which matches `facts` mode exactly. There, a round that asks only for the capital
 * reveals `Answer: Kathmandu` and never says the word Nepal; the same is true here. The
 * player asked to be quizzed on capitals, and the panel answers the question that was
 * put. Adding a name the round never asked for would make this mode quietly different
 * from the one it is a copy of.
 *
 * That is also why `CountryFlag` gets an explicit `label`. Its default names the ISO-2
 * code, which on the web path becomes `alt="Flag of NP"` - the answer, handed to a screen
 * reader or a find-in-page without being asked for.
 *
 * ## Ordinary conditional rendering is correct in here
 *
 * A `flag` round mounts **no MapLibre surface at all** - `MODE_USES_MAP` says so, and
 * `play.tsx` decides it from a `config` that is parsed once, so it cannot flip mid-round.
 * That puts this component in the same position as `/search` and `/quiz`, where the
 * always-mounted discipline of `AnswerField` and `ChipInput` simply does not apply. Those
 * exist only where a view shares a window with a live map surface. See CLAUDE.md.
 */
export function FlagStage({ flag, compact }: FlagStageProps) {
  const size: FlagSize = compact ? 'md' : 'lg';

  return (
    /**
     * Tapping the stage dismisses the keyboard, which is how the player gets the full
     * size flag back. `QuizPanel`'s body already sets `keyboardShouldPersistTaps`, so
     * this does not fight anything there.
     */
    <Pressable
      testID="quiz-flag-stage"
      onPress={Keyboard.dismiss}
      accessibilityRole="image"
      accessibilityLabel="The country's flag"
      style={[styles.stage, compact && styles.stageCompact]}
    >
      {/*
        A plaque, rather than the flag floating on the ocean colour.

        Not decoration: Japan, Finland, Nigeria and a dozen others are mostly white, and
        against the screen's navy they read as a shapeless blob with no edge. The web path
        already solves this at small sizes with a hairline ring around its `<img>`; this
        is the same idea at a size where a ring alone is too thin to frame anything.
      */}
      <View style={styles.plaque}>
        {/*
          The box is pinned rather than left to the flag, for two reasons.

          It is tall enough to hold the whole line box, so nothing can clip the glyph -
          Android will happily cut a flag off at the bottom when the glyph is drawn
          larger than its own metrics claim, which is exactly what happened here.

          And it is a fixed number rather than whatever the platform produces, because an
          emoji occupies its font's line box while the web `<img>` occupies exactly
          `FLAG_SIZES.height`. Left alone those disagree by ~39 dp at this size, which is
          a stage that lays out one way on Android and another on Windows.
        */}
        <View style={{ height: FLAG_BOX[size], justifyContent: 'center' }}>
          <CountryFlag
            flag={flag}
            size={size}
            label="The country's flag"
            nudge={GLYPH_NUDGE}
          />
        </View>
      </View>
    </Pressable>
  );
}

/**
 * How far to lift the glyph off the floor of its box, as a fraction of the font size.
 *
 * Measured on Android from a 120 dp flag: the glyph's middle sat ~16 dp below the middle
 * of its container, which is 0.13. Proportional, so the one number serves both sizes the
 * stage uses - and it is the number to turn if the flag ever looks high or low, since
 * nothing else here depends on it. See `CountryFlag`'s `nudge`.
 */
const GLYPH_NUDGE = 0.13;

/**
 * The plaque's inner box per size - see the note at the call site.
 *
 * Sized from the LINE box rather than from `FLAG_SIZES.height`, so the glyph always has
 * room and can never be clipped. It makes the plaque taller than the flag it frames,
 * which is the deliberate trade: a roomy card that always draws the whole flag beats a
 * tight one that sometimes shaves the bottom off it.
 */
const FLAG_BOX: Record<'lg' | 'md', number> = {
  lg: Math.round(FLAG_SIZES.lg.fontSize * 1.5),
  md: Math.round(FLAG_SIZES.md.fontSize * 1.5),
};

const PLAQUE_PADDING = 8;

/**
 * The floor the stage will not shrink past, and why it has one at all.
 *
 * In `facts` mode the map is `flex: 1` and simply absorbs whatever the keyboard takes -
 * a smaller map is still a map. A flag cannot do that: measured on a 411x914 dp screen,
 * a five-field round with the IME open leaves the stage a fair share of **60 dp**, which
 * would clip the flag to a stripe.
 *
 * So the stage keeps a floor and the panel gives way instead - it already has
 * `flexShrink: 1` and its body already scrolls, and you have to be able to see the flag
 * to answer it. Paired with the `compact` size swap, the floor while typing is *below*
 * the map's own 96 dp, so a flag round never leaves the panel less room than the facts
 * round it is copied from.
 */
export const FLAG_STAGE_MIN_HEIGHT = FLAG_BOX.lg + PLAQUE_PADDING * 2;
const FLAG_STAGE_COMPACT_MIN_HEIGHT = FLAG_BOX.md + PLAQUE_PADDING * 2;

const styles = StyleSheet.create({
  stage: {
    // The map's own shape, so the screen's flex arithmetic is unchanged by the swap.
    flex: 1,
    minHeight: FLAG_STAGE_MIN_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  stageCompact: { minHeight: FLAG_STAGE_COMPACT_MIN_HEIGHT },
  plaque: {
    backgroundColor: quizColors.surfaceRaised,
    borderRadius: quizRadii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
    paddingHorizontal: PLAQUE_PADDING + 4,
    paddingVertical: PLAQUE_PADDING,
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
