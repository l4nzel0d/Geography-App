/**
 * The quiz's seeded randomness, in one module.
 *
 * Extracted from `quizBuilder` when `quizOptions` needed the same shuffle: the builder
 * calls the options module and the options module needs to shuffle, which as a direct
 * import would be a cycle. `quizBuilder` re-exports both names, so nothing that already
 * imported them from there had to move.
 */

/**
 * mulberry32: 32-bit, seedable, no dependency, and identical on every JS engine - which
 * matters because Jest runs on Node and the quiz runs on Hermes.
 */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates, non-mutating, with every random draw coming from `rng`. */
export function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
