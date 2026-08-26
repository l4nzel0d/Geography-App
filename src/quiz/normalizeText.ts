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

/**
 * Russian inflectional endings, longest first.
 *
 * Not a real morphological analyser and not trying to be. The job is narrow: a player
 * asked to name a currency types "рублей" or "рубля" as readily as "рубль", and the typo
 * budget cannot absorb that - `allowedEdits` gives a five-letter target ONE edit, and
 * рубль -> рублей is two.
 *
 * Ordered longest-first so "английского" loses "ого" rather than "о".
 */
const RUSSIAN_ENDINGS = [
  'ыми', 'ими', 'ого', 'ему', 'ому', 'его', 'ями', 'ами', 'иях',
  'ах', 'ях', 'ов', 'ев', 'ей', 'ий', 'ый', 'ой', 'ая', 'ое', 'ые', 'ие',
  'ом', 'ем', 'им', 'ым', 'ую', 'юю', 'ья', 'ью', 'ию',
  // The ё spellings as well as the folded е ones. In production every string reaches this
  // through `normalizeText`, which has already folded ё to е - but a stemmer that is only
  // correct on pre-normalized input is a trap for the next caller, and the two extra
  // entries cost nothing.
  'ём', 'ёй',
  // The -й forms as `normalizeText` leaves them. Its NFD pass decomposes й into и plus a
  // combining breve and strips the mark, so by the time a word reaches here "рублей" is
  // "рублеи" and "российский" is "россиискии". Listing only the -й spellings would make
  // this stemmer a no-op on exactly the endings it exists for.
  'еи', 'ии', 'ыи', 'ои', 'аи',
  'а', 'я', 'и', 'ы', 'у', 'ю', 'е', 'о', 'ь',
];

/**
 * Shortest stem an ending may leave behind.
 *
 * Three, not four, because of the short currency names: "иена"/"иены" and "вона"/"воны"
 * are four letters and would otherwise keep their endings and fail to match each other.
 * The floor exists only to stop a two-letter word being eaten whole - both sides go
 * through this, so a slightly over-eager stem costs nothing as long as it is consistent.
 */
const MIN_STEM = 3;

/**
 * Crudely strip one inflectional ending from each word.
 *
 * **Applied to both sides**, so it never has to be right in an absolute sense - only
 * consistent. `рубль`, `рубля` and `рублей` all reduce to `рубл`, which is the whole
 * requirement.
 *
 * The `MIN_STEM` floor is what stops it eating short words whole: "евро" keeps its "о"
 * because four letters minus one is under the floor, and stemming it to "евр" would
 * bring it within one edit of nothing useful.
 *
 * Deliberately NOT applied to country names. There the confusable guard is doing safety
 * work - it is what stops "австрия" scoring for Австралия - and loosening the comparison
 * on the one field where a near miss means a different country is the wrong trade. It is
 * used only for currencies, where inflection actually bites.
 */
export function russianStem(text: string): string {
  return text
    .split(' ')
    .map((word) => {
      for (const ending of RUSSIAN_ENDINGS) {
        if (word.length - ending.length >= MIN_STEM && word.endsWith(ending)) {
          return word.slice(0, -ending.length);
        }
      }
      return word;
    })
    .join(' ');
}

/**
 * Does this look like a Russian adjective rather than a noun?
 *
 * Only ever asked of a word that has already been through `normalizeText`, so the endings
 * are the folded ones - "российский" arrives as "россиискии".
 *
 * Used by the head-noun rule: "российский рубль" is adjective-then-noun, and offering the
 * adjective as an accepted answer would mean "российский" alone counted as naming the
 * currency.
 */
export function looksAdjectival(word: string): boolean {
  return /(?:ыми|ими|ого|ому|ыи|ои|ии|ая|ое|ые|ие)$/.test(word);
}
