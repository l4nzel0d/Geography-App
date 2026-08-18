/**
 * How a search result reaches the map behind it.
 *
 * `/search` is pushed over `MapScreen`, so the map stays mounted the whole time and must
 * simply be told what was picked. `router.back()` cannot carry params, and
 * `router.replace('/', { params })` would swap in a fresh `MapScreen` and with it a fresh
 * MapLibre surface - an expensive teardown to deliver one ISO-3 code.
 *
 * So: a module singleton, like `quizResultStore.ts`. Unlike that one this is a
 * SUBSCRIPTION rather than a slot that gets read on arrival, for two reasons:
 *
 *   - reading on arrival means `useFocusEffect`, which calls `useNavigation()` and so
 *     needs navigator context at render time. `QuizLaunchButton` documents that the map's
 *     chrome deliberately uses the imperative `router` singleton precisely so
 *     `MapScreen.test.tsx` can keep rendering the screen bare, with no router mock at
 *     all. Staying off the navigation hooks keeps that true.
 *   - it fires while the search screen is still sliding away, so the highlight and the
 *     camera fly have already started by the time the map is uncovered.
 *
 * There is no stored value to go stale: nothing is retained between a notification and
 * the next one, so a back gesture cannot resurrect an old pick.
 */
type Listener = (iso3: string) => void;

const listeners = new Set<Listener>();

/** Announce that the user picked a country. The caller navigates; this does not. */
export function selectCountry(iso3: string): void {
  for (const listener of [...listeners]) listener(iso3);
}

/** Returns an unsubscribe function, shaped for a bare `useEffect` return. */
export function subscribeToCountrySelection(listener: Listener): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
