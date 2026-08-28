/**
 * The country's flag, full size, over a dimmed screen. Tap anywhere outside it to dismiss.
 *
 * The info card draws the flag 30 dp tall off the 96 px thumb tier, which is right for a
 * header row and useless for actually looking at a flag. The app already ships ~1024 px
 * masters and, until this, only the quiz's flag round ever drew one. This is the second
 * consumer, and it reaches them the same way: `CountryFlag`'s `fill` prop, which is what
 * picks `FLAG_ASSETS` over `FLAG_THUMBS`.
 *
 * ## Why a `Modal`, and why the backdrop is not blurred
 *
 * Same structural reason as `ConfirmDialog`, whose header comment has the long version:
 * this has to cover a live MapLibre surface and appear on demand, and a view inserted
 * above that surface after the first mount lays out perfectly and paints nothing at all.
 * `Modal` sidesteps it rather than working around it - RN's Android backend hosts it in
 * its own `Dialog` window, which the system composites over the app's.
 *
 * That is also exactly why the backdrop is a flat scrim rather than a blur. A `BlurView`
 * blurs what is behind it **in its own window**, and the map is not in this one - there is
 * nothing behind this to blur. Cross-window blur on Android is `setBackgroundBlurRadius`,
 * which most devices report as unsupported. Getting a real blur would mean giving up the
 * Modal for an in-tree overlay above the map, which is the bug above. So: a heavy scrim,
 * no new dependency, and no native rebuild.
 *
 * The corollary from `ConfirmDialog` holds here too - ordinary conditional rendering is
 * correct inside a Modal, because it does not share the map's window.
 */
import { Modal, Pressable, StyleSheet } from 'react-native';

import { CountryFlag } from './CountryFlag';
import { DEFAULT_FLAG_ASPECT, FLAG_ASPECTS } from './flagAspects';
import { flagLetters } from './flagEmoji';
import { quizColors, quizRadii } from './palette';
import { useTranslator } from '@/i18n/useTranslator';

/**
 * How wide the flag is allowed to get.
 *
 * On a phone the scrim is narrower than this and the cap never binds. It exists for a
 * desktop browser, where a flag as wide as the window stops reading as a flag - the same
 * judgement `FlagStage` makes, one step larger because this one has the whole screen
 * rather than a stage above a quiz panel.
 */
const LIGHTBOX_MAX_WIDTH = 560;

/**
 * The shape of the frame is the shape of THIS flag - Qatar is 28:11, Nepal is a pennant,
 * the Vatican is square. `FLAG_ASPECTS` is generated beside the images themselves, so the
 * frame and the picture in it cannot disagree. Same helper as `FlagStage`'s; three lines,
 * kept local rather than exported out of a quiz component.
 */
function flagAspect(flag: string | null): number {
  const letters = flagLetters(flag);
  return (letters && FLAG_ASPECTS[letters.toLowerCase()]) || DEFAULT_FLAG_ASPECT;
}

type FlagLightboxProps = {
  visible: boolean;
  /** The regional indicator pair from `countryFacts.json`. */
  flag: string | null;
  /** The country, named in the enlarged image's accessibility label. */
  name: string;
  /** The scrim, and Android's back button while the flag is up. */
  onDismiss: () => void;
};

export function FlagLightbox({ visible, flag, name, onDismiss }: FlagLightboxProps) {
  const t = useTranslator();

  return (
    <Modal
      testID="flag-lightbox"
      visible={visible}
      transparent
      animationType="fade"
      // The Modal holds window focus, so Android's back key never reaches the screen
      // underneath. Without this the flag would be closable only by tapping the scrim.
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      {/*
        The scrim is the dismiss target, and here it is the ONLY one - there is no button
        anywhere on this screen. So unlike `ConfirmDialog`'s scrim it carries the button
        role and a label: that file leaves the role off because its action buttons are
        descendants of the scrim, and react-native-web turns the role into a real
        `<button>`, which produced nested ones. Nothing here is a button, so the role is
        free, and without it a screen reader has no announced way out on the web.
      */}
      <Pressable
        testID="flag-lightbox-scrim"
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel={t('info.flag.close')}
        style={styles.scrim}
      >
        {/*
          Swallows the press, so a tap ON the flag does not dismiss it - only a tap outside
          does. `onPress` with an empty body is the whole point; nothing is missing here.
        */}
        <Pressable
          testID="flag-lightbox-frame"
          onPress={() => {}}
          style={[styles.frame, { aspectRatio: flagAspect(flag) }]}
        >
          <CountryFlag flag={flag} fill label={t('info.flag.large', { name })} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    // Heavier than `ConfirmDialog`'s 0.66. There is no card here to separate from the map -
    // the flag itself has to, and half of them carry large fields of white or pale colour.
    backgroundColor: 'rgba(4, 12, 20, 0.82)',
  },
  frame: {
    /**
     * Width-first, height-capped, exactly as `FlagStage`'s frame: take the width the scrim
     * allows, derive the height from the flag's own ratio, and give up width instead once
     * the height is the binding constraint. `maxHeight` is what makes landscape work, and
     * in portrait it binds for Nepal - the only flag in the set taller than it is wide.
     *
     * No padding, deliberately: padding inside an `aspectRatio` box would make the picture
     * some other shape.
     */
    width: '100%',
    maxWidth: LIGHTBOX_MAX_WIDTH,
    maxHeight: '80%',
    alignSelf: 'center',
    backgroundColor: quizColors.surfaceRaised,
    borderRadius: quizRadii.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
    /*
      No `elevation`. `ConfirmDialog`'s card carries 12, and copying it here was wrong: that
      card is navy on navy and needs the lift to separate, whereas this sits on a scrim dark
      enough that the shadow has nothing to do but smear a grey halo around the picture -
      and Android draws that halo OUTSIDE the rounded box, so it reads as a printing fault
      on the flag rather than as depth. The hairline border is the separation here.
    */
    // Rounds the flag's own corners with the frame's. Safe here, and only where the thing
    // being clipped is an image that occupies exactly this box rather than a glyph.
    overflow: 'hidden',
  },
});
