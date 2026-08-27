import rawGeoJson from '@/data/countries.geo.json';
import { factsFor } from '@/data/countryFacts';
import { nameAliases } from '@/quiz/answerAliases';
import { getLocale } from '@/i18n/locale';
import { byLocale, DEFAULT_LOCALE, type Locale } from '@/i18n/localeTypes';
import type { MessageKey } from '@/i18n/t';
import { allowedEdits, editDistance } from '@/quiz/editDistance';
import { normalizeText } from '@/quiz/normalizeText';

/**
 * Finding a country by typing its name, its capital or its currency.
 *
 * Deliberately more forgiving than `gradeAnswer.ts`, which is the other consumer of these
 * same helpers. Grading has to reject a near-miss, because accepting "Gambia" for Zambia
 * would hand out a point that was not earned; searching has to *offer* near-misses,
 * because the whole reason to open a search box is that you are not certain how the name
 * is spelled. So there is no confusable guard here, and partial input - which grading
 * refuses outright - is the normal case.
 *
 * Pure and synchronous over a module-scope index. Everything it reads is bundled by
 * Metro, so this never touches the filesystem or the network.
 */

/** Below this many characters, a fuzzy match says nothing that a prefix match did not. */
const MIN_FUZZY_QUERY = 4;

/**
 * How many matches a real query is worth showing. Past this the tail is all substring
 * noise. An EMPTY query is uncapped instead - see `searchCountries`.
 */
const DEFAULT_LIMIT = 50;

/**
 * What kind of fact put this row in the list, when it was not the primary name.
 *
 * A discriminated union rather than a second `matchedKind` field beside the text: one
 * object cannot desync from itself, and the discriminant turns the row's lookup into a
 * `Record<MatchKind, MessageKey>` - the `FIELD_LABEL_KEYS` / `MODE_USES_MAP` pattern used
 * throughout this codebase, which fails to COMPILE when a fourth kind is added rather than
 * silently rendering a blank line.
 */
export type MatchKind = 'alias' | 'capital' | 'currency';

export type MatchedAs = { kind: MatchKind; text: string };

/** The line under the country's name, saying why the row is here. */
export const MATCH_DETAIL_KEYS: Record<MatchKind, MessageKey> = {
  alias: 'search.match.alias',
  capital: 'search.match.capital',
  currency: 'search.match.currency',
};

/** The same fact, as a screen reader hears it. */
export const MATCH_A11Y_KEYS: Record<MatchKind, MessageKey> = {
  alias: 'search.result.alias',
  capital: 'search.result.capital',
  currency: 'search.result.currency',
};

export type CountrySearchResult = {
  iso3: string;
  name: string;
  flag: string | null;
  subregion: string;
  /**
   * What matched, when it was not the primary name - the row renders it as "Holland" or
   * "Capital: Lima" above the country, so a hit on something the user typed is never
   * mysterious. Null when the country's own name matched.
   */
  matchedAs: MatchedAs | null;
};

type Alias = { raw: string; normalized: string; squashed: string };

/**
 * The normalized form with its spaces removed.
 *
 * `normalizeText` DELETES hyphens and apostrophes rather than replacing them with a
 * space, so "Guinea-Bissau" becomes "guineabissau" while someone typing it produces
 * "guinea bissau". Comparing the space-free forms on both sides closes that gap, and the
 * same trick covers "timor leste" and "bosnia herzegovina".
 */
const squash = (normalized: string) => normalized.replace(/ /g, '');

type Entry = {
  iso3: string;
  name: string;
  flag: string | null;
  subregion: string;
  normalizedName: string;
  squashedName: string;
  /** Every accepted spelling except the primary name, deduped and pre-normalized. */
  aliases: Alias[];
  /** Every capital the country has - South Africa has three. */
  capitals: Alias[];
  /** Currency NAMES, never codes: "USD" is a different thing to know from "dollar". */
  currencies: Alias[];
};

/**
 * Which countries are searchable: everything with BOTH an outline and a facts record.
 *
 * Wider than `QUIZ_COUNTRIES` on purpose. The quiz asks about the 193 UN members, but a
 * map that draws Greenland, Puerto Rico and Western Sahara should let you find them - the
 * only thing search cannot offer is a country it could neither highlight nor describe.
 * That excludes exactly the three geometry-only entries in the pipeline's
 * FACTLESS_ALLOWLIST (Somaliland, Northern Cyprus, Siachen Glacier).
 */
const mappedIso3 = new Set(
  (rawGeoJson as unknown as { features: { properties: { iso3: string } }[] }).features.map(
    (feature) => feature.properties.iso3,
  ),
);

/**
 * Normalize a list of spellings, dropping anything already claimed by a better one.
 *
 * `seen` is shared across the name, the aliases, the capitals and the currencies of ONE
 * country, which is what makes Djibouti, Singapore, Monaco and Luxembourg - where the
 * capital is the country's own name - cost exactly nothing. Their capital is skipped, the
 * name still matches at rank 0, and `matchedAs` stays null, so no row ever explains itself
 * with "Capital: Monaco" under the word Monaco. No special case needed.
 */
function spellings(raws: readonly string[], seen: Set<string>): Alias[] {
  const list: Alias[] = [];

  for (const raw of raws) {
    const normalized = normalizeText(raw);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    list.push({ raw, normalized, squashed: squash(normalized) });
  }

  return list;
}

/**
 * The index in every language.
 *
 * **Unlike the quiz pool, this one IS re-sorted per language**, and the difference is the
 * point: `QUIZ_COUNTRIES` feeds a seeded shuffle, so its order decides which countries a
 * seed picks and must not move. This is a browsable list a person reads, so it has to be
 * alphabetical in the alphabet they are reading.
 *
 * `localeCompare(name, locale)` rather than the bare call it used to make: the host's
 * default collation is not the app's language, and on this project's own Windows box those
 * two disagree.
 *
 * **The capitals and currencies come out of `factsFor(locale)` already translated**, and
 * that is the whole reason searching them costs no new data: `localize()` in
 * `countryFacts.ts` swaps `capital` for `translations.ru.capital` and each currency's
 * `name` for its Russian one, so a Russian index carries Лима and квача with no new join
 * and nothing added to `src/data/ru/`.
 *
 * Only the ACTIVE locale's strings are indexed, not the union of both. `nameAliases`
 * returns a bilingual superset, but its stated justification is that a superset makes the
 * grader's confusable guard stricter - and search has no confusable guard, so the argument
 * does not carry over. Indexing English capitals in a Russian list would put English text
 * in a Russian row for nothing.
 */
export const SEARCH_INDEX_BY_LOCALE: Record<Locale, readonly Entry[]> = byLocale((locale) =>
  Object.entries(factsFor(locale))
    .filter(([iso3]) => mappedIso3.has(iso3))
    .map(([iso3, facts]) => {
      const normalizedName = normalizeText(facts.name);
      const seen = new Set([normalizedName]);

      return {
        iso3,
        name: facts.name,
        flag: facts.flag,
        subregion: facts.subregion,
        normalizedName,
        squashedName: squash(normalizedName),
        aliases: spellings(nameAliases(iso3, facts, locale), seen),
        capitals: spellings(facts.capital, seen),
        currencies: spellings(
          facts.currencies.map((currency) => currency.name),
          seen,
        ),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale)),
);

export const SEARCH_INDEX: readonly Entry[] = SEARCH_INDEX_BY_LOCALE[DEFAULT_LOCALE];

/**
 * How good a match is, best first. Ranked rather than scored because the tiers are
 * genuinely ordinal: an exact name is better than any prefix, and every prefix is better
 * than any substring, whatever the lengths involved.
 *
 * **Every name or alias tier beats every capital or currency tier**, and the block is not
 * interleaved. That single sentence is what keeps the ordering explainable: typing
 * "Guinea" lists Guinea, Equatorial Guinea, Guinea-Bissau and Papua New Guinea before
 * anything whose *capital* merely contains the word. Interleaving would make "is a capital
 * hit better than a name substring?" a case-by-case judgement, and the stable-sort
 * tie-break would stop being explainable with it.
 *
 * The block sits ABOVE `Fuzzy`, because a literal hit on a real fact is better evidence
 * than a spelling guess - and structurally that is free, since `score()` already falls
 * through to `scoreFuzzy` only when nothing matched literally.
 *
 * **Capital outranks currency at equal tier.** A capital identifies essentially one
 * country; a currency is shared - the euro is twenty countries and the CFA franc fourteen -
 * so a currency hit is intrinsically less discriminating.
 */
const Rank = {
  ExactName: 0,
  ExactAlias: 1,
  NamePrefix: 2,
  AliasPrefix: 3,
  NameWord: 4,
  AliasWord: 5,
  NameSubstring: 6,
  AliasSubstring: 7,

  ExactCapital: 8,
  ExactCurrency: 9,
  CapitalPrefix: 10,
  CurrencyPrefix: 11,
  CapitalWord: 12,
  CurrencyWord: 13,
  CapitalSubstring: 14,
  CurrencySubstring: 15,

  Fuzzy: 16,
} as const;

type Rank = (typeof Rank)[keyof typeof Rank];

/** Exported for the ordering tests, which pin the block rather than a data-dependent case. */
export const SEARCH_RANK = Rank;

/** Does `haystack` contain `needle` at the start of one of its words? */
function startsWord(haystack: string, needle: string): boolean {
  return haystack.includes(` ${needle}`);
}

type Scored = { rank: Rank; matchedAs: MatchedAs | null };

/** The query, in the two forms every spelling is indexed in. */
type Query = { normalized: string; squashed: string };

/**
 * Which of exact / prefix / word-start / substring a spelling manages, or null.
 *
 * Both forms of the query are tried at every step so that a space the dataset spells as a
 * hyphen never demotes an otherwise perfect match.
 */
function tierOf(normalized: string, squashed: string, query: Query): 0 | 1 | 2 | 3 | null {
  if (normalized === query.normalized || squashed === query.squashed) return 0;
  if (normalized.startsWith(query.normalized) || squashed.startsWith(query.squashed)) return 1;
  if (startsWord(normalized, query.normalized)) return 2;
  if (normalized.includes(query.normalized) || squashed.includes(query.squashed)) return 3;
  return null;
}

/** Each list's four tiers, indexed by what `tierOf` returns. */
type RankTiers = readonly [Rank, Rank, Rank, Rank];

const NAME_RANKS: RankTiers = [
  Rank.ExactName,
  Rank.NamePrefix,
  Rank.NameWord,
  Rank.NameSubstring,
];
const ALIAS_RANKS: RankTiers = [
  Rank.ExactAlias,
  Rank.AliasPrefix,
  Rank.AliasWord,
  Rank.AliasSubstring,
];
const CAPITAL_RANKS: RankTiers = [
  Rank.ExactCapital,
  Rank.CapitalPrefix,
  Rank.CapitalWord,
  Rank.CapitalSubstring,
];
const CURRENCY_RANKS: RankTiers = [
  Rank.ExactCurrency,
  Rank.CurrencyPrefix,
  Rank.CurrencyWord,
  Rank.CurrencySubstring,
];

function scoreName(entry: Entry, query: Query): Scored | null {
  const tier = tierOf(entry.normalizedName, entry.squashedName, query);
  return tier === null ? null : { rank: NAME_RANKS[tier], matchedAs: null };
}

/**
 * The best tier any spelling in `list` manages, tagged with what kind of thing it was.
 *
 * `tierOf` is reused untouched, which is exactly why the two new fields were cheap: the
 * matching rules do not change at all, only which list they are applied to and what rank
 * comes out.
 */
function scoreIn(
  list: readonly Alias[],
  query: Query,
  ranks: RankTiers,
  kind: MatchKind,
): Scored | null {
  let best: Scored | null = null;

  for (const spelling of list) {
    const tier = tierOf(spelling.normalized, spelling.squashed, query);
    if (tier === null) continue;

    const scored: Scored = {
      rank: ranks[tier],
      matchedAs: { kind, text: spelling.raw },
    };
    if (!best || scored.rank < best.rank) best = scored;
  }

  return best;
}

/**
 * A typo away from any accepted NAME or alias.
 *
 * Only reached when nothing matched literally, and only for queries long enough to be
 * worth it: `allowedEdits` returns 0 below five characters, so a short query can never
 * match fuzzily anyway and would just pay for the comparison.
 *
 * **Deliberately not extended to capitals or currencies.** Fuzzy is already the noisiest
 * tier under a cap of fifty, and a fuzzy currency match would surface twenty euro countries
 * for one mistyped letter. A named omission, not an oversight.
 *
 * Note the budget comes from the CANDIDATE's length, not the query's, and that
 * `editDistance` returns `max + 1` once the budget is blown - it may only be compared
 * against a threshold, never used to rank.
 */
function scoreFuzzy(entry: Entry, { normalized: query }: Query): Scored | null {
  if (query.length < MIN_FUZZY_QUERY) return null;

  const budget = allowedEdits(entry.normalizedName.length);
  if (budget > 0 && editDistance(query, entry.normalizedName, budget) <= budget) {
    return { rank: Rank.Fuzzy, matchedAs: null };
  }

  for (const alias of entry.aliases) {
    const aliasBudget = allowedEdits(alias.normalized.length);
    if (aliasBudget > 0 && editDistance(query, alias.normalized, aliasBudget) <= aliasBudget) {
      return { rank: Rank.Fuzzy, matchedAs: { kind: 'alias', text: alias.raw } };
    }
  }

  return null;
}

function score(entry: Entry, query: Query): Scored | null {
  let best = scoreName(entry, query);

  for (const scored of [
    scoreIn(entry.aliases, query, ALIAS_RANKS, 'alias'),
    scoreIn(entry.capitals, query, CAPITAL_RANKS, 'capital'),
    scoreIn(entry.currencies, query, CURRENCY_RANKS, 'currency'),
  ]) {
    if (scored && (!best || scored.rank < best.rank)) best = scored;
  }

  return best ?? scoreFuzzy(entry, query);
}

const toResult = (entry: Entry, matchedAs: MatchedAs | null): CountrySearchResult => ({
  iso3: entry.iso3,
  name: entry.name,
  flag: entry.flag,
  subregion: entry.subregion,
  matchedAs,
});

/**
 * Countries matching `query`, best match first.
 *
 * An empty query lists everything alphabetically rather than nothing, so the screen opens
 * as a browsable index of the world and is useful before a single key is pressed.
 */
export function searchCountries(
  query: string,
  limit?: number,
  locale: Locale = getLocale(),
): CountrySearchResult[] {
  const index = SEARCH_INDEX_BY_LOCALE[locale] ?? SEARCH_INDEX;
  const normalized = normalizeText(query);

  // Uncapped by default when nothing has been typed: the cap exists to hide a noisy tail,
  // and an alphabetical index of the world has no tail to hide.
  if (!normalized) {
    return index.slice(0, limit ?? index.length).map((entry) => toResult(entry, null));
  }

  const parsed: Query = { normalized, squashed: squash(normalized) };
  const matches: { entry: Entry; scored: Scored }[] = [];

  for (const entry of index) {
    const scored = score(entry, parsed);
    if (scored) matches.push({ entry, scored });
  }

  // SEARCH_INDEX is already sorted by name, and `sort` is stable, so equal ranks keep
  // alphabetical order without a second comparison.
  matches.sort((a, b) => a.scored.rank - b.scored.rank);

  return matches
    .slice(0, limit ?? DEFAULT_LIMIT)
    .map(({ entry, scored }) => toResult(entry, scored.matchedAs));
}
