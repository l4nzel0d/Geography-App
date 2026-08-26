import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { quizColors, quizRadii } from './palette';

/**
 * A confirmation card in the app's own colours, over a dimmed screen.
 *
 * ## Why a `Modal` and not a view in the screen's tree
 *
 * This is the paint bug from CLAUDE.md, and the answer is structural rather than a style
 * that happens to work. `/quiz/play` has a live MapLibre surface in it, and a view
 * inserted ABOVE that surface after the first mount lays out with entirely correct bounds
 * and paints nothing at all - which is why the quiz panel is a flex sibling of the map and
 * why the choropleth legend is mounted from startup and merely parked off-screen.
 *
 * A dialog cannot be either of those: it has to cover the map, and it has to appear on
 * demand. `Modal` sidesteps the whole question because it is not in that window - RN's
 * Android backend hosts it in a separate `Dialog` with its own window, which the system
 * composites over the app's. That is the same reason the native `Alert` this replaced was
 * safe, and it is the reason to reach for `Modal` here rather than an always-mounted
 * absolute overlay: nothing is ever added above the map surface, so the bug is unreachable
 * instead of avoided.
 *
 * The corollary is that ordinary conditional rendering is correct inside here, exactly as
 * it is on `/search` - the always-mounted slots elsewhere are a workaround for a window
 * this component does not share.
 *
 * ## Buttons
 *
 * Stacked and full width rather than a row: three actions do not fit side by side at
 * 411dp once one of them is "Discard and leave", and a stack lets the labels stay verbs
 * instead of shrinking to "End"/"Quit".
 */
export type ConfirmDialogButton<Id extends string> = {
  id: Id;
  label: string;
  style: 'primary' | 'destructive' | 'quiet';
};

type ConfirmDialogProps<Id extends string> = {
  visible: boolean;
  title: string;
  message: string;
  buttons: ConfirmDialogButton<Id>[];
  /** The scrim, and Android's back button while the dialog is up. */
  onDismiss: () => void;
  onPress: (id: Id) => void;
  testID?: string;
};

export function ConfirmDialog<Id extends string>({
  visible,
  title,
  message,
  buttons,
  onDismiss,
  onPress,
  testID = 'confirm-dialog',
}: ConfirmDialogProps<Id>) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Android's back button while the dialog is up. The dialog holds window focus, so
      // the key never reaches the screen's own BackHandler - without this, back would do
      // nothing at all and the card would be unclosable except by its buttons.
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      {/*
        The scrim is the dismiss target. `Pressable` rather than a bare View so a tap
        outside the card means cancel, which is what a dimmed backdrop looks like it does.

        **It must NOT carry `accessibilityRole="button"`.** react-native-web maps that role
        onto a real `<button>` element (`propsToAccessibilityComponent`), and the card's own
        action buttons are descendants of this one - so the role produced nested `<button>`s,
        which is invalid HTML that React reports as an error and a browser is free to
        restructure around. The role bought nothing on native either: every prompt carries an
        explicit `cancel` button, and Android's back key reaches `onRequestClose`, so there
        are two labelled ways out without turning the whole backdrop into a control a screen
        reader announces.
      */}
      <Pressable testID={`${testID}-scrim`} style={styles.scrim} onPress={onDismiss}>
        {/*
          Swallows the press so a tap on the card itself does not dismiss it. `onPress`
          with an empty body is the whole point; there is nothing missing here.
        */}
        <Pressable testID={testID} style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.actions}>
            {buttons.map((button) => (
              <Pressable
                key={button.id}
                testID={`${testID}-${button.id}`}
                accessibilityRole="button"
                accessibilityLabel={button.label}
                onPress={() => onPress(button.id)}
                style={[
                  styles.button,
                  button.style === 'primary' && styles.buttonPrimary,
                  button.style === 'destructive' && styles.buttonDestructive,
                ]}
              >
                <Text
                  style={[
                    styles.buttonText,
                    button.style === 'primary' && styles.buttonTextPrimary,
                    button.style === 'destructive' && styles.buttonTextDestructive,
                  ]}
                >
                  {button.label}
                </Text>
              </Pressable>
            ))}
          </View>
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
    // Darker than a stock scrim: the map underneath is a saturated green or a deep red
    // choropleth, and at 0.4 the card's own navy did not separate from it.
    backgroundColor: 'rgba(4, 12, 20, 0.66)',
  },
  card: {
    width: '100%',
    // The panel radius rather than the card one: this is a full-width surface in its own
    // right, like the quiz panel, not a row inside one.
    maxWidth: 360,
    padding: 20,
    borderRadius: quizRadii.panel,
    backgroundColor: quizColors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.border,
    elevation: 12,
  },
  title: {
    color: quizColors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  message: {
    color: quizColors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  actions: {
    marginTop: 18,
    gap: 8,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: quizRadii.pill,
    alignItems: 'center',
    backgroundColor: quizColors.surfaceRaised,
  },
  // The same filled accent pill as the panel's Check/Next button, so the safe, expected
  // action looks the same everywhere in the quiz.
  buttonPrimary: {
    backgroundColor: quizColors.accent,
  },
  buttonDestructive: {
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: quizColors.wrong,
  },
  buttonText: {
    color: quizColors.textMuted,
    fontSize: 15,
    fontWeight: '600',
  },
  buttonTextPrimary: {
    color: quizColors.textInverted,
    fontWeight: '700',
  },
  buttonTextDestructive: {
    color: quizColors.wrong,
  },
});
