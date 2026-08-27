import {
  decodeSetupPrefs,
  encodeSetupPrefs,
  type QuizSetupPrefs,
  SETUP_PREFS_KEY,
} from './setupPrefs';

/**
 * The same two functions, backed by `localStorage` rather than AsyncStorage.
 *
 * **This takes the `masteryStorage.web.ts` shape, NOT `localeStorage.web.ts`'s**, and the
 * difference matters enough to write down. The locale's web sibling is a deliberate no-op,
 * because on the web the language is a property of the deployment - `/` versus `/ru` - so
 * there is nothing for it to remember. A quiz setup is not a property of the deployment: a
 * player on the web wants their mode and regions remembered exactly as a player on a phone
 * does. Copying the no-op here would leave the feature silently dead on one platform.
 *
 * So this is a real implementation, and it **guards for the absence of a window**, which
 * AsyncStorage 2.2.0's own web path does not. `web.output: "static"` renders every route in
 * Node during the export, where there is no window at all.
 *
 * Both functions stay `async` so the two platforms present an identical signature and the
 * store never has to know which one it got.
 */

function storage(): Storage | null {
  // `typeof window` rather than a Platform check: this file IS the platform branch, and the
  // guard is about the static-render pass, not about which OS is running.
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage ?? null;
  } catch {
    // Private-mode Safari and blocked third-party storage both throw on access.
    return null;
  }
}

export async function loadSetupPrefs(): Promise<Partial<QuizSetupPrefs>> {
  try {
    return decodeSetupPrefs(storage()?.getItem(SETUP_PREFS_KEY) ?? null);
  } catch {
    return {};
  }
}

export async function saveSetupPrefs(prefs: QuizSetupPrefs): Promise<void> {
  try {
    storage()?.setItem(SETUP_PREFS_KEY, encodeSetupPrefs(prefs));
  } catch {
    // Quota exceeded, or storage disabled. Same reasoning as the native sibling.
  }
}
