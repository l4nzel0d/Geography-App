/**
 * Escape-to-dismiss. Native answer: there is no Escape key, so this does nothing.
 *
 * Android already has a back gesture and a close button, and adding a keyboard listener
 * on a platform with no keyboard would be pure cost. The web build resolves
 * `useDismissKey.web.ts`, where Escape is what people actually press to close a panel.
 */
export function useDismissKey(_onDismiss: () => void, _enabled = true): void {
  // Intentionally empty. See the web sibling.
}
