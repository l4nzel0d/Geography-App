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
 * Nothing is retained between one notification and the next, so a back gesture cannot
 * resurrect an old pick - with one deliberate exception, below.
 */
type Listener = (iso3: string) => void;

const listeners = new Set<Listener>();

/**
 * A pick announced while nothing was listening, held for the next subscriber.
 *
 * Normally the map IS mounted - `/search` is pushed over it - and this stays null. The
 * exception is a **deep link**: on the web every route is a real URL, so `/search` can be
 * opened directly, and leaving it then goes `replace('/')` rather than `back()` (see
 * `navigation/goBack.ts`). That mounts MapScreen fresh, AFTER the pick was announced, so
 * a purely synchronous handover would deliver the country to nobody and land the user on
 * an empty map having just chosen one.
 *
 * **Consumed once and cleared**, like `quizResultStore`, which is what keeps the "cannot
 * resurrect an old pick" property above true: a back gesture finds it already spent.
 */
let pending: string | null = null;

/** Announce that the user picked a country. The caller navigates; this does not. */
export function selectCountry(iso3: string): void {
  if (listeners.size === 0) {
    pending = iso3;
    return;
  }

  for (const listener of [...listeners]) listener(iso3);
}

/** Returns an unsubscribe function, shaped for a bare `useEffect` return. */
export function subscribeToCountrySelection(listener: Listener): () => void {
  listeners.add(listener);

  if (pending !== null) {
    const iso3 = pending;
    pending = null;
    listener(iso3);
  }

  return () => {
    listeners.delete(listener);
  };
}
