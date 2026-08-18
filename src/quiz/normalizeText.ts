/**
 * Reducing a typed answer to something comparable.
 *
 * Grading is deliberately forgiving: someone who knows the capital of Ivory Coast
 * should not lose the point to an accent they cannot type on a phone keyboard, or to a
 * hyphen the dataset happens to use.
 */

/**
 * Combining marks, spelled out rather than written `\p{Diacritic}`.
 *
 * Unicode property escapes are the sort of thing that works on Node and then is missing
 * or subtly different on Hermes, and this runs on both.
 */
const COMBINING_MARKS = /[̀-ͯ]/g;

/** Everything a player might type that carries no meaning: 'Cote d'Ivoire' -> 'cote divoire'. */
const PUNCTUATION = /[.,'’`´\-–—()[\]/\\!?;:"“”]/g;

const LEADING_ARTICLE = /^the\s+/;

/**
 * Drop a leading "the".
 *
 * "The Gambia" and "The Bahamas" are the dataset's own names, and nobody types the
 * article when asked for a country. Exported because the same rule has to be applied to
 * the expected answer, not just the guess.
 */
export function stripLeadingArticle(input: string): string {
  return input.replace(LEADING_ARTICLE, '');
}

export function normalizeText(input: string): string {
  const decomposed =
    // `normalize` is standard, but guard it anyway: if a runtime ever lacks it, degrade
    // to case- and punctuation-insensitive rather than throwing mid-quiz. Accented
    // answers still pass through `altSpellings`, which carries unaccented variants.
    typeof input.normalize === 'function' ? input.normalize('NFD') : input;

  const cleaned = decomposed
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bst\.?\s/g, 'saint ')
    .replace(PUNCTUATION, '')
    .replace(/\s+/g, ' ')
    .trim();

  return stripLeadingArticle(cleaned);
}
