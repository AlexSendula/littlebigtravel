# Test Inventory

This document tracks the current regression coverage. Keep it updated when tests are added, removed, or when behavior moves to a different layer.

`docs/testing-strategy.md` explains how the test stack should be used. This file records what is currently covered.

## Commands

- `npm run test:unit`: Vitest domain and helper tests.
- `npm run test:bdd`: Cucumber + Playwright mobile user-flow tests.
- `npm run test:visual`: Playwright mobile visual snapshots.
- `npm run test:perf`: Playwright mobile performance audit and JS heap estimate.
- `npm run test:all`: unit, BDD, and visual tests.

## Unit Tests

### `tests/unit/generated-items.test.ts`

Covers generated linked-item visibility helpers.

- Hiding one generated transport moment does not delete or disable the source route.
- Stay check-in and check-out generated moments can be hidden independently.
- Linked moments can be toggled off and back on as a group.

Update this file when generated arrival, departure, check-in, check-out, or linked-item visibility rules change.

### `tests/unit/map-data.test.ts`

Covers map-stop derivation and ordering.

- Route labels and custom bases for the same city are deduplicated.
- Starting travel origin appears before the first base city.
- Mappable activities appear inside their parent base sequence before the next base city.
- Opted-in activities appear once and do not duplicate the parent base city.

Update this file when destination rail ordering, map stop deduping, route generation, or activity map visibility rules change.

### `tests/unit/place-formatting.test.ts`

Covers place label and flag formatting.

- Common country codes such as Germany and Croatia produce flag emoji.
- Invalid country-code input safely falls back without a flag.
- Place keys normalize labels by removing flags and country tails.

Update this file when place labels, country-code parsing, flag display, or map stop matching changes.

### `tests/unit/provider-config.test.ts`

Covers map and place provider abstraction contracts.

- The default development map provider remains `carto-positron-dev` with the current CARTO Positron style URL.
- `openfreemap-dev` remains configured as an inactive map-style alternative.
- Photon remains the default development geocoder.
- The future places/recommendations provider exists only as an explicit placeholder.
- Photon general and city-only request URLs are built correctly.
- Photon city and address responses preserve labels, coordinates, country codes, and flags.

Update this file when provider IDs, default provider selection, Photon request construction, Photon parsing, or future provider placeholders change.

### `tests/unit/imports.test.ts`

Covers the Gmail import domain foundation.

- Gmail query construction uses trip dates, destination/base names, and booking keywords.
- Candidate scoring rejects irrelevant email-like sources and accepts likely travel/booking sources.
- Deterministic extraction creates a high-confidence starting-travel candidate from structured confirmation text.
- High-confidence flight imports create one imported starting travel item and one arrival base.
- Re-importing the same source id updates the imported item instead of duplicating it.
- Matching manual planner items are not silently overwritten by imported candidates.
- Gmail incremental history id selection keeps the highest available history id.
- Import run coordination collapses repeated triggers into one in-flight run plus one follow-up run.

Update this file when Gmail import source metadata, deterministic extraction, candidate scoring, source deduplication, or import coalescing changes.

### `tests/unit/timeline-defaults.test.ts`

Covers default ordering for unknown times.

- TBD arrival sorts before stay moments.
- TBD departure sorts after stay moments.
- Stay check-out sorts before stay check-in when both are TBD.

Update this file when unknown-time sorting, generated moment ordering, or daily timeline ordering changes.

## BDD Scenarios

### `features/trips.feature`

Covers trip-level local-first behavior.

- Create the first trip from an empty app.
- Create multiple trips and switch the active trip.
- Unarchive an archived trip without stealing the active trip.

Update this feature when trip creation, active-trip selection, archiving, unarchiving, or trip menu behavior changes.

### `features/planner.feature`

Covers core planner flows.

- Starting travel creates exactly one linked arrival and base city.
- Editing a starting travel destination does not create duplicate or partial base cities.
- A linked generated arrival can be hidden and regenerated.
- A valid activity place exposes the show-on-map option.
- Enabling show-on-map persists a mappable activity.
- Adding a stay generates linked check-in and check-out moments.
- Empty day deletion does not require confirmation.
- Non-empty day deletion requires confirmation.
- Date picker closes after selection without focusing notes.
- Time picker closes after selection without focusing notes.

Update this feature when planner creation, linked-item generation, deletion confirmation, activity map visibility, stay generation, or picker close behavior changes.

### `features/imports.feature`

Covers foreground Gmail auto-import behavior.

- Connecting Gmail through the trip menu exposes connected state.
- Flight confirmation fixtures create one imported starting travel item and a linked arrival/base flow.
- Hotel confirmation fixtures create one imported stay with linked check-in/check-out moments.
- Repeated visible Gmail checks do not duplicate imported items.
- Imported confirmations do not overwrite matching manual planner items.
- Disconnecting Gmail stops later foreground import checks.

Update this feature when Gmail connection UI, foreground import triggering, duplicate prevention, imported item generation, or disconnect behavior changes.

## Visual Snapshots

All visual snapshots are mobile-sized Chromium baselines. They intentionally focus on app UI surfaces, not full map rendering.

Baseline PNGs live in `tests/visual/*-snapshots/` and are committed as the source of truth for visual regression tests. Run `npm run test:visual:update` only after accepting a visual state, review the generated image diffs, then run `npm run test:visual` to compare against the committed baselines. Failure artifacts such as `test-results/` and `playwright-report/` remain ignored.

### `tests/visual/planner-ui.spec.ts`

Current snapshots:

- `trip-card-collapsed-darwin.png`: collapsed top trip card.
- `trip-card-expanded-darwin.png`: expanded trip drawer.
- `trip-planner-main-darwin.png`: main planner timeline view.
- `departure-editor-calendar-darwin.png`: departure editor with calendar open.
- `starting-travel-editor-darwin.png`: starting travel editor.
- `activity-editor-time-darwin.png`: activity editor with time selector open.
- `stay-editor-darwin.png`: stay editor.
- `linked-items-toggle-enabled-darwin.png`: linked-item toggle enabled state.
- `linked-items-toggle-disabled-darwin.png`: linked-item toggle disabled state.
- `planner-swipe-delete-exposed-darwin.png`: planner swipe-delete exposed state.
- `trip-swipe-delete-exposed-darwin.png`: trip delete swipe exposed state.
- `trip-swipe-archive-exposed-darwin.png`: trip archive swipe exposed state.
- `destination-rail-mappable-activity-darwin.png`: destination rail with a base city and mappable activity.

Update these snapshots when the accepted visual design of the corresponding UI changes. Add a new focused snapshot when a new stable sheet, picker, rail, swipe state, or repeated card pattern becomes important enough to protect.

## Performance Audit

### `tests/performance/performance-audit.spec.ts`

Captures a local mobile Chromium performance baseline. This is a diagnostic audit, not a strict pass/fail performance budget.

Current audit output includes:

- separate normal-trip and generated large-trip reports
- boot to first usable top trip card
- first usable map readiness, when MapLibre loads within the timeout
- trip drawer open and close timing
- planner open timing
- destination rail selection timing
- planner edit to IndexedDB save timing
- coalesced IndexedDB save count and timing through the `indexeddb.save` internal metric
- map init-to-load, basemap styling, route build, and route `setData` timing
- marker create/update/remove counts
- map resize and selected-stop camera transition counts
- development-only render counters for heavy regions
- Chromium JS heap estimate after boot and after interactions

The generated large trip currently includes multiple bases, stays, inter-base transports, and repeated activities so large-list and map-data costs can be compared against the normal fixture.

Update this file when adding a new high-risk interactive surface that should be included in performance baselines. Keep thresholds loose unless we intentionally introduce a formal performance budget.

## Support Helpers

### `tests/fixtures/plannerFixtures.ts`

Shared planner fixtures for unit and visual tests:

- `startingTravel`
- `stayItem`
- `activityItem`
- `customBase`
- `tripFixture`

Update fixtures when the domain type shape changes or when a repeated test setup needs one canonical version.

### `tests/bdd/support/world.ts`

BDD browser and storage setup:

- Starts Vite for BDD runs when no external `BDD_BASE_URL` is provided.
- Uses an iPhone-sized Chromium context.
- Clears IndexedDB and localStorage between clean scenarios.
- Seeds local trips directly into IndexedDB for deterministic setup.

Update this file when storage, trip repository, app startup, or BDD browser setup changes.

### `tests/bdd/support/actions.ts`

Reusable BDD UI actions:

- Open and close trip menu.
- Create trips.
- Open planner.
- Select mocked/local place options.
- Open starting travel editor.
- Perform deterministic swipe gestures.
- Expose swipe states for deterministic assertions.

Update this file when UI selectors, sheet-opening behavior, or deterministic gesture helpers change.

### `tests/bdd/steps/import.steps.ts`

BDD Gmail import steps:

- Inject deterministic in-browser Gmail fixture messages.
- Connect and disconnect the local Gmail import provider through the trip menu.
- Trigger a foreground Gmail check without waiting for the 60-second polling interval.
- Assert imported starting travel and stay counts through IndexedDB.

Update this file when the Gmail test fixture shape, import provider test hook, trip menu Gmail controls, or imported item metadata changes.

### `src/performance/perfMetrics.ts`

Development-only render and timing instrumentation used by `npm run test:perf`.

Update this file when adding or renaming render counters, internal timing names, or performance-audit collection behavior. It must stay disabled in production and off by default in development.

## Known Gaps

These are intentionally not covered yet:

- Real iOS Safari or Android Chrome device runs.
- Total device RAM, GPU memory, and real Safari PWA memory telemetry.
- Desktop viewport regression coverage.
- CI execution.
- Full map tile/canvas visual snapshots.
- Exhaustive gesture physics and every possible swipe angle.
- Offline reinstall/data persistence behavior.
- Sharing, auth, subscriptions, payments, sync, and backend behavior.
- Real Gmail OAuth/API integration, token expiry, and Google API verification flow.
- Gmail attachment/PDF/OCR parsing.
- Local LLM extraction engine behavior.
- Accessibility audits beyond selectors, roles, and current interaction checks.

## Maintenance Rule

When behavior changes, update this inventory in the same change that updates the tests. If a behavior is intentionally left untested, add it to Known Gaps with a short reason.
