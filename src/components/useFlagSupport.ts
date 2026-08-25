/**
 * Whether this platform draws country flag emoji. Native answer: always yes.
 *
 * Android composes regional indicator pairs into flags through Noto Color Emoji, as do
 * iOS and macOS, so there is nothing to detect and nothing to fall back to. A plain
 * constant keeps the native render path byte-identical to what it has always been - no
 * state, no effect, no extra render.
 *
 * The web build resolves `useFlagSupport.web.ts` instead, where the answer is genuinely
 * in doubt. See `flagEmoji.ts` for why.
 */
export function useFlagSupport(): boolean {
  return true;
}
