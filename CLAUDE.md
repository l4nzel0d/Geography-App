# geography-app

An Android app showing a world map with country outlines. Tapping a country opens an info box with its
population, currency and official languages.

## Hard constraint: the app must work fully offline

This is the requirement that drives every other decision. No map tile server, no REST call at tap time,
no font/glyph fetch. Everything ships inside the APK.

**Never introduce a runtime network dependency** — a tile source, a `glyphs`/`sprite` URL in the map
style, a live API call — without flagging it explicitly. The offline acceptance test (release build,
wifi + data disabled) is the gate that this must pass.

The rule is **no remote URL**, not "no symbol layers". Map labels draw real text through a TTF bundled
in the APK and referenced as `asset://`; see *Map labels* below. An older version of this file, and of
`offlineStyle.ts`, said any symbol layer broke the requirement. That was wrong, and the label layer
depends on it being wrong.

## Status

**Working and verified on the emulator.** Tap a country → it highlights and the info sheet shows
population, currency, official languages, capital and area.

Verified end to end on 2026-08-16:

- debug build: 14m 48s first build, installs and runs on `Medium_Phone`
- release build: 5m 48s
- 36 Jest tests pass, typecheck clean
- Maestro flow passes all 18 steps
- **offline acceptance test passes** — release build, airplane mode, `ping` unreachable: map renders,
  taps work, info sheet populates, and logcat shows no HTTP/DNS/tile/glyph request from the app
- **verified on physical hardware**: Galaxy S25 (SM-S931B), Android 16, arm64-v8a, 1080x2340 @480dpi.
  Cold start matches the emulator, and the Maestro flow passes unchanged — the tap percentages survive
  the aspect-ratio difference. Only Samsung/Qualcomm platform noise in logcat (Adreno, ashmem,
  libpenguin, Kumiho); nothing from the app.

Added 2026-08-17, verified on the emulator (`Medium_Phone`, x86_64 debug build):

- the info card **animates out** instead of vanishing, and **landscape** docks it to the right edge
- the **Region row is gone** from the info sheet, and `region`/`subregion` are gone from the pipeline,
  `CountryFacts` and `countryFacts.json` entirely
- geometry moved to **Natural Earth 1:50m**, so the ~65 microstates the 110m tier omitted now exist:
  **Liechtenstein selected on the emulator** (41,024, Vaduz, 160 km²), as did Switzerland beside it
- 61 Jest tests pass, typecheck clean
- both Maestro flows pass unchanged — portrait 20 steps, landscape 24, **no tap point needed
  re-deriving** despite the geometry change (the camera is what pins those, and it did not move)
- **not re-verified on the S25 or against the offline acceptance test.** The manifest lost
  `android:screenOrientation`, so those two need a re-run before release; nothing here adds a network
  call — the geometry is still a bundled `import` — but the gate is the gate, and the bundle did grow
  by ~1.4 MB, which is worth a look at cold-start time on real hardware.

Added 2026-08-17, **not yet verified on any device**:

- the **population choropleth** — a toggle in the top-left switches the land between the flat green
  basemap and a log-scaled white→deep-red ramp, with a stepped legend. See *Map fill modes*.
- 102 Jest tests pass, typecheck clean. The x86_64 debug APK builds and installs.
- **the visual check never happened.** The emulator could not reach the dev server: the app dials
  `10.0.2.2:8081` and got `Failed to connect`, and that AVD had no working DNS either
  (`play.googleapis.com` unresolvable), so its whole NAT stack looks wedged rather than this being a
  Metro problem — Metro served the bundle to the host fine (HTTP 200, 10.9 MB). `adb reverse` does not
  help on its own because the client dials `10.0.2.2`, not `localhost`; launching via
  `adb shell am start -a android.intent.action.VIEW -d "geographyapp://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"`
  is the way to point it at the reversed port, and that still needs a re-try on a healthy AVD.
- So **nothing below the unit tests is confirmed**: not the colours on screen, not the legend layout,
  not that the paint expression parses in the native renderer, and not
  `.maestro/choropleth-modes.yaml`, which had never been run. *(Superseded — see below.)*

Added 2026-08-18, verified on the emulator (`Medium_Phone`, x86_64, dev build over Metro):

- **the dev loop is unwedged.** The AVD's NAT was the problem, not Metro: a cold boot
  (`emulator -avd Medium_Phone -no-snapshot-load`, launched detached) came up with working DNS and a
  reachable `10.0.2.2`, and `adb reverse tcp:8081 tcp:8081` plus the
  `geographyapp://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081` intent connects first
  time. A JS edit reaches the screen in about a second. **Do not set `CI=1` when starting Metro** —
  it disables watch mode, which is exactly the thing you want.
- that also clears the choropleth's backlog: the mode toggle and the legend paint, and
  `.maestro/choropleth-modes.yaml` now passes.
- **quiz mode** — zoom to a country, paint it yellow, type the answers. See *Quiz mode*.
- 389 Jest tests across 15 suites pass, typecheck clean, and **all four Maestro flows pass**.
- **not re-verified on the S25, and the offline acceptance test has still not been re-run** since the
  1:50m switch. Nothing in quiz mode adds a network call — the new fields come from the same bundled
  `countryFacts.json` — but the gate is the gate.

Added 2026-08-18, verified on the emulator (`Medium_Phone`, x86_64, dev build over Metro):

- **country search** — a pill in the top-right row opens `/search`; type a name, pick a result, and the
  map highlights the country exactly as a tap would and flies to frame it clear of the info sheet.
  See *Country search*.
- **explore `maxZoom` is now 10**, up from 8, so a searched microstate is actually visible. At 8 Monaco
  framed correctly and rendered as a 22 dp dot.
- **quiz "Change settings" pops back** to the setup screen instead of building a fresh one, so the
  round's subregions and fields are still selected. It now agrees with the back gesture.
- 464 Jest tests across 18 suites pass, typecheck clean, and **all five Maestro flows pass**.
- verified by hand on the emulator in both orientations: Netherlands, Liechtenstein, Russia (the
  pole-clamped case), Fiji (antimeridian), the "Holland" alias, and a rotation mid-selection.
- **still not re-verified on the S25, and the offline acceptance test has still not been re-run.**
  Search adds no network call — names, aliases and geometry are all already bundled — but the gate is
  the gate, and this is now two features deep into owing it.

Added 2026-08-20, verified on the emulator (`Medium_Phone`, x86_64, dev build over Metro **and** a
release build):

- **map labels** — a pill in the top-left row writes one fact on top of every country: name, capital,
  languages, currencies or population. Independent of the fill mode. See *Map labels*.
- **MapLibre draws real text, and the app is still fully offline.** A bundled Noto Sans TTF reached
  through the style's `font-faces` and an `asset://` URL, embedded by `expo-font`'s config plugin.
  **This disproves the old claim in this file and in `offlineStyle.ts` that any symbol layer breaks the
  offline requirement** — the rule is no *remote* URL. Both comments have been corrected.
- **the fill-mode toggle collapsed into a pill.** The three-segment control and the top-right row no
  longer fitted side by side once a label pill existed — they overlapped on screen at 411 dp. Both
  appearance settings are now pills opening an always-mounted panel, sharing the top-left row.
- 520 Jest tests across 20 suites pass, typecheck clean, and **all six Maestro flows pass** — the five
  existing ones unchanged in their tap points, because both panels are closed by default.
- **the offline acceptance test has finally been re-run, and passes.** Release build, wifi and data
  disabled, `ping` unreachable: the map renders, all five label fields draw, taps work, the info sheet
  populates, and logcat shows nothing from the app but the platform's own boilerplate
  `NetworkSecurityConfig` line — no HTTP, DNS, glyph or font request, and no errors. This was three
  features overdue and is the first change that touched how the style resolves resources.
- verified by hand: labels legible over the flat basemap and over both ends of the population ramp;
  Türkiye, Brasília, Côte d'Ivoire and São Tomé all render their diacritics; microstates correctly
  unlabelled at world zoom.
- **still not re-verified on the S25.** The font adds 569 KB to the APK and the symbol layer adds a
  native text buffer, so cold-start time and `dumpsys meminfo` are worth a look there.

Added 2026-08-24, **not yet verified on any device**:

- **leaving a round mid-way asks first.** A back press on `/quiz/play` raises a styled
  confirmation — *See my score* / *Discard and leave* / *Cancel* — instead of silently
  binning the round. See *Leaving mid-round asks first*.
- the card is a `Modal` in the app's own palette, not the native `Alert` this was first
  built as. That swap is the whole reason *The confirmation is a `Modal`* exists as a
  section: it is the paint bug's one genuinely unavoidable case.
- 535 Jest tests across 21 suites pass, typecheck clean.
- **`.maestro/quiz.yaml` has not been run since the new steps were added**, and neither has
  anything else here been seen on a screen. What is unproven is specifically: that Android
  routes a back press into our handler at all (Jest resolves the iOS `BackHandler` stub, so
  no unit test can show it), and that the card paints over the MapLibre surface. Both are
  exactly what the new flow steps assert, so running that flow is the gate.
- nothing here adds a network call.

Added 2026-08-25, **not yet verified on any device**:

- **quiz modes.** The setup screen now asks *how* you want to play before it asks what.
  The second mode is **locate** — you are given a country's name and have to find it on
  the map. See *Locate mode*.
- **every camera move is now a `fly` whose duration is computed from how far it travels**,
  replacing a flat 900 ms `ease`. This is not confined to the new mode: it changes the
  pacing of **every question of an existing facts round**, and reverses a decision the old
  comment recorded. See *Pacing a camera move*.
- 669 Jest tests across 29 suites pass, typecheck clean.
- **nothing here has been seen on a screen.** Three things in particular are unproven, and
  each is the kind Jest structurally cannot reach: that the new `country-reveal` fill layer
  paints at all, that a reveal camera stop parses in the native renderer rather than
  blanking the map, and whether the new pacing actually *feels* better — which is a
  judgement no test can make. There is **no Maestro flow for locate mode**, so the first
  two are covered by nothing.
- nothing here adds a network call, and nothing here is a native change — no `app.json`
  edit, no new native dependency, so a JS reload is enough to see all of it.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Expo SDK 57** + React Native 0.86.2, TypeScript | Development build, **not Expo Go** — MapLibre is a native module |
| Routing | expo-router, routes in **`src/app/`** | SDK 57's default template layout |
| Map | **`@maplibre/maplibre-react-native` 11.3.6** | Free, no API key, GPU polygon rendering, native hit-testing |
| Info box | Hand-rolled on RN `Animated` | See below — deliberately not a bottom-sheet dependency |
| Geometry | Natural Earth *Admin 0 Countries, 1:50m* | public domain, 242 features → 240 countries |
| Facts | `world-countries` npm (= mledoze/countries) | ODbL; the dataset REST Countries itself serves |
| Population | World Bank `SP.POP.TOTL` | free, no key, most-recent-year values |

Chosen over Android Studio + Kotlin because polygon rendering happens inside MapLibre's native renderer
either way — so RN costs nothing in performance while giving a far faster iteration loop.

### MapLibre v11 API — do not follow v10 docs

v11 renamed the components. Verified against the installed type definitions:

- `Map` (not `MapView`), `GeoJSONSource` (not `ShapeSource`), `<Layer type="fill">` (not `FillLayer`)
- `Map` takes **`mapStyle`**; `GeoJSONSource` takes **`data`** (not `shape`)
- press payloads arrive on **`event.nativeEvent.features`**
- ornament props are `attribution` / `logo` / `compass` / `scaleBar` booleans
- use `paint` / `layout`; the `style` prop is deprecated and goes away in v12
- `LngLatBounds` is a flat `[west, south, east, north]` tuple

**v11 requires the New Architecture** (Fabric + TurboModules) — it is not optional. `newArchEnabled=true`
is set in `android/gradle.properties`. Setting it to `false` breaks the map rather than fixing anything.

### Why the info box is hand-rolled

`@gorhom/bottom-sheet` was the original plan. The interaction is a simple show/hide, and hand-rolling on
RN's `Animated` keeps the native dependency surface — and therefore the rebuild surface — unchanged.
Dismissal is a close button plus tapping the ocean, not a swipe. If you later want drag-to-dismiss,
adding the dependency is JS-only (reanimated and gesture-handler are already installed) and needs no
native rebuild, but check its reanimated 4 compatibility first.

### The info card in both orientations

`orientation` is `"default"` in `app.json` and `android:screenOrientation` is **absent** from the
manifest — re-adding either pins the app to portrait again. The card docks to a different edge per
orientation, decided by `getInfoSheetLayout(window)`:

| | Portrait | Landscape |
|---|---|---|
| Dock | bottom, full width | **right**, full height |
| Size | `maxHeight: 55%`, content-height | `width` = clamp(280, 42% of width, 360) dp, capped at 60% |
| Slides along | `translateY` | `translateX` |
| Facts list | `flexGrow: 0` | `flex: 1`, scrolls inside the panel |

A bottom sheet in landscape would cover most of the little vertical space there is, while the map is
wider than it is tall — the spare room is at the side. The panel is capped at 60% of the width so the map
keeps at least 40% on the narrowest landscape screens.

**The card animates out, so it outlives its selection.** It keeps its own `visibleFacts` state that lags
the `iso3` prop: on close it goes on rendering the country it was showing, slides off, and drops the
content in the animation's completion callback. Returning `null` as soon as `iso3` is `null` unmounts it
on the same frame and there is nothing left to animate — which is what the code used to do, despite a
comment claiming otherwise. It also sets `pointerEvents="none"` while sliding out so taps reach the map,
and the slide distance is **measured via `onLayout`**, not a constant: `maxHeight: 55%` is ~429 dp on a
780 dp-tall phone, so a hardcoded 400 left a visible sliver at the moment it unmounted.

## Layout

```
src/
  app/
    _layout.tsx             # GestureHandlerRootView + Stack
    index.tsx               # MapScreen: owns selectedIso3, fillMode, and the search camera stop
    search.tsx              # /search: the country search route (no map on it)
  map/
    WorldMap.tsx            # Map + GeoJSONSource + fill/selected/reveal/line Layers
    cameraFit.ts            # pure: zoom floors - world-fit width, and the both-axes fit
    choropleth.ts           # pure: population ramp + the fill-color paint expression
    offlineStyle.ts         # inline style: background layer, a bundled font-face, no sources
    mapLabels.ts            # pure: label field catalogue + the symbol layer's expressions
    labelFit.ts             # pure: text + country width -> the zoom a label appears at
  data/
    countries.geo.json      # 240 outlines, properties trimmed to { iso3, name }   (1.6 MB)
    countryFacts.json       # 250 fact records keyed by ISO-3                       (65 KB)
    countryFacts.ts         # synchronous lookup
    labelPoints.json        # 240 label anchors + landmass widths                    (9 KB)
    labelGeoJson.ts         # one label point per country, every field's text folded on
    worldGeoJson.ts         # outlines + population folded on, for the choropleth
    types.ts
  components/
    CountryInfoSheet.tsx
    ConfirmDialog.tsx       # a Modal-hosted confirmation card in the app's colours
    infoSheetLayout.ts      # pure: sheet dock per orientation, and the map's unobstructed band
    palette.ts              # the shared chrome colours (was components/quiz/palette.ts)
    formatters.ts           # pure, unit-tested
    MapControls.tsx         # the chrome: fill + label pills and their panels top-left,
                            #   legend under them, search + quiz pills top-right
    MapOptionPill.tsx       # a pill that opens one of the option panels
    MapOptionPanel.tsx      # the always-mounted radio list behind a pill
    ChoroplethLegend.tsx    # stepped key, driven by the active ramp
    quiz/                   # QuizPanel, LocatePanel, AnswerField, ChipInput,
                            #   SubregionPicker, FieldPicker, ModePicker,
                            #   QuizLaunchButton, useKeyboardHeight
    search/                 # SearchLaunchButton, CountryResultRow
  map/
    countryBounds.ts        # pure: which polygons to frame for one country
    quizCamera.ts           # pure: bbox + viewport -> centre and zoom, whole-viewport or
                            #   into a focus rect (search frames around the info sheet);
                            #   and getFlightDuration - how long a move should take
  quiz/
    quizConfig.ts           # pure: QuizMode, FieldId/GradedField, QuizConfig, params
    quizCountries.ts        # the 193-country pool and the subregion catalogue
    quizBuilder.ts          # pure: seeded shuffle -> ordered questions
    normalizeText.ts        # pure
    editDistance.ts         # pure: Damerau, and the typo budget
    answerAliases.ts        # accepted spellings, plus NAME_INDEX for the confusable guard
    gradeAnswer.ts          # pure: the marking
    gradeLocation.ts        # the marking for a locate round: one country, `===`
    quizScore.ts            # pure: the tallies
    quizPanelLayout.ts      # pure: the map/panel split, and the map's own viewport
                            #   (a locate panel is content-height: panelHeight is null)
    exitPrompt.ts           # pure: the wording and buttons of the leave-mid-round dialog
    quizResultStore.ts      # one-slot handover from the round to the score screen
  search/
    countrySearch.ts        # pure: the 237-country index and the ranked matcher
    pendingCountry.ts       # subscription handover from /search back to the map
scripts/build-label-points.mjs      # offline; polylabel anchors from the committed geometry
scripts/build-country-data.mjs      # full online rebuild
scripts/enrich-country-facts.mjs    # offline facts-only re-derivation
scripts/countryFactRecord.mjs       # the record shape, shared by both
plugins/withJsonBundleInputs.js      # config plugin: makes .json a Gradle bundle-task input
__tests__/ , __mocks__/ , .maestro/
```

**Single source of identity: ISO 3166-1 alpha-3.** Geometry features and fact records join on it.

Both JSON files are `import`ed directly — Metro inlines them into the bundle, so there is no filesystem
read and no async load at runtime. Do not convert either to a fetch.

## The data pipeline

`npm run build:data` — a **one-off**, run while online; its output is committed. The app never calls
these APIs.

**There are two writers of `countryFacts.json`, and one record builder shared between them** so they
cannot drift (`scripts/countryFactRecord.mjs`):

| | |
|---|---|
| `npm run build:data` | the full rebuild. Fetches Natural Earth + the World Bank; rewrites **both** JSON files. |
| `npm run enrich:data` | **offline.** Re-derives the facts from the local `world-countries`, carries the committed population through untouched, rewrites **only** `countryFacts.json`. |

Prefer `enrich:data` for anything that comes from `world-countries`. A full rebuild re-fetches Natural
Earth `master`, and the geometry drifts — this file already records a border moving between tiers and
flipping a `pickCountry` expectation, and every Maestro percentage tap is pinned to today's outlines.
Taking an unreviewable 1.6 MB coordinate diff to gain four fields from a pinned local devDependency is a
bad trade. The enrich script **fails if any population would change**, which is the proof it never
touched the World Bank join.

Quiz mode added four fields to each record: `region`, `subregion`, `unMember` and `altSpellings`
(region/subregion having been removed in `3cb9f6e` and now restored). Both scripts assert the quiz's own
invariants — 193 UN members with geometry, each with a subregion, a population, a capital and a language,
and a currency for all but FSM — and `data-integrity.test.ts` mirrors them.

### Why 1:50m, and what it cost

1:110m has **177 features and no microstates at all** — Liechtenstein, Dominica, Monaco, San Marino,
Andorra, Malta, Singapore, Vatican and ~25 others simply had no polygon, so they could not be tapped,
highlighted or reached in any way. 1:50m carries every one of them. Measured before choosing:

| Tier | Features | Committed size @3dp | Unmatched slivers |
|---|---|---|---|
| 1:110m | 177 | 0.24 MB | 0 — but no microstates |
| **1:50m** | 242 → **240** | **1.6 MB** | 1 (Siachen Glacier) |
| 1:10m | 258 | ~8 MB | 13 |

10m was rejected on size, and because it splits disputed slivers (Bir Tawil, the Spratlys, the Cyprus
buffer zone) into their own ISO-less, factless features — a lot of allowlist for detail invisible on a
world map.

Two things the higher tier forced:

- **Some countries arrive as several features and must be merged.** Australia ships as the mainland
  plus `Indian Ocean Territories` plus `Ashmore and Cartier Islands`, all resolving to AUS through
  `ISO_A3_EH`. The build folds every same-ISO feature into one MultiPolygon (`mergePolygons`). It has
  to: the highlight layer filters on `iso3`, so a second AUS feature would be an untappable duplicate.
- **17 more territories have no World Bank population** (Vatican, Jersey, Guernsey, Niue, Cook Islands,
  Anguilla, …). Every one was checked against `GET /v2/country/<code>` and is genuinely not a World Bank
  economy — none is a join failure. Jersey and Guernsey are reported only as a combined "Channel
  Islands" (CHI), which would double-count if split across both, so both stay blank.

**`roundCoords` never rounded anything.** It recursed on numbers and arrays and returned everything else
untouched — but it was called with `f.geometry`, an *object*, so it hit that identity branch and the
110m file shipped at full 6dp precision for its whole life, despite the comment. `roundGeometry` now
takes the geometry and recurses into `.coordinates`; the integrity suite asserts nothing finer than 3dp
survives. At 50m that is worth ~0.5 MB.

Things that bit us, preserved so they don't bite again:

- **REST Countries is no longer usable.** v3.1 is deprecated (returns an error envelope, not data) and
  v5 requires an API key. `world-countries` is the same upstream dataset, but it has **no population
  field** — hence the separate World Bank call.
- **Natural Earth ships `ISO_A3 = "-99"`** for disputed/dependent territories. `NE_TO_ISO3` patches
  Kosovo (`KOS` → `UNK`) and South Sudan (`SDS` → `SSD`); France and Norway resolve via the `ADM0_A3`
  fallback. Without this France silently becomes an untappable blank.
- **Kosovo is `UNK` in mledoze but `XKX` at the World Bank** — see `ISO3_TO_WORLD_BANK`.
- Coordinates are rounded to 3 dp (~110 m), which takes ~25% off the file and is still far finer than a
  1:50m basemap resolves.

The script **fails the build** on any unresolved code, duplicate, missing facts record, or missing
population. Genuine upstream gaps go in an explicit allowlist (`FACTLESS_ALLOWLIST` = Northern Cyprus,
Somaliland, Siachen Glacier; `POPULATIONLESS_ALLOWLIST` = Taiwan, Western Sahara, Falklands, French
Southern Territories, Antarctica plus the 17 small territories 50m added) — never a silent skip. The
same invariants are re-asserted in `__tests__/data-integrity.test.ts` so they cannot rot.

## Selection

Highlight is a **filtered layer**, not feature-state:
`filter: ['==', ['get','iso3'], selectedIso3 ?? '']`. An empty string matches nothing, which is how
"no selection" is expressed.

There are **three** such layers. Two of them exist because the choropleth needs a different marker (see
below): `country-selected` (orange fill) and `country-selected-outline` (white line, drawn last so it
sits over `country-border`). Both stay mounted in both modes and the fill mode is expressed by handing
the ISO-3 to only one of them — the same empty-string idiom, rather than adding and removing layers
at runtime.

The third is **`country-reveal`**, and it exists because one `selectedIso3` cannot say two things at
once: locate mode has to show where the answer was *alongside* the country the player tapped, and
whenever the guess was wrong those are two different countries. Same idiom, its own colour, drawn
immediately after `country-selected` so that the one case where both name the same country — a correct
guess — resolves to the reveal colour rather than to draw order.

### `GeoJSONSource.onPress` MUST call `event.stopPropagation()`

This cost real debugging time. Source presses **bubble up to `Map.onPress`**, which is our
tap-the-ocean-to-deselect handler. Without `stopPropagation()` the ocean handler fires immediately
after every country press and clears the selection that was just made, so tapping a country appears to
do nothing at all — no error, no log, just silence.

Unit tests cannot catch this on their own (the mock doesn't model native bubbling), so there is an
explicit assertion that `stopPropagation` was called, plus a Maestro step that taps ocean after
selecting.

## Map fill modes — the population choropleth

`WorldMap` takes `fillMode: 'flat' | 'population'`, owned by `MapScreen` and driven by the toggle in
`MapControls`. `flat` is the original green basemap; `population` paints the ColorBrewer *Reds* ramp
defined in `src/map/choropleth.ts`.

**The scale is `log10(population)`, and that is not a preference.** Population runs from ~11k (Tuvalu)
to ~1.45B (India) — five orders of magnitude. A linear ramp renders the entire world white except China
and India. The stops sit one per decade, so each colour step is a 10× step of people.

| 10k | 100k | 1M | 10M | 100M | 1B | 1.5B |
|---|---|---|---|---|---|---|
| `#ffffff` | `#fee0d2` | `#fcbba1` | `#fc9272` | `#ef3b2c` | `#a50f15` | `#67000d` |

`interpolate` clamps outside its domain, so under 10k is white and over 1.5B is the darkest stop without
extra branches. `ChoroplethLegend` renders these same stops, so the key and the map cannot drift.

**Population reaches the paint expression through a runtime join, not the pipeline.** The build script
trims outline properties to `{ iso3, name }`, and a data-driven expression can only read what is on the
feature. `src/data/worldGeoJson.ts` folds `population` on at module load — keeping `countryFacts.json` the
single source of truth, where emitting it into `countries.geo.json` too would give you two committed
copies free to drift and would need an online rebuild to change. It is cheap because **`geometry` is
passed through by reference**; only the small properties object is rebuilt. `worldGeoJson.test.ts` asserts
that identity, since losing it means duplicating 1.6 MB at import.

**Features with no World Bank figure omit `population` entirely rather than carrying null**, which is what
lets the expression split them off with `['has','population']` into the grey `NO_DATA_COLOR`. A null would
also reach `log10` and poison the whole expression — as would a `0`, which `data-integrity.test.ts` now
forbids.

### Never conditionally mount an overlay above the map

**The most expensive bug in the project so far.** A view inserted over the MapLibre surface *after* the
initial mount is never drawn. It sits in the view hierarchy with entirely correct bounds — `uiautomator
dump` showed the legend card, all seven swatches and every label exactly where they belonged — and
paints nothing at all; sampling the screenshot at those coordinates returns pure map pixels.

So `ChoroplethLegend` is **mounted from startup and never conditionally rendered**. `MapControls` parks it
at `left: -200` when hidden and animates `left` — a **layout** property, on the **JS thread**
(`useNativeDriver: false`) — to slide it in. Every part of that sentence is load-bearing:

- *Always mounted* gives it the same stable insertion order as the toggle pill, which never had the bug
  precisely because it is present in the first pass.
- *Animating a layout property* supplies the re-layout that reveals it. Rotating the device fixed it
  manually for the same reason — and it then stayed visible, because the view was never recreated.
- *JS-driven* so each frame commits through the shadow tree.

`visible` therefore drives `accessibilityElementsHidden` / `importantForAccessibility`, not mounting.
In tests that means presence proves nothing, and **RNTL queries need `{ includeHiddenElements: true }`**
or they will not find the parked legend at all.

What did **not** work — one release build each, do not repeat them: a translucent `backgroundColor`;
the `pointerEvents` prop; `elevation: 6`; restructuring `MapControls` into a shrink-wrapped absolute
container, then into `absoluteFillObject` + `box-none`; and an entrance animation on opacity + translateY
with `useNativeDriver: true`. That last one is the instructive failure — `CountryInfoSheet` uses exactly
that pattern and paints fine, because its container is mounted at startup. The animation was never the
thing that mattered; the insertion order was.

Method that actually found it: `adb shell uiautomator dump` to prove the view **is** laid out with the
right bounds, then sample the screenshot's pixels at those bounds to prove it is **not** painted. That
splits "layout bug" from "paint bug" in one step, and is far faster than changing styles and rebuilding.
The other free signal is behavioural: if rotating the device makes it appear and it then stays, you are
looking at this bug, not a styling one.

Two more traps worth keeping:

- **The Jest mock used to strip `paint`.** It now forwards it, like `filter`. Without that no test can see
  the fill colour at all.
- **A malformed paint expression fails inside the native renderer**, which is exactly the thing Jest
  replaces with a stub — so it passes every unit test and then blanks the layer on a device.
  `.maestro/choropleth-modes.yaml` exists solely to catch that.

The map now has **chrome in the top-left** (`MapControls`, safe-area inset). It is the one corner free in
both orientations — the info sheet docks bottom in portrait and right in landscape. Keep Maestro tap
points clear of it; the portrait Greenland tap at `19%,13%` passes just under it.

## Map labels

A pill in the top-left row writes one fact on top of every country: **name, capital, languages,
currencies or population**. Independent of the fill mode — the density choropleth with capital labels
over it is a legal and useful combination — so it has its own state, its own pill and its own panel.

### Real text, and still no network

**This is the feature that corrected the "no symbol layers" rule at the top of this file.** MapLibre
needs glyph data to draw text, but that data does not have to come over the wire:

- **`font-faces`** (root of the style, spec 24.x) maps a font name to a real TTF/OTF file. The shipped
  `libmaplibre.so` implements it — `mbgl::FontFace`, the error string `"Invalid font-face definition
  for: "`, and FreeType plus HarfBuzz are all in the binary. Characters a face covers never touch the
  `glyphs` URL, and there is no `glyphs` URL here at all.
- **`asset://`** resolves against the APK's own `assets/` directory through the Android asset manager.
  `mbgl::AssetFileSource` is in the same binary. No socket, no DNS, no permission.
- **`expo-font`'s config plugin** puts the file there. Its Android path copies every plain-string entry
  of the plugin's `fonts` array into `app/src/main/assets/fonts`, so
  `asset://fonts/NotoSans-Regular.ttf` resolves. It has to be the plugin and not a hand-placed file,
  because **`android/` is gitignored and regenerated by `expo prebuild`** — anything dropped in by hand
  is destroyed on the next one.

Noto Sans Regular, 569 KB, SIL Open Font License — **which belongs in the About screen** with Natural
Earth, mledoze and the World Bank. It covers the Latin Extended-A these strings need: Türkiye, Côte
d'Ivoire, São Tomé, Curaçao and Asunción all render.

Adding the font means `app.json` changed, so this needs `expo prebuild` and a **native rebuild** — a JS
reload is not enough.

### Labels come from their own point source

`GeoJSONSource id="country-labels"`, one Point per country, **not** a symbol layer on the outlines.

MapLibre labels a polygon at its pole of inaccessibility, which is a good anchor, but it computes one
**per polygon**. France is a MultiPolygon of the mainland plus five overseas departments, so labelling
the outlines directly draws "France" six times, once over South America; Kiribati gets one per atoll.

`scripts/build-label-points.mjs` (offline, `npm run labels:data`) picks each country's largest polygon
by latitude-weighted area and runs **`polylabel`** on it, writing `{ at: [lng, lat], w: <degrees> }` to
the committed `labelPoints.json`. `polylabel` is a **devDependency** — it never ships, and there is no
startup cost.

- **The anchor must be inside the country, and a bbox centre is not.** Norway, Chile, Croatia, Vietnam
  and Indonesia all have centroids in the sea. `data-integrity.test.ts` asserts all 240 anchors pass
  `booleanPointInPolygon` against their own geometry; if that fails after a geometry change, re-run the
  script rather than editing the expectation.
- **`polylabel`'s tolerance is relative, not absolute.** At a flat 0.01 degrees the Vatican — 0.011
  degrees wide in total — came back with an anchor *outside its own outline*, because the search grid
  was coarser than the country. It is now a fraction of the polygon's own bbox.
- **Antarctica is an explicit allowlist entry.** The script fails any polygon spanning more than 180
  degrees, on the assumption that it wrapped the antimeridian. Antarctica genuinely spans 360, being
  drawn as one ring around the pole. `POLAR_SPAN_ALLOWLIST` names it, in keeping with the pipeline's
  "explicit allowlist, never a silent skip" rule.

`data/labelGeoJson.ts` folds every field's text onto those points at module load, following
`worldGeoJson.ts`'s idioms: a module-scope constant so the `data` identity is stable, and a field the
country has no value for is **absent, not null**, so the filter can split it off with `['has', …]`.
Micronesia has no currency and Vatican no population; both simply go unlabelled in that field.

### Decluttering is collision plus fit

At the launch camera a 411 dp screen shows ~166° of longitude, so "Luxembourg" is ~60 dp of text over
~1 dp of country. Two mechanisms, doing different halves of the job:

- **Collision is MapLibre's**, and free: `text-allow-overlap: false` drops overlapping labels, and
  `symbol-sort-key` (the negated landmass width) decides who wins — widest country first. This is the
  single biggest reason labels are a native symbol layer rather than RN views over the map.
- **Fit is ours.** Collision has no idea a country is too small for its own name; it would draw
  "Luxembourg" at world zoom simply because nothing else is there. `labelFit.ts` precomputes, per
  country **and per field**, the zoom at which the country is wide enough, and the layer filters
  `['<=', ['get', zoomProp], ['zoom']]`.

**`['zoom']` is legal inside a `filter`** — the spec says "Zoom expressions in filters are only
evaluated at integer zoom levels" — which is what lets the fit test be declarative. The alternative was
subscribing to camera changes and re-rendering on every pan.

Mercator x is linear in longitude, so a country's on-screen width is exactly `w / 360 × 512 × 2^zoom`
dp — no projection correction needed on the one axis a text width cares about. `FIT_TOLERANCE` is 0.55,
meaning a label may be ~1.8× its country's width: requiring strict containment would permanently
unlabel Chile, Norway, Vietnam and Italy, none of which is ever as wide as its own name. **It is the
one number to turn if labels overhang more or less than you want.**

Countries that lose show nothing — no dot, no abbreviation. Zoom in and they appear.

Two consequences worth expecting: **population labels are far denser than name labels**, because "47m"
is a quarter the width of "Uzbekistan" and clears the fit test at a much lower zoom. And the label
source carries **no `onPress`**, so presses fall through to the outlines and `pickCountry` is
unaffected.

### The chrome had to be rebuilt around it

The fill mode was a three-segment control until this landed. On the 411 dp emulator there are 379 dp
between the safe areas, and the segmented group (~206 dp) plus a top-right row carrying the label pill
(~187 dp idle, ~216 dp with "Currencies" selected) came to 393–422 dp. **They overlapped on screen.**

So both appearance settings are now pills that open an always-mounted panel, sitting together in the
top-left row, and search and quiz keep the top-right row they had before. `MapOptionPill` and
`MapOptionPanel` are shared by both.

- Choosing a fill mode is now **two taps**, which is why `choropleth-modes.yaml` opens
  `toggle-fill-mode` before every `mode-*` tap, and why `MapScreen.test.tsx`'s `selectMode` helper does
  the same — and must `await` both, because RNTL v14's `fireEvent` is async and the panel's rows are
  hidden from queries until the opening press has re-rendered.
- **Only one panel is open at a time.** Two opaque menus on a phone-sized map leave almost no map.
- **Both panels are closed by default, which is what kept all five existing Maestro flows valid** —
  they cover the map only while open, so no percentage tap moved.
- The panels share the left column with the legend and are drawn over it while open, deliberately:
  parking the legend below a panel's full height would push it into the Greenland tap permanently.

### What the tests can and cannot see

- **The Jest mock had to start forwarding `layout`.** It stripped it, exactly as it once stripped
  `paint`, so `text-field`, `text-size` and `symbol-sort-key` were invisible to every test.
- **The mock's `GeoJSONSource` testID is now `source-<id>`.** It was hardcoded to `countries-source`,
  which was fine with one source and threw "found multiple elements" with two.
- **Maestro cannot see the labels themselves.** They are drawn inside the MapLibre GPU surface, not the
  view hierarchy, so no `assertVisible: 'Paris'` will ever match. `.maestro/map-labels.yaml` switches
  each field on and re-asserts that the map and a country selection still work — the same proof-of-parse
  trick `choropleth-modes.yaml` uses, and the only automated defence against a malformed layout
  expression or a `text-font` naming a face that `font-faces` does not define. **Confirming that text
  actually appears is a manual screenshot step.**

## Quiz mode

Three routes, none of which touch `src/app/index.tsx`:

| Route | File | Map? |
|---|---|---|
| `/quiz` | `src/app/quiz/index.tsx` | no — subregion + field picker |
| `/quiz/play` | `src/app/quiz/play.tsx` | **yes** — the round |
| `/quiz/results` | `src/app/quiz/results.tsx` | no — score and per-question review |

The config crosses `/quiz → /quiz/play` as **router params** (`subregions`, `fields`, `seed`), which
also makes a round deep-linkable and therefore pinnable from a test. The finished round crosses
`/quiz/play → /quiz/results` through **`quizResultStore.ts`**, a one-slot module singleton: 193 × 5
graded fields will not fit in a URL, and results are reached with `router.replace`, which is what tears
down the second MapLibre surface. The store **clears on read**, so a back gesture cannot resurrect a
stale score.

### The panel is a flex sibling, never an overlay

**This is the structural answer to the paint bug above, not a styling preference.** The answer panel
grows a chip every time the player names a language, and a view inserted over a live MapLibre surface
after the first mount lays out perfectly and never paints. So the quiz screen *splits*: map on top and
panel below in portrait, map left and panel right in landscape, sized by `quizPanelLayout.ts`. Nothing
is ever positioned over the map, so the bug is unreachable rather than worked around. Belt to that
braces: one row per **configured** field for the whole round, hidden with `display: 'none'` when the
current country cannot be asked it, a fixed pool of chip slots, and one button whose label swaps
`Check` → `Next`.

`QuizPanel`'s root needs `flex: 1`. Without it the panel shrink-wraps its header and button, the body
`ScrollView`'s own `flex: 1` resolves against a zero-height parent, and **every answer field collapses
to nothing** — which looks exactly like the fields failing to render.

### The keyboard is an inset, not a resize

The app is **edge-to-edge** (the RN 0.86 / Expo 57 default), so Android does **not** resize the window
when the IME opens — `android:windowSoftInputMode` is irrelevant, and `KeyboardAvoidingView`'s Android
path assumes a resize and does nothing useful. `useKeyboardHeight` listens to `keyboardDidShow` /
`keyboardDidHide` and the screen gives that space back as `paddingBottom`; the map absorbs the loss.

**Add `insets.bottom` to the reported height.** Measured on the emulator, `endCoordinates.height` stops
at the top of the navigation bar, so reserving it alone leaves the Check button 56 px under the keyboard.

### Leaving mid-round asks first

A back press on `/quiz/play` used to pop straight to the setup screen and bin the round
without a word. It now raises a confirmation offering three ways out — **See my score**
(the same thing the panel's *End quiz* button does), **Discard and leave**, and **Cancel**.
The score button is dropped when nothing has been checked yet, because a score of nothing
out of nothing is not an offer; the wording and the button list are `quiz/exitPrompt.ts`,
pure and unit-tested, so what is on the dialog is decided somewhere Jest can read it.

**It is `BackHandler`, not `usePreventRemove`.** Both work. `BackHandler` wins because
expo-router's own root handler is itself a `hardwareBackPress` listener and RN calls those
in **reverse registration order** — so a subscription added when this screen mounts runs
first, and returning `true` stops the pop dead. `usePreventRemove` would need navigator
context at render time, which is exactly what `QuizLaunchButton` and `pendingCountry.ts`
record this app avoiding so its screens stay renderable bare in `QuizScreens.test.tsx`.
It is also not a public export: expo-router 57 **vendors React Navigation** (there is no
`@react-navigation` in `node_modules` at all) and reaches it only via the deep subpath
`expo-router/react-navigation`.

`predictiveBackGestureEnabled` is **false** in `app.json`, so the edge swipe and the
hardware button are the same plain back press and there is no predictive-back animation to
fight. If that is ever turned on, re-check this — a committed predictive gesture is not a
press you can decline.

The listener is registered **once for the whole round** and reached through a ref that a
second, dependency-less effect keeps current. Re-subscribing on every keystroke would be
churn, and the ref is written in an effect rather than during render because `app.json`
has `reactCompiler: true`.

### The confirmation is a `Modal`, and that is the paint bug again

A dialog is the one thing the rest of this app is not allowed to be: it must **cover** the
map and it must **appear on demand**, and a view inserted above the MapLibre surface after
the first mount lays out perfectly and never paints. The quiz panel dodged that by being a
flex sibling, the legend by being mounted from startup and parked, `/search` by being a
route with no map on it. None of those is available to a confirmation.

`Modal` sidesteps the question entirely: RN's Android backend hosts it in a **separate
`Dialog` with its own window**, which the system composites over the app's. Nothing is
added above the map surface, so the bug is unreachable rather than avoided — the same
reason the native `Alert` this started as was safe. **The corollary is that ordinary
conditional rendering is correct inside `ConfirmDialog`**, exactly as it is on `/search`.

`ConfirmDialog` lives in `src/components/` and is generic; it takes its colours from
`palette.ts`, so the card is the panel's navy, the primary button is the same filled accent
pill as *Check*/*Next*, and the destructive one is outlined in the wrong-answer red.
Buttons are **stacked**, not a row: three actions do not fit side by side at 411 dp once
one of them is "Discard and leave".

- **`onRequestClose` is required**, not optional. The dialog holds window focus, so
  Android's back key goes to it and never reaches the screen's own `BackHandler` — without
  it, back while the card is open does nothing at all.
- **The button order changed when the native `Alert` was dropped.** `Alert.alert` on
  Android pops the array from the **end** to fill its neutral/negative/positive slots, so
  the list had to be written backwards to read forwards. Drawing it ourselves removed that
  constraint. If it ever goes back to `Alert`, invert `buildExitPrompt`'s order again.
- **Jest cannot see any of the interception.** It resolves `BackHandler.ios.js`, a stub
  whose `addEventListener` stores nothing and returns a shared no-op `remove` — so the
  tests invoke the registered handler directly and wrap that `remove` to observe it at all.
  That a real Android back press arrives here is `.maestro/quiz.yaml`'s job.

### The camera

`WorldMap` gained four optional props — `selectionColor`, `camera`, `maxZoom`, and an `onSelect` whose
*absence* makes the map read-only. All default to today's behaviour, so `index.tsx` renders
byte-identically and every existing tap point still lands where it did. **`MapScreen.test.tsx` asserts
that the explore camera is never handed a stop**, which is what protects the three coordinate flows from
a future edit here.

No camera ref: v11's `Camera` takes a declarative `Partial<CameraStop>`, and the imperative
`fitBounds`/`setStop` *throw* when the native view is not ready — which is exactly the first question of
a round. `initialViewState` stays alongside it to supply frame one.

**We compute centre and zoom ourselves** (`quizCamera.ts`) rather than handing MapLibre `bounds` +
`padding`, whose antimeridian behaviour cannot be verified offline and which Fiji and Russia exercise on
day one. Doing the Mercator arithmetic here makes it unit-testable — and a bad stop is otherwise
invisible until the native renderer blanks the map, exactly like a malformed paint expression. Quiz
`maxZoom` is **10**, not the explore map's 8: at 8 a 400 dp screen shows ~1° of longitude, which leaves
Liechtenstein a few pixels; 3 dp geometry makes 10 the honest ceiling. The stop is `useMemo`'d on the
country and the map's box only — `Camera` is `memo()`'d and rebuilds its animation from its props, so a
freshly allocated object would re-fire the fly on every keystroke.

### Pacing a camera move — `getFlightDuration`

A fixed duration is wrong in both directions at once. 900 ms is a crawl between two neighbouring
countries and a blur across an ocean, and lengthening it only chooses which half to be wrong about. Time
alone cannot fix the long case either: `ease` interpolates the centre linearly at the *starting* scale,
so at zoom 8 the ground tears past however many seconds you give it. Zooming out on the way is what makes
a long move readable — which is what `fly` is.

So both modes now use **`easing: 'fly'` with a duration computed from the flight's length**, and the two
halves are one change: a fly at a fixed 900 ms has to cover the distance *and* the arc in the time of a
short hop, which is precisely the jank.

**The unit is screenfuls, not kilometres**, and that is the whole idea. This is the van Wijk & Nuij
(2003) path length — the same thing `maplibre-gl` computes for a `flyTo` given no duration, with its own
`curve` of 1.42.

#### Why it is reimplemented rather than delegated

**MapLibre Native Android cannot do it.** From `CameraUpdateItem.kt` in the RN binding: a `duration` of
`0` — which is what an absent one becomes — takes the `moveCamera` path, an instant jump; a negative one
falls back to a **fixed** `MapLibreConstants.ANIMATION_DURATION`. The file says so itself:

> On iOS a duration of -1 means default or dynamic duration (based on flight-path length). On Android we
> can fallback to MapLibre's default duration as there is no such API. TODO: Implement in MapLibre Native
> Android

Web would compute it happily; Android is the primary target and would jump. Computing it ourselves is
what makes the two agree, and it puts the number somewhere Jest can read it — the same argument
`quizCamera.ts` already makes for doing the Mercator arithmetic here rather than handing MapLibre a
`bounds`. The web implementation needs the number too: `applyStop`'s starvation deadline is
`duration + ARRIVAL_GRACE_MS`, and there is no deadline to set without one.

`CameraEasing.FLY` maps to `animateCamera` on Android and `flyTo` on web, so the arc is the renderer's;
only its pacing is ours.

#### The numbers, and the two that look wrong

`FLIGHT_SPEED` is **the one number to turn.** It is screenfuls per second; `maplibre-gl` defaults to 1.2,
tuned for someone browsing a map, at which France to Japan takes over three seconds — a wait rather than
an animation, twenty times a round. **2** is the quiz's version of that judgement. Measured against the
committed geometry on a 411x500 dp map box:

| flight | ms |
|---|---|
| France - Germany, Brazil - Argentina | 450 (the floor) |
| world view - Australia, USA - China | ~620 |
| France - Turkey | 766 |
| France - Japan | 1588 |
| New Zealand - Iceland, world view - Monaco | 2000 (the ceiling) |

Two of those read as wrong until you remember the unit. **USA to China is 620 ms** because both frame at
about zoom 1, so nearly the whole world is already on screen at each end and very little of it moves.
**Monaco to Liechtenstein is 2 s** despite being 500 km apart, because at zoom 10 that is hundreds of
screenfuls. Any distance-based scheme gets both backwards, and `flightDuration.test.ts` pins them.

The ceiling matters more than the floor: the formula will spend four seconds crossing the world from a
street-level zoom and is *right* that this is what smooth costs — but not twenty times a round. Past it
the move is simply faster than optimal, which is the better failure.

#### Where the flight starts

The formula needs the camera's current pose, and nothing reports it back — so it is derived:

- **`facts`**: the previous question's country, which is a pure function of the question list. A player
  who pans mid-question makes it an estimate (the map is read-only for *selection*, not for gestures).
- **`locate`**: the last stop we sent, or the world view if there has not been one. Rougher, because
  hunting for a country *is* panning and zooming.

Being wrong costs a move paced for a slightly longer or shorter journey than the real one, never a wrong
destination. Tracking the true pose would mean a camera-change event on both `WorldMap` implementations
and a ref written on every pan, which is a lot of surface for a pacing estimate.

### Which polygons to frame — `countryBounds.ts`

A plain bounding box is wrong, and the reason is France: Natural Earth draws French Guiana as part of
FRA, so the full extent spans 63° and the camera frames the Atlantic with a speck of Europe in it.
Guiana is ~13% of France's polygon area, so **no area threshold separates it from Sicily** — only
distance does.

So: rank the polygons by area, seed a cluster with the largest, and absorb any polygon whose bbox is
within `max(GAP_MIN_DEG, 0.35 × cluster diagonal)`, to a fixpoint. Two things that bite:

- **Pick the longitude frame first, from the country's total extent**, then cluster inside it. Deciding
  per polygon instead silently yields "Kiribati is one atoll" and "the UK is Great Britain only".
- **`GAP_MIN_DEG` is 5.5 because of Malaysia**, whose two halves sit 5.2° apart with Borneo the larger —
  a tighter floor seeds on Borneo and drops the peninsula, capital and all. Measured margins at 5.5:
  Spain rejects the Canaries by 2.5°, Portugal the Azores by 2.8, Ecuador the Galápagos by 2.8, South
  Africa the Prince Edward Islands by 5.7, France its overseas departments by 53. Raising it much
  further starts pulling the Canaries in.

Degenerate spans are widened to `MIN_SPAN_DEG`, and the widening deliberately **overshoots by a relative
epsilon**: `mid ± MIN_SPAN_DEG / 2` around Monaco's latitude lands at 0.04999999999999716, and
correcting by that 2.8e-15 shortfall does nothing at all, because one ulp at latitude 44 is ~7e-15. A
zero span sends `log2(0)` to the native camera.

Accepted limitation: **Kiribati and Micronesia frame to their largest island group.** Their islands span
38° and 25° of ocean; framing either in full is an empty blue rectangle. The subregion filter is the way
to opt out.

### Grading — forgiving about spelling, unforgiving about being a different country

Normalize (NFD, strip combining marks, drop punctuation, `&`→`and`, `st.`→`saint`, strip a leading
"the"), then accept an exact match, an alias, or a small typo. Aliases come mostly from the dataset:
`altSpellings` already carries "Ivory Coast", "Holland", "UK", "DRC" and "Republic of Korea". The build
strips **the cca2 code** out of that list — not entries under some length — or "fr" would pass for
France while UK, USA, UAE, DRC and RSA would all be thrown away.

Typo tolerance is **Damerau**, not plain Levenshtein: adjacent transposition is the commonest typing
mistake, and plain Levenshtein scores "Frnace" two edits from "France", outside the budget for a
six-letter target. The budget is 0 edits under 5 characters, 1 under 9, 2 above.

**The confusable guard is load-bearing.** Edit distance alone accepts **"Gambia" for Zambia** — one edit
on a six-letter target. So a *fuzzy* match (never an exact or alias one) is rejected outright when the
thing typed is itself the name of another country, via `NAME_INDEX`. `grading.test.ts` sweeps all
193 × 193 combinations and asserts no country is ever accepted for another, while every country's own
name and every dataset alias still passes.

Set fields (languages, currencies) match **exact before fuzzy** — with one greedy pass a loosely spelled
chip can consume the entry that a later chip matches exactly, marking a right answer wrong. Head nouns
count when unambiguous *within that country*: "rand" for the South African rand, "German" for
Switzerland's "Swiss German" — but not "peso" for Cuba, which has two, nor "Sotho" for South Africa,
which lists Northern and Southern. Currency **codes are rejected**: "USD" is different knowledge from
"United States dollar".

The rules, all settled: name and capital are single answers (any one of South Africa's three capitals
counts), currencies need **all** of them, languages need **any 3** (Zimbabwe lists 15, and demanding all
15 is a wall rather than a question), and population is correct **within ±20%**, parsed from
`68,000,000`, `68m`, `68 million` or `1.4bn`.

### Who gets asked

`QUIZ_COUNTRIES` is the **193 UN member states** that have an outline. mledoze flags 194: it counts
**Vatican City**, which is a permanent observer rather than a member — and which is also the only
UN-flagged record with no World Bank population. `NON_MEMBER_ISO3` excludes it by name, in keeping with
the pipeline's "explicit allowlist, never a silent skip" rule.

A country missing data for a selected field is still asked; it just skips that field. Only one real case
exists: **Micronesia has no currency** upstream. A country left with nothing askable — a currency-only
round over Micronesia — drops out entirely rather than becoming a question with no inputs.

Order is a **seeded** Fisher-Yates (`mulberry32`), so a round replays identically and a Maestro flow can
pin it.

### Locate mode — find it on the map

`QuizConfig` gained a **`mode`**: `facts` is everything above, `locate` gives you a country's name and
makes you find it. They are mutually exclusive rather than a sixth field you can tick, because they run
the map in opposite directions — `facts` paints the country and asks about it, and `locate` must **not**
paint it, since that is the answer. The mode crosses into `/quiz/play` as one more router param, and an
absent or unrecognised `mode` is `facts`, which is what every link written before this says by omission.

The round: tap a country to highlight it, press **Check** to commit. Right → it turns green. Wrong → your
pick turns red, and a beat later the camera goes to the country you were asked for and paints it green.

**Nothing may name the pick before it is checked.** "Your pick — New Zealand" under a prompt reading
*Find New Zealand* answers the question outright, and lets a player retap until the panel agrees with the
prompt. So an open question gets a bare "Ready — press Check" and the highlight on the map is the only
thing that says *which* country is selected, which is the judgement being tested. Once graded there is
nothing left to spoil and the verdict names it.

#### The camera never resets, and only ever moves to reveal

A `locate` round issues **no camera stop at all** while a question is open. It does not need one:
`WorldMap`'s own default is `INITIAL_CENTER` at the world-fit zoom, which is exactly the whole-world
opening this mode wants, and the player pans and zooms from there. `MapScreen.test.tsx`'s rule that the
explore camera is never handed a stop now has a sibling assertion here.

The **only** stop the mode ever issues is the reveal, and it is deliberately **never withdrawn**:

- handing the native `Camera` a stop and then taking it away turns its stop prop from
  `{center, zoom, duration, easing}` into `{}` — a real prop change pushed into a renderer Jest replaces
  with a stub. `MapScreen`'s search focus records the same rule.
- and leaving it in place *is* the behaviour: the next question starts from wherever the reveal left you,
  which is what makes a regional round playable without the map snapping back to the world every time.

Three details that are each load-bearing:

- **`easing: 'fly'`, not the `'ease'` the facts camera uses.** There the camera hops between countries
  from a known world view. Here the player may be at zoom 8 in the Alps when the answer turns out to be
  in Peru, and an ease across that is an unreadable blur. The objection that a fly telegraphs where you
  are heading does not apply to a move that happens only after the answer is already out.
- **The red sits for `REVEAL_DELAY_MS` (700) before the camera moves**, so the verdict reads as being
  about the country you picked rather than as part of the camera move. `answerShown` and `revealStop` are
  two pieces of state written by that one timer: the first is cleared per question, the second never is.
  The panel takes `answerShown` as a prop rather than running its own timer, so the words and the map
  cannot get out of step.
- **Pressing Next inside the delay cancels the reveal.** They have moved on; yanking the camera
  afterwards would land them somewhere they did not ask to be, on a question that is already over.

A correct guess moves nothing at all. They found it — there is nothing to show them.

#### What it reuses, and the two small things it did not

`buildQuiz`, the seeded shuffle, the subregion pool, the exit confirmation, `summarize` and the whole
results screen are untouched. Two things had to give:

- **`location` is a `GradedField` but deliberately not a `FieldId`.** Everything that iterates
  `ANSWERABLE_FIELDS` — the field picker, `toAnswerInput`, the `fields=` parser, `gradeField`'s exhaustive
  switch — is about a fact you type into a box, and this is not one. Keeping it out of that union means
  none of them needs a case for it, and no deep link can smuggle `fields=location` into a facts round. It
  is still a `GradedField`, so `FieldGrade`, `perField` and the review list carry it unchanged.
- **`buildQuiz` skips its completeness filter.** That filter exists to drop a country that cannot answer
  any of the *chosen facts* — Micronesia in a currency-only round. A locate round asks something every
  country can answer, and a config carrying `fields: ['currency']` over from a previous facts round must
  not silently drop Micronesia from it.

`gradeLocation.ts` is its own module rather than a sixth case in `gradeAnswer.ts`: everything there is
about being forgiving with a *string*, and none of it — accents, a typo budget, the confusable guard —
has anything to say about an ISO-3 code that came out of `pickCountry`. There is one right answer and
comparing it is `===`.

Checking with **nothing** picked is legal, scores as blank/wrong, and still reveals. It is the "no idea,
show me" move, and it matches facts mode, where Check with every box empty has always been allowed.

#### The panel is content-height, and `flexGrow` is why

`LocatePanel` is a sibling of `QuizPanel`, not a mode branch inside it — they share only a frame, and
this one has no inputs, so none of `QuizPanel`'s field rows, chip slots, focus chain or keyboard handling
applies. It keeps the same testIDs (`quiz-panel`, `quiz-progress`, `quiz-end`, `quiz-submit`) so the
screen's wiring does not care which mode is on screen.

In portrait its slot is given **no explicit height** (`getQuizPanelLayout(..., locate)` returns
`panelHeight: null`, which the screen spreads as `height: undefined`). A panel sized like a facts panel
left a growing gap between the last line and the Check button — wider the taller the screen.

**Which means its root uses `flexGrow: 1`, not `flex: 1`, and the two are not interchangeable.** RN's
`flex: 1` also sets `flexBasis: 0`, so a panel carrying it reports a content height of zero to an
auto-height parent and collapses. `flexGrow: 1` keeps `flexBasis: auto`: content-height in portrait, and
still filling the stretched column in landscape, which is untouched. CLAUDE.md's warning that
**`QuizPanel` needs `flex: 1`** still stands for that panel — its slot has a definite height and its body
must fill it or every answer field collapses. This one has neither property.

`LOCATE_PORTRAIT_HEIGHT` survives as an **estimate with exactly one consumer**: `mapViewport`, which the
reveal camera fits a country into. Being a few dp out costs a marginally roomier frame, and
`CONTEXT_MARGIN` already spends 12% on that. Measuring it for real would mean threading an `onLayout` up
into the camera's inputs and re-firing the fly whenever it settled — the same trade `getMapFocusRect`
refuses for the info sheet.

#### What is not covered

There is **no Maestro flow for locate mode**, which leaves the two things Jest structurally cannot see
uncovered: that `country-reveal` paints at all, and that a reveal stop parses in the native renderer
rather than blanking the map. Both are exactly the failure modes `choropleth-modes.yaml` and `quiz.yaml`
exist for elsewhere.

Worth knowing when one is written: unlike `quiz.yaml`, a locate flow **can** use coordinate taps, because
the map sits at the launch camera for the whole question — there is no stop until the reveal. The
percentages are not the explore flows' though: the map is a band between the top inset and the panel, not
the whole window, so only the *x* percentages carry over.


## Country search

A pill in the top-right row opens `/search`. Type a name, pick a result, and the map behind it
highlights that country exactly as a tap would — same `selectedIso3`, same filtered layer, same info
sheet — and flies the camera to frame it in the part of the map the sheet does not cover.

### It is a route, not a dropdown

**This is the structural answer to the paint bug, not a styling preference.** A results list that
appears as you type is precisely "a view inserted over the MapLibre surface after the initial mount",
which lays out perfectly and never paints. `/search` has no map on it, so the bug is unreachable rather
than worked around — the same reasoning that made the quiz panel a flex sibling.

Which means the **opposite** rule applies on that screen: ordinary conditional rendering is correct
there. The always-mounted slots in `ChipInput`, the `display: 'none'` rows in `AnswerField` and the
parked `ChoroplethLegend` exist only because those views share a window with the map surface. Copying
that discipline into `/search` would mount 237 rows forever for nothing. The file says so in its own
docstring, because someone will otherwise "fix" it.

### The handover is a subscription, not a params round-trip

`/search` is **pushed** over `MapScreen`, so the map stays mounted underneath the whole time and only
needs telling what was picked. `src/search/pendingCountry.ts` is a module singleton with
`selectCountry` / `subscribeToCountrySelection`; the screen announces, then calls `router.back()`.

Three alternatives were rejected, each for a concrete reason:

- `router.back()` cannot carry params.
- `router.replace('/', { params })` would mount a **second `MapScreen`** and with it a second MapLibre
  surface — an expensive teardown to deliver one ISO-3 code.
- `useFocusEffect`, the obvious read-on-arrival shape, calls `useNavigation()` and so needs navigator
  context at render time. `QuizLaunchButton` documents that the map's chrome deliberately uses the
  imperative `router` singleton **so `MapScreen.test.tsx` can keep rendering the screen bare, with no
  router mock at all**. A subscription keeps that true — and it fires while the search screen is still
  sliding away, so the fly has already started by the time the map is uncovered.

`SearchLaunchButton` uses the imperative `router.push('/search')` for the same reason.

### Matching — forgiving in the opposite direction to grading

`src/search/countrySearch.ts` reuses `normalizeText`, `nameAliases` and `editDistance`/`allowedEdits`
from the quiz. **The duty is inverted, which is worth knowing before "fixing" it**: grading must
*reject* a near-miss, because "Gambia" for Zambia would award a point nobody earned; search must
*offer* one, because not knowing the spelling is why the box is open. So there is no confusable guard
here, and partial input — which grading refuses outright — is the normal case.

Ranked in tiers, best first, ties broken alphabetically (the index is pre-sorted and `sort` is stable):
exact name, exact alias, name prefix, alias prefix, name word-start, alias word-start, name substring,
alias substring, fuzzy. Ordinal rather than scored, because the tiers really are ordinal — and because
`editDistance(a, b, max)` returns `max + 1` once the budget blows, so it may only be compared against a
threshold, never used as a ranking score.

- **Both the spaced and the space-free forms are compared.** `normalizeText` *deletes* hyphens and
  apostrophes rather than replacing them with a space, so "Guinea-Bissau" indexes as `guineabissau`
  while a player types `guinea bissau`. Squashing both sides closes that, and covers "timor leste" and
  "bosnia herzegovina" too.
- **Fuzzy is skipped below 4 characters.** `allowedEdits` returns 0 under 5, so a short fuzzy pass is a
  pure no-op that only costs time — over 237 countries, on every keystroke.
- **An empty query lists all 237 alphabetically**, uncapped; a real query caps at 50. The screen is a
  browsable index of the world before a key is pressed, which costs nothing and is why the Maestro flow
  can assert on `country-result-AFG`.

The pool is **237**: every ISO-3 in *both* `countries.geo.json` and `countryFacts.json`. Deliberately
wider than the quiz's 193 UN members — the map draws Greenland, Puerto Rico and Western Sahara, so
search has to find them. The three excluded are exactly the geometry-only `FACTLESS_ALLOWLIST` entries
(`SOL`, `CYN`, `KAS`), which would open an empty info sheet.

`matchedAs` carries the alias that matched so the row can show it. Offering "Netherlands" for
"holland" with no explanation reads like a bug, and that line is the only place alias support is
discoverable at all.

### Framing around the info sheet

`getCountryCameraStop` centres a bbox in the **whole** viewport. That is right for the quiz, whose
panel is a flex sibling, and wrong here, where the sheet is a genuine absolute overlay: the map is
full-screen while only part of it is visible. So `quizCamera.ts` gained **`getFocusedCameraStop`** —
the same arithmetic plus a focus rect. `getCountryCameraStop` is untouched so quiz framing cannot
regress, and a test asserts the two agree exactly when the focus rect *is* the whole viewport.

The camera always points at the viewport's centre, so putting a country somewhere else means pointing
the camera **away** from it by the offset between the two centres. Zoom is fitted to the focus rect,
then the centre is shifted by `dx / worldPx` and `dy / worldPx` at that zoom.

**Both axes shift with the same sign, and the missing negation is deliberate.** `mercatorY` is 0 at the
north pole and grows southward; screen y also grows downward. The two conventions cancel.

`getMapFocusRect` (in `infoSheetLayout.ts`) says which band that is:

| | Portrait | Landscape |
|---|---|---|
| Top | `safeArea.top + MAP_CHROME_HEIGHT` | same |
| Bottom | the top of the sheet, 55% down | the foot of the window |
| Width | full | `width − panelWidth` |

- **It uses the sheet's MAXIMUM height, not its measured one.** The card is content-height and only
  knows its extent after an `onLayout` pass; threading that up would change the camera's inputs once
  per country and fire the fly **twice per search**. `PORTRAIT_MAX_HEIGHT_FRACTION` is the one literal,
  and `CountryInfoSheet`'s `maxHeight` derives from it so the two cannot drift.
- **`MAP_CHROME_HEIGHT` is why the band does not start at the top of the window.** Without it a country
  is centred in the whole area above the sheet and its northern edge lands under the toggle —
  Liechtenstein's tip disappeared behind it. An estimate mirroring `MapControls`' own spacing rather
  than a measurement, for the same re-fire reason.

### The pole clamp — load-bearing, and found by prototyping

Without it, **searching Russia in portrait sends the camera to latitude −54** and Russia leaves the top
of the screen entirely. Its fit zoom is already at the floor, so the world is barely taller than the
screen and the 232 dp the offset wants is ~45% of the whole globe.

```ts
const half = viewport.height / 2 / worldPx;
const camY = half >= 0.5 ? 0.5 : Math.max(half, Math.min(1 - half, wanted));
```

Exactly five countries reach it on today's geometry — `USA`, `RUS`, `GRL`, `CAN`, `ATA` — and the list
is pinned in `focusedCamera.test.ts`. A sixth appearing there means the geometry moved, not the maths.

Its companion is **`getViewportFitZoom`** in `cameraFit.ts`: the lowest zoom at which one world covers
*both* axes. `getWorldFitZoom` only answers for the width, which is all the launch camera needs because
MapLibre clamps the height itself. A stop fitted to *part* of the screen is different — asking for a
zoom MapLibre will override means the offset was computed against a scale the map never used. This is a
floor for the computed **stop** only; do not raise `Camera`'s `minZoom`, which is the pinch limit.

### The rest of the wiring

- `MapScreen` holds `focus: { iso3, nonce }`, set **only by a search**, never by a tap. The **nonce is
  required**: keying on the iso3 alone yields an identical stop when the same country is searched
  twice, and an identical stop is not a change, so the map would simply not move.
- **The stop is state, not a memo, and is never withdrawn.** `WorldMap` spreads `{...(camera ?? {})}`,
  so handing back `undefined` after a stop would take the native `stop` prop from
  `{center, zoom, duration, easing}` to `{}` — a real prop change pushed into a renderer Jest replaces
  with a stub. Clearing `focus` stops the recompute and leaves the last stop in place.
- **A map press clears `focus`**, so a later rotation re-fits the map rather than yanking the camera
  back to a country the user stopped looking at several gestures ago. Rotation *while* focused does
  re-frame, which is correct and matches quiz mode.
- **Explore `maxZoom` is 10**, matching the quiz. At 8 a 400 dp screen spans ~1.1° of longitude and
  Monaco is a 22 dp dot — framed correctly and useless. It bounds interaction, not the launch camera,
  so no Maestro coordinate tap depends on it.

### `disableFullscreenUI` is not optional

Found on the emulator, not in a test: **in landscape Android decides the field has too little vertical
room and replaces the entire screen with its own IME "extract" editor** — a white full-screen box and a
SEARCH button, with the app's screen and its results nowhere to be seen. `disableFullscreenUI` prevents
it. `SearchScreen.test.tsx` asserts the prop, which is as close as Jest can get.

The quiz's own `TextInput`s (`AnswerField`, `ChipInput`) do **not** set it and are likely to have the
same problem in landscape — unverified, because `.maestro/quiz.yaml` only types in portrait.

### Where the chrome actually is

Search and quiz share **one row** in the top-right, at the same height, so the chrome does not grow
downward into the portrait Greenland tap at `19%,13%`. Growing that row leftward is free — the nearest
coordinate tap is Russia at `81%,20%`, some 80 dp below it. **Keep any future control the same height,
and never put it on a second line.**

One correction to an older claim in this file: top-right is *not* free in both orientations. With the
card open in landscape it docks to the right edge full-height and **covers both pills**. That is
pre-existing behaviour rather than something search introduced, and it only bites while the card is
open — but do not assume the pills are reachable in landscape.

## Which country a press selects — `pickCountry.ts`

`GeoJSONSource.onPress` returns **every feature the hitbox touches**, not the one under the finger, and
in an arbitrary order. Taking `features[0]` is wrong and was a real, user-visible bug: "sometimes the
country above or below my fingertip gets selected".

Measured on the device, a press on **Paris** returned
`["GBR","ITA","NLD","BEL","LUX","CHE","DEU","FRA"]` — France **last** of eight, so the old code selected
Great Britain. Berlin returned Czechia first, Rome returned Bosnia first.

The fix is two-part and both halves matter:

1. **`hitbox` is tightened to 10 dp** (from MapLibre's 44 dp default). At zoom 0 the default spans ~30°
   of longitude and drags half a continent into every press. The tighter box also means open water
   yields *no* candidates, which is what lets `Map.onPress` deselect.
2. **`pickCountry`** resolves candidates against the pressed coordinate: prefer the country whose
   polygon actually **contains** the point (`@turf/boolean-point-in-polygon`), and fall back to the
   nearest candidate only when none does. The fallback keeps small islands and thin coastal states
   reachable — and correctly handles presses into the Caspian, which is inside no country.

Verified on hardware: 6/6 European capitals select correctly, plus a Sahara sweep at 7/8 exact
containment (the 8th was a press into the Caspian Sea, resolved by the fallback).

**Containment is what makes microstates usable.** Their polygons existing is not enough — at any zoom
where Liechtenstein is visible, the 10 dp hitbox still returns Switzerland and Austria alongside it, and
Dominica competes with France (Natural Earth draws Guadeloupe and Martinique as part of FRA). Both cases
are pinned in `__tests__/pickCountry.test.ts`.

**A sharper border can change the right answer.** The recorded Sahara press at `10.0E, 25.29N` used to
be inside Libya and is now inside Algeria — 110m smoothed that stretch of border eastward, and 50m and
10m both put the point in Algeria, as does the real border near Ghat. The test expectation moved with
it; the property under test did not (LBY is still first in the candidate list, so `features[0]` still
fails). If a `pickCountry` expectation flips after a data change, check the geometry before the code.

## Camera

`INITIAL_CENTER = [10, 20]`. The zoom is **not** a constant: both `initialViewState.zoom` and `minZoom`
come from `getWorldFitZoom(windowWidth)` in `src/map/cameraFit.ts`.

**Do not switch back to `bounds`.** Fitting `[-180,-60,180,85]` on a tall phone fills the screen height
with the latitude range and crops most of the longitude range — half the world ends up off-screen.

**Zoom 0 is a request, not a guarantee.** MapLibre clamps the camera so the world covers the viewport,
so on a tall phone the effective zoom is higher than asked — measured at ~0.61 on the S25, where the
world's full height maps exactly onto the 2340 px screen and only ~46% of the longitude range is
visible. Don't be surprised when a projection calculation assuming zoom 0 disagrees with reality;
derive the mapping empirically instead.

**Why the zoom floor is derived, not pinned.** That upward clamp only saves you in portrait. The world is
512 dp wide at zoom 0, and a landscape window is *wider* than that — 914 dp on the emulator — so
MapLibre tiles the world horizontally instead: a cold launch into landscape rendered ~1.8 copies with a
seam through the Pacific. `getWorldFitZoom` returns `max(0, log2(width / 512))`, which is **exactly 0 in
portrait** (so the portrait tap points are untouched) and 0.836 in landscape. Keep the `max(0, …)`: it is
what makes portrait a no-op, and `log2(0)` would otherwise send `-Infinity` to the native camera.

**A cold launch and a rotation do not settle at the same camera.** Rotating a running app keeps the
zoom it already had; launching fresh into landscape starts from the fit zoom. The two projections differ
by enough to change which country a percentage tap hits — 32%,56% is Brazil after a rotation but Guyana
on a cold launch. Derive Maestro points from a cold launch in the orientation the flow pins.

## Local toolchain (verified 2026-08-16)

| | |
|---|---|
| JDK | Temurin **17.0.20** at `C:\Program Files\Eclipse Adoptium\jdk-17.0.20.8-hotspot` |
| `JAVA_HOME` / `ANDROID_HOME` | set at **User** scope |
| Android SDK | `%LOCALAPPDATA%\Android\Sdk` — platforms **36** + 37.0, build-tools 36.0.0, cmdline-tools/latest |
| Emulator | AVD **`Medium_Phone`** — API 33, x86_64, Play Store image, 4096 MB RAM, GPU auto |
| Node / npm | 24.13.1 / 11.8.0 |

- Oracle **Java 8 JRE is still installed**; Temurin 17's `bin` sits ahead of it in the machine PATH.
  Don't remove the Oracle entries.
- Android PATH entries are **literal absolute paths**, not `%ANDROID_HOME%\...` — the user `Path`
  registry value is `REG_SZ`, so `%VAR%` would never expand.
- `sdkmanager` works but warns it is deprecated; `android sdk` is the replacement CLI.

## Commands

```bash
emulator -avd Medium_Phone
npx expo start                     # leave running; r = reload, j = debugger, m = dev menu
                                   # do NOT set CI=1 - it disables watch mode

# native build — only when native deps or app.json change
npx expo run:android
npx expo run:android --variant release

# tests
npm test                           # jest, runs on the PC, no emulator needed
npm run typecheck
npm run test:e2e                   # maestro, needs a running emulator/device
npm run build:data                 # one-off, needs network; rewrites BOTH json files
npm run enrich:data                # offline; rewrites countryFacts.json only

# web
npm run web                        # expo start --web (dev; no service worker)
npm run build:web                  # assets + icons + export + service worker -> dist/
npm run serve:web                  # serve an existing dist/ on :4173
npm run web:phone                  # build and serve for a phone on the LAN
# A service worker needs a SECURE context, so a LAN IP shows the app but never the PWA.
# `adb reverse tcp:4173 tcp:4173` makes the phone treat it as localhost, which counts.
# Load any route with `?debug` to get the live map on `window.__geoMap`.
```

### A release build can package a stale JS bundle — `.json` is not a Gradle input

**This bites precisely because the app's data lives in JSON.** `createBundleReleaseJsAndAssets`
(`BundleHermesCTask`, the task that runs `expo export:embed`) declares its inputs as a file tree of
**`**/*.js`, `.jsx`, `.ts` and `.tsx` only** — see
`node_modules/@react-native/gradle-plugin/.../tasks/BundleHermesCTask.kt`. Editing
`countryFacts.json`, `countries.geo.json` or `labelPoints.json` therefore does **not** invalidate it.
Gradle marks the task `UP-TO-DATE`, `assembleRelease` reuses whatever bundle is sitting in
`android/app/build/generated/assets/react/release/`, and the APK ships old data **with no warning at
all** — the build succeeds and looks completely normal.

`npx expo run:android` hides it entirely: debug is a debuggable variant, so the bundle task never runs
and Metro serves the fresh file. So the symptom is "the emulator is right and the release APK is
wrong", which reads like a bundling or minification bug and is not one.

It found us on 2026-08-24. Three capitals were corrected — Eswatini, Equatorial Guinea, Sri Lanka —
and the release APK showed only Eswatini's. The bundle on disk was dated two days before the commit,
from a build made after the Eswatini edit but before the other two; every `assembleRelease` since had
skipped the task.

**The fix is `plugins/withJsonBundleInputs.js`**, registered in `app.json`, which widens that file
tree with `sources.include("**/*.json")` (and excludes `.expo/`, whose generated JSON is volatile and
would re-bundle for nothing). It has to be a config plugin and not a hand-edit to
`android/app/build.gradle`, because **`android/` is gitignored and regenerated by `expo prebuild`** —
the same reason the font goes in through `expo-font`'s plugin.

Diagnosing a suspected recurrence takes one command — grep the built bundle for the string you expect:

```bash
grep -c "Ciudad de la Paz" android/app/build/generated/assets/react/release/index.android.bundle
ls -la android/app/build/generated/assets/react/release/index.android.bundle   # is it older than your edit?
```

An escape hatch if it ever happens again without touching the plugin: delete that generated directory,
which makes the task's outputs missing and forces it to rerun. `--rerun-tasks` also works and rebuilds
far more than you want.


### Architectures — this bites every time

`ORG_GRADLE_PROJECT_reactNativeArchitectures` controls which ABIs get built. An x86_64-only APK **will
not install on a phone** (`INSTALL_FAILED_NO_MATCHING_ABIS`), and an arm-only APK will not install on
the emulator.

- emulator only, fastest: `x86_64`
- phone only: `arm64-v8a`
- both (current debug APK): `arm64-v8a,x86_64` — 157 MB debug, ~3.5 min incremental
- omit entirely for a store build, so all four ABIs are produced

### Testing on the physical phone

```bash
adb devices                          # phone must show `device`, not `unauthorized`
adb -s <serial> reverse tcp:8081 tcp:8081    # REQUIRED: lets the phone reach Metro over USB
npx expo run:android --device
maestro --device <serial> test .maestro/tap-country.yaml
```

`adb reverse` is the step people forget — without it the app opens to a blank or red screen because it
cannot find the bundler. Re-run it after every unplug. With two targets attached, every `adb` command
needs `-s <serial>` or it fails with "more than one device/emulator".

### The dev loop

The dev build APK is a shell containing the native code plus a Metro client; your JS is served from the
PC at runtime. **JS/TS edits hot-reload in about a second** — you do *not* rebuild the APK per change.
Rebuild only when adding/removing a native dependency, editing `app.json`, or upgrading the Expo SDK.

## Testing

**Jest** (`jest-expo` preset, `@/` mapped to `src/`) — the fast inner loop, no device involved. The
native map is replaced by `__mocks__/@maplibre/maplibre-react-native.tsx`, because Fabric views cannot
render under Jest; what the tests exercise is our own wiring, not MapLibre.

React Native Testing Library **v14 made `render` and `fireEvent` async** — they must be awaited or
`screen` is never populated and every query fails with "render function has not been called".
`tsconfig.json` needs `"types": ["jest"]` or the test globals don't typecheck.

**Maestro** (`.maestro/`) drives the installed app; it does not rebuild. Maestro runs **natively on
Windows** (no WSL) and needs JDK 17, which is already set up. It is installed at
`C:\Users\Boris\maestro\maestro\bin\maestro.bat` and is **not on PATH** — either add it or call it by
full path. `npm run test:e2e` assumes `maestro` is on PATH.

There are **six flows**, and each pins its own orientation with `setOrientation` — the app rotates
freely now, so none can assume it:

| Flow | Orientation | Journey |
|---|---|---|
| `.maestro/tap-country.yaml` | `PORTRAIT` | Russia → Greenland → close → ocean-deselect |
| `.maestro/landscape-info-panel.yaml` | `LANDSCAPE_LEFT` | Brazil → Mali → close → ocean-deselect → rotate to portrait with the card open |
| `.maestro/choropleth-modes.yaml` | `PORTRAIT` | toggle on → legend → Russia still selects → close → toggle off |
| `.maestro/map-labels.yaml` | `PORTRAIT` | each label field in turn → map and selection still work |
| `.maestro/search-country.yaml` | `PORTRAIT` | open search → browse → type → pick → the map highlights and flies |
| `.maestro/quiz.yaml` | `PORTRAIT` + rotate | Quiz → pick a subregion and fields → back-press → discard → restart → answer → reveal → back-press → cancel → rotate → end → score |

**There is no flow for the quiz's `locate` mode**, which is the current gap — see *What is not
covered* under *Locate mode*.

Coordinate taps are only deterministic because `INITIAL_CENTER` and the derived zoom floor
(`cameraFit.ts`) pin the camera on launch — **change either and you must re-derive every tap point in
the three explore flows.**

`quiz.yaml` is the exception and contains **no coordinate taps at all**: the quiz camera moves on every
question, so a screen percentage means nothing there. It is entirely testID-driven, which also makes it
the one flow immune to a camera change. Two things it needs that the others do not: `scrollUntilVisible`
to reach a subregion row (Oceania is the last region in a long list), and the smallest subregion —
*Australia and New Zealand*, 2 countries — so the round is short and "Australia" is a knowable answer
without pinning the shuffle seed.

Things to know when picking tap points:

- **The card occupies a different edge per orientation.** Portrait: it covers roughly the bottom half, so
  follow-up taps go above it. Landscape: it covers the right ~40%, so they go in the **left 60%**.
- **Derive points from a cold launch in the flow's orientation**, not by rotating a running app — the two
  settle at different cameras. `32%,56%` is Brazil after a rotation and Guyana on a cold launch.
- MapLibre's default hitbox is **44 dp**, which is generous at this zoom. A point that looks like open sea
  can still select a country — `33%,47%` looked like mid-ocean and reliably selected **Gambia**. The
  ocean-deselect steps use `17%,44%` in portrait (mid-Atlantic) and `16%,83%` in landscape (South
  Pacific, ~96 dp clear of Chile), both of which clear every coastline by a wide margin.
- Aim at a **verified interior**, never a border. Both flows' points are point-in-polygon hits confirmed
  by screenshot; a first draft of the landscape flow aimed at "Algeria" and got Mali.

**Offline acceptance test** — the one that actually proves the requirement:

```bash
npx expo run:android --variant release       # JS bundle embedded; Metro not involved
adb shell svc wifi disable
adb shell svc data disable
# cold start, pan/zoom, tap countries on several continents
adb logcat | grep -i "http\|network"          # should show nothing from the app
adb exec-out screencap -p > proof.png
adb shell svc wifi enable
```

## The web target

The same app runs in a browser - phone and desktop - as an installable PWA that works
offline. `feat/web` added it; **Android is unchanged in behaviour throughout.**

Metro picks the platform by file extension, so the split is a set of `.web.tsx` siblings
rather than `Platform.OS` branches. There are still **zero** `Platform.OS` checks in
`src/`.

| | native | web |
|---|---|---|
| Map | `WorldMap.tsx` - `@maplibre/maplibre-react-native` | `WorldMap.web.tsx` - `maplibre-gl` |
| Style | `OFFLINE_STYLE` (`font-faces` + `asset://`) | `WEB_OFFLINE_STYLE` (no `font-faces`, no `glyphs`) |
| Flags | emoji | `CountryFlag.web.tsx` - real SVGs where the platform has no flag glyphs |
| Escape / keyboard play | no-ops | `useDismissKey.web.ts`, `keyboardPlay.web.ts` |
| Window size | `useWindowDimensions` | `useWindowSize.web.ts` - DOM truth, hydration-safe |

`worldMapProps.ts` holds the props and camera constants both implementations share, so
the two cannot drift. Everything above the renderer - `worldGeoJson`, `labelGeoJson`,
`CHOROPLETH_RAMPS`, `labelFilter`, `getWorldFitZoom`, `pickCountry`, all of
`quizCamera.ts` - is used unmodified. **The style spec is the portability layer**, which
is why this port is small.

### Text still needs no network

`font-faces` is MapLibre **Native** only, and the tempting conclusion - "so the web needs
a glyph server" - is wrong and would break the whole point of this project. From
maplibre-gl's `glyph_manager.ts`:

```js
if (!this.url || this._charUsesLocalIdeographFontFamily(id)) {
    glyph = entry.glyphs[id] = await this._drawGlyph(entry, stack, id);
```

With **no `glyphs` key at all**, every glyph is rasterised locally through canvas/TinySDF
using the `text-font` name as a CSS family. So `text-font: [LABEL_FONT]` carries over
unchanged and `expo-font`'s runtime hook registers the family. Verified with the origin
dead: zero glyph requests, zero external origins.

### Traps, each of which cost real time

- **MapLibre invents a viewport rather than waiting for one.** Given a zero-sized
  container it does not warn - it falls back to a **400x300** canvas and carries on, so
  every camera stop afterwards is arithmetic against a viewport that does not exist and
  the country lands off screen. Resizing "fixes" it because that finally tells the
  transform the truth. `WorldMap.web.tsx` therefore waits for a measured container before
  creating the map, ignores zero sizes from its `ResizeObserver` (a navigator reports one
  while `/search` sits over the map), re-syncs the transform before every stop, and holds
  a stop that arrives too early rather than dropping it.
- **React keeps the server's `className` on a hydration mismatch.** `web.output: "static"`
  renders every route in Node, where there is no window, so responsive branches take their
  smallest path - and the corrected classes computed on the client never reach the DOM.
  Nothing throws. Anything responsive in a FIRST render must use `useWindowSize`, not
  `useWindowDimensions`. Diagnose by comparing `element.className` against
  `__reactProps$*.className`.
- **`reactCompiler: true` punishes extracting a subscription into a hook.** Moving
  `useWindowDimensions()` out of a component body changes what the compiler memoises;
  the quiz then kept a stale layout through a rotation and `.maestro/quiz.yaml` failed
  0/3 against master's 3/3. `quizScreenBox.ts` is a PURE function taking the window for
  exactly this reason - keep the subscription inline.
- **A redeploy takes two visits to appear** unless the page reloads on
  `controllerchange`: the open page keeps its worker's assets and the new one only serves
  the visit after. Every conclusion drawn from that first load describes the previous
  build. Bit us twice.
- **Workbox's 2 MB default silently skips the bundle**, which is ~5 MB. The worker then
  registers, activates, looks perfect and fails offline. `scripts/build-web.mjs` asserts
  the bundle is under the limit rather than trusting the summary line.
- **Windows ships no country flag emoji at all.** Segoe UI Emoji has none, so a regional
  indicator pair renders as two letters. Not fixable in CSS; `public/flags/` carries real
  SVGs, fetched same-origin only where the platform needs them.

### Framing is tested end to end, on purpose

`searchFraming.test.ts` asserts a searched country is centred in, and fits inside, the
band a person can actually see - across five real viewports and five awkward countries.

It derives that band from **independently measured facts about the UI**, never from the
code under test. That is the whole point: every earlier check asked "did it land at the
centre of `getMapFocusRect(...)`", which agrees with that function however wrong it is,
and is why framing measured perfect while a phone was visibly wrong. Reintroducing the
original bug fails 28 of its 55 cases.

Two things it must keep doing, both of which fooled its own first draft: measure the
country **as drawn** (Mercator is not linear, so a tall country's latitude midpoint is
not its visual centre), and via projected corners (New Zealand's bbox crosses the
antimeridian, so `(west + east) / 2` lands in the Atlantic).

### Deploying

`vercel.json` pins the build to `npm run build:web` and the output to `dist/`. The
headers there are not decoration: **`sw.js` must not be cached** or a deploy never
reaches anyone, and the MapLibre worker needs a JavaScript content type. `cleanUrls`
serves `/search` and `/quiz/play` from the per-route HTML the static export emits.

Assets under `_expo/static/` and `assets/` are content-hashed and marked immutable;
everything else the worker precaches carries a Workbox revision, so it updates despite
the HTTP cache.

## Open risks

- **MapLibre vs RN 0.86** — the library is developed against RN 0.85.3 and declares `>= 0.80`. Nothing
  has broken in practice, but we are a version ahead of what upstream tests.
- **Release APK is x86_64 only** right now, because every build so far used
  `ORG_GRADLE_PROJECT_reactNativeArchitectures=x86_64`. It will not install on a physical phone —
  drop that variable for a real-device or store build.
- **The release APK is debug-signed** (Expo's default). A proper upload key is needed before
  distribution.
- **Emulator GPU** — if the map ever renders as a black rectangle, that's the emulator's graphics mode,
  not a code bug. Switch the AVD to *Hardware — GLES 2.0*.
- **Two MapLibre surfaces are alive during a quiz.** `/quiz/play` is `push`ed, so the explore map stays
  mounted behind it. It behaves on the emulator and has **not** been measured on the S25 — check
  `adb shell dumpsys meminfo com.boris.geographyapp` before and after, and watch for a black quiz map,
  which is what GL-context exhaustion looks like. If it bites, the fix is one word: `push` → `replace`
  in `QuizLaunchButton`, at the cost of the back gesture.
- **`.expo/types/router.d.ts` goes stale, and looks like a compile error.** With `typedRoutes: true`,
  adding a route fails `npm run typecheck` until Metro regenerates that file — and it can regenerate
  *wrong*, listing every module under `src/` as a route. Deleting `.expo/types` and restarting
  `npx expo start --clear` fixes it. This is not a bug in your code.

Two emulator failure modes that look like app bugs but aren't:

- **Never force-kill `qemu-system-x86_64`.** It corrupts the AVD's quick-boot snapshot, and the next
  launch hangs with `sys.boot_completed=1` but only ~50 services registered and the boot animation still
  spinning — `system_server` never starts, `adb shell settings` reports *"Can't find service: settings"*,
  and `screencap` hangs. Shut down with `adb emu kill` and wait for the process to exit; recover a wedged
  AVD with `emulator -avd Medium_Phone -no-snapshot-load` (a cold boot, which keeps installed apps).
  `-gpu angle_indirect` does **not** help — it hangs the same way.
- **Launch the emulator detached**, e.g. PowerShell `Start-Process`. Started as a child of a shell that
  the tooling later reaps, it has segfaulted (exit 139) seconds after a clean boot, taking the device
  offline mid-session.

## Attribution

Natural Earth is public domain. `world-countries`/mledoze is ODbL and World Bank data is CC BY 4.0 —
both require credit. All three belong in an About screen.

## Build APK commands
cd android && ORG_GRADLE_PROJECT_reactNativeArchitectures=arm64-v8a ./gradlew.bat assembleRelease

## Launching the app on AVD
emulator -avd Medium_Phone
npx expo run:android

## Launch web-dev server
npx expo start --web