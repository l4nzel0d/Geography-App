import { en } from '@/i18n/en';
import { LOCALES, type Locale } from '@/i18n/localeTypes';
import { translate, type MessageKey } from '@/i18n/t';
import { FILL_MODES } from '@/map/choropleth';
import { AVG_GLYPH_RATIO, CYRILLIC_GLYPH_RATIO } from '@/map/labelFit';
import { LABEL_FIELDS } from '@/map/mapLabels';

/**
 * The two rows of map chrome must not overlap, in either language.
 *
 * This is the one CLAUDE.md bug that actually shipped: the fill control and the top-right
 * row came to 393-422 dp on a 411 dp screen and drew on top of each other. It was found on
 * a device, and the fix was a redesign. Russian words are longer than English ones and a
 * third control is being added to that same budget, so the same failure is one careless
 * translation away.
 *
 * A character-count estimate is a proxy, not a measurement - the real check is a
 * screenshot at 411 dp. What it does buy is a **red test before an APK**, which is the
 * part that was missing last time.
 */

/** 411 dp emulator minus the safe-area insets either side, from `MapControls`. */
const CHROME_BUDGET_DP = 379;

/** Font sizes and padding taken from `MapOptionPill` and the two launch buttons. */
const PILL_FONT_SIZE = 13;
const PILL_PADDING = 14;
const COMPACT_PADDING = 10;
const GAP = 8;

/** The `⌕` glyph button, which carries no word and so cannot grow with translation. */
const SEARCH_BUTTON_DP = 40;

function glyphRatio(locale: Locale): number {
  return locale === 'ru' ? CYRILLIC_GLYPH_RATIO : AVG_GLYPH_RATIO;
}

function pillWidth(label: string, locale: Locale, compact = false): number {
  const padding = compact ? COMPACT_PADDING : PILL_PADDING;
  return label.length * glyphRatio(locale) * PILL_FONT_SIZE + padding * 2;
}

const t = (key: MessageKey, locale: Locale) => translate(locale, key);

/**
 * The widest the left row ever gets: the longest fill label beside the longest label
 * label, since either pill shows the current selection rather than a fixed word.
 */
function leftRowWidth(locale: Locale): number {
  const fill = Math.max(...FILL_MODES.map((mode) => pillWidth(t(mode.labelKey, locale), locale)));
  const labels = Math.max(
    // `map.labels.pill` is what the pill says while labels are off.
    pillWidth(t('map.labels.pill', locale), locale),
    ...LABEL_FIELDS.map((field) => pillWidth(t(field.labelKey, locale), locale)),
  );
  return fill + GAP + labels;
}

/** Search glyph, quiz word, and the two-letter language toggle. */
function rightRowWidth(locale: Locale): number {
  const quiz = pillWidth(t('quiz.open.label', locale), locale);
  // The language pill shows a two-character code in the compact padding, never the
  // language's name: "English" and "Русский" are ~47 dp wider than the row has spare. The
  // full names live in the panel behind it, where nothing competes for width.
  const language = pillWidth('EN', locale, true);
  return SEARCH_BUTTON_DP + GAP + quiz + GAP + language;
}

describe('the map chrome fits at 411 dp', () => {
  it.each(LOCALES)('in %s', (locale) => {
    const total = leftRowWidth(locale) + rightRowWidth(locale);
    expect(total).toBeLessThanOrEqual(CHROME_BUDGET_DP);
  });

  /**
   * The quiz button is the single riskiest word in the chrome: "Викторина" is the natural
   * translation and is more than twice the width of "Тест". Named explicitly so a future
   * edit toward the natural wording fails here with the reason attached.
   */
  it('keeps the quiz button short enough to share its row', () => {
    for (const locale of LOCALES) {
      expect(t('quiz.open.label', locale).length).toBeLessThanOrEqual(5);
    }
  });

  /** Neither row may wrap; every pill label has to be one short word. */
  it.each(LOCALES)('gives %s no pill label long enough to wrap', (locale) => {
    const labels = [
      ...FILL_MODES.map((mode) => t(mode.labelKey, locale)),
      ...LABEL_FIELDS.map((field) => t(field.labelKey, locale)),
      t('map.labels.pill', locale),
    ];

    for (const label of labels) {
      expect(label).not.toContain(' ');
      expect(label.length).toBeLessThanOrEqual(12);
    }
  });

  /** A sanity check that the budget is actually tight, not vacuously satisfied. */
  it('has less than 100 dp of slack in Russian, so the check means something', () => {
    const slack = CHROME_BUDGET_DP - (leftRowWidth('ru') + rightRowWidth('ru'));
    expect(slack).toBeGreaterThanOrEqual(0);
    expect(slack).toBeLessThan(100);
  });

  it('measures against the real catalogue, not a copy of it', () => {
    // Guards the estimate itself: if a key here stops existing, this suite would silently
    // measure `undefined`. Bracket access, not `toHaveProperty` - these keys contain dots
    // and `toHaveProperty` would read them as a path into a nested object.
    expect(en['map.labels.pill']).toBeTruthy();
    expect(en['quiz.open.label']).toBeTruthy();
  });

  it('reports the measured widths, so the margin is legible when this fails', () => {
    for (const locale of LOCALES) {
      const left = Math.round(leftRowWidth(locale));
      const right = Math.round(rightRowWidth(locale));
      // eslint-disable-next-line no-console
      console.log(`${locale}: left ${left} dp + right ${right} dp = ${left + right} of ${CHROME_BUDGET_DP}`);
    }
    expect(true).toBe(true);
  });
});
