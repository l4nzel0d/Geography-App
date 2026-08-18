/**
 * Typo tolerance.
 *
 * The budget is tight on purpose. Country names are full of near-collisions - Iran and
 * Iraq differ by one character, Zambia and Gambia by one, Niger and Nigeria by two -
 * and being generous here does not make the quiz friendlier, it makes it wrong.
 * `gradeAnswer` adds a second guard on top of this; see the confusable check there.
 */

/**
 * Optimal string alignment distance, bailing out at `max`.
 *
 * Levenshtein plus adjacent transposition, which is not a refinement so much as the
 * point: swapping two neighbouring letters is the commonest typing mistake there is, and
 * plain Levenshtein scores "Frnace" two edits from "France" - outside the budget for a
 * six-letter target, so a perfectly ordinary slip marks wrong.
 *
 * Returns `max + 1` rather than the true distance once it is certain the answer exceeds
 * the budget; callers only ever compare against a threshold.
 */
export function editDistance(a: string, b: string, max = Infinity): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Three rows, because a transposition looks back two.
  let twoBack = new Array<number>(b.length + 1);
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  let current = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    current[0] = i;
    let rowBest = current[0];

    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      let best = Math.min(current[j - 1] + 1, previous[j] + 1, substitution);

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, twoBack[j - 2] + 1);
      }

      current[j] = best;
      if (best < rowBest) rowBest = best;
    }

    // Every later row is at least this good, so nothing below the budget can appear.
    if (rowBest > max) return max + 1;

    [twoBack, previous, current] = [previous, current, twoBack];
  }

  return previous[b.length];
}

/**
 * How many edits a target of this length may forgive.
 *
 * Zero under five characters is what keeps Iran/Iraq, Chad/Chile and Mali/Male apart -
 * at those lengths a single edit is usually a different country rather than a slip.
 */
export function allowedEdits(targetLength: number): number {
  if (targetLength < 5) return 0;
  if (targetLength < 9) return 1;
  return 2;
}
