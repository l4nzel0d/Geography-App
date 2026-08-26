import type { QuestionResult } from '@/quiz/gradeAnswer';

import { mergeTables } from './masteryCodec';
import {
  applyResult,
  type MasteryTable,
  masteryScores,
  practiceScores,
} from './masteryScore';
import { loadMastery, saveMastery } from './masteryStorage';

/**
 * The mastery table at runtime, and how the map hears about it.
 *
 * A module singleton with subscribe/notify, modelled directly on `search/pendingCountry.ts`
 * - not a React context. `_layout.tsx` has no providers at all, and keeping it that way is
 * what lets `MapScreen.test.tsx` render the screen bare with no provider and no router
 * mock. It is also the pattern `allCountryFacts`, `worldGeoJson` and `quizResultStore`
 * already use.
 *
 * ## The load-bearing asymmetry: `recordResult` does NOT notify
 *
 * `/quiz/play` is **pushed** over `MapScreen`, so the explore map and its live MapLibre
 * surface stay mounted underneath for the whole round. Notifying on every answer would
 * re-fold the outlines and re-upload 1.6 MB of geometry to a backgrounded GL surface up to
 * 193 times in one round.
 *
 * So recording is cheap and silent: it updates the table in memory and schedules a write.
 * Only `publishMastery()` recomputes the scores, bumps the version, flushes the pending
 * write and tells anyone listening. The play screen calls it once, on unmount - which is
 * the single event that covers finishing, ending early, discarding and backing out.
 */

export type MasterySnapshot = {
  /**
   * ISO-3 -> mastery in [0, 1). A country that has never been asked is **absent**, not
   * zero - `withMastery` relies on that to leave the property off the feature entirely.
   */
  scores: Readonly<Record<string, number>>;
  /**
   * The same countries, discounted for how thin each record is - what `pickWeakSpots`
   * weighs, and deliberately NOT what the map paints.
   *
   * A country answered right once is 1 in `scores` and 0.5 here. That disagreement is the
   * design: the map reports what the evidence says, the sampler additionally cares how
   * much evidence there is. See `MASTERY_PRIOR`.
   */
  practiceScores: Readonly<Record<string, number>>;
  /** Bumped on every publish that changed something. What the map's `useMemo` keys off. */
  version: number;
};

/** Trailing-edge, so a burst of answers costs one write. */
const PERSIST_DEBOUNCE_MS = 2000;

let table: MasteryTable = {};
let snapshot: MasterySnapshot = { scores: {}, practiceScores: {}, version: 0 };

/** Set by `recordResult`, cleared by a publish or a flush. */
let dirty = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

type Listener = (snapshot: MasterySnapshot) => void;
const listeners = new Set<Listener>();

/**
 * The current scores.
 *
 * The returned object's identity changes **only** on a publish that changed something,
 * which is what makes it usable as a `useMemo` dependency in `MapScreen`.
 */
export function getMasterySnapshot(): MasterySnapshot {
  return snapshot;
}

/** Returns an unsubscribe function, shaped for a bare `useEffect` return. */
export function subscribeToMastery(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Note: `setTimeout` here is a write debounce, not a clock.
 *
 * The no-clock rule this feature was designed under is about the MODEL - no dates, no due
 * times, nothing time-dependent in what is stored or scored. Nothing here reads the time,
 * and `Date.now()` still appears nowhere in `src/`. The app already uses `setTimeout` for
 * `REVEAL_DELAY_MS`.
 */
function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void saveMastery(table);
  }, PERSIST_DEBOUNCE_MS);
}

function flushPersist(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  void saveMastery(table);
}

/**
 * Fold one graded question in. **Silent by design** - see the note at the top.
 *
 * Called from `check()` in `play.tsx`, which is guarded so it fires exactly once per
 * question. Recording in `next()` instead would lose the last checked answer whenever a
 * player checks the final question and then backs out.
 */
export function recordResult(result: QuestionResult): void {
  const next = applyResult(table, result);
  if (next === table) return;

  table = next;
  dirty = true;
  schedulePersist();
}

/** Recompute the snapshot and tell everyone. Does not touch storage. */
function notify(): void {
  snapshot = {
    scores: masteryScores(table),
    practiceScores: practiceScores(table),
    version: snapshot.version + 1,
  };
  for (const listener of [...listeners]) listener(snapshot);
}

/**
 * Recompute, persist and notify - the one place any of those three happen together.
 *
 * A no-op when nothing has been recorded since the last publish, so the StrictMode
 * double-mount and a round the player abandoned without answering both cost nothing.
 */
export function publishMastery(): void {
  if (!dirty) return;

  dirty = false;
  flushPersist();
  notify();
}

/**
 * Kicked off at module import, so the read starts on the app's first frame.
 *
 * `mergeTables`, not assignment: the read is async and an answer could land first. The map
 * renders against an empty table and re-folds once when this resolves.
 */
void loadMastery().then((stored) => {
  const merged = mergeTables(stored, table);
  const hadMemory = dirty;
  table = merged;

  if (Object.keys(table).length === 0) return;

  // Notify WITHOUT persisting. This is the first time the map has anything to draw, but
  // in the common case the table is byte-identical to what was just read - writing it
  // straight back would be a pointless round trip on every cold start. A pending write
  // is only flushed when something really was recorded before the read landed, which is
  // exactly what `mergeTables` exists to handle.
  if (hadMemory) {
    dirty = false;
    flushPersist();
  }

  notify();
});

/** Tests only. There is no user-facing reset yet. */
export function __resetMasteryStore(): void {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  table = {};
  snapshot = { scores: {}, practiceScores: {}, version: 0 };
  dirty = false;
  listeners.clear();
}
