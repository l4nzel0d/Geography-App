import { decodeMastery, encodeMastery, MASTERY_KEY } from './masteryCodec';
import type { MasteryTable } from './masteryScore';

/**
 * The same two functions, backed by `localStorage` rather than AsyncStorage.
 *
 * This exists so the web bundle never imports the native module. AsyncStorage 2.2.0's own
 * web path is `window.localStorage` anyway - so this is not reimplementing anything, it is
 * skipping a dependency - but it also **guards for the absence of a window**, which that
 * path does not. `web.output: "static"` renders every route in Node during the export, and
 * CLAUDE.md records a single bad import there failing every route at once.
 *
 * Both functions stay `async` so the two platforms present an identical signature and the
 * store never has to know which one it got.
 */

function storage(): Storage | null {
  // `typeof window` rather than a Platform check: this file IS the platform branch, and
  // the guard is about the static-render pass, not about which OS is running.
  if (typeof window === 'undefined') return null;

  try {
    return window.localStorage ?? null;
  } catch {
    // Private-mode Safari and blocked third-party storage both throw on access.
    return null;
  }
}

export async function loadMastery(): Promise<MasteryTable> {
  try {
    return decodeMastery(storage()?.getItem(MASTERY_KEY) ?? null);
  } catch {
    return {};
  }
}

export async function saveMastery(table: MasteryTable): Promise<void> {
  try {
    storage()?.setItem(MASTERY_KEY, encodeMastery(table));
  } catch {
    // Quota exceeded, or storage disabled. Same reasoning as the native sibling.
  }
}
