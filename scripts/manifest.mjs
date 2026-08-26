/**
 * The web app manifest, per locale.
 *
 * One builder rather than two hand-written files, for the reason `countryFactRecord.mjs`
 * is shared by both writers of countryFacts.json: the two manifests differ in four strings
 * and a path prefix, and everything else must not be free to drift.
 *
 * The strings are duplicated from `src/i18n/{en,ru}.ts` rather than imported, because this
 * runs in plain Node during the build and those are TypeScript. `webAssets.test.ts` asserts
 * they still agree, which is the same discipline that file already applies to the MapLibre
 * worker copy.
 */

/** Where each locale is deployed. Must match `LOCALE_PATH_PREFIX` in `src/i18n/localePath.ts`. */
const BASE = { en: '', ru: '/ru' };

const TEXT = {
  en: {
    name: 'Countries of the World',
    short_name: 'Countries',
    description:
      'A world map you can explore offline: tap any country for its population, currency, capital and area, colour the land by population or density, label every country, search 237 countries, or take a quiz.',
  },
  ru: {
    name: 'Страны мира',
    short_name: 'Страны',
    description:
      'Карта мира, которая работает офлайн: нажмите на любую страну, чтобы увидеть её население, валюту, столицу и площадь, раскрасьте сушу по населению или плотности, подпишите каждую страну, найдите любую из 237 стран или пройдите тест.',
  },
};

export const MANIFEST_LOCALES = Object.keys(TEXT);

/**
 * `start_url` and `scope` are the locale's own subtree.
 *
 * `scope` is what makes the two installable as separate apps rather than one overwriting
 * the other, and it must agree with the service worker's scope and with the registration
 * in `+html.tsx` - all three come from the same prefix.
 */
export function manifestFor(locale) {
  const base = BASE[locale] ?? '';
  const text = TEXT[locale] ?? TEXT.en;

  return {
    ...text,
    lang: locale,
    start_url: `${base}/`,
    scope: `${base}/`,
    display: 'standalone',
    orientation: 'any',
    background_color: '#0d2b45',
    theme_color: '#0d2b45',
    // Spec-defined vocabulary, deliberately not translated.
    categories: ['education', 'reference', 'travel'],
    icons: [
      { src: `${base}/icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `${base}/icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: `${base}/icons/icon-512-maskable.png`,
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}

/** Pretty-printed, because it is committed for the dev server and read in diffs. */
export function manifestJson(locale) {
  return `${JSON.stringify(manifestFor(locale), null, 2)}\n`;
}

/**
 * The invariants a manifest must satisfy, asserted at build time.
 *
 * Here rather than in Jest because this module is ESM and Jest's transform does not reach
 * `.mjs` - but also because it belongs here: a wrong `scope` does not break a test run, it
 * breaks an installed PWA, so the deploy is the right thing to fail.
 *
 * The scope is the load-bearing one. It has to agree with three other places - the
 * service worker's own scope, the `Service-Worker-Allowed` header in `vercel.json`, and
 * the registration call in `+html.tsx` - and if the Russian manifest ever claimed `/`, the
 * two installed apps would fight over every page in the English tree.
 */
export function manifestProblems(locale) {
  const manifest = manifestFor(locale);
  const base = BASE[locale] ?? '';
  const problems = [];

  if (manifest.scope !== `${base}/`) {
    problems.push(`${locale}: scope is ${manifest.scope}, expected ${base}/`);
  }
  if (manifest.start_url !== `${base}/`) {
    problems.push(`${locale}: start_url is ${manifest.start_url}, expected ${base}/`);
  }
  if (manifest.lang !== locale) {
    problems.push(`${locale}: lang is ${manifest.lang}`);
  }

  // Every icon must sit INSIDE this locale's scope, or the installed app fetches it from
  // a path its own service worker cannot serve offline.
  for (const icon of manifest.icons) {
    if (!icon.src.startsWith(`${base}/`)) {
      problems.push(`${locale}: icon ${icon.src} is outside the scope`);
    }
  }

  if (!manifest.name || !manifest.description) {
    problems.push(`${locale}: missing name or description`);
  }

  // A locale whose strings were never written would silently ship the English ones.
  if (locale !== 'en' && manifest.name === TEXT.en.name) {
    problems.push(`${locale}: name is still the English one`);
  }

  return problems;
}
