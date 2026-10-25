<div align="center">

<img src="assets/images/favicon.png" width="96" alt="Countries of the World icon" />

# Countries of the World

**An offline world map you can explore, colour, label and quiz yourself on.**
Tap any country for its capital, population, currency and area, then test what you know in three quiz modes.
It runs on Android and as an installable PWA, in English and Russian.

<a href="https://geography-app-bay.vercel.app/"><img src="https://img.shields.io/badge/▶_Try_it_live-geography--app--bay.vercel.app-f5c542?style=for-the-badge&labelColor=0d2b45" alt="Try it live" /></a>

[![Expo SDK 57](https://img.shields.io/badge/Expo_SDK-57-000020?logo=expo&logoColor=white)](https://expo.dev)
[![React Native 0.86](https://img.shields.io/badge/React_Native-0.86-61dafb?logo=react&logoColor=black)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![MapLibre](https://img.shields.io/badge/MapLibre-native_%2B_GL_JS-396cb2?logo=maplibre&logoColor=white)](https://maplibre.org)
[![Jest](https://img.shields.io/badge/tests-1207_passing-15c213?logo=jest&logoColor=white)](__tests__)
<br />
[![Android](https://img.shields.io/badge/Android-supported-3ddc84?logo=android&logoColor=white)](#getting-started)
[![PWA](https://img.shields.io/badge/PWA-installable-5a0fc8?logo=pwa&logoColor=white)](https://geography-app-bay.vercel.app/)
[![Offline](https://img.shields.io/badge/network-not_required-0d2b45)](#it-works-with-no-network)
[![Languages](https://img.shields.io/badge/languages-EN_·_RU-e34c26)](https://geography-app-bay.vercel.app/ru)
[![Deployed on Vercel](https://img.shields.io/badge/deployed_on-Vercel-000?logo=vercel&logoColor=white)](https://geography-app-bay.vercel.app/)

<br />

<img src="docs/screenshots/hero.webp" alt="The app on desktop, with the world coloured by population, and on a phone, showing Japan's info card" width="100%" />

<sub><a href="https://geography-app-bay.vercel.app/">English</a> · <a href="https://geography-app-bay.vercel.app/ru">Русский</a></sub>

<br />

https://github.com/user-attachments/assets/e5ef44ce-b29d-476e-8a84-5b25da123f4c

</div>

---

## Contents

- [Highlights](#highlights)
- [Explore the map](#explore-the-map)
- [Colour the world](#colour-the-world)
- [Label every country](#label-every-country)
- [Search](#search)
- [Quiz](#quiz)
- [Two languages](#two-languages)
- [It works with no network](#it-works-with-no-network)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Data and credits](#data-and-credits)

## Highlights

|  |  |
|---|---|
| 🗺️ **240 countries and territories** | Natural Earth 1:50m outlines, so you can tap microstates like Liechtenstein, Monaco and the Vatican. |
| 🎨 **Four fill modes** | Flat, population, density, or your own quiz mastery. |
| 🏷️ **Five label fields** | Names, flags, capitals, currencies or population, decluttered by fit and collision. |
| 🔎 **Forgiving search** | Matches names, aliases ("Holland"), capitals ("Lima") and currencies ("kwacha"), with fuzzy fallback. |
| 🧠 **Three quiz modes** | Name the facts, find it on the map, or name it from the flag. Type your answer or pick one of four. |
| 📈 **Mastery tracking** | Remembers how you do on each country, colours the map by it, and builds practice rounds from your weak spots. |
| 🌐 **English and Russian** | The UI, every country name, capital and currency, and the grading rules. |
| 📴 **Fully offline** | No tile server and no API calls. Everything ships in the APK or the precached web bundle. |

## Explore the map

Tap a country to highlight it and open its card: flag, official name, capital, population, currency and area. Tap the flag to see it full size. Tap the ocean to close the card.

<table>
  <tr>
    <td width="68%"><img src="docs/screenshots/desktop-explore.webp" alt="Brazil selected on desktop, with the info card docked on the right" /></td>
    <td width="32%"><img src="docs/screenshots/phone-explore.webp" alt="Japan selected on a phone, with the info card as a bottom sheet" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Desktop and landscape: the card docks to the right</sub></td>
    <td align="center"><sub>Portrait: it slides up from the bottom</sub></td>
  </tr>
</table>

<p align="center">
  <img src="docs/screenshots/desktop-flag-lightbox.webp" width="68%" alt="Brazil's flag shown full size over a dimmed map" /><br />
  <sub>Every flag is drawn at its true aspect ratio: Nepal's pennant, Qatar's 28:11, the square Swiss flag</sub>
</p>

## Colour the world

Choose a fill mode from the pill in the top-left. Population and density use a **log scale**, one colour step per factor of ten, because a linear ramp would leave everything except China and India white. The legend always matches the map.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/desktop-population.webp" alt="World map coloured by population with population labels" /></td>
    <td width="50%"><img src="docs/screenshots/desktop-density-names.webp" alt="World map coloured by population density with country name labels" /></td>
  </tr>
  <tr>
    <td align="center"><sub><b>Population</b>, with population labels</sub></td>
    <td align="center"><sub><b>Density</b>, people per km², with name labels</sub></td>
  </tr>
</table>

**Mastery** colours each country by how well you have answered it in quizzes. Grey means it hasn't been asked yet.

<table>
  <tr>
    <td width="68%"><img src="docs/screenshots/desktop-mastery.webp" alt="World map coloured by quiz mastery, red to green, with unasked countries in grey" /></td>
    <td width="32%"><img src="docs/screenshots/phone-mastery.webp" alt="Mastery fill mode on a phone" /></td>
  </tr>
</table>

<sub>These screenshots use sample quiz history.</sub>

## Label every country

Labels are real text drawn by MapLibre with a **bundled font**, so no glyph server is involved. Each label sits on a point inside the country (via `polylabel`), and a label only appears once its country is wide enough on screen to hold it.

<table>
  <tr>
    <td width="68%"><img src="docs/screenshots/desktop-flags-europe.webp" alt="Flags drawn over each European country" /></td>
    <td width="32%"><img src="docs/screenshots/phone-flags.webp" alt="Flag labels on a phone" /></td>
  </tr>
  <tr>
    <td width="68%"><img src="docs/screenshots/desktop-capitals-africa.webp" alt="Capital city labels across Africa and the Middle East" /></td>
    <td width="32%"><img src="docs/screenshots/phone-population.webp" alt="Population choropleth on a phone with legend" /></td>
  </tr>
</table>

## Search

The search button opens a list of all 237 countries. Type a name, an alias, a capital or a currency, and picking a result flies the map to that country and frames it clear of the info card.

<table>
  <tr>
    <td width="68%"><img src="docs/screenshots/desktop-search.webp" alt="Search results for 'guinea': Guinea, Guinea-Bissau, Equatorial Guinea, Papua New Guinea" /></td>
    <td width="32%"><img src="docs/screenshots/phone-search.webp" alt="Search for 'george' matching countries by capital: Cayman Islands, Guyana, Grenada" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Name matches are ranked first</sub></td>
    <td align="center"><sub>Capitals are searchable too ("george" → Georgetown)</sub></td>
  </tr>
</table>

## Quiz

Pick a mode, the facts you want to be asked, how you answer, and which regions to include. The setup is saved between sessions.

<table>
  <tr>
    <td width="68%"><img src="docs/screenshots/desktop-quiz-setup.webp" alt="Quiz setup screen on desktop" /></td>
    <td width="32%"><img src="docs/screenshots/phone-quiz-setup.webp" alt="Quiz setup screen on a phone" /></td>
  </tr>
</table>

### Three modes

<table>
  <tr>
    <th>Name the facts</th>
    <th>Find it on the map</th>
    <th>Name it from the flag</th>
  </tr>
  <tr>
    <td width="33%"><img src="docs/screenshots/phone-quiz-facts.webp" alt="Facts round: 'Holland' accepted as Netherlands, a typo in Amsterdam accepted, population 38% too high marked wrong" /></td>
    <td width="33%"><img src="docs/screenshots/phone-quiz-locate.webp" alt="Locate round: Brazil tapped when asked for Paraguay, Brazil in red and Paraguay in green" /></td>
    <td width="33%"><img src="docs/screenshots/phone-quiz-flag.webp" alt="Flag round showing Nepal's flag" /></td>
  </tr>
  <tr>
    <td><sub>The map flies to a country and you type its name, capital, currencies or population.</sub></td>
    <td><sub>You get a name and tap the country. A wrong guess turns red, and the camera moves to show the right one in green.</sub></td>
    <td><sub>Only the flag is shown, never the country's name, not even after you answer.</sub></td>
  </tr>
</table>

**Grading is forgiving about spelling but not about getting the wrong country.** It accepts aliases ("Holland", "UK", "DRC"), typos (Damerau edit distance, so a swapped pair of letters counts as one mistake), and population within ±20% (`68m`, `1.4bn`, `68 million`). It rejects a near-miss that is actually another country's name: "Gambia" is not accepted for Zambia, and in Russian "Австрия" is not accepted for Австралия. A correct answer still shows the canonical spelling, so you learn it.

<p align="center">
  <img src="docs/screenshots/desktop-quiz-facts.webp" width="49%" alt="Facts round on desktop, after checking" />
  <img src="docs/screenshots/desktop-quiz-locate.webp" width="49%" alt="Locate round on desktop, showing the reveal" />
</p>

### Type it, or pick from four

In multiple-choice mode each field gets four buttons: the answer, one wrong option from the same subregion, one from the same continent, and one from somewhere far away. No button is ever another correct answer for that country, so South Africa's three capitals can't appear as both right and wrong.

<table>
  <tr>
    <td width="34%"><img src="docs/screenshots/phone-quiz-choice.webp" alt="Multiple-choice round before answering" /></td>
    <td width="34%"><img src="docs/screenshots/phone-quiz-choice-graded.webp" alt="Multiple-choice round after checking: wrong pick in red, right answers in green" /></td>
    <td width="32%"><img src="docs/screenshots/phone-quiz-results.webp" alt="Results screen: 7 of 10 countries fully correct, with a retry button" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Four options per field</sub></td>
    <td align="center"><sub>Graded in place</sub></td>
    <td align="center"><sub>Results, and <b>retry only what you missed</b></sub></td>
  </tr>
</table>

**Retry what you got wrong** starts a new round with only the countries you missed, and only the fields you missed for each one. If you missed France's currency and Germany's capital, the retry asks France its currency and Germany its capital, and nothing else.

**Practice mode** picks ten countries weighted toward your weak spots. Countries you have never been asked count as weakest, so on a fresh install practice also works as a tour of the world.

<p align="center">
  <img src="docs/screenshots/desktop-quiz-results.webp" width="68%" alt="Results screen on desktop" />
</p>

## Two languages

English and Russian cover everything: the UI, all 250 country names, capitals, currencies and regions, plus Russian-aware grading. That means stemming for currency inflections (`рублей` → `рубль`), parsing `1,4 млрд`, and a separate list of Russian country names so confusable near-misses are still rejected. On the web each language is its own static build with its own service worker: [`/`](https://geography-app-bay.vercel.app/) and [`/ru`](https://geography-app-bay.vercel.app/ru).

<p align="center">
  <img src="docs/screenshots/phone-russian.webp" width="32%" alt="The app in Russian: density fill, Russian name labels, and Russia's info card" />
</p>

## It works with no network

This is the project's one hard constraint, and it drives almost every other decision.

- **No tile server.** Country outlines (1.6 MB GeoJSON) and facts are bundled into the JS.
- **No glyph server.** On Android, map labels render from a bundled Noto Sans TTF referenced as `asset://` through MapLibre's `font-faces`. On the web, maplibre-gl rasterises glyphs locally.
- **No sprite URL.** Flags are registered as map images at runtime: `<Images>` on native, `map.addImage` on the web.
- **No API calls.** Population and facts were fetched once at build time and committed.
- **On the web,** a Workbox service worker precaches the whole app, all three flag tiers included, so the installed PWA keeps working with the origin unreachable.

## Tech stack

| | |
|---|---|
| Framework | [Expo SDK 57](https://expo.dev) · React Native 0.86 (New Architecture) · TypeScript · React Compiler |
| Routing | expo-router, typed routes |
| Map | [`@maplibre/maplibre-react-native`](https://github.com/maplibre/maplibre-react-native) v11 on Android · [`maplibre-gl`](https://maplibre.org/maplibre-gl-js/) on the web |
| Geometry | [Natural Earth](https://www.naturalearthdata.com/) Admin 0, 1:50m |
| Facts | [`world-countries`](https://github.com/mledoze/countries) |
| Population | [World Bank](https://data.worldbank.org/indicator/SP.POP.TOTL) `SP.POP.TOTL` |
| Web | Static export, two locale trees, Workbox service workers, Vercel |
| Tests | Jest + React Native Testing Library (1207 tests, 51 suites) · Maestro E2E flows |

The `.web.tsx` siblings handle the web/native split, so there are no `Platform.OS` checks in `src/`. Everything above the renderer is shared: the GeoJSON joins, colour ramps, label expressions, camera maths and hit-testing.

## Getting started

```bash
npm install

# Web
npm run web              # dev server (no service worker)
npm run build:web        # production build: English -> dist/, Russian -> dist/ru/
npm run serve:web        # serve dist/ on :4173

# Android (a development build, not Expo Go, because MapLibre is native)
npx expo run:android
npx expo run:android --variant release

# Checks
npm test                 # Jest
npm run typecheck
npm run test:e2e         # Maestro, needs a running device
```

Data scripts. Their output is committed, so you only need these to change the data:

```bash
npm run enrich:data      # offline: re-derive facts from world-countries
npm run labels:data      # offline: label anchor points
npm run flags:data       # offline: flag thumbnails and map icons from the committed masters
npm run build:data       # needs network: full rebuild from Natural Earth + World Bank
```

The architecture notes, including the traps that cost real time and why each decision went the way it did, are in [`CLAUDE.md`](CLAUDE.md).

## Data and credits

| Source | Used for | Licence |
|---|---|---|
| [Natural Earth](https://www.naturalearthdata.com/) | Country outlines | Public domain |
| [world-countries](https://github.com/mledoze/countries) (mledoze) | Names, capitals, currencies, regions | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) |
| [World Bank](https://data.worldbank.org/) | Population | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| [MapLibre](https://maplibre.org/) | Map rendering | BSD-3-Clause |
| [Noto Sans](https://fonts.google.com/noto/specimen/Noto+Sans) | Map label typeface | [SIL OFL 1.1](https://openfontlicense.org/) |
| [flag-icons](https://github.com/lipis/flag-icons) | Flags for dependent territories | MIT |

The same credits are in the app, on the **About** screen (the ⓘ button at the bottom-left of the map).

<p align="center">
  <img src="docs/screenshots/desktop-about.webp" width="68%" alt="The About screen listing every data source and its licence" />
</p>

---

<div align="center">
<sub>Screenshots taken with Playwright from the live deployment, at 1440×900 for desktop and 390×844 @2x for the phone.</sub>
</div>
