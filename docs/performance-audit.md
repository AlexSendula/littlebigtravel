# Performance Audit

This document records the local performance baseline and measurement workflow. The goal is to measure before optimizing and to separate confirmed bottlenecks from guesses.

## Automated Audit

Run:

```sh
npm run build
npm run test:perf
```

`npm run test:perf` runs `tests/performance/performance-audit.spec.ts` with a mobile-sized Chromium context. It starts Vite on port `4174`, seeds deterministic IndexedDB trips, enables development-only render counters with `localStorage["lbt-performance-audit"] = "1"`, then prints a JSON report for a normal trip and a generated large trip.

Captured metrics:

- boot to first usable top trip card
- first usable map readiness, when MapLibre loads within the timeout
- trip drawer open and close timing
- planner open timing
- destination rail selection timing
- planner edit to IndexedDB save timing
- render counters for heavy regions
- map init-to-load timing
- basemap styling and route-layer setup timing
- route GeoJSON build and route source `setData` timing
- marker create/update/remove counts
- selected-stop camera transition count
- map resize count
- Chromium JS heap estimate after boot and after interactions

Memory limitation: the automated audit reports JavaScript heap estimates from Chromium DevTools Protocol when available. It does **not** report total app RAM, GPU memory, map tile memory, or real iPhone Safari memory. Real-device memory still needs manual Safari/Web Inspector profiling.

## Current Baseline

Initial production build inspected during Phase 1 after instrumentation:

- JavaScript bundle: `1,440.72 kB`, gzip `402.25 kB`
- CSS bundle: `145.31 kB`, gzip `23.45 kB`
- Vite warning: chunks larger than `500 kB`
- `src/App.tsx`: `1628` lines
- `src/features/planner/PlannerView.tsx`: `4210` lines
- MapLibre setup uses globe projection, DOM markers, route GeoJSON updates, selected-stop camera transitions, and third-party vector tiles.

Use the latest `npm run build` output as the source of truth when this document is updated.

Phase 2 production build after app-shell extraction and planner lazy loading:

- Date: 2026-05-01
- Initial JavaScript chunk after Phase 2C map extraction/instrumentation: `1,330.25 kB`, gzip `372.65 kB`
- Lazy planner chunk: `114.61 kB`, gzip `31.82 kB`
- CSS bundle: `145.31 kB`, gzip `23.45 kB`
- Initial JS reduction versus Phase 1: about `110.47 kB` minified and `29.60 kB` gzip moved out of the first chunk
- `src/App.tsx`: `509` lines
- `src/TravelMap.tsx`: `271` lines
- `src/mapCamera.ts`: `162` lines
- `src/mapMarkers.ts`: `144` lines
- `src/mapRoutes.ts`: `22` lines
- `src/features/trips/TripMenu.tsx`: `959` lines
- `src/features/map/DestinationRail.tsx`: `384` lines
- `src/features/planner/PlannerView.tsx`: `4213` lines

Latest local automated audit, normal trip:

- Date: 2026-05-01
- Browser/device: Playwright Chromium using iPhone 14 emulation
- Command: `npm run test:perf`
- Boot to top trip card: `100 ms`
- First usable map: `1415 ms`
- Trip drawer open: `485 ms`
- Trip drawer close: `516 ms`
- Destination rail select: `117 ms`
- Planner open: `261 ms`
- Planner edit to IndexedDB save: `913 ms`
- IndexedDB save internal timing: `0.4 ms`, `1` save
- Map boot timings: init-to-load `149 ms`, basemap style `3.7 ms`, route layer setup `2.2 ms`, route `setData` `1`
- Map boot counts: resize `2`, camera fit `2`, marker create `2`
- Map interaction counts: route `setData` `1`, marker element updates `2`, marker create `1`, camera transition `1`
- JS heap after boot: `22.62 MB` used, `38.52 MB` total
- JS heap after interactions: `30.84 MB` used, `54.44 MB` total
- Render counters: planner `4`, map shell `2`, editor sheet `3`, top card `1`, trip drawer `1`, destination rail `1`, app shell `1`

Latest local automated audit, generated large trip:

- Date: 2026-05-01
- Fixture shape: `10` bases, `5` days per base, stays, transports between bases, and `3` activities per day
- Browser/device: Playwright Chromium using iPhone 14 emulation
- Command: `npm run test:perf`
- Boot to top trip card: `65 ms`
- First usable map: `1248 ms`
- Trip drawer open: `493 ms`
- Trip drawer close: `482 ms`
- Destination rail select: `156 ms`
- Planner open: `294 ms`
- Planner edit to IndexedDB save: `950 ms`
- IndexedDB save internal timing: `0.5 ms`, `1` save
- Map boot timings: init-to-load `98.6 ms`, basemap style `2.4 ms`, route layer setup `1.4 ms`, route `setData` `1`
- Map boot counts: resize `3`, camera fit `2`, marker create `11`
- Map interaction counts: route `setData` `1`, marker element updates `2`, marker create `6`, camera transition `1`
- JS heap after boot: `31.95 MB` used, `81.45 MB` total
- JS heap after interactions: `63.81 MB` used, `114.95 MB` total
- Render counters: planner `4`, editor sheet `3`, top card `1`, trip drawer `1`, map shell `1`, destination rail `1`, app shell `1`

Previous local automated audit:

- Date: 2026-04-30
- Browser/device: Playwright Chromium using iPhone 14 emulation
- Command: `npm run test:perf`
- Boot to top trip card: `81 ms`
- First usable map: `1315 ms`
- Trip drawer open: `520 ms`
- Trip drawer close: `543 ms`
- Destination rail select: `235 ms`
- Planner open: `303 ms`
- Planner edit to IndexedDB save: `381 ms`
- IndexedDB save internal timing: `26.6 ms`
- JS heap after boot: `28.28 MB` used, `38.17 MB` total
- JS heap after interactions: `22.96 MB` used, `57.21 MB` total

These numbers are local-machine diagnostics, not app-wide performance budgets.

## Development Render Counters

Render counters are intentionally development-only. They are disabled unless both conditions are true:

- Vite is running in development mode.
- `localStorage["lbt-performance-audit"] === "1"`.

Tracked regions:

- `app-shell`
- `map-shell`
- `top-trip-card`
- `trip-drawer`
- `destination-rail`
- `planner-view`
- `editor-sheet`

Map-specific counters and timings currently include:

- `map.initToLoad`
- `map.basemap.style`
- `map.route.layers`
- `map.route.build`
- `map.route.setData`
- `map.marker.sync`
- `map.marker.create`
- `map.marker.updateElement`
- `map.marker.updatePosition`
- `map.marker.remove`
- `map.camera.fit`
- `map.camera.transition`
- `map.resize`

The counters are diagnostic only. They should not affect production behavior.

## Manual Profiling Checklist

Use Chrome Performance or Safari Web Inspector on a real phone when checking perceived lag:

- record one map pan and zoom
- record one planner open and close
- record one swipe delete
- record one destination rail drag/select
- record one editor date picker interaction
- record one editor time picker interaction

For each recording, note:

- device and browser
- whether the app was installed as PWA or running in browser
- rough trip size: number of trips, bases, days, items, stays, and mappable activities
- visible lag or missed gesture
- main-thread scripting time
- layout/recalculate style spikes
- paint/compositing spikes
- MapLibre frame/render spikes

## Findings Queue

Use this structure for Phase 2 candidates:

```md
### Finding

- Confirmed issue:
- Evidence:
- Suspected cause:
- Recommended Phase 2 fix:
- Risk level:
```

Initial candidates to verify with measurements:

### Large Initial Bundle

- Confirmed issue: initial production JS remains over 1.3 MB minified after the first split.
- Evidence: Vite build output. Phase 2 moved `114.61 kB` minified / `31.82 kB` gzip into a lazy planner chunk, but the main chunk is still large.
- Suspected cause: MapLibre and remaining map/app orchestration code loaded up front.
- Recommended next fix: defer deeper bundle work until the map-focused session, then evaluate MapLibre import cost, style data, and route/marker code paths.
- Risk level: medium, because map behavior is core UX.

### Large Planner/App Components

- Confirmed issue: `PlannerView.tsx` remains large; `App.tsx` is now materially smaller.
- Evidence: `App.tsx` reduced from `1628` lines to `509` lines by extracting trip menu and destination rail. `PlannerView.tsx` remains about `4213` lines.
- Suspected cause: planner timeline, editors, sheets, gestures, and linked-item behavior are still concentrated in one file.
- Recommended next fix: defer deep planner decomposition until planner-specific feature work requires touching the same areas, then split by editor/section boundaries.
- Risk level: medium, because behavior is gesture-heavy.

### IndexedDB Save Frequency

- Confirmed issue: immediate save-on-every-state-change was unnecessary for normal edits.
- Evidence: Phase 2 audit records one coalesced `indexeddb.save` for the planner edit interaction in both normal and large fixtures.
- Suspected cause: prior persistence was tied too directly to React state updates.
- Implemented Phase 2 fix: debounce normal saves by `400 ms`, enforce a `2000 ms` max wait, keep only the latest snapshot, and allow one in-flight save with one follow-up if needed.
- Risk level: low to medium, because destructive and lifecycle-sensitive operations still flush immediately.

### Map Interaction Cost

- Confirmed issue: map work is measurable and should stay under observation as trip size grows.
- Evidence: Phase 2C now records map init-to-load, basemap styling, route build/setData, marker operation counts, resize counts, and camera transition counts for normal and large fixtures.
- Implemented Phase 2C fix: marker updates are diffed, route `setData` is skipped when the visible route signature is unchanged, resize calls are requestAnimationFrame-throttled, and repeated selected-stop camera targets are skipped.
- Recommended next fix: defer deeper map work until the planned map redesign/provider session; then evaluate MapLibre style cost, globe projection cost, DOM marker scalability, and route rendering strategy together.
- Risk level: medium to high, because map feel is core UX.

### Gesture And Sheet Work

- Confirmed issue: gesture-heavy surfaces have had repeated regressions.
- Evidence: prior bug fixes around swipe delete, drag, trip drawer, and picker behavior.
- Suspected cause: competing touch handlers and large sheet DOM.
- Recommended Phase 2 fix: audit handler frequency, avoid layout reads during pointer moves, and keep active gesture state isolated.
- Risk level: medium.
