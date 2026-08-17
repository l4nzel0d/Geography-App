# geography-app

An Android app showing a world map with country outlines. Tapping a country opens an info box with its
population, currency and official languages.

## Hard constraint: the app must work fully offline

This is the requirement that drives every other decision. No map tile server, no REST call at tap time,
no font/glyph fetch. Everything ships inside the APK.

**Never introduce a runtime network dependency** — a tile source, a `glyphs`/`sprite` URL in the map
style, a live API call — without flagging it explicitly. The offline acceptance test (release build,
wifi + data disabled) is the gate that this must pass.

## Status

**Working and verified on the emulator.** Tap a country → it highlights and the info sheet shows
population, currency, official languages, capital, region and area.

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
- 59 Jest tests pass, typecheck clean
- both Maestro flows pass — portrait 20 steps, landscape 24
- **not re-verified on the S25 or against the offline acceptance test.** The manifest lost
  `android:screenOrientation`, so those two need a re-run before release; nothing here adds a network
  call, but the gate is the gate.

## Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Expo SDK 57** + React Native 0.86.2, TypeScript | Development build, **not Expo Go** — MapLibre is a native module |
| Routing | expo-router, routes in **`src/app/`** | SDK 57's default template layout |
| Map | **`@maplibre/maplibre-react-native` 11.3.6** | Free, no API key, GPU polygon rendering, native hit-testing |
| Info box | Hand-rolled on RN `Animated` | See below — deliberately not a bottom-sheet dependency |
| Geometry | Natural Earth *Admin 0 Countries, 1:110m* | public domain, 177 features |
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
    index.tsx               # MapScreen: owns selectedIso3 state
  map/
    WorldMap.tsx            # Map + GeoJSONSource + fill/selected/line Layers
    cameraFit.ts            # pure: zoom floor that stops the world tiling in landscape
    offlineStyle.ts         # inline style: background layer ONLY, no sources, no glyphs
  data/
    countries.geo.json      # 177 outlines, properties trimmed to { iso3, name }   (248 KB)
    countryFacts.json       # 250 fact records keyed by ISO-3                       (77 KB)
    countryFacts.ts         # synchronous lookup
    types.ts
  components/
    CountryInfoSheet.tsx
    infoSheetLayout.ts      # pure: portrait bottom sheet vs landscape side panel
    formatters.ts           # pure, unit-tested
scripts/build-country-data.mjs
__tests__/ , __mocks__/ , .maestro/
```

**Single source of identity: ISO 3166-1 alpha-3.** Geometry features and fact records join on it.

Both JSON files are `import`ed directly — Metro inlines them into the bundle, so there is no filesystem
read and no async load at runtime. Do not convert either to a fetch.

## The data pipeline

`npm run build:data` — a **one-off**, run while online; its output is committed. The app never calls
these APIs.

Things that bit us, preserved so they don't bite again:

- **REST Countries is no longer usable.** v3.1 is deprecated (returns an error envelope, not data) and
  v5 requires an API key. `world-countries` is the same upstream dataset, but it has **no population
  field** — hence the separate World Bank call.
- **Natural Earth ships `ISO_A3 = "-99"`** for disputed/dependent territories. `NE_TO_ISO3` patches
  Kosovo (`KOS` → `UNK`) and South Sudan (`SDS` → `SSD`); France and Norway resolve via the `ADM0_A3`
  fallback. Without this France silently becomes an untappable blank.
- **Kosovo is `UNK` in mledoze but `XKX` at the World Bank** — see `ISO3_TO_WORLD_BANK`.
- Coordinates are rounded to 3 dp (~110 m), which roughly halves the file size and is far finer than a
  1:110m basemap needs.

The script **fails the build** on any unresolved code, duplicate, missing facts record, or missing
population. Genuine upstream gaps go in an explicit allowlist (`FACTLESS_ALLOWLIST` = Northern Cyprus,
Somaliland; `POPULATIONLESS_ALLOWLIST` = Taiwan, Western Sahara, Falklands, French Southern Territories,
Antarctica) — never a silent skip. The same invariants are re-asserted in `__tests__/data-integrity.test.ts`
so they cannot rot.

## Selection

Highlight is a **filtered layer**, not feature-state:
`filter: ['==', ['get','iso3'], selectedIso3 ?? '']`. An empty string matches nothing, which is how
"no selection" is expressed.

### `GeoJSONSource.onPress` MUST call `event.stopPropagation()`

This cost real debugging time. Source presses **bubble up to `Map.onPress`**, which is our
tap-the-ocean-to-deselect handler. Without `stopPropagation()` the ocean handler fires immediately
after every country press and clears the selection that was just made, so tapping a country appears to
do nothing at all — no error, no log, just silence.

Unit tests cannot catch this on their own (the mock doesn't model native bubbling), so there is an
explicit assertion that `stopPropagation` was called, plus a Maestro step that taps ocean after
selecting.

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

# native build — only when native deps or app.json change
npx expo run:android
npx expo run:android --variant release

# tests
npm test                           # jest, runs on the PC, no emulator needed
npm run typecheck
npm run test:e2e                   # maestro, needs a running emulator/device
npm run build:data                 # one-off, needs network
```

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

There are **two flows, one per orientation**, and each pins its own with `setOrientation` — the app
rotates freely now, so neither can assume it:

| Flow | Orientation | Journey |
|---|---|---|
| `.maestro/tap-country.yaml` | `PORTRAIT` | Russia → Greenland → close → ocean-deselect |
| `.maestro/landscape-info-panel.yaml` | `LANDSCAPE_LEFT` | Brazil → Mali → close → ocean-deselect → rotate to portrait with the card open |

Coordinate taps are only deterministic because `INITIAL_CENTER` and the derived zoom floor
(`cameraFit.ts`) pin the camera on launch — **change either and you must re-derive every tap point in
both flows.**

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

## Ideas not yet built

Country search, zoom-to-selected-country, an About screen with the required attributions, and haptics on
selection.

## Attribution

Natural Earth is public domain. `world-countries`/mledoze is ODbL and World Bank data is CC BY 4.0 —
both require credit. All three belong in an About screen.
