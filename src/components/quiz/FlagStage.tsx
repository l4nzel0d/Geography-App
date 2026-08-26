import { Keyboard, Pressable, StyleSheet, View } from 'react-native';

import { CountryFlag } from '@/components/CountryFlag';

import { quizColors, quizRadii } from '../palette';
import { useTranslator } from '@/i18n/useTranslator';

type FlagStageProps = {
  /** The flag emoji from `countryFacts.json`. Every quiz country has one. */
  flag: string | null;
  /**
   * The on-screen keyboard is up, so the stage may give up more of its room.
   *
   * It no longer changes the flag's SIZE - the flag is responsive and shrinks with its
   * box on its own. All this does is lower the floor the stage refuses to go below.
   */
  compact: boolean;
};

/**
 * Every `flag-icons` SVG is 4:3, so the frame is too and the flag fills it exactly.
 */
const FLAG_ASPECT = 4 / 3;

/**
 * How wide the flag is allowed to get.
 *
 * On a phone the stage is narrower than this and the cap never binds, which is the point:
 * the flag runs the full width it is given. It exists for a desktop browser, where the
 * stage can be 900 dp across and a flag that wide stops reading as a flag and starts
 * reading as wallpaper.
 */
const FLAG_MAX_WIDTH = 460;

/**
 * The floor the stage will not shrink past, and why it has one at all.
 *
 * In `facts` mode the map is `flex: 1` and simply absorbs whatever the keyboard takes - a
 * smaller map is still a map. The flag can absorb it too, now that it is responsive, but
 * only down to a point: measured on a 411x914 dp screen, a five-field round with the IME
 * open leaves the stage a fair share of **60 dp**, at which the flag is a stripe.
 *
 * So the stage keeps a floor and the panel gives way instead - it already has
 * `flexShrink: 1` and its body already scrolls, and you have to see the flag to answer.
 * The compact floor sits *below* the map's own 96 dp, so a flag round never leaves the
 * panel less room than the facts round it is copied from.
 */
export const FLAG_STAGE_MIN_HEIGHT = 132;
const FLAG_STAGE_COMPACT_MIN_HEIGHT = 84;

/**
 * The question, in a `flag` round: a country's flag and nothing else.
 *
 * ## The flag is sized by its box, not by a number
 *
 * It runs the full width of the stage, keeps 4:3, and shrinks when the height is the
 * binding constraint instead - so it is as big as the room allows on a phone, on a
 * tablet, in landscape, and while the keyboard is up. **That is only possible because the
 * flag is an image.** It used to be an emoji, whose only size control is a font size, and
 * every attempt to make one large ran into a different property of glyph layout: not
 * centred in its line box, clipped when drawn taller than it, clipped again by the
 * transform that tried to correct the first two. See `CountryFlag` for the whole list.
 *
 * ## Nothing here names the country, at any point
 *
 * Not before the answer is checked, for the obvious reason, and **not after it either** -
 * which matches `facts` mode exactly. There, a round that asks only for the capital
 * reveals `Answer: Kathmandu` and never says the word Nepal. The player asked to be
 * quizzed on capitals, and the panel answers the question that was put; adding a name the
 * round never asked for would make this mode quietly different from the one it copies.
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
  const t = useTranslator();

  return (
    /**
     * Tapping the stage dismisses the keyboard, which is how the player gets the room
     * back. `QuizPanel`'s body already sets `keyboardShouldPersistTaps`, so this does not
     * fight anything there.
     */
    <Pressable
      testID="quiz-flag-stage"
      onPress={Keyboard.dismiss}
      accessibilityRole="image"
      accessibilityLabel={t('quiz.flag.a11y')}
      style={[styles.stage, compact && styles.stageCompact]}
    >
      {/*
        A frame, rather than the flag floating on the ocean colour.

        Not decoration: Japan, Finland, Nigeria and a dozen others are mostly white, and
        against the screen's navy they read as a shapeless blob with no edge.

        It carries no padding on purpose. The aspect ratio has to describe the FLAG, and
        padding inside an `aspectRatio` box would make the picture some other shape.
      */}
      <View style={styles.frame}>
        <CountryFlag flag={flag} fill label={t('quiz.flag.a11y')} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stage: {
    // The map's own shape, so the screen's flex arithmetic is unchanged by the swap.
    flex: 1,
    minHeight: FLAG_STAGE_MIN_HEIGHT,
    // `stretch`, so the frame's `width: '100%'` has something to be 100% of.
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  stageCompact: { minHeight: FLAG_STAGE_COMPACT_MIN_HEIGHT },
  frame: {
    /**
     * Width-first, height-capped: take the full width, derive the height from the aspect
     * ratio, and give way on both when the stage is shorter than that implies. `maxHeight`
     * is what makes a landscape round work, where the stage is wide and short.
     */
    width: '100%',
    maxWidth: FLAG_MAX_WIDTH,
    maxHeight: '100%',
    aspectRatio: FLAG_ASPECT,
    // Re-centres once `maxWidth` binds, since the stage stretches its children.
    alignSelf: 'center',
    backgroundColor: quizColors.surfaceRaised,
    borderRadius: quizRadii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
    // Rounds the flag's own corners with the frame's. Safe here, and only here: the thing
    // being clipped is an image that occupies exactly this box, not a glyph that hangs
    // out of its own line box.
    overflow: 'hidden',
  },
});
