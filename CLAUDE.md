# geography-app

An offline world map. Tap a country → it highlights and an info sheet shows population, currency,
capital, area. Plus a choropleth, map labels, country search, a three-mode quiz, and
per-country mastery tracking. Runs on Android and as a PWA. English and Russian.

## Hard constraint: the app must work fully offline

This drives every other decision. No tile server, no REST call at tap time, no font/glyph fetch.
Everything ships inside the APK (or the precached web bundle).

**Never introduce a runtime network dependency** — a tile source, a `glyphs`/`sprite` URL, a live API
call — without flagging it explicitly. The offline acceptance test (release build, wifi + data
disabled) is the gate.

The rule is **no remote URL**, not "no symbol layers". Map labels draw real text through a TTF bundled
in the APK and referenced as `asset://` — see *Map labels*.

## Status

Everything below is implemented and unit-tested (1125 Jest tests across 48 suites, typecheck clean).
Verification state, which is what actually varies:

| | state |
|---|---|
| Emulator (`Medium_Phone`, x86_64) | all features seen working, dev + release builds |
| Web (both locale trees, desktop browser) | verified |
| **Offline acceptance test** | last passed at the *map-labels* commit; **not re-run** since flag labels, mastery, Russian or the raster flags |
| **Galaxy S25 (SM-S931B)** | last verified long ago; not re-checked since 1:50m geometry, the font, mastery or the raster flags |
| Maestro | seven flows pass; an eighth (`quiz-choice.yaml`) is **written but never run**; **no flow for locate mode, flag mode, or Russian**, and none re-run since the raster flags |

Nothing added since the last offline run introduces a network call, but the gate is the gate, and two
changes since are exactly the class it exists for: the web half changed how resources resolve (two
service workers, per-subtree scope), and the raster flags replaced **every image asset in the app** and
needed a new extension in the precache glob to be reachable offline at all.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Expo SDK 57** + React Native 0.86.2, TypeScript | Development build, **not Expo Go** — MapLibre is native |
| Routing | expo-router, routes in **`src/app/`** | `typedRoutes: true`, `reactCompiler: true` |
| Map | **`@maplibre/maplibre-react-native` 11.3.6** (native) / `maplibre-gl` (web) | free, no API key |
| Info box | hand-rolled on RN `Animated` | keeps the native dependency surface unchanged |
| Geometry | Natural Earth *Admin 0 Countries, 1:50m* | public domain, 242 features → 240 countries |
| Facts | `world-countries` npm (= mledoze/countries) | ODbL |
| Population | World Bank `SP.POP.TOTL` | free, no key |
| i18n | English + Russian, hand-authored, no library | see *Localization* |

RN over Kotlin because polygon rendering happens inside MapLibre's native renderer either way.

### MapLibre v11 API — do not follow v10 docs

- `Map` (not `MapView`), `GeoJSONSource` (not `ShapeSource`), `<Layer type="fill">` (not `FillLayer`)
- `Map` takes **`mapStyle`**; `GeoJSONSource` takes **`data`** (not `shape`)
- press payloads arrive on **`event.nativeEvent.features`**
- ornament props are `attribution` / `logo` / `compass` / `scaleBar` booleans
- use `paint` / `layout`; the `style` prop is deprecated
- `LngLatBounds` is a flat `[west, south, east, north]` tuple
- **v11 requires the New Architecture.** `newArchEnabled=true` in `android/gradle.properties`; setting
  it false breaks the map rather than fixing anything.

## Layout

```
src/
  app/
    _layout.tsx  index.tsx (MapScreen)  search.tsx
    quiz/index.tsx  quiz/play.tsx  quiz/results.tsx
  map/
    WorldMap.tsx / .web.tsx   # Map + source + fill/selected/reveal/line/label/flag layers
    worldMapProps.ts          # props + camera constants shared by both implementations
    cameraFit.ts              # world-fit width zoom, and the both-axes fit
    choropleth.ts             # log + linear ramps and their paint expressions
    offlineStyle.ts / web     # inline style: background layer, bundled font-face, no sources
    mapLabels.ts              # label field catalogue + both symbol layers' expressions
    mapFlagImages.ts / .web   # GENERATED: 249 PNG requires / URLs, keyed flag-<iso2>
    labelFit.ts               # text width, or flag height x aspect -> the zoom that fits it
    countryBounds.ts          # which polygons to frame for one country
    quizCamera.ts             # bbox + viewport -> centre/zoom (whole viewport or a focus rect);
                              #   and getFlightDuration
  i18n/       localeTypes  locale(.web)  localeStorage(.web)  localePath  baseUrl
              en/ru + plurals  plural.ts  t.ts  useTranslator.ts
  data/       countries.geo.json (1.6 MB)  countryFacts.json (184 KB)  countryFacts.ts
              placeNames.ts  ru/  labelPoints.json  labelGeoJson.ts  worldGeoJson.ts  types.ts
  components/ CountryInfoSheet  ConfirmDialog  infoSheetLayout  palette  formatters
              MapControls  MapOptionPill  MapOptionPanel  ChoroplethLegend
              CountryFlag(.web)  flagSizes  LocaleToggleButton
              flagAssets / flagThumbs / flagAspects .ts (all GENERATED)
              quiz/  search/
  quiz/       quizConfig  quizCountries  quizBuilder  normalizeText  editDistance
              answerAliases  gradeAnswer  gradeLocation  quizScore  quizPanelLayout
              exitPrompt  resetPrompt  quizResultStore  practicePool
  mastery/    masteryStore  masteryCodec  masteryStorage(.web)  masteryScore
  search/     countrySearch.ts  pendingCountry.ts
scripts/  countryOverrides  manifest  build-label-points  copy-web-assets
          import-flag-masters  build-flag-assets
          build-country-data  enrich-country-facts  countryFactRecord  build-web
plugins/withJsonBundleInputs.js
__tests__/  __mocks__/  .maestro/
```

**Single source of identity: ISO 3166-1 alpha-3.** Geometry and facts join on it.

Both JSON files are `import`ed — Metro inlines them into the bundle. No filesystem read, no async
load. Do not convert either to a fetch.

## The paint bug — read this before adding any view over the map

**The most expensive bug in the project.** A view inserted over the MapLibre surface *after* the
initial mount is never drawn. It sits in the hierarchy with entirely correct bounds — `uiautomator
dump` shows it exactly where it belongs — and paints nothing; sampling the screenshot at those
coordinates returns pure map pixels.

Four escapes, and every UI decision in this app picks one of them:

1. **Mounted from startup and parked** — `ChoroplethLegend` lives at `left: -200` and animates `left`,
   a **layout** property, on the **JS thread** (`useNativeDriver: false`). Always-mounted gives it the
   stable insertion order the pills have; animating layout supplies the re-layout that reveals it.
   `visible` therefore drives `accessibilityElementsHidden`, not mounting — so in tests presence proves
   nothing and **RNTL queries need `{ includeHiddenElements: true }`**.
2. **A flex sibling, never an overlay** — the quiz panel splits the screen with the map.
3. **A separate route with no map on it** — `/search`, `/quiz`, and a `flag` quiz round.
4. **A `Modal`** — RN's Android backend hosts it in its own `Dialog` window, composited over the app.
   `ConfirmDialog` is the one genuinely unavoidable case (a dialog must cover the map *and* appear on
   demand).

**The corollary matters as much:** inside 2, 3 and 4, ordinary conditional rendering is correct.
Copying the always-mounted discipline into `/search` would mount 237 rows forever for nothing. The
`display: 'none'` rows in `AnswerField` and the fixed chip slots in `ChipInput` exist *only* because
those views share a window with a live map surface.

What did **not** work — one release build each, do not repeat: a translucent `backgroundColor`;
`pointerEvents`; `elevation: 6`; an absolute shrink-wrapped container; `absoluteFillObject` +
`box-none`; and an opacity/translateY entrance with `useNativeDriver: true`. That last is the
instructive failure — `CountryInfoSheet` uses exactly that pattern and paints fine, because its
container is mounted at startup. The animation never mattered; the insertion order did.

Diagnosis in one step: `adb shell uiautomator dump` to prove the view **is** laid out, then sample the
screenshot's pixels at those bounds to prove it is **not** painted. Free behavioural signal: if
rotating the device makes it appear and it *stays*, this is the bug, not styling.

## The data pipeline

`npm run build:data` — a **one-off**, run while online; its output is committed. The app never calls
these APIs.

**Two writers of `countryFacts.json`, one shared record builder** (`scripts/countryFactRecord.mjs`):

| | |
|---|---|
| `npm run build:data` | full rebuild. Fetches Natural Earth + World Bank; rewrites **both** JSON files. |
| `npm run enrich:data` | **offline.** Re-derives facts from local `world-countries`, carries the committed population through untouched, rewrites **only** `countryFacts.json`. |

Prefer `enrich:data`. A full rebuild re-fetches Natural Earth `master` and the geometry drifts — a
border has already moved between tiers and flipped a `pickCountry` expectation, and every Maestro
percentage tap is pinned to today's outlines. `enrich:data` **fails if any population would change**,
which proves it never touched the World Bank join.

Both scripts assert the quiz's invariants — 193 UN members with geometry, each with a subregion,
population, capital and language, and a currency for all but FSM — and `data-integrity.test.ts`
mirrors them.

**`languages` is gone, from the surface and from the data.** It was dropped as a displayed fact, a
map-label field and a quiz field, and then out of the record entirely — `CountryFacts.languages`,
`languageCodes`, `LocalizedFacts.languages` and `src/data/ru/languages.json` (153 entries) are all
deleted, along with `formatLanguages`, `languageAliases`, the `info.fact.languages` plural, both
`map.label.languages.*` and `quiz.field.languages.*` message keys, and the `label-field-languages`
stanza in `.maestro/map-labels.yaml`. `countryFacts.json` went 188 KB → 161 KB.

Two things worth keeping from how that landed. The invariant list above lost its `languages` check
and the Russian one lost two, so **`world-countries`' own `languages` map is no longer read by
anything in this repo** — re-adding the field means re-adding both checks, not just the builder line.
And a stored mastery table that already carries `languages` grades is dropped per field by
`decodeMastery`'s `isMasteryField` check, which is exactly what that check was for: the history for a
removed field stops counting rather than corrupting a score. Genuine upstream gaps go in an explicit allowlist (`FACTLESS_ALLOWLIST` = Northern
Cyprus, Somaliland, Siachen Glacier; `POPULATIONLESS_ALLOWLIST` = Taiwan, Western Sahara, Falklands,
French Southern Territories, Antarctica + 17 small territories) — **never a silent skip**. The script
fails the build on any unresolved code, duplicate, or missing record.

### Why 1:50m

1:110m has **177 features and no microstates at all** — Liechtenstein, Monaco, San Marino, Malta,
Singapore, Vatican and ~25 others had no polygon, so they could not be tapped at all.

| Tier | Features | Committed @3dp | Unmatched |
|---|---|---|---|
| 1:110m | 177 | 0.24 MB | 0 — but no microstates |
| **1:50m** | 242 → **240** | **1.6 MB** | 1 (Siachen Glacier) |
| 1:10m | 258 | ~8 MB | 13 |

10m was rejected on size, and because it splits disputed slivers into ISO-less, factless features.

Two things the higher tier forced:

- **Some countries arrive as several features and must be merged.** Australia ships as mainland +
  Indian Ocean Territories + Ashmore and Cartier, all resolving to AUS. The build folds every same-ISO
  feature into one MultiPolygon (`mergePolygons`) — the highlight layer filters on `iso3`, so a second
  AUS feature would be an untappable duplicate.
- **17 more territories have no World Bank population.** Every one was checked against
  `GET /v2/country/<code>`; none is a join failure. Jersey and Guernsey are reported only as combined
  "Channel Islands", so both stay blank.

### Pipeline traps

- **REST Countries is no longer usable** — v3.1 deprecated, v5 needs a key. `world-countries` is the
  same upstream dataset but has **no population field**, hence the separate World Bank call.
- **Natural Earth ships `ISO_A3 = "-99"`** for disputed/dependent territories. `NE_TO_ISO3` patches
  Kosovo (`KOS`→`UNK`) and South Sudan (`SDS`→`SSD`); France and Norway resolve via the `ADM0_A3`
  fallback. Without this France silently becomes an untappable blank.
- **Kosovo is `UNK` in mledoze but `XKX` at the World Bank** — `ISO3_TO_WORLD_BANK`.
- Coordinates round to 3 dp (~110 m), ~25% off the file. `roundGeometry` takes the geometry and
  recurses into `.coordinates`; the old `roundCoords` was handed an *object*, hit its identity branch
  and **never rounded anything** for the 110m file's whole life. The integrity suite now asserts it.
- **`scripts/countryOverrides.mjs`** holds deliberate corrections to `world-countries` (three
  capitals: Eswatini, Equatorial Guinea, Sri Lanka), because `enrich-country-facts.mjs` rebuilds every
  record from the pinned dataset and would otherwise silently revert any hand-edit into a minified
  single-line file nobody diffs. An override that has *stopped* differing from upstream also fails the
  build, so a fix upstream tells you to delete a line instead of rotting.

## Selection

Highlight is a **filtered layer**, not feature-state:
`filter: ['==', ['get','iso3'], selectedIso3 ?? '']`. An empty string matches nothing, which is how
"no selection" is expressed. Layers stay mounted and are switched by handing the ISO-3 to only one of
them, rather than adding/removing layers at runtime.

Three such layers: `country-selected` (orange), `country-selected-outline` (white, drawn over
`country-border`), and **`country-reveal`** — which exists because one `selectedIso3` cannot say two
things at once: locate mode must show where the answer was *alongside* what the player tapped. Drawn
immediately after `country-selected`, so a correct guess resolves to the reveal colour rather than to
draw order.

### `GeoJSONSource.onPress` MUST call `event.stopPropagation()`

Source presses **bubble up to `Map.onPress`**, our tap-the-ocean-to-deselect handler. Without
`stopPropagation()` the ocean handler fires immediately after every country press and clears the
selection just made — so tapping a country appears to do nothing at all, with no error and no log.

Unit tests can't catch this alone (the mock doesn't model bubbling), so there is an explicit assertion
that `stopPropagation` was called, plus a Maestro step tapping ocean after selecting.

### Which country a press selects — `pickCountry.ts`

`onPress` returns **every feature the hitbox touches**, in arbitrary order. Taking `features[0]` was a
real user-visible bug. Measured on device, a press on **Paris** returned
`["GBR","ITA","NLD","BEL","LUX","CHE","DEU","FRA"]` — France **last**.

Both halves of the fix matter:

1. **`hitbox` tightened to 10 dp** (from MapLibre's 44 dp default). At zoom 0 the default spans ~30° of
   longitude. The tighter box also means open water yields *no* candidates, which is what lets
   `Map.onPress` deselect.
2. **`pickCountry`** prefers the country whose polygon **contains** the pressed point
   (`@turf/boolean-point-in-polygon`), falling back to nearest only when none does — which keeps small
   islands reachable and handles presses into the Caspian, inside no country.

**Containment is what makes microstates usable**: at any zoom where Liechtenstein is visible the 10 dp
box still returns Switzerland and Austria alongside it. Both cases pinned in `pickCountry.test.ts`.

**A sharper border can change the right answer.** A recorded Sahara press used to be inside Libya and
is now inside Algeria. If a `pickCountry` expectation flips after a data change, check the geometry
before the code.

## Camera

`INITIAL_CENTER = [10, 20]`. The zoom is **not** a constant: both `initialViewState.zoom` and `minZoom`
come from `getWorldFitZoom(windowWidth)` = `max(0, log2(width / 512))`.

- **Do not switch back to `bounds`.** Fitting `[-180,-60,180,85]` on a tall phone fills the height with
  the latitude range and crops most of the longitude range.
- **Zoom 0 is a request, not a guarantee.** MapLibre clamps so the world covers the viewport — measured
  ~0.61 on the S25. Derive projection mappings empirically.
- **The floor is derived because the clamp only saves you in portrait.** A landscape window is *wider*
  than the world at zoom 0 (914 dp vs 512), so MapLibre tiles the world horizontally — a cold landscape
  launch rendered ~1.8 copies with a seam through the Pacific. The formula is exactly 0 in portrait (so
  portrait taps are untouched) and 0.836 in landscape. Keep the `max(0, …)`: `log2(0)` would send
  `-Infinity` to the native camera.
- **A cold launch and a rotation do not settle at the same camera.** `32%,56%` is Brazil after a
  rotation and Guyana on a cold launch. Derive Maestro points from a cold launch in the flow's
  orientation.

Explore and quiz `maxZoom` are both **10**. At 8 a 400 dp screen spans ~1.1° and Monaco is a 22 dp dot
— framed correctly and useless. 3 dp geometry makes 10 the honest ceiling.

No camera ref: v11's `Camera` takes a declarative `Partial<CameraStop>`, and the imperative
`fitBounds`/`setStop` *throw* when the native view is not ready — which is exactly the first question
of a round. `initialViewState` stays alongside to supply frame one.

**We compute centre and zoom ourselves** (`quizCamera.ts`) rather than handing MapLibre `bounds` +
`padding`, whose antimeridian behaviour cannot be verified offline and which Fiji and Russia exercise
on day one. Doing the Mercator arithmetic here makes it unit-testable — a bad stop is otherwise
invisible until the native renderer blanks the map. Stops are `useMemo`'d on the country and map box
only; `Camera` is `memo()`'d and rebuilds its animation from its props, so a freshly allocated object
re-fires the fly on every keystroke.

**A stop is never withdrawn.** `WorldMap` spreads `{...(camera ?? {})}`, so handing back `undefined`
takes the native `stop` prop from `{center, zoom, duration, easing}` to `{}` — a real prop change
pushed into a renderer Jest replaces with a stub. Both the search focus and the locate reveal follow
this rule. `MapScreen.test.tsx` asserts the explore camera is **never** handed a stop.

### Which polygons to frame — `countryBounds.ts`

A plain bbox is wrong, and the reason is France: Natural Earth draws French Guiana as part of FRA, so
the full extent spans 63°. Guiana is ~13% of France's polygon area, so **no area threshold separates it
from Sicily** — only distance does.

Rank polygons by area, seed a cluster with the largest, absorb any whose bbox is within
`max(GAP_MIN_DEG, 0.35 × cluster diagonal)`, to a fixpoint.

- **Pick the longitude frame first, from the country's total extent**, then cluster inside it. Deciding
  per polygon yields "Kiribati is one atoll" and "the UK is Great Britain only".
- **`GAP_MIN_DEG` is 5.5 because of Malaysia**, whose halves sit 5.2° apart with Borneo the larger — a
  tighter floor drops the peninsula and its capital. At 5.5 Spain rejects the Canaries by 2.5°,
  Portugal the Azores by 2.8, South Africa the Prince Edward Islands by 5.7.
- Degenerate spans widen to `MIN_SPAN_DEG` and deliberately **overshoot by a relative epsilon** — one
  ulp at latitude 44 is ~7e-15, so correcting the shortfall exactly does nothing. A zero span sends
  `log2(0)` to the native camera.
- Accepted limitation: **Kiribati and Micronesia frame to their largest island group** (38° and 25° of
  ocean otherwise). The subregion filter is the opt-out.

### Pacing a camera move — `getFlightDuration`

Every camera move is a **`fly` whose duration is computed from the flight's length**. A fixed duration
is wrong in both directions at once, and time alone can't fix the long case: `ease` interpolates the
centre linearly at the *starting* scale, so at zoom 8 the ground tears past however long you give it.
Zooming out on the way is what makes a long move readable.

**The unit is screenfuls, not kilometres** — the van Wijk & Nuij (2003) path length, the same thing
`maplibre-gl` computes for a parameterless `flyTo` (`curve` 1.42).

**Reimplemented rather than delegated because MapLibre Native Android cannot do it.** From
`CameraUpdateItem.kt`: a `duration` of `0` takes the `moveCamera` path (an instant jump); a negative
one falls back to a **fixed** `ANIMATION_DURATION`. The file says so itself — iOS has the dynamic API,
Android does not. Computing it here makes the two platforms agree and puts the number where Jest can
read it; the web implementation needs it too, for `applyStop`'s `duration + ARRIVAL_GRACE_MS` deadline.

`FLIGHT_SPEED` is **the one number to turn** — screenfuls per second, 2 here against `maplibre-gl`'s
1.2 (at which France→Japan takes over three seconds, twenty times a round). Measured on a 411x500 map:

| flight | ms |
|---|---|
| France–Germany, Brazil–Argentina | 450 (floor) |
| world view–Australia, **USA–China** | ~620 |
| France–Japan | 1588 |
| NZ–Iceland, **world view–Monaco** | 2000 (ceiling) |

The two bold ones read as wrong until you remember the unit: USA–China is short because both frame at
about zoom 1 so little moves, and Monaco–Liechtenstein is 2 s despite 500 km because at zoom 10 that is
hundreds of screenfuls. `flightDuration.test.ts` pins them.

**Where the flight starts** is derived, since nothing reports the pose back: `facts` uses the previous
question's country (a pure function of the question list), `locate` uses the last stop sent. Being
wrong costs a slightly mis-paced move, never a wrong destination.

## Map fill modes

`WorldMap` takes a `fillMode`, owned by `MapScreen`: `flat` (green basemap), `population`, `density`,
and `mastery`. Each non-flat mode is a ramp in `src/map/choropleth.ts` with seven stops, matched by
`ChoroplethLegend` so key and map cannot drift.

**Population and density are `log10`, and that is not a preference.** Population runs from ~11k
(Tuvalu) to ~1.45B (India) — five orders of magnitude, and a linear ramp renders the world white except
China and India. Stops sit one per decade, so each colour step is a 10× step of people. `interpolate`
clamps outside its domain, so no extra branches are needed at either end.

**Values reach the paint expression through a runtime join, not the pipeline.** The build trims outline
properties to `{ iso3, name }`, and a data-driven expression can only read what is on the feature.
`src/data/worldGeoJson.ts` folds `population`/`area` on at module load — keeping `countryFacts.json`
the single source of truth. It is cheap because **`geometry` is passed by reference**; only the small
properties object is rebuilt, and `worldGeoJson.test.ts` asserts that identity, since losing it
duplicates 1.6 MB at import.

**Features with no figure omit the property entirely rather than carrying null**, which lets the
expression split them off with `['has', …]` into the grey `NO_DATA_COLOR`. A null would reach `log10`
and poison the whole expression — as would a `0`, which `data-integrity.test.ts` forbids.

Two test traps: the Jest mock had to be taught to forward `paint` (and later `layout` and `data`); and
**a malformed paint expression fails inside the native renderer**, which is exactly what Jest replaces
with a stub — so it passes every unit test and blanks the layer on a device.
`.maestro/choropleth-modes.yaml` exists solely to catch that.

## Map labels

A pill in the top-left row writes one fact over every country: **name, capital, currencies,
population, or flag**. Independent of the fill mode, so it has its own state, pill and panel.

### Real text, and still no network

**This is the feature that corrected the "no symbol layers" rule.** MapLibre needs glyph data, but it
does not have to come over the wire:

- **`font-faces`** (style spec 24.x) maps a font name to a real TTF. The shipped `libmaplibre.so`
  implements it — `mbgl::FontFace`, FreeType and HarfBuzz are all in the binary. Characters a face
  covers never touch the `glyphs` URL, and there is no `glyphs` URL here at all.
- **`asset://`** resolves against the APK's `assets/` via the Android asset manager
  (`mbgl::AssetFileSource`). No socket, no DNS, no permission.
- **`expo-font`'s config plugin** puts the file there — it must be the plugin, because **`android/` is
  gitignored and regenerated by `expo prebuild`**, which destroys anything hand-placed.

Noto Sans Regular, 569 KB, SIL OFL — **belongs in the About screen** with Natural Earth, mledoze and
the World Bank. It covers Latin Extended-A (Türkiye, Côte d'Ivoire, São Tomé) and the **entire**
Cyrillic block plus `№`, verified by parsing its cmap — so Russian needed no font change.

Adding the font changed `app.json`, so it needed `expo prebuild` and a native rebuild.

**On the web there is no `font-faces` and no `glyphs` key either**, and the tempting conclusion — "so
the web needs a glyph server" — is wrong. From maplibre-gl's `glyph_manager.ts`, with no `glyphs` key
every glyph is rasterised locally through canvas/TinySDF using the `text-font` name as a CSS family. So
`text-font: [LABEL_FONT]` carries over unchanged and `expo-font`'s runtime hook registers the family.
Verified with the origin dead: zero glyph requests.

### Labels come from their own point source

`GeoJSONSource id="country-labels"`, one Point per country, **not** a symbol layer on the outlines.
MapLibre labels a polygon at its pole of inaccessibility — but computes one **per polygon**, so
labelling the outlines draws "France" six times, one over South America, and Kiribati once per atoll.

`scripts/build-label-points.mjs` (offline, `npm run labels:data`) picks each country's largest polygon
by latitude-weighted area and runs **`polylabel`** (a devDependency — never ships) on it, writing
`{ at, w }` to the committed `labelPoints.json`.

- **The anchor must be inside the country, and a bbox centre is not.** Norway, Chile, Croatia, Vietnam
  and Indonesia all have centroids in the sea. `data-integrity.test.ts` asserts all 240 anchors pass
  `booleanPointInPolygon`; if that fails after a geometry change, re-run the script rather than editing
  the expectation.
- **`polylabel`'s tolerance is relative, not absolute.** At a flat 0.01° the Vatican — 0.011° wide in
  total — came back with an anchor *outside its own outline*. It is now a fraction of the polygon bbox.
- **Antarctica is an explicit allowlist entry** (`POLAR_SPAN_ALLOWLIST`): the script fails any polygon
  spanning >180°, assuming an antimeridian wrap, and Antarctica genuinely spans 360.

`labelGeoJson.ts` folds every field's text onto those points at module load, following
`worldGeoJson.ts`'s idioms — a module-scope constant for stable `data` identity, and a field a country
has no value for is **absent, not null**.

### Decluttering is collision plus fit

At the launch camera a 411 dp screen shows ~166° of longitude, so "Luxembourg" is ~60 dp of text over
~1 dp of country. Two mechanisms:

- **Collision is MapLibre's**, and free: `text-allow-overlap: false` drops overlaps and
  `symbol-sort-key` (the negated landmass width) decides who wins. This is the single biggest reason
  labels are a native symbol layer rather than RN views over the map.
- **Fit is ours.** Collision has no idea a country is too small for its own name. `labelFit.ts`
  precomputes, per country **and per field**, the zoom at which the country is wide enough, and the
  layer filters `['<=', ['get', zoomProp], ['zoom']]`.

**`['zoom']` is legal inside a `filter`** — the spec evaluates zoom expressions in filters at integer
zoom levels — which is what lets the fit test be declarative instead of a camera subscription.

Mercator x is linear in longitude, so a country's on-screen width is exactly `w / 360 × 512 × 2^zoom`
dp. **`FIT_TOLERANCE` (0.55) is the one number to turn**: a label may be ~1.8× its country's width,
because strict containment would permanently unlabel Chile, Norway, Vietnam and Italy.

Countries that lose show nothing — no dot, no abbreviation. Expect **population labels far denser than
name labels** ("47m" is a quarter the width of "Uzbekistan"), and note the label source carries **no
`onPress`**, so presses fall through to the outlines.

### Flag labels are a second layer, and it is the one that must be PNG

The whole flag set is raster now (see *The flags are raster*), so "must be raster" is no longer the
interesting claim — **"must be PNG, on Android"** is. MapLibre's icon pipeline, read out of the shipped
source rather than guessed:

- **Android** — `DownloadMapImageTask.java`: a `require`d asset in release goes to
  `BitmapFactory.decodeResource`; in dev the same require is a Metro URL decoded by **Fresco**, which
  demands a `CloseableStaticBitmap`. Neither decodes SVG. (Both decode WebP, so this is now a choice
  rather than a constraint — it is just the fussiest path in the app and the tier is 1 MB, so there is
  nothing to buy by re-proving it.)
- **iOS** — `UIImage` via `RCTImageLoader`, round-tripped through `UIImagePNGRepresentation`.
- **Web** — **corrected**: `map.loadImage` reaches `getImage`, which sets `img.src = url` on an
  `Image` element and takes anything a browser decodes. The `{type:"image/png"}` blob and the *"Note
  that SVGs are not supported"* throw are real but live in `arrayBufferToImageBitmap`, on the
  worker/sprite path, not here. maplibre-gl v6, verified in `dist/maplibre-gl.mjs`.

**`expo-image`'s Android SVG decoder was expo-image's own Glide pipeline and never reached MapLibre** —
so the identical file that rendered in the info sheet drew nothing as a map icon, and it failed
**log-only**: one `FLog.e("Failed to load bitmap from: …")` and a blank map. That trap is gone with the
SVGs, but the shape of it is why the map tier is still generated separately.

So `npm run flags:data` derives the map tier with `sharp` from the committed masters into
`assets/map-flags/` (both scales) and two generated require maps; `copy-web-assets.mjs` copies the 3x
bytes to `public/map-flags/`. ~1.06 MB native, ~0.84 MB web.

**A `sprite` entry in the style is still forbidden** — it is a remote-URL-shaped dependency. Images go
in imperatively: `<Images>` on native, `map.addImage` on web.

#### Two raster scales, because of a density trap

`DownloadMapImageTask` sets `inDensity` **only when the resolved asset's scale is not 1**. Ship a
single unsuffixed `br.png` and RN files it under `drawable-mdpi`, so `decodeResource` takes `inDensity`
160 against an `inTargetDensity` of 480 on a 3x phone and **upsamples every flag 3x at decode time** —
blurry, and ~35 MB of style bitmaps.

With `br@3x.png` beside it, `resolveAssetSource` reports scale 3, the densities match, and the bitmap
is used as-is: crisp. Both arrive as **18 style px TALL** — height, because each flag's width is its
own now, and one scalar `icon-size` scales both axes, so the only axis all 249 share is the one worth
pinning. That is what lets one `icon-size` expression be right at every density. The 1x file also keeps
**Jest** working, whose resolver does no `@Nx` lookup. `icon-size` is expressed as a fraction of
`MAP_FLAG_INTRINSIC_DP` — if flags are ever the wrong size on a device, that is the one place to
correct it. Web is told outright: `addImage(…, {pixelRatio: 3})`.

**The 3x width is computed as three times the 1x width, not rounded independently.** `round(18 × r)`
and `round(54 × r)` disagree by a pixel for some ratios, and MapLibre derives an icon's style width as
`pixels ÷ pixelRatio` — so the same flag would be 34.00 dp wide on a 1x screen and 34.33 dp on a 3x
one, from one expression. Invisible in Jest, visible on a device; `mapFlagImages.test.ts` pins it.

#### `icon-padding: 2` is a fatal crash, and the browser will not tell you

```
UnexpectedNativeTypeException: Value for value cannot be cast from Double to ReadableArray
  at MLRNStyleFactory.setIconPadding(MLRNStyleFactory.kt:1606)
```

**`setTextPadding` calls `getFloat`; `setIconPadding` calls `getFloatArray`**, because the spec types
`text-padding` as a `number` and `icon-padding` as a `padding`. maplibre-gl accepts the scalar without
a murmur, so it looked perfect in a browser and killed the app on launch on Android.

It is now **unset** (the spec default is already `[2]`); if ever set it must be an **array**.
`MapScreen.test.tsx` guards it, and **the same question is worth asking of any other icon property —
check the `else` branch of its setter in `MLRNStyleFactory.kt` before trusting a scalar.**

#### The layer, the latch, and what draws

- **A second symbol layer, `country-flag`**, on the same source. One symbol layer has one `text-field`
  and a flag has none. Both layers stay mounted and **exactly one filter ever matches** —
  `labelFilter` goes empty for `flag`, `flagIconFilter` for everything else. Nothing is added or
  removed at runtime, so the paint bug stays out of reach.
- **`icon-image` is a constant**, unlike `text-field`. An expression that emptied out off-mode would be
  a missing-image lookup and a log line every time labels were anything but flags — noise in the one
  log the offline acceptance test reads.
- **`<Images>` is permanently mounted but its `images` prop is latched**, `{}` until flags are first
  selected. Registering 249 bitmaps costs one sequential `AsyncTask`, ~3.9 MB of style images, and in a
  **dev build 249 HTTP round-trips to Metro**. `setImages` only ever ADDS keys, so the latch is one-way
  by construction.
- **The border is baked into the PNG, because MapLibre has no `icon-halo`.** Japan, Finland and Nigeria
  are nearly all white and would be holes against a pale choropleth. It is now four solid strips
  composited **over** the resized flag rather than a stroke spliced into an SVG — so the file's outer
  box stays exactly the flag's own aspect box, and every border pixel is opaque `13,43,69,255` by
  construction at both scales rather than by the luck of a clipped stroke. Extending the canvas instead
  would inset the picture by two pixels in eighteen and make every map flag a slightly different shape
  from the same flag in the info sheet. Flags are composited **onto white** first, which now matters
  only for the flag-icons fallbacks — the raster masters are already flat on white.
- **`flag` is a `LabelField` but deliberately NOT a `LabelFieldId`**, the same trade `location` makes
  against `FieldId`: everything iterating `LABEL_FIELD_IDS` is about a string.
- Fit reuses `FIT_TOLERANCE` via a shared `getFitMinZoom`, and `getFlagMinZoom` now takes the flag's
  **aspect as a required second argument** — height is fixed at a nominal `MAP_FLAG_HEIGHT_DP` of 15,
  so the drawn width is `15 × aspect`: 20 dp at 4:3 (exactly the old constant, so no 4:3 flag moved),
  22.5 at 3:2, 30 at 2:1, 38 for Qatar, 12.3 for Nepal. Even the widest clears where 66 dp of
  "Uzbekistan" does not, so **flag labels are still markedly denser than name labels** — but a wide
  flag now waits for a wider country, which is the truth and was unsayable before.

#### `assets/**/*.png` and `assets/**/*.webp` had to join the Gradle bundle inputs

`withJsonBundleInputs` widened to both for exactly the reason it was written: that task also runs the
`--assets-dest` pass, and re-rendering flags touches no `.js`/`.ts`/`.json`, so Gradle would mark it
UP-TO-DATE and ship the previous flags. `.webp` covers `assets/flags` and `assets/flag-thumbs`, which
were never covered while they were SVGs either. See *A release build can package a stale JS bundle*.

### The chrome

Both appearance settings (fill mode, labels) are **pills opening an always-mounted panel**, sharing the
top-left row; search and quiz share one row top-right. The fill mode was a three-segment control until
labels landed and the two rows **overlapped on screen** at 411 dp.

- Choosing a fill mode is **two taps**, which is why `choropleth-modes.yaml` opens `toggle-fill-mode`
  before every `mode-*` tap, and why `MapScreen.test.tsx`'s `selectMode` helper does the same — and
  must `await` both, because RNTL v14's `fireEvent` is async and the rows are hidden until the opening
  press re-renders.
- **Only one panel is open at a time**, and **both are closed by default**, which is what kept every
  existing Maestro flow valid — no percentage tap moved.
- The panels are drawn over the legend while open, deliberately: parking the legend below a panel's
  full height would push it into the Greenland tap permanently.
- Top-right is *not* free in both orientations: with the info card open in landscape it docks right
  full-height and **covers both pills**. Pre-existing, and only while the card is open.
- **Keep Maestro tap points clear of the chrome**; the portrait Greenland tap at `19%,13%` passes just
  under it. Keep any future control the same height and **never on a second line**.

Width budget, measured by the project's own estimator against the 379 dp available at 411 dp:

| | left row | right row | total |
|---|---|---|---|
| English | 186 | 147 | 333 |
| Russian | 204 | 151 | **355** |

24 dp of slack in Russian, and only because the language toggle is a **compact two-letter pill** and
the quiz button says **`Тест`, not `Викторина`** — which alone would overflow. `chromeWidth.test.ts`
sweeps every fill mode × label field × locale against the budget.

## The info card

`orientation` is `"default"` in `app.json` and `android:screenOrientation` is **absent** from the
manifest — re-adding either pins the app to portrait. `getInfoSheetLayout(window)` decides the dock:

| | Portrait | Landscape |
|---|---|---|
| Dock | bottom, full width | **right**, full height |
| Size | `maxHeight: 55%`, content-height | clamp(280, 42% of width, 360) dp, capped at 60% |
| Slides along | `translateY` | `translateX` |
| Facts list | `flexGrow: 0` | `flex: 1`, scrolls inside the panel |

A bottom sheet in landscape would cover most of the little vertical space there is, while the spare
room is at the side. Capped at 60% so the map keeps at least 40%.

**The card animates out, so it outlives its selection.** It keeps its own `visibleFacts` state lagging
the `iso3` prop: on close it goes on rendering the country it was showing, slides off, and drops the
content in the animation's completion callback. Returning `null` as soon as `iso3` is `null` unmounts
it on the same frame with nothing left to animate. It sets `pointerEvents="none"` while sliding out,
and the slide distance is **measured via `onLayout`** — `maxHeight: 55%` is ~429 dp on a 780 dp phone,
so a hardcoded 400 left a visible sliver.

Dismissal is a close button plus tapping the ocean, not a swipe. `@gorhom/bottom-sheet` was the
original plan; hand-rolling on `Animated` keeps the native rebuild surface unchanged. Adding it later
is JS-only (reanimated and gesture-handler are installed) but check reanimated 4 compatibility.

## Country search

A pill in the top-right opens `/search`. Type a name, pick a result, and the map behind it highlights
that country exactly as a tap would and flies to frame it clear of the info sheet.

**It is a route, not a dropdown**, because a results list appearing as you type is precisely the paint
bug. Which means the **opposite** rule applies on that screen — see the corollary in *The paint bug*.

### The handover is a subscription, not a params round-trip

`/search` is **pushed** over `MapScreen`, so the map stays mounted underneath and only needs telling
what was picked. `src/search/pendingCountry.ts` is a module singleton with `selectCountry` /
`subscribeToCountrySelection`; the screen announces, then calls `router.back()`.

Three alternatives, each rejected for a concrete reason: `router.back()` cannot carry params;
`router.replace('/', {params})` would mount a **second MapLibre surface**; and `useFocusEffect` calls
`useNavigation()`, needing navigator context at render time — which the map's chrome deliberately
avoids (it uses the imperative `router` singleton) **so `MapScreen.test.tsx` can render the screen bare
with no router mock at all**. The subscription also fires while the search screen is still sliding
away, so the fly has already started by the time the map is uncovered.

### Matching — forgiving in the opposite direction to grading

Reuses `normalizeText`, `nameAliases` and `editDistance` from the quiz. **The duty is inverted**:
grading must *reject* a near-miss ("Gambia" for Zambia), search must *offer* one. So there is no
confusable guard here, and partial input is the normal case.

Ranked in ordinal tiers, ties broken alphabetically (the index is pre-sorted and `sort` is stable):
exact name, exact alias, name prefix, alias prefix, name word-start, alias word-start, name substring,
alias substring, fuzzy. Ordinal rather than scored, because `editDistance(a, b, max)` returns `max + 1`
once the budget blows — it may only be compared against a threshold, never used as a score.

- **Both the spaced and space-free forms are compared.** `normalizeText` *deletes* hyphens, so
  "Guinea-Bissau" indexes as `guineabissau` while a player types `guinea bissau`.
- **Fuzzy is skipped below 4 characters** — `allowedEdits` returns 0 under 5, so it is a pure no-op
  costing time over 237 countries on every keystroke.
- **An empty query lists all 237 alphabetically**, uncapped; a real query caps at 50. That makes the
  screen a browsable index of the world, and is why the Maestro flow can assert on `country-result-AFG`.

The pool is **237**: every ISO-3 in *both* JSON files — wider than the quiz's 193, because the map draws
Greenland, Puerto Rico and Western Sahara. The three excluded are the geometry-only `FACTLESS_ALLOWLIST`
entries, which would open an empty info sheet.

`matchedAs` carries the alias that matched so the row can show it — offering "Netherlands" for "holland"
with no explanation reads like a bug, and that line is the only place alias support is discoverable.

### Framing around the info sheet

`getCountryCameraStop` centres a bbox in the **whole** viewport — right for the quiz, whose panel is a
flex sibling, wrong here, where the sheet is a genuine overlay. So `quizCamera.ts` gained
**`getFocusedCameraStop`**: the same arithmetic plus a focus rect. `getCountryCameraStop` is untouched
so quiz framing cannot regress, and a test asserts the two agree when the focus rect *is* the viewport.

The camera always points at the viewport's centre, so putting a country elsewhere means pointing the
camera **away** from it by the offset between the two centres. **Both axes shift with the same sign,
and the missing negation is deliberate**: `mercatorY` is 0 at the north pole and grows southward, and
screen y also grows downward — the conventions cancel.

`getMapFocusRect` says which band that is: top is `safeArea.top + MAP_CHROME_HEIGHT`; bottom is the top
of the sheet (55% down) in portrait and the foot of the window in landscape; width is full in portrait
and `width − panelWidth` in landscape.

- **It uses the sheet's MAXIMUM height, not its measured one.** The card is content-height and only
  knows its extent after `onLayout`; threading that up would change the camera's inputs once per country
  and **fire the fly twice per search**. `PORTRAIT_MAX_HEIGHT_FRACTION` is the one literal, and
  `CountryInfoSheet`'s `maxHeight` derives from it.
- **`MAP_CHROME_HEIGHT` is why the band does not start at the top of the window** — without it
  Liechtenstein's northern tip landed under the toggle. An estimate mirroring `MapControls`' spacing,
  for the same re-fire reason.

**The pole clamp is load-bearing, and was found by prototyping.** Without it, searching Russia in
portrait sends the camera to latitude −54 and Russia leaves the top of the screen: its fit zoom is
already at the floor, so the 232 dp the offset wants is ~45% of the globe.

```ts
const half = viewport.height / 2 / worldPx;
const camY = half >= 0.5 ? 0.5 : Math.max(half, Math.min(1 - half, wanted));
```

Exactly five countries reach it on today's geometry — `USA`, `RUS`, `GRL`, `CAN`, `ATA` — pinned in
`focusedCamera.test.ts`. A sixth means the geometry moved, not the maths.

Its companion is **`getViewportFitZoom`**: the lowest zoom at which one world covers *both* axes.
`getWorldFitZoom` only answers for the width, which is all the launch camera needs because MapLibre
clamps the height itself. A stop fitted to *part* of the screen is different — asking for a zoom
MapLibre will override means the offset was computed against a scale the map never used. This is a
floor for the computed **stop** only; do not raise `Camera`'s `minZoom`, which is the pinch limit.

### The rest of the wiring

- `MapScreen` holds `focus: { iso3, nonce }`, set **only by a search**, never by a tap. The **nonce is
  required**: the same country searched twice yields an identical stop, and an identical stop is not a
  change, so the map would not move.
- **A map press clears `focus`**, so a later rotation re-fits the map rather than yanking the camera
  back. Rotation *while* focused does re-frame, matching quiz mode.

### `disableFullscreenUI` is not optional

Found on the emulator: **in landscape Android decides the field has too little vertical room and
replaces the entire screen with its own IME "extract" editor** — a white full-screen box with a SEARCH
button and the app nowhere to be seen. `SearchScreen.test.tsx` asserts the prop, which is as close as
Jest can get.

The quiz's own `TextInput`s do **not** set it and are likely to have the same problem in landscape —
unverified, because `.maestro/quiz.yaml` only types in portrait.

## Quiz mode

Three routes, none of which touch `src/app/index.tsx`: `/quiz` (setup, no map), `/quiz/play` (the
round), `/quiz/results` (score and review, no map).

Config crosses `/quiz → /quiz/play` as **router params** (`mode`, `subregions`, `fields`, `only`,
`seed`, `practice`), which makes a round deep-linkable and pinnable from a test. The finished round crosses to
results through **`quizResultStore.ts`**, a one-slot singleton — 193 × 5 graded fields will not fit in a
URL, and results are reached with `router.replace`, which tears down the second MapLibre surface. The
store **clears on read**, so a back gesture cannot resurrect a stale score.

### The three modes

| mode | stimulus | asks | map? |
|---|---|---|---|
| `facts` | the map flies to a country and paints it | the configured fields | yes |
| `locate` | a country's name | tap it on the map | yes |
| `flag` | the country's flag | the same fields as `facts` | **no** |

`MODE_USES_MAP` and `MODE_ASKS_FIELDS` are `Record<QuizMode, boolean>` rather than `mode === …` tests at
the call site, deliberately: a fourth mode fails to **compile** until someone answers them, and "does
this screen mount a MapLibre surface?" must never be answered by accident.

`play.tsx` reads them from a `config` that is `useState`-parsed once and never re-read, so the ternary
is decided on the first frame and cannot flip. Three things would break that licence, each named in the
comment above it: making the mode switchable mid-round; mounting `WorldMap` with `display: 'none'` "to
keep the tree stable" (which pays a full MapLibre init for nothing); and re-parsing params on render,
already forbidden because it would reseed `buildQuiz`.

**`buildQuiz` needed no change for `flag` or for practice** — it already reads `config.mode ===
'locate'`, and its second parameter is already an injectable pool. Multiple choice is the first thing
that did change it; see *Answering by button*.

**Two flags sit beside the mode and are deliberately not modes**: `practice` (*who* is asked) and
`choice` (*how* you answer). Both are orthogonal — `practice × choice × facts|locate|flag` are all
coherent — and neither has an answer to give `MODE_USES_MAP`, which is exactly the test for whether
something is a mode.

### The panel is a flex sibling, never an overlay

See *The paint bug*, escape 2. Belt to braces: one row per **configured** field for the whole round,
hidden with `display: 'none'` when the current country cannot be asked it; a fixed pool of chip slots;
one button whose label swaps `Check` → `Next`.

**`QuizPanel`'s root needs `flex: 1`.** Without it the panel shrink-wraps, the body `ScrollView`'s own
`flex: 1` resolves against a zero-height parent, and **every answer field collapses to nothing** — which
looks exactly like the fields failing to render.

**`LocatePanel` uses `flexGrow: 1`, and the two are not interchangeable.** Its portrait slot has *no*
explicit height (`getQuizPanelLayout` returns `panelHeight: null`), because a fixed-height panel left a
growing gap above the Check button. RN's `flex: 1` also sets `flexBasis: 0`, so a panel carrying it
reports a content height of zero to an auto-height parent and collapses; `flexGrow: 1` keeps
`flexBasis: auto` — content-height in portrait, still filling the stretched landscape column.
`quizPanelLayout.test.ts` pins both. **`flag` takes the `facts` branch**: same rows, so same need for a
definite height.

`LOCATE_PORTRAIT_HEIGHT` survives as an **estimate with one consumer** — `mapViewport`, which the reveal
camera fits into. Being a few dp out costs a marginally roomier frame; measuring it would mean threading
an `onLayout` into the camera's inputs, the same trade `getMapFocusRect` refuses.

### The keyboard is an inset, not a resize

The app is **edge-to-edge** (the RN 0.86 default), so Android does **not** resize the window when the
IME opens — `android:windowSoftInputMode` is irrelevant and `KeyboardAvoidingView`'s Android path
assumes a resize. `useKeyboardHeight` listens to `keyboardDidShow`/`Hide` and the screen gives that
space back as `paddingBottom`; the map absorbs the loss.

**Add `insets.bottom` to the reported height.** `endCoordinates.height` stops at the top of the
navigation bar, so reserving it alone leaves the Check button 56 px under the keyboard.

### Leaving mid-round asks first

A back press on `/quiz/play` raises a confirmation — **See my score** / **Discard and leave** /
**Cancel**. The score button is dropped when nothing has been checked. Wording and buttons live in
`quiz/exitPrompt.ts`, pure and unit-tested.

**It is `BackHandler`, not `usePreventRemove`.** Both work; `BackHandler` wins because expo-router's own
root handler is itself a `hardwareBackPress` listener and RN calls those in **reverse registration
order**, so a subscription added on mount runs first and returning `true` stops the pop dead.
`usePreventRemove` would need navigator context at render time — the thing this app avoids so screens
stay renderable bare in Jest. It is also not a public export: expo-router 57 **vendors React
Navigation** (there is no `@react-navigation` in `node_modules`) and reaches it via
`expo-router/react-navigation`.

`predictiveBackGestureEnabled` is **false** in `app.json`, so the edge swipe and the hardware button are
the same plain press. If that is ever turned on, re-check this — a committed predictive gesture is not a
press you can decline.

The listener registers **once for the whole round** and is reached through a ref kept current by a
second, dependency-less effect. Re-subscribing per keystroke would be churn, and the ref is written in
an effect rather than during render because of `reactCompiler`.

`ConfirmDialog` (see *The paint bug*, escape 4) is generic and takes its colours from `palette.ts`.

- **`onRequestClose` is required**, not optional. The dialog holds window focus, so Android's back key
  goes to it and never reaches the screen's own `BackHandler` — without it, back does nothing at all.
- **Buttons are stacked, not a row**: three actions do not fit at 411 dp once one is "Discard and leave".
- **The order changed when the native `Alert` was dropped.** `Alert.alert` on Android pops the array
  from the **end**, so the list had to be written backwards to read forwards. If it ever goes back to
  `Alert`, invert `buildExitPrompt`'s order again.
- **Jest cannot see any of the interception.** It resolves `BackHandler.ios.js`, a stub whose
  `addEventListener` stores nothing and returns a shared no-op `remove` — so tests invoke the handler
  directly and wrap that `remove` to observe it. That a real Android back press arrives here is
  `.maestro/quiz.yaml`'s job.

### Grading — forgiving about spelling, unforgiving about being a different country

Normalize (NFD, strip combining marks, drop punctuation, `&`→`and`, `st.`→`saint`, strip a leading
"the"), then accept an exact match, an alias, or a small typo. Aliases come mostly from `altSpellings`
("Ivory Coast", "Holland", "UK", "DRC"). The build strips **the cca2 code** out of that list — not
entries under some length — or "fr" would pass for France while UK, USA, UAE, DRC and RSA would be
thrown away.

Typo tolerance is **Damerau**, not plain Levenshtein: adjacent transposition is the commonest typing
mistake, and plain Levenshtein scores "Frnace" two edits from "France". Budget: 0 edits under 5
characters, 1 under 9, 2 above.

**The confusable guard is load-bearing.** Edit distance alone accepts **"Gambia" for Zambia**. So a
*fuzzy* match (never an exact or alias one) is rejected outright when the thing typed is itself the name
of another country, via `NAME_INDEX`. `grading.test.ts` sweeps all 193 × 193 combinations.

Currency is the one **set field** — several chips rather than one value — and it matches **exact before
fuzzy**: with one greedy pass a loosely spelled chip can consume the entry a later chip matches exactly.
`SET_FIELDS` stays a list of one rather than collapsing into `field === 'currency'`, because the
distinction is real and the grader and the panel both have to agree on it. Head nouns count when
unambiguous *within that country*: "rand" for the South African rand — but not "peso" for Cuba, which has
two. Currency **codes are rejected**: "USD" is different knowledge from "United States dollar".

The rules: name and capital are single answers (any one of South Africa's three capitals counts),
currencies need **all** of them except Zimbabwe's nine, where **three** is the cap (`CURRENCIES_REQUIRED`),
population is within **±20%**, parsed from `68,000,000`, `68m`, `68 million` or `1.4bn`.

`gradeLocation.ts` is its own module rather than a sixth case in `gradeAnswer.ts`: everything there is
about being forgiving with a *string*, and none of it has anything to say about an ISO-3 code out of
`pickCountry`. There is one right answer and comparing it is `===`.

### Who gets asked

`QUIZ_COUNTRIES` is the **193 UN member states** with an outline. mledoze flags 194: it counts **Vatican
City**, a permanent observer rather than a member — and the only UN-flagged record with no World Bank
population. `NON_MEMBER_ISO3` excludes it by name.

A country missing data for a selected field is still asked; it just skips that field. Only one real case
exists: **Micronesia has no currency**. A country left with nothing askable drops out entirely.

Order is a **seeded** Fisher-Yates (`mulberry32`), so a round replays identically and Maestro can pin
it. **A practice round is the one config the seed does not pin** — selection reads the device's mastery
table, so "Play again" gives a different ten. That is right for practice, and a real break from the rule.

### Locate mode specifics

**Nothing may name the pick before it is checked.** "Your pick — New Zealand" under a prompt reading
*Find New Zealand* answers the question outright and lets a player retap until the panel agrees. So an
open question gets a bare "Ready — press Check", and the highlight on the map is the only thing that
says *which* country is selected — which is the judgement being tested. Once graded there is nothing
left to spoil and the verdict names it.

**The camera never resets, and only ever moves to reveal.** A locate round issues **no stop at all**
while a question is open: `WorldMap`'s own default is the world-fit opening this mode wants, and the
player pans from there. The reveal stop is never withdrawn (see *Camera*), and leaving it in place *is*
the behaviour — the next question starts from wherever the reveal left you.

- **`easing: 'fly'`** — the player may be at zoom 8 in the Alps when the answer is in Peru. The
  objection that a fly telegraphs the destination doesn't apply to a move that happens after the answer.
- **The red sits for `REVEAL_DELAY_MS` (700) before the camera moves**, so the verdict reads as being
  about the country you picked. `answerShown` and `revealStop` are two pieces of state written by that
  one timer; the panel takes `answerShown` as a **prop** rather than running its own timer, so words and
  map cannot get out of step.
- **Pressing Next inside the delay cancels the reveal** — they have moved on.
- A correct guess moves nothing at all.

Checking with **nothing** picked is legal, scores as blank/wrong, and still reveals — the "no idea, show
me" move, matching facts mode where Check with every box empty has always been allowed.

**`location` is a `GradedField` but deliberately not a `FieldId`.** Everything iterating
`ANSWERABLE_FIELDS` — the field picker, `toAnswerInput`, the `fields=` parser, `gradeField`'s exhaustive
switch — is about a fact you type into a box. Keeping it out means none of them needs a case, and no
deep link can smuggle `fields=location` into a facts round.

**`buildQuiz` skips its completeness filter for locate**: that filter drops a country that cannot answer
any *chosen fact*, and a locate round asks something every country can answer — a config carrying
`fields: ['currency']` over from a previous round must not silently drop Micronesia.

### Retrying what you got wrong

`/quiz/results` renders a full per-question review, and the button under it starts a round asking
**only the countries that were not fully correct, and only the fields each of them actually got
wrong**. Miss France's currency and Germany's capital in a five-field round and the retry asks France
its currency and Germany its capital — nothing else, and neither country the other's miss.

`buildRetryConfig` (`src/quiz/retryRound.ts`, pure, type-only imports) is the whole decision;
`results.tsx` supplies `newSeed()` so that module stays pure, the split "Play again" already makes.

**`QuizConfig` gained one field, `only: RetryTarget[]`** — `{ iso3, fields }` per country, crossing
the URL as `only=FRA:capital.currency,JPN:name`. A comma between countries, a colon before the field
list, a dot between fields; **dots rather than `+`, which a form-encoded query string reads as a
space**. A bare `FRA` with no colon is legal and means "the round's own fields", which is what a
hand-typed link says and what a `locate` retry emits (`location` is not a `FieldId`, so there is
nothing to name). Params rather than a store, for the reason `quizConfig.ts` already gives: a store
would also break "Play again" on a retry round, which replays the config through the URL.

Four rules, each of which cost a decision:

- **`only` REPLACES the subregion filter, it does not intersect it.** `?only=FRA&subregions=Eastern
  Africa` is two individually sensible params that intersect to an empty round. `subregions` is still
  carried untouched, because "Change settings" pops back to a setup screen that shows it ticked — the
  same reason `fields` is carried through a locate round.
- **`only` beats `practice`**, and `buildRetryConfig` sets `practice: false` so a real config never
  says both. The precedence rule only ever decides a hand-typed link.
- **The round's `fields` stays the UNION of every target's**, and that is load-bearing: `QuizPanel`
  mounts one row per configured field **once for the whole round** and hides the ones the current
  country is not being asked (`askable = new Set(question.fields)`). A `fields` narrower than some
  target's would mount no row for that field and the question would silently lose it. Per-country
  targets feed machinery that already existed for a country missing a fact.
- **It never narrows `fields` to empty.** `fields: []` round-trips through `parseQuizParams` into
  `DEFAULT_FIELDS`, so emitting one would rewrite a locate round's carried currency selection into a
  name round.

`only` is read in **two** places, which is the one wrinkle. *Who* is asked is honoured at the call
site — `play.tsx` injects `countriesWithCodes(...)` as the pool, so a bare `buildQuiz(config)` ignores
it exactly as it ignores `practice`. *Which fields* each is asked is honoured **inside `buildQuiz`**,
because that is already where per-question fields are computed and there is nowhere else they could
come from. This is the first feature that did not fit through the injectable-pool seam alone.

**Ended early is correct by construction**: `missedCountries`/`missedTargets` read `run.results` and
never `run.total`, and `finish` is handed only the questions actually checked — so a country never
reached cannot be retried. `total` sits right there in `QuizRun` and is the obvious wrong thing to
reach for, which is why a test says so.

Chaining converges: a retry's own misses are a subset on both axes, and a perfect retry yields `null`
and no button. Mastery needed nothing — `recordResult` fires per checked question regardless of how
the pool was chosen, so a chain of retries tightens the score on exactly the weak field.

The label counts (`results.retryMissed`, in the **plural** catalogues — Russian needs three forms).
The count is in the button and not left to the review heading because the footer is pinned while that
list scrolls, and 3 versus 87 is the one fact worth having before committing.

### Answering by button

`choice` on `QuizConfig` swaps every answer box for a 2×2 grid of four options — one right, three
wrong. It composes with `facts` and `flag`; in `locate` it is **carried but ignored**, since the answer
there is the tap. `play.tsx` derives `config.choice && MODE_ASKS_FIELDS[mode]` once, beside `showsMap`
and under the same licence.

**The distractors are the feature.** Two rules in `quizOptions.ts` carry it, and both fail silently:

- **One wrong answer per ring, working outward** (`CHOICE_TIER_QUOTA`), so a Peru capital question
  reads *Lima / Quito / Havana / Oslo*: the answer, a neighbour, one more from the same continent,
  and one from nowhere near.

  | slot | source |
  |---|---|
  | the answer | the country itself — same subregion, trivially |
  | distractor 1 | the same **subregion** |
  | distractor 2 | the same **region**, a different subregion |
  | distractor 3 | a **different region** |

  Both earlier shapes were worse in opposite directions: drawing everything nearest-first put all
  four in one subregion, which is a coin flip with nothing to anchor it; reserving one far slot and
  nothing else left two neighbours crowding the answer. **This is a deliberate difficulty
  reduction** — the tightest discrimination drops from three same-subregion candidates to two — and
  what it buys is a wrong answer that *teaches* ("that one is not even on this continent") rather
  than one that is merely hard, which is the right trade for the mode that exists as the on-ramp to
  typing. Satisfiable everywhere: the three subregions with under four UN members (Australia and
  New Zealand 2, North America 3, Polynesia 3) each need exactly one neighbour and have one, and
  every region has at least four subregions.

  **The top-up when a ring comes up short is not dead code, and the reason is `currency`.** A ring
  shrinks whenever its candidates are rejected for sharing a display string with the answer, and
  every euro country in Western Europe leaves exactly one usable same-subregion currency (the Swiss
  franc). `name` and `capital` never reach it on today's data, which is why those two are the
  fields `quizOptions.test.ts` pins the exact distribution on, over all 193.
- **No option may be a value that is ALSO true of the country.** South Africa shows one of three
  capitals and a two-currency country shows one of two, so "not the displayed answer" is not enough —
  the guard is over `nameAliases`, every capital and every currency, normalized. Without it a question
  has two right buttons and nothing on screen says so. Display strings are deduped on top of that,
  which is what stops two "Euro" buttons or two countries whose populations format identically.
  `quizOptions.test.ts` sweeps all 193 × 4.

**The catalogue is all 193, never the round's pool** — a two-country subregion and an `only=FRA` retry
could not fill four buttons out of themselves. Who is asked and what the wrong answers are is not the
same question; plausibility is the tiering's job.

**Options are drawn from `makeRng(seed ^ CHOICE_SALT)`, a separate mulberry32 stream**, and that is
load-bearing in the same way `PRACTICE_SALT` is: sharing the shuffle's stream would mean turning
multiple choice on changed *which countries a seed asks and in what order*, breaking every pinned round
and `.maestro/quiz.yaml`'s pinned-seed answer — and looking like a data change rather than a feature.
`quizBuilder.test.ts` asserts the order is identical either way. `makeRng`/`shuffle` moved to
`random.ts` so `quizOptions` could use them without a cycle; `quizBuilder` re-exports both.

Each field re-ranks the catalogue, so the capital buttons are **not** the capitals of the countries in
the name buttons — otherwise a two-field question is answerable twice over from one piece of knowledge.

**Grading is `gradeChoice.ts`, a sibling of `gradeLocation.ts`, and `gradeAnswer.ts` is untouched.** A
pick is already a canonical string, so none of the spelling tolerance applies; more to the point,
routing picks through `gradeField` would mean relaxing `CURRENCIES_REQUIRED` for choice rounds — a
change inside the grader that `grading.test.ts` and `gradingRu.test.ts` sweep 193 × 193. The result is
an ordinary `QuestionResult`, so `summarize`, `recordResult`, the review list and `buildRetryConfig`
all needed nothing. `buildRetryConfig` **carries `choice` through**: making a player type what they had
just answered by button would be a different round.

**A correct pick is a 1-in-4 guess and records in mastery identically to a typed answer**, so the map
greens faster for someone who only plays choice rounds. Deliberate — `commit()` stays one seam for
every mode, and `MASTERY_PRIOR` is what stops a lucky answer retiring a country. The smallest fix if it
ever reads wrong is one branch in `commit()`, with no change to the table's shape.

**The buttons are a fixed pool of `CHOICE_OPTION_COUNT` slots**, mounted once and hidden with
`display: 'none'`, exactly like `ChipInput`'s `MAX_CHIPS` — they share a window with a live MapLibre
surface, and only their *text* changes between countries. `AnswerField` branches on the round's
`choice` prop and **not** on whether `options` happens to be set: a hidden row has no options, and
branching on their absence would swap an input back in mid-round.

A choice round takes the **`facts`** layout branch — a definite `panelHeight`, or `QuizPanel`'s body
`ScrollView` resolves `flex: 1` against nothing and the buttons collapse just as the inputs would. The
grid is 2×2 rather than four stacked rows because it halves the height that costs;
`PORTRAIT_HEIGHT_PER_CHOICE_FIELD` is 0.16 against the typed 0.1, still clamped by
`PORTRAIT_MAX_FRACTION`. `width: '48%'` against a fixed 8 dp gap, since 4% of any panel this app
produces is wider than 8 dp. The currency row drops its "3 of 9" label in a choice round — that count
is a promise about typing three chips, and a grid asks for one of four.

No IME is ever summoned, so `autoFocusFirstField()` and the focus chain are skipped.

### Flag mode specifics

**Nothing names the country, at any point** — not before the answer, and **not after it either**,
because that is what `facts` mode does. A capital-only round reveals `Answer: Kathmandu` and never says
Nepal; the map is what answers "which country was that", and a flag round has no map.

That is why `CountryFlag` gained a `label`: its default names the ISO-2 code, which on web becomes
`alt="Flag of NP"` — the answer, handed to a screen reader unasked. It does not hide the
`<img src="/flags/np.webp">`, so view-source always spoils a web round; it fixes the case that matters.

`FlagStage` takes the map's flex shape — `flex: 1` plus a `minHeight` — because a flag cannot absorb the
keyboard the way a map can: measured on 411x914, a five-field round with the IME open leaves the stage a
fair share of **60 dp**. So the stage keeps a floor and the panel gives way (it already has
`flexShrink: 1` and scrolls). Paired with the `compact` swap while the IME is up, the floor while typing
sits *below* the map's own 96 dp, so a flag round never leaves the panel less room than a facts round.

The plaque behind the flag is not decoration: Japan, Finland and Nigeria are mostly white and read as a
shapeless blob against the navy.

### The flags are raster, at each flag's own true aspect ratio

**Worth reading, because the emoji route looked obviously cheaper and cost most of an afternoon.** The
flag used to be a regional indicator pair in a `Text`. That works at 20 dp and falls apart the moment
you want a big one, because **an emoji is a glyph, not an image**, and each of these is a property of
glyph layout rather than a bug:

- **It is not centred in the box the text engine lays out for it** — 35 dp of gap above and 3 below,
  measured on Android at 120 dp.
- **The error is proportional to the font size**, so it hid at 20 dp and was glaring at 120 — and made
  the first diagnosis wrong, because the flag looked fine whenever the keyboard was up (smaller size).
- **The glyph can be drawn taller than its own line box**, and Android clips it.
- **`transform: translateY` to correct that clips it too** — Android composites a transformed child
  against its pre-transform bounds.
- **Below Android 13 emoji are 136x128 bitmap strikes**, so any large flag is an upscale.

An image has none of those: it occupies exactly the box it is given and centres by arithmetic.
Switching deleted the nudge constant, the line-box-derived frame, `useFlagSupport` and its canvas
measurement, and the emoji branch on web. That argument is unchanged; only the file format under it is.

#### Why they stopped being SVGs

`flag-icons` normalises every flag to **4:3**, and almost none is. Measured over the 208 country files
in the raster pack: **4 are 4:3**, 103 are ~3:2, 64 are ~2:1, and the outliers are real — Qatar 28:11,
Nepal a pennant at 0.82, the Vatican square. So the app spent its whole life drawing nearly every flag
the wrong shape, most visibly in the one round that asks about nothing else.

Dropping SVG also removed a dependency on **expo-image's vendored AndroidSVG decoder** — a
simplification, not a regression, and `react-native-svg` was never installed.

#### Two scripts, because the source pack cannot be committed

The same split as `build:data` / `enrich:data`, for the same reason:

| | |
|---|---|
| `npm run flags:import` | **one-off**, needs `temp/classic_big_1000` (189 MB, gitignored). Writes the committed masters `assets/flags/<iso2>.webp` — 1024 px on the long side, WebP q82, 2.77 MB — and `src/components/flagAspects.ts`. |
| `npm run flags:data` | **offline**, needs only the committed masters. Derives the thumbs, both map raster scales, the `public/` copies and four generated require maps. |

Four sources feed the import, in priority order, and an unresolved code **throws**:

1. **A hand-placed override**, any file named `<alpha-2>-…` — `CH-1.0-1200.png`. It beats the plain
   `ch.jpg` beside it, and two overrides for one code throw rather than letting readdir order decide.
   The rest of the filename is documentation and is deliberately **not parsed**: the image's own
   dimensions are what the master is built from, so a filename disagreeing with its contents could
   only mislead. (`DE-O-1200.png` has a typo where its ratio should be, and imports correctly.)
2. **The pack's JPEG**, 200 of them, after dropping 14 non-country files (`eu`, `nato`, `scotland`, …)
   and repairing three filenames.
3. **A loose SVG dropped into the pack** — Montenegro and South Sudan, simply absent from it and both
   quiz questions, and Syria, present but three governments out of date. Syria's is dropped in as an
   override (`SY-0.67-600.svg`), so rule 1 and rule 3 compose rather than competing.
4. **`flag-icons`' 4x3 SVG** for the **41 dependent territories** the pack does not carry — Puerto
   Rico, Kosovo, the Falklands, New Caledonia. Those 41 stay 4:3; none is ever a quiz question.

`@resvg/resvg-js` now runs only for those 44 SVGs, and `sharp` (devDependency, prebuilt) does the rest.

**The six overrides are the two ways a flag pack goes wrong.** *Shape*: Switzerland is drawn 3:2
and is square; Germany came out 1.6517 against an official 3:5. *Content*: Libya was the pre-2011
plain green flag, Mauritania predated the red stripes added in 2017, Afghanistan was the republic
tricolour and Syria the pre-2024 one — no amount of care about ratios helps with a flag that is
simply out of date, and nothing in this pipeline could have noticed. **A flag that changes can change
shape with it**: Afghanistan's white Emirate flag is 2:1 where the tricolour was 3:2, which is why
`FLAG_ASPECTS` is re-measured off the written master and never carried over — the map icon went
27x18 to 36x18 with no line of code touched. Same shape as `scripts/countryOverrides.mjs`, minus its "this override stopped differing"
check, because the pack is a frozen folder rather than a package that can be upgraded underneath us.

**A master's ratio is its own pixels, and 1024 px on the long side quantises it.** Germany's 5:3
source lands at 1024x614 = 1.6678 rather than 1.6667, because 614 is the closer of the two integers.
Every flag carries the same ~0.1% quantisation, `FLAG_ASPECTS` is measured off the written file rather
than off the source, and `flagAssets.test.ts` asserts the two agree — so the error is consistent and
visible rather than a discrepancy waiting to be found.

#### Three tiers, because there are three consumers

| tier | where | size | drawn at |
|---|---|---|---|
| master | `assets/flags`, `public/flags` | 1024 long side, WebP, 2.77 MB | the quiz's flag round, `fill` |
| thumb | `assets/flag-thumbs`, `public/flag-thumbs` | **96 px tall**, WebP, 0.33 MB | info sheet 30 dp, search row 21, results row 18 |
| map | `assets/map-flags` (both scales), `public/map-flags` | **18 / 54 px tall** + border, PNG, 1.06 MB | the `country-flag` symbol layer |

The thumb tier is not tidiness: the search screen lists every country it matches, and handing fifty
21 dp rows a 1024 px master apiece is fifty full-size decodes on a keystroke.

`public/` is written by **`copy-web-assets.mjs` alone** now, as a straight `copyFileSync` of `assets/`.
`build-flag-assets.mjs` calls it rather than writing those directories itself, so there is one copier
rather than two places that could disagree — and `webAssets.test.ts` can assert **byte identity**,
which it never could while `public/map-flags` was a second render.

**The require maps are generated because Metro cannot do a dynamic `require`** — there is no way to
write a template-literal require path. 249 literals per map is the honest way to say that.

#### Sizing: heights, and each flag's own width

`FLAG_SIZES` is `{ fontSize, height, maxWidth }` and has **no `lg`**, deliberately. A fixed size is a
HEIGHT — a row of flags shares a baseline and a cap height, not a width — and `flagBox()` derives the
width from `flagAspects.ts`. `maxWidth` is `round(height x 2.1)`, which **clamps Qatar and nothing
else**: the next widest flags cluster at 2.00-2.01, sixty-four of them, and a cap of exactly 2 would
shave half a percent off all of them for no reason. A clamped flag gives up height rather than being
cropped.

Width is a property of the flag now, so a *list* of them has a ragged right edge. `CountryResultRow`
and the quiz results review each park theirs in a `width: maxWidth` slot — kept at the call sites,
because they are the two screens that are lists; the info sheet's single header flag needs none.

The flag round passes `fill`: `width: '100%'` with **`aspectRatio` from `FLAG_ASPECTS`, per country**,
`maxHeight: '100%'` so it gives way when height binds (which is what makes landscape work, and what
Nepal now exercises in *portrait*), and `maxWidth: 460` so a desktop browser does not render wallpaper.
The frame carries **no padding** — padding inside an `aspectRatio` box would make the picture some other
shape — so it is a border directly around the flag with `overflow: 'hidden'`. That clipping is safe here
**and only here**: the thing being clipped is an image that occupies exactly the box, not a glyph
hanging out of its line box.

`FLAG_SIZES`' `fontSize` survives for exactly one case: BES, the only record with no flag, where the
white-flag glyph is still text.

**`webp` had to join `build-web.mjs`'s `globPatterns`**, and this is the highest-risk line in the whole
change: that list is an explicit set of extensions, and a format missing from it is simply absent from
the precache manifest. The app would install, look perfect online, and show nothing but two-letter
badges the moment the network went — the one failure this project exists to prevent.

**The web draws the image unconditionally**, where it used to use emoji except on Windows. In production
the service worker precaches all three tiers; in dev there is no worker (`+html.tsx` registers it only
for `production`), so every flag is a cold fetch from Metro. A search row now costs ~1.3 KB rather than
a full master, which is most of the old "flags take forever on web". The unbuilt fix for the quiz round
is to prefetch the next question's flag, which this app can do because it knows the whole question order
up front.

## Per-country mastery

The app remembers how you answer each country, colours the map by what you know, and can build a
practice round out of your weak spots. It is the first thing in the project that **persists anything**.

### The model is a weakness score, and there is deliberately no clock

Per `(iso3, GradedField)` the table keeps `asked`, `correct`, `lastCorrect`. Nothing else. No dates, no
due times, no spaced repetition, and **`Date.now()` still appears nowhere in `src/`**.

```
recency  = 1 - RECENCY_WEIGHT * (lastWrong / fields)   // weight = 0.4
display  = (correct / asked)            * recency      // what the map paints,  [0, 1]
practice = (correct / (asked + PRIOR))  * recency      // what the sampler weighs, prior = 1
```

**Two scores, one formula, one parameter apart** — `scoreWith(record, prior)`. They disagree on purpose:

- **Never asked is `null`, never `0`.** A country you have not seen and one you always get wrong are
  different things. The null becomes an *absent* property, which `['has','mastery']` splits into the
  grey band.
- **The displayed score carries NO prior, and 100% is reachable.** Everything you were asked about a
  country, answered right, is 100% — however few times that was.
- **The prior survives only in the practice score**, so a country proven once (weight ~0.40) resurfaces
  far more often than one proven nine times (~0.16). One lucky guess must not retire a country, and
  that is the only thing the prior was ever buying.
- **Fields are pooled, not averaged as per-field rates**, so the score is weighted by how often you were
  actually asked. The recency discount is *proportional*.

**The prior used to apply to both, and that was the one real design mistake here.** Every graded field
counts as one `asked`, so with a name-only round a country just answered **correctly** painted at
**50%**, and reaching the green 90% band took **nine consecutive correct answers on that one country** —
unreachable across 193 countries, so the map sat permanently orange however well anyone played. The
error was conceptual: **the prior conflated "you are mediocre at this" with "we have not asked you
much".** The map already says the second with its grey band, so the colour never has to hedge; the
sampler has no such band, which is exactly why the hedge belongs there and only there. **If you ever
hand `pickWeakSpots` the display scores, one lucky guess retires a country** — `practicePool.test.ts`
pins the ordering.

`masteryOf` validates its counters and returns `null` rather than `NaN` for anything non-finite.
`asked: Infinity` is the instructive case: it divides to a finite `0`, painting a country as "always
wrong" on the strength of a corrupt counter.

### `recordResult` does not notify — and that is the whole design

**`/quiz/play` is pushed over `MapScreen`, so the explore map's surface stays mounted underneath for the
entire round.** Notifying on every answer would re-fold the outlines and re-upload 1.6 MB of geometry to
a backgrounded GL surface up to 193 times.

So the store splits: `recordResult` updates the table and schedules a write, silently; `publishMastery`
recomputes scores, bumps a version, flushes the write and notifies. `play.tsx` calls the first from
`check()` and the second **once, on unmount** — the single event covering finishing, End quiz, Discard
and leave, and a plain back-out.

**Recording happens in `check()`, not `next()`.** `check()` is guarded by `if (!question || result)
return`, so it fires once per question — and recording in `next()` would lose the last checked answer
whenever a player checks the final question and backs out. *Discarding a round throws away the score,
not what you learned.*

### This is the first thing to change `<GeoJSONSource data>` after mount

`worldGeoJson` is a module constant precisely so MapLibre never re-uploads geometry. Mastery is dynamic,
so it cannot be folded in at module load. Three things keep the churn down, all pinned by tests:

- **`withMastery` returns the same collection object when the table is empty**, so a player who has
  never done a quiz is byte-identical to before.
- **The fold runs unconditionally in `MapScreen`, not only in mastery mode.** Folding on demand would
  change the identity on every switch *into and out of* the mode — two re-uploads per visit.
  Unconditional makes the identity a pure function of the mastery version.
- **Geometry is passed by reference**, exactly as `withChoroplethValues` does.

`WorldMap.web.tsx` needed a `setData` effect, because it adds the source inside `map.once('load')` —
plus a ref so a table landing before the style loads is not dropped. Native needs neither: `data` is a
prop and React pushes it.

**If this ever hitches or blanks on a device**, the escape hatch is to move mastery into the paint
expression instead — `['match', ['get','iso3'], 'FRA', 62, …]`, at most 193 pairs, rebuilt per publish.
That re-uploads nothing, because a paint-property change is the code path a fill-mode switch already
uses. The cost is that `fillColor` stops being a module constant for that ramp.

### The mastery ramp is the first LINEAR one

`logRampFillColor` could not be reused: **a mastery score has a legitimate zero** — one question,
answered wrong — and `log10(0)` is the `-Infinity` the population ramp spends four paragraphs avoiding.
`linearRampFillColor` sits beside it with the same `['has', property]` split and no logarithm. That
broke a `describe.each` in `choropleth.test.ts` asserting decade spacing for *every* ramp; it is now
split into shared invariants over all three and log-only tests over the two that are logarithmic.

Seven stops, matching the other ramps — **that count is load-bearing**, because the legend is one
always-mounted view whose swatches are swapped by prop. Stops are in **percent**, so the legend's labels
are free. Palette is ColorBrewer RdYlGn, echoing the quiz's red-wrong/green-right language. **Known
trade: RdYlGn is not colourblind-safe**; the drop-in swap is RdYlBu-7.

`ChoroplethRamp` gained an optional **`noDataLabel`** so mastery's grey band reads *"not asked yet"* —
the grey countries are exactly the ones worth practising, which is most of the mode's value. It swaps
the text of a mounted row, so it inserts no view.

### Practice is a `QuizConfig` flag, not a fourth `QuizMode`

It is orthogonal: it decides *who* is asked, not *how*. `practice × facts|locate|flag` are all coherent.
It crosses the URL as `'1'|'0'`, always emitted, absent meaning false.

`pickWeakSpots` is weighted sampling **without replacement**, seeded and pure:

```
weight = PRACTICE_FLOOR + (1 - mastery) ** PRACTICE_EXPONENT   // 0.15, 2
```

**A never-asked country weighs exactly as much as one always answered wrong.** Unseen is maximally weak,
which is what makes practice work on a fresh install and lets it double as a way through the whole
world. Nothing has weight zero, so consecutive rounds differ and a fully-mastered pool still yields a
full round; the spread is about 7:1.

The pool handed in is `countriesIn(config.subregions)`, so "practise my weak spots in Africa" works for
free. **Practice and the region picker INTERSECT, and the setup screen has to say so** — they are
orthogonal questions (*who* versus *where from*), which is why they are two sections rather than one
exclusive list. The first version shipped with the region note still saying *"all 193 UN member
states"*, which is wrong the moment practice is on; the note is now practice-aware
(`quiz-setup-scope-note`) and pinned by a test. If revisited: making them exclusive by *hiding* the
region picker is the worst option — the selection appears to vanish; disable it with a reason instead.

`PRACTICE_ROUND_SIZE` is **10**, the app's first round-length bound of any kind: a normal round is still
the whole filtered pool, 193 questions for the world.

### Storage

One AsyncStorage key holding one versioned JSON blob, positional tuples `[asked, correct, lastCorrect]`.
**Measured worst case — 193 countries × 6 fields — is 39 KB**, asserted in `masteryCodec.test.ts`. One
key rather than 193 because the choropleth needs the whole table on the first frame.

`decodeMastery` **never throws**, and validates **per field**: one corrupt entry costs one entry, not a
player's history. An unknown ISO-3 is kept rather than rejected — validating it would mean importing
geometry into a pure module — and simply never matches a feature. `saveMastery` swallows its rejection:
this is a cache the player can regenerate by playing, and a failed write must never cost them a round.

Writes are debounced 2 s with an explicit flush on publish. **That `setTimeout` is not a clock** —
nothing time-dependent enters what is stored or scored.

**`masteryStorage.web.ts` is not optional.** AsyncStorage 2.2.0's web path reaches straight for
`window.localStorage` with no guard, and `web.output: "static"` renders every route in Node, where there
is no window. It is a file-extension split, not a `Platform.OS` check.

### Resetting — the third door into the store

The bottom of `/quiz` carries a **Reset mastery** button behind the same `ConfirmDialog`. Its wording
lives in `quiz/resetPrompt.ts`, and it **names the count**, because "your progress" is an abstraction
and "37 countries" is the thing a player would actually miss.

`resetMastery()` behaves like neither sibling, and all three differences are load-bearing:

- **It notifies unconditionally.** `publishMastery` is guarded by `dirty`, and a reset records nothing,
  so routing through it would be a silent no-op with the map still painting deleted scores.
- **It writes immediately.** `flushPersist()` cancels the pending 2 s debounce first, so the write from
  the round just played cannot land a second later and resurrect what was deleted.
- **A `cleared` flag guards the import-time read.** The module fires `loadMastery()` at import and
  merges with `mergeTables(stored, table)`, which returns `stored` verbatim when memory is empty — so a
  reset landing before that read resolves would be undone by it. Reachable only via a deep link straight
  onto `/quiz`, and one line to make impossible.

**`__resetMasteryStore` is not this**: it clears the listener set (dropping `MapScreen`'s subscription
for the life of the process), rewinds `version` to 0, and writes nothing. It stays the test-only rewind.

Nothing new was needed in either storage module: `encodeMastery({})` is a well-formed empty payload, so
`saveMastery({})` is a correct clear on both platforms — no `clearMastery`, and no second place that
knows the key.

The button is **disabled when nothing has been asked**, and the note says so rather than leaving a live
control that does nothing. That is the only reason the setup screen subscribes to the store at all; it
subscribes **inline**, not through a hook, for the `reactCompiler` reason below.

### What Jest cannot see here

- That a linear `interpolate` inside a `case`/`has` wrapper **parses in the native renderer**.
- That **replacing `<GeoJSONSource data>` on a live map redraws** rather than blanking or hitching.
  Nothing in the app had ever done it. **This is the riskiest unproven part.**
- That **AsyncStorage survives a cold start** — persistence across process death *is* the feature. Same
  in reverse for a reset.
- That the map redraws when handed back its **original** collection, which is what a reset does.
- Whether the ramp is legible, and readable by a red-green colourblind player.

`.maestro/mastery.yaml` covers the parse and the swap structurally, but **cannot assert which countries
a practice round picked** — the pool is a function of device state, not the seed. That is a permanent
reduction in what E2E can prove here, unlike `quiz.yaml`, which pins a seed precisely so it can.

## Localization

English and Russian, and "fully" means the data too: every country name, capital, language, currency and
region has a Russian value, and the quiz grades Russian answers with Russian rules.

### `useTranslator`, and why `t` alone is a trap

**Read this before touching anything here.** A component gets its strings from
`const t = useTranslator()`, **never** from a module-level `t(key)` import. The module-level `t` still
exists and is still correct — `labelGeoJson` and `formatters` use it — but calling it *inside a
component* does not work, and the way it fails is invisible in every test.

`reactCompiler: true`. A call like `t('quiz.open.label')` takes a constant and reads a module singleton
the compiler cannot see, so it has **no reactive inputs at all** and the compiler is entitled to compute
it once and reuse the result forever. It does.

The symptom, found on a device and not by 997 passing tests: switching language updated the toggle and
the map labels and left the three pills beside them in English — until the next tap on a pill
invalidated that memo. A subscription in the parent does not help: the child's props are unchanged, so
the compiler skips it entirely.

`useTranslator()` returns the translator for the active locale, and `translatorFor` is memoised per
locale — so its **identity** changes exactly when the language does, and every `t(...)` now depends on
something the compiler tracks.

- Pure modules take a `Translator` as an argument instead — `buildExitPrompt`, `buildResetPrompt` — which
  keeps the decision they encode legible to Jest.
- Non-component code passes an explicit locale: `formatCompactNumber(n, locale)`,
  `getCountryFacts(iso3, locale)`, `labelTextFor(field, facts, locale)`.
- This is the same lesson as the `useWindowDimensions` trap under *The web target*: **a subscription has
  to stay somewhere the compiler can see it invalidate a render.** Reading the singleton directly is the
  shape that goes stale.

### The locale itself

`src/i18n/locale.ts` is a module singleton with subscribe/notify, modelled on `masteryStore.ts` — no
context, no provider, so screens stay renderable bare in Jest. Two deliberate differences: no write
debounce (once per tap, not 193 times a round), and **the startup storage read notifies only when it
disagrees** with the device default, because the common case is agreement and a spurious notify
re-renders the map's layers for nothing.

The initial value is `Intl.DateTimeFormat().resolvedOptions().locale` — **not `expo-localization`**,
which would be a native dependency, an `app.json` edit, an `expo prebuild` and a full rebuild for one
string Hermes already has.

`locale.web.ts` is the sibling: on the web the language is a property of the deployment, so `setLocale`
is a document navigation and `subscribeToLocale` never fires. Every call site is written against the
native signature, so there are **still zero `Platform.OS` checks in `src/`**.

### The catalogues

`en.ts` is the schema — `MessageKey` is `keyof typeof en`, `ru.ts` is `Record<MessageKey, string>`, so a
missing or extra key is a **compile error**. `catalogue.test.ts` covers only what a type cannot see: an
empty value, a dropped placeholder, a string left in English.

Counted messages are separate (`en.plurals.ts` / `ru.plurals.ts`) because English needs two forms and
**Russian needs three**. `pluralCategory` is hand-rolled rather than `Intl.PluralRules`, the same call
`normalizeText.ts` makes about its combining-mark range: Hermes delegates `Intl` to Android's ICU, a
different implementation from the Node the tests run on. The 11–14 exception is checked first, or you
get "11 страна".

**Every leftover English table is a bug of the same shape**, and two shipped: `FieldPicker` kept a local
`FIELD_HINTS` map, and `AnswerField` passed its own `'Your answer'` / `'e.g. 12,000,000 or 12m'` literals
to `TextInput` while `quiz.placeholder.*` sat in both catalogues, correct and **entirely unreferenced** —
which a type cannot see, since `ru.ts` is complete either way. Words go in the catalogue AND get read
back out of it.

### The data

`countryFacts.json` gained `translations.ru` per record. Each dictionary joins on a stable identifier
rather than a position, so a list reordered upstream cannot silently relabel every entry.

| Source | What it gives |
|---|---|
| `world-countries` `translations.rus` | country name + official name, **all 250, no gaps** |
| `src/data/ru/capitals.json` | 247 capitals, keyed by the English string |
| `src/data/ru/currencies.json` | 162 currencies, keyed by ISO-4217 |
| `src/data/ru/places.json` | 6 regions + 24 subregions |
| `src/data/ru/countries.json` | per-country overrides and extra aliases (Голландия, Бирма, США) |

Hand-authored, keyed on **codes rather than positions** so a mis-join is impossible, and regenerated with
`npm run enrich:data`. A missing entry fails the build (`russianIntegrityProblems`), checked over all 250
records rather than the 193 quiz countries, because the info sheet can reach any country with geometry.

`COUNTRY_FACTS` builds both locales' tables **eagerly at module load**, so each one's object identity is
permanently stable — the property every derived structure depends on. `worldGeoJson` is not involved at
all, because it reads only `population` and `area`, neither of which is a word. That is why the 1.6 MB
outline source is locale-invariant and stays a true module constant.

**Subregion and region identifiers stay English.** They are the `?subregions=` URL param, the key
`countriesIn` filters on, and what Maestro types; only the display label is translated. Same trade
`FieldId` and `QuizMode` make. `QUIZ_COUNTRIES_BY_LOCALE` keeps **both arrays in the English sort order**
for a related reason: `buildQuiz` shuffles that array with a seed, so re-sorting the Russian pool would
make one seed give two different rounds. A pool order is not a display order — the search index, which a
person reads, *is* re-sorted per language.

### Grading in Russian

Four things needed real work; everything else was already language-neutral.

- **`NAME_INDEX` is per locale**, and this is the load-bearing one. `австрия` is two edits from
  `австралия` on a nine-letter target — inside the budget — so without a Russian index the confusable
  guard is blind and the round awards Austria's point for Australia. `gradingRu.test.ts` sweeps 193×193.
- **The head-noun rule is not the same rule.** English puts the head last ("South African rand"); Russian
  puts it either side — `российский рубль` but `фунт стерлингов`, `доллар США`. So Russian offers both
  ends, minus anything adjectival (`российский`) or an abbreviation (`США`), and the existing ambiguity
  check discards the rest. Offering both ends in English would accept "south" for the rand.
- **Inflection.** `рублей` is two edits from `рубль` on a five-letter target, outside the budget.
  `russianStem` crudely trims one ending, applied **to both sides** and **only to the set fields** —
  never to country names, where a near miss means a different country and the guard is doing safety work.
  It runs on already-normalized text, where `й` has become `и`, so the ending list carries both spellings.
- **`parsePopulation` accepts `млн`, `млрд`, `тыс`**, the bare `т`/`м` a number keypad makes easy, and the
  English `k`/`m`/`b`. Spaces of every width are stripped, so the app's own Russian formatting — which
  groups with a thin space — parses back as typed.
- **The comma is the decimal point in Russian, so the parser is told which language it is reading.** It
  used to be stripped in both and `1,4 млрд` graded as fourteen billion — ten times the answer, marked
  wrong, with the panel echoing back a figure nobody typed. `parsePopulation` and `gradeNumeric` take a
  `locale` the way `formatPopulation` always has, threaded from `gradeField`; that also closes a latent
  mismatch where `gradeNumeric` formatted its reveal with the *ambient* locale while the round graded
  with the passed one. **Several commas are grouping in both languages**, because a decimal has one
  point — which keeps `68,000,000` working in a Russian round. One shape stays ambiguous, a lone comma
  with three digits after it: `1,400` is 1.4 in Russian and 1400 in English, settled per language rather
  than guessed at per number. Both separators at once (`1.000,5`) is rejected, not guessed.

A Russian round also accepts the **English** names, deliberately: a bilingual player typing "Russia" has
not got it wrong, and a superset makes the confusable guard *stricter*, because more strings are claimed
by some country.

`normalizeText` needed no structural change — its NFD pass already folds `ё` to `е`, which is exactly the
tolerance Russian users expect. An accident worth the test that pins it.

### Map labels carry both languages

`textPropertyFor(field, locale)` returns `tName` for English (**unsuffixed**, so nothing existing moved)
and `tNameRu` for Russian, and `labelGeoJson` writes both onto the same features in one pass.

That is the whole safety argument: replacing `<GeoJSONSource data>` on a live map is the riskiest
operation in the app, and a settings toggle must not be on that path. Baking both languages onto one
source means a switch changes only `text-field` and `filter` — a layout-property change, no re-upload.
The cost is ~10 extra small properties on 240 features. `MapScreen.test.tsx` asserts both sources come
back `toBe`-identical across a language change.

The **fit threshold is genuinely per-locale**: Russian names are longer and Cyrillic measures wider
(`CYRILLIC_GLYPH_RATIO` 0.60 against 0.55, and **English stays at exactly 0.55** so no English label
moves). It is not monotone — `Чехия` is shorter than `Czechia` — so 41 of 240 thresholds go the other
way, and the test asserts the ordering rather than a rule.

### The web ships twice

`app.config.js` layers over `app.json` and sets `experiments.baseUrl` from `EXPO_PUBLIC_LOCALE`. **With
that variable unset it resolves to exactly what `app.json` already described**, so every native build is
unchanged — **do not export it in your shell**, or a native build gets a `/ru` base URL and every bundled
asset resolves to a path that does not exist in an APK.

`npm run build:web` runs two exports and generates two service workers. Three load-bearing things:

- **English exports FIRST.** `expo export` calls `removeAsync(outputDir)` before writing, so
  `--output-dir dist` running second would delete `dist/ru` with it.
- **Each tree is self-contained** — its own flags, icons, MapLibre worker and manifest, because **a
  service worker cannot intercept requests outside its own scope**. A page at `/ru/` reaching for
  `/flags/ru.svg` works online and fails offline, which is the one requirement this project has.
  `withBaseUrl` covers the four hand-written absolute URLs. ~3.4 MB of duplication; `dist` goes 9 → 20 MB.
- **`navigateFallbackDenylist` needs a `(/|$)` alternation, not a trailing slash.** `vercel.json` sets
  `trailingSlash: false`, so the canonical Russian URL is `/ru` with no slash, and a pattern anchored on
  `/ru/` does not match it. The root worker then served its own `/index.html` there, the English bundle
  booted at a Russian URL, and expo-router rendered "Unmatched Route". It looked like a routing bug and
  was a one-character regex bug.

The build asserts per tree: bundle size under the precache limit, `<html lang>` correct, the right worker
registered, and the pre-rendered markup in the right language. That last check reads the **HTML, not the
JS bundle** — both bundles contain both catalogues, and Metro escapes non-ASCII in minified output.

`EXPO_PUBLIC_LOCALE` is a build input to `app.config.js` **and nothing else**: `baseUrl` is part of
Metro's transform cache key and `EXPO_PUBLIC_*` is not, so app code reads the locale from `EXPO_BASE_URL`
instead. Otherwise the second export could reuse the first's cached transform and ship the wrong
language, successfully and silently.

### What the tests pin here

`jest.setup.ts` pins the locale to English **twice** — once at setup load, once per test. Both are
needed: the singleton seeds from the machine's own locale, which on a Russian-locale Windows box is
`ru-RU`, and a `describe` body building a fixture with `getCountryFacts('FRA')` reads it long before any
`beforeEach` fires. Without the top-level pin that fixture came back as Франция and the failures looked
nothing like the cause.

**No Maestro flow for Russian.** When one is written, note that persisting the locale makes the suite
order-dependent: a `locale.yaml` sorts before `map-labels.yaml`, `mastery.yaml` and `quiz.yaml`, so a
mid-run abort would leave Russian selected and fail all three on English strings. **`clearState: true` on
every `launchApp` becomes mandatory.**

## The web target

The same app runs in a browser — phone and desktop — as an installable PWA that works offline. Metro
picks the platform by file extension, so the split is a set of `.web.tsx` siblings rather than
`Platform.OS` branches. There are still **zero** `Platform.OS` checks in `src/`.

| | native | web |
|---|---|---|
| Map | `@maplibre/maplibre-react-native` | `maplibre-gl` |
| Style | `OFFLINE_STYLE` (`font-faces` + `asset://`) | `WEB_OFFLINE_STYLE` (no `font-faces`, no `glyphs`) |
| Escape / keyboard play | no-ops | `useDismissKey.web.ts`, `keyboardPlay.web.ts` |
| Window size | `useWindowDimensions` | `useWindowSize.web.ts` — DOM truth, hydration-safe |
| Storage | AsyncStorage | `masteryStorage.web.ts`, `localeStorage.web.ts` |

`worldMapProps.ts` holds the props and camera constants both implementations share. Everything above the
renderer — `worldGeoJson`, `labelGeoJson`, the ramps, `labelFilter`, `getWorldFitZoom`, `pickCountry`,
all of `quizCamera.ts` — is used unmodified. **The style spec is the portability layer**, which is why
this port is small.

### Traps, each of which cost real time

- **MapLibre invents a viewport rather than waiting for one.** Given a zero-sized container it does not
  warn — it falls back to a **400x300** canvas, so every camera stop afterwards is arithmetic against a
  viewport that does not exist. Resizing "fixes" it because that finally tells the transform the truth.
  `WorldMap.web.tsx` waits for a measured container before creating the map, ignores zero sizes from its
  `ResizeObserver` (a navigator reports one while `/search` sits over the map), re-syncs the transform
  before every stop, and holds a stop that arrives too early rather than dropping it.
- **React keeps the server's `className` on a hydration mismatch.** `web.output: "static"` renders every
  route in Node, where there is no window, so responsive branches take their smallest path — and the
  corrected classes computed on the client never reach the DOM. Nothing throws. Anything responsive in a
  FIRST render must use `useWindowSize`. Diagnose by comparing `element.className` against
  `__reactProps$*.className`.
- **`reactCompiler: true` punishes extracting a subscription into a hook.** Moving `useWindowDimensions()`
  out of a component body changed what the compiler memoises; the quiz then kept a stale layout through a
  rotation and `.maestro/quiz.yaml` failed 0/3 against master's 3/3. `quizScreenBox.ts` is a PURE function
  taking the window for exactly this reason — **keep the subscription inline.**
- **A redeploy takes two visits to appear** unless the page reloads on `controllerchange`: the open page
  keeps its worker's assets. Every conclusion drawn from that first load describes the previous build. Bit
  us twice.
- **Workbox's 2 MB default silently skips the bundle**, which is ~5 MB. The worker then registers,
  activates, looks perfect and fails offline. `scripts/build-web.mjs` asserts the bundle is under the
  limit rather than trusting the summary line.
- **Windows ships no country flag emoji at all** — Segoe UI Emoji has none. Not fixable in CSS; this is
  part of why flags are raster images everywhere now.
- **`build-web.mjs`'s `globPatterns` is an explicit extension list.** A new asset format that is not in
  it is silently absent from the precache manifest — perfect online, broken with the origin dead.

### Framing is tested end to end, on purpose

`searchFraming.test.ts` asserts a searched country is centred in, and fits inside, the band a person can
actually see — across five real viewports and five awkward countries.

It derives that band from **independently measured facts about the UI, never from the code under test.**
That is the whole point: every earlier check asked "did it land at the centre of `getMapFocusRect(...)`",
which agrees with that function however wrong it is — and is why framing measured perfect while a phone
was visibly wrong. Reintroducing the original bug fails 28 of its 55 cases.

Two things it must keep doing, both of which fooled its own first draft: measure the country **as drawn**
(Mercator is not linear, so a tall country's latitude midpoint is not its visual centre), and via
projected corners (New Zealand's bbox crosses the antimeridian, so `(west + east) / 2` lands in the
Atlantic).

### Deploying

`vercel.json` pins the build to `npm run build:web` and the output to `dist/`. The headers are not
decoration: **`sw.js` must not be cached** or a deploy never reaches anyone, and the MapLibre worker needs
a JavaScript content type. `cleanUrls` serves `/search` and `/quiz/play` from the per-route HTML the
static export emits. Assets under `_expo/static/` and `assets/` are content-hashed and immutable;
everything else the worker precaches carries a Workbox revision, so it updates despite the HTTP cache.

## Toolchain

| | |
|---|---|
| JDK | Temurin **17.0.20** at `C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot` |
| `JAVA_HOME` / `ANDROID_HOME` | set at **User** scope |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk` — platforms 36 + 37.0, build-tools 36.0.0, cmdline-tools/latest |
| Emulator | AVD **`Medium_Phone`** — API 33, x86_64, Play Store image, 4096 MB RAM |
| Node / npm | 24.13.1 / 11.8.0 |
| Maestro | `C:\Users\Boris\maestro\maestro\bin\maestro.bat`, **not on PATH**; runs natively on Windows |

- Oracle Java 8 JRE is still installed; Temurin 17's `bin` sits ahead of it. Don't remove the Oracle
  entries.
- Android PATH entries are **literal absolute paths** — the user `Path` registry value is `REG_SZ`, so
  `%VAR%` would never expand.

## Commands

```bash
emulator -avd Medium_Phone         # launch DETACHED (PowerShell Start-Process)
npx expo start                     # r = reload, j = debugger, m = dev menu
                                   # do NOT set CI=1 — it disables watch mode
adb reverse tcp:8081 tcp:8081
adb shell am start -a android.intent.action.VIEW \
  -d "geographyapp://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"

npx expo run:android               # native build — only when native deps or app.json change
npx expo run:android --variant release
cd android && ORG_GRADLE_PROJECT_reactNativeArchitectures=arm64-v8a ./gradlew.bat assembleRelease

npm test                           # jest, no emulator needed
npm run typecheck
npm run test:e2e                   # maestro, needs a running device
npm run build:data                 # one-off, needs network; rewrites BOTH json files
npm run enrich:data                # offline; countryFacts.json only
npm run labels:data                # offline; polylabel anchors
npm run flags:import               # ONE-OFF; needs temp/classic_big_1000. Writes the masters
npm run flags:data                 # offline; 249 thumbs + 498 PNGs + 747 public copies + 4 maps

npm run web                        # expo start --web (dev; no service worker)
npm run build:web                  # TWO exports + two workers. English -> dist/, Russian -> dist/ru/
npm run serve:web                  # serve dist/ on :4173
npm run web:phone                  # build and serve for a phone on the LAN
# A service worker needs a SECURE context, so a LAN IP shows the app but never the PWA.
# `adb reverse tcp:4173 tcp:4173` makes the phone treat it as localhost, which counts.
# Load any route with `?debug` to get the live map on `window.__geoMap`.
```

**The dev loop:** the dev APK is a shell containing native code plus a Metro client; JS edits hot-reload
in about a second. Rebuild only when adding/removing a native dependency, editing `app.json`, or
upgrading the SDK.

### A release build can package a stale JS bundle — `.json` is not a Gradle input

**This bites precisely because the app's data lives in JSON.** `createBundleReleaseJsAndAssets`
(`BundleHermesCTask`) declares its inputs as a file tree of **`.js`, `.jsx`, `.ts`, `.tsx` only**.
Editing `countryFacts.json`, `countries.geo.json` or `labelPoints.json` does **not** invalidate it. Gradle
marks the task UP-TO-DATE, `assembleRelease` reuses whatever bundle is on disk, and the APK ships old data
**with no warning at all**.

`npx expo run:android` hides it entirely: debug never runs the bundle task. So the symptom is "the
emulator is right and the release APK is wrong", which reads like a minification bug and is not one. It
found us on 2026-08-24: three corrected capitals, and the release APK showed only one.

**The fix is `plugins/withJsonBundleInputs.js`**, registered in `app.json`, which widens that file tree
with `**/*.json`, `assets/**/*.png` and `assets/**/*.webp` (excluding `.expo/`). It has to be a
config plugin, because
**`android/` is gitignored and regenerated by `expo prebuild`**.

Diagnosing a recurrence takes one command:

```bash
grep -c "Ciudad de la Paz" android/app/build/generated/assets/react/release/index.android.bundle
ls -la android/app/build/generated/assets/react/release/index.android.bundle   # older than your edit?
```

Escape hatch: delete that generated directory, which makes the task's outputs missing and forces a rerun.

### Architectures — this bites every time

`ORG_GRADLE_PROJECT_reactNativeArchitectures` controls which ABIs are built. An x86_64-only APK **will not
install on a phone** (`INSTALL_FAILED_NO_MATCHING_ABIS`), and an arm-only APK will not install on the
emulator.

- emulator only, fastest: `x86_64` · phone only: `arm64-v8a` · both: `arm64-v8a,x86_64` (157 MB debug)
- omit entirely for a store build, so all four ABIs are produced

### Testing on the physical phone

```bash
adb devices                                  # must show `device`, not `unauthorized`
adb -s <serial> reverse tcp:8081 tcp:8081    # REQUIRED — re-run after every unplug
npx expo run:android --device
maestro --device <serial> test .maestro/tap-country.yaml
```

Without `adb reverse` the app opens to a blank or red screen. With two targets attached, every `adb`
command needs `-s <serial>`.

## Testing

**Jest** (`jest-expo` preset, `@/` → `src/`) — the fast inner loop. The native map is replaced by
`__mocks__/@maplibre/maplibre-react-native.tsx`, because Fabric views cannot render under Jest; what the
tests exercise is our own wiring, not MapLibre.

The mock has been taught, one bug at a time, to forward **`paint`**, **`layout`**, **`filter`** and
**`data`** — it stripped each in turn, and each time no test could see the thing that mattered (fill
colour, `text-field`, one re-upload per round versus one per answer). Its `GeoJSONSource` testID is
`source-<id>`; it was hardcoded to `countries-source`, which threw "found multiple elements" once a second
source existed.

RNTL **v14 made `render` and `fireEvent` async** — they must be awaited or every query fails with "render
function has not been called". `tsconfig.json` needs `"types": ["jest"]`.

**Maestro** (`.maestro/`) drives the installed app; it does not rebuild. Eight flows, each pinning its own
orientation with `setOrientation`:

| Flow | Orientation | Journey |
|---|---|---|
| `tap-country.yaml` | PORTRAIT | Russia → Greenland → close → ocean-deselect |
| `landscape-info-panel.yaml` | LANDSCAPE_LEFT | Brazil → Mali → close → deselect → rotate with the card open |
| `choropleth-modes.yaml` | PORTRAIT | toggle on → legend → Russia still selects → toggle off |
| `map-labels.yaml` | PORTRAIT | each label field in turn, flags included → map and selection still work |
| `search-country.yaml` | PORTRAIT | open search → browse → type → pick → map highlights and flies |
| `mastery.yaml` | PORTRAIT | mastery fill mode → practice round → reset → structure only |
| `quiz.yaml` | PORTRAIT + rotate | pick subregion/fields → back-press → discard → restart → answer → reveal → back-press → cancel → rotate → end → score → **retry the miss** |
| `quiz-choice.yaml` | PORTRAIT + rotate | pick the option style → play both questions by button → grid repaints on grade → rotate → score → retry keeps the buttons |

**No flow for locate mode, flag mode, or Russian** — the current gaps. Several flows exist purely as a
**proof-of-parse** for expressions the native renderer would otherwise reject silently, which is the only
automated defence against a malformed paint/layout expression. **Maestro cannot see the labels themselves**
— they are drawn inside the GL surface, so no `assertVisible: 'Paris'` will ever match. Confirming text
actually appears is a manual screenshot.

Coordinate taps are only deterministic because `INITIAL_CENTER` and the derived zoom floor pin the launch
camera — **change either and re-derive every tap point in the explore flows.** `quiz.yaml` is the exception
and contains **no coordinate taps at all**, which makes it the one flow immune to a camera change; it needs
`scrollUntilVisible` to reach a subregion row, and uses the smallest subregion (*Australia and New
Zealand*, 2 countries) so the round is short and answerable without pinning a seed.

Picking tap points:

- **The card occupies a different edge per orientation.** Portrait: follow-up taps go above it. Landscape:
  the **left 60%**.
- **Derive points from a cold launch in the flow's orientation**, not by rotating a running app.
- MapLibre's default hitbox is 44 dp: `33%,47%` looked like mid-ocean and reliably selected **Gambia**. The
  ocean-deselect steps use `17%,44%` portrait and `16%,83%` landscape, both wide of every coastline.
- Aim at a **verified interior**, never a border — a first draft aimed at "Algeria" and got Mali.

**Offline acceptance test** — the one that proves the requirement:

```bash
npx expo run:android --variant release       # JS bundle embedded; Metro not involved
adb shell svc wifi disable && adb shell svc data disable
# cold start, pan/zoom, tap countries on several continents, switch every label field
adb logcat | grep -i "http\|network"          # should show nothing from the app
adb exec-out screencap -p > proof.png
adb shell svc wifi enable
```

## Open risks

- **The Russian build has never run on Android**, and the offline acceptance test has not been re-run
  since it — or since flag labels or mastery — landed.
- **Multiple choice has not been seen on a device.** Three things Jest cannot reach: whether the 2×2
  grid holds at `width: '48%'` in the narrower landscape panel, where the buttons are also the
  longest-wrapping (Russian names in a docked panel is the worst case); whether four cards per field
  leave the Check button reachable at four fields without the panel feeling like a scroll well; and
  whether the graded palette reads — the right button goes green whether or not it was the one pressed,
  which is the whole reveal, and RdYlGn is already noted as not colourblind-safe elsewhere.
  `.maestro/quiz-choice.yaml` covers the structure and the repaint; it cannot see colour.
- **The Russian dictionaries are ~590 hand-authored strings.** The build proves they are complete and that
  no English leaked in; it cannot prove they are *right*. A native-speaker read is owed.
- **`app.json` is layered by `app.config.js`.** Anything reading the config sees the merged result. Do not
  export `EXPO_PUBLIC_LOCALE` in your shell.
- **Replacing `<GeoJSONSource data>` on a live map** (mastery) is the riskiest unproven operation.
- **The raster flags have not been seen on a device.** Three things Jest cannot reach: whether Yoga
  narrows the quiz frame or merely squashes it when `maxHeight` binds — which now happens in
  *portrait*, for Nepal, the one portrait flag in the set; whether a 1024 px WebP master under
  `drawable-mdpi` costs real memory in a flag round (Glide should downsample to the view, so measure
  `dumpsys meminfo` rather than assume); and whether a 57x Lanczos downscale to an 18 px map icon reads
  as well as the vector render it replaced (compare Greece's nine stripes and the US canton at zoom 6).
- **The map's flag layer will look different, not just sharper.** Half the flags are now wider than the
  old flat 20 dp at the same height, so `icon-allow-overlap: false` drops a different set at low zoom,
  and `getFlagMinZoom` gates on true width so wide-flag countries appear later and narrow-flag ones
  earlier. If it reads as too sparse, the lever is a dedicated `FLAG_FIT_TOLERANCE` — **not** turning
  the shared `FIT_TOLERANCE`, which would move every text label with it.
- **`temp/classic_big_1000` is gitignored, so `flags:import` is not reproducible from a clean clone.**
  That is the design — the masters are committed and `flags:data` is fully reproducible — but it means
  the pack has to be kept somewhere if the ratios are ever to be re-derived.
- **41 flags are still 4:3 while their neighbours are not.** All dependent territories, none ever a
  quiz question, but `pr`, `ky`, `vg`, `im` and `je` are visibly the wrong shape beside a true-ratio
  neighbour in search. Fixing it needs no code: drop true-ratio sources into the pack and re-run both
  scripts.
- **The pack is a 2017 snapshot, and six flags were wrong enough to replace by hand** — see the
  override lane below. Nothing systematically audits the other 202 for a flag that has changed since,
  and no test could: a current flag and an obsolete one are both well-formed images.
- **MapLibre vs RN 0.86** — the library is developed against 0.85.3 and declares `>= 0.80`.
- **Release APK is x86_64 only** as built so far, and **debug-signed** (Expo's default). A proper upload
  key is needed before distribution.
- **Two MapLibre surfaces are alive during a quiz** (`/quiz/play` is pushed). Fine on the emulator, not
  measured on the S25 — check `adb shell dumpsys meminfo com.boris.geographyapp`, and watch for a black
  quiz map, which is what GL-context exhaustion looks like. The fix is one word: `push` → `replace` in
  `QuizLaunchButton`, at the cost of the back gesture.
- **Emulator GPU** — a black rectangle instead of a map is the emulator's graphics mode, not a code bug.
  Switch the AVD to *Hardware — GLES 2.0*.
- **`.expo/types/router.d.ts` goes stale and looks like a compile error.** With `typedRoutes: true`,
  adding a route fails `npm run typecheck` until Metro regenerates it — and it can regenerate *wrong*,
  listing every module under `src/` as a route. Delete `.expo/types` and restart `npx expo start --clear`.

Two emulator failure modes that look like app bugs but aren't:

- **Never force-kill `qemu-system-x86_64`.** It corrupts the quick-boot snapshot, and the next launch
  hangs with `sys.boot_completed=1` but `system_server` never starting — `adb shell settings` reports
  *"Can't find service: settings"* and `screencap` hangs. Shut down with `adb emu kill`; recover with
  `emulator -avd Medium_Phone -no-snapshot-load` (a cold boot, which keeps installed apps).
  `-gpu angle_indirect` does **not** help.
- **Launch the emulator detached.** Started as a child of a shell the tooling later reaps, it has
  segfaulted seconds after a clean boot, taking the device offline mid-session.

## Attribution

Natural Earth is public domain. `world-countries`/mledoze is ODbL, World Bank data is CC BY 4.0, and Noto
Sans is SIL OFL — all require credit, and all belong in an About screen.
