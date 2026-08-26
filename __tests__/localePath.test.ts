import { localeHref, LOCALE_PATH_PREFIX } from '@/i18n/localePath';

/**
 * Rewriting a URL from one locale's static export to the other's.
 *
 * Pure, so it is tested with no DOM at all - which is the reason it is a separate file
 * from `locale.web.ts` rather than three lines inside `setLocale`.
 */
describe('localeHref', () => {
  it('prefixes English paths for Russian', () => {
    expect(localeHref('ru', '/')).toBe('/ru');
    expect(localeHref('ru', '/search')).toBe('/ru/search');
    expect(localeHref('ru', '/quiz/play')).toBe('/ru/quiz/play');
  });

  it('strips the prefix on the way back to English', () => {
    expect(localeHref('en', '/ru')).toBe('/');
    expect(localeHref('en', '/ru/search')).toBe('/search');
    expect(localeHref('en', '/ru/quiz/results')).toBe('/quiz/results');
  });

  /**
   * The whole reason the query is carried rather than dropped: a quiz round lives entirely
   * in its URL, so switching language mid-round has to land on the same question of the
   * same round rather than binning it.
   */
  it('carries the query string, which is where a round lives', () => {
    expect(localeHref('ru', '/quiz/play?mode=flag&seed=7&fields=capital')).toBe(
      '/ru/quiz/play?mode=flag&seed=7&fields=capital',
    );
    expect(localeHref('en', '/ru/quiz/play?seed=7')).toBe('/quiz/play?seed=7');
  });

  it('carries a fragment too', () => {
    expect(localeHref('ru', '/search#top')).toBe('/ru/search#top');
  });

  /** A stray double call must not produce `/ru/ru/search`. */
  it('is idempotent', () => {
    const once = localeHref('ru', '/search');
    expect(localeHref('ru', once)).toBe(once);
    expect(localeHref('en', localeHref('en', '/search'))).toBe('/search');
  });

  /**
   * Matched at a segment boundary. There is no `/rugby` route today, and this is what
   * means nobody has to remember the rule before adding one.
   */
  it('only treats /ru as a locale at a segment boundary', () => {
    expect(localeHref('ru', '/rugby')).toBe('/ru/rugby');
    expect(localeHref('en', '/rugby')).toBe('/rugby');
  });

  it('agrees with the prefixes the build deploys to', () => {
    expect(LOCALE_PATH_PREFIX.en).toBe('');
    expect(LOCALE_PATH_PREFIX.ru).toBe('/ru');
  });
});
