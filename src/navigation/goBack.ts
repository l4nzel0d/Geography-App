/**
 * Leave the current screen, without stranding a visitor who arrived directly.
 *
 * `router.back()` assumes there is something behind. On native there always is - every
 * screen here is reached by pushing from the map. **On the web there often is not:**
 * `web.output: "static"` exports a real HTML file per route, so `/search`, `/quiz` and
 * `/quiz/play` are all URLs someone can bookmark, share or open in a new tab. Landing on
 * one of those and pressing Back or picking a result called `router.back()` against an
 * empty history and simply did nothing - the screen sat there, unresponsive, with no way
 * out but the browser's own back button.
 *
 * Falling back to `replace` rather than `push` keeps the history sane: the dead-end
 * screen should not remain behind the map for Back to land on again.
 *
 * `quiz/results.tsx` already guarded its own back for the same reason; this is that idea
 * extracted so every exit shares it.
 */
import { router } from 'expo-router';

/** Where to land when there is no history to go back to. The map is always home. */
const HOME = '/' as const;

export function goBack(): void {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(HOME);
}
