import type { MessageKey, Translator } from '@/i18n/t';

/**
 * Who the app owes credit to, and under what licence.
 *
 * ## Why the names are data and not messages
 *
 * `catalogue.test.ts` asserts that the only keys whose English and Russian values are
 * identical are the two language names. Nearly every string on this screen is a proper
 * noun that is the same in both languages - "Natural Earth", "MapLibre", "ODbL 1.0",
 * "CC BY 4.0" - so putting them in the catalogues fails that test on the first entry, and
 * the fix of adding each to its `SHARED` array turns a tight invariant into a growing
 * exception list.
 *
 * So a credit carries its `name` and `licence` as data, and only its **role** - the human
 * sentence saying what the thing actually does for the app - goes through the catalogue.
 * That is the same trade subregion and region identifiers already make: they stay English
 * because they are keys rather than prose, and only their display labels are translated.
 *
 * ## Not every label is an identifier, which is why `Label` is a union
 *
 * The rule above is "identifiers are data, descriptions are messages", and two entries
 * are descriptions wearing an identifier's slot. The flag artwork has **no** upstream to
 * name - it is credited by what it IS, because a flag design is not copyrightable and the
 * pack it was rendered from carries no terms we can state. And "Public domain" is a
 * status rather than a licence identifier: "ODbL 1.0" is the same string in every
 * language, "Общественное достояние" is not.
 *
 * Left as plain strings those two rendered in English on the Russian screen - which is
 * the exact shape of the leftover-English bug this project has shipped twice. So a label
 * says which kind it is, and `labelText` is the only way to read one.
 *
 * Pure and type-only, like `exitPrompt.ts` and `resetPrompt.ts`, so the list is testable
 * without a renderer.
 */
export type Label =
  /** An identifier. Rendered verbatim, never translated. */
  | { text: string }
  /** A description. Rendered through the catalogue. */
  | { key: MessageKey };

export type Credit = {
  /** testID suffix and React key. Stable; not derived from the name. */
  id: string;
  /** What the thing is called. */
  name: Label;
  /** The licence it carries. */
  licence: Label;
  /** What this source gives the app. Always translated - it is a sentence. */
  roleKey: MessageKey;
  /** An extra line where the licence asks for more than a name. Only ODbL does. */
  noticeKey?: MessageKey;
};

/** The one way to read a label, so neither kind can be rendered as the other. */
export function labelText(label: Label, t: Translator): string {
  return 'key' in label ? t(label.key) : label.text;
}

/** "Public domain" is a status, and shares one key rather than being spelled twice. */
const PUBLIC_DOMAIN: Label = { key: 'about.licence.publicDomain' };

/**
 * The datasets baked into the bundle.
 *
 * All three ship *inside* the APK rather than being fetched, which is the whole point of
 * the offline constraint - and is exactly why they need crediting here rather than in a
 * map attribution control. `attribution={false}` on native and `attributionControl: false`
 * on web suppress MapLibre's own, because there is no tile source to attribute; these
 * obligations are ours and this screen is where they are met.
 */
export const DATA_CREDITS: readonly Credit[] = [
  {
    id: 'natural-earth',
    name: { text: 'Natural Earth' },
    licence: PUBLIC_DOMAIN,
    roleKey: 'about.credit.naturalEarth',
  },
  {
    // `world-countries` is a devDependency, which does NOT lift the obligation:
    // `countryFacts.json` is generated from it and ships in the APK, so the app
    // distributes a derived database and ODbL applies to it.
    id: 'world-countries',
    name: { text: 'world-countries (mledoze)' },
    licence: { text: 'ODbL 1.0' },
    roleKey: 'about.credit.worldCountries',
    noticeKey: 'about.credit.worldCountries.notice',
  },
  {
    id: 'world-bank',
    name: { text: 'World Bank' },
    licence: { text: 'CC BY 4.0' },
    roleKey: 'about.credit.worldBank',
  },
] as const;

/** The renderer, the typeface, and the pictures. */
export const SOFTWARE_CREDITS: readonly Credit[] = [
  {
    id: 'maplibre',
    name: { text: 'MapLibre' },
    licence: { text: 'BSD-3-Clause' },
    roleKey: 'about.credit.maplibre',
  },
  {
    // The one bundled font, and the reason map labels can draw real text with no glyph
    // server: it is referenced as `asset://` out of the APK.
    id: 'noto-sans',
    name: { text: 'Noto Sans' },
    licence: { text: 'SIL OFL 1.1' },
    roleKey: 'about.credit.notoSans',
  },
  {
    // Credited by what the artwork IS rather than by the pack it was imported from: a
    // flag design is not copyrightable, but a particular rendering can carry its own
    // terms, so this states what is true and claims nothing that is not.
    id: 'flags',
    // The only name that goes through the catalogue: there is no upstream to name, so
    // this is a description and has to translate like one.
    name: { key: 'about.credit.flags.name' },
    licence: PUBLIC_DOMAIN,
    roleKey: 'about.credit.flags',
  },
] as const;

/** Every credit, in the order the screen shows them. */
export const ALL_CREDITS: readonly Credit[] = [...DATA_CREDITS, ...SOFTWARE_CREDITS];
