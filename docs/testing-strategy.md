# Testing Strategy

This app has a lot of gesture-heavy mobile behavior, generated planner data, and map-derived UI. The test stack is split so each layer protects the part it is best at. The current goal is a local, mobile-first Core Gate before larger product work continues.

For the current list of protected behaviors and snapshot states, see `docs/test-inventory.md`.

## Layers

- **Vitest unit tests** protect pure trip logic: date ranges, flags, map data ordering, timeline sorting, and generated item rules.
- **Cucumber + Playwright BDD tests** protect user-visible workflows in readable Gherkin files.
- **Playwright visual tests** protect focused UI states like sheets, pickers, cards, destination rails, and swipe affordances.
- **Playwright performance audit** records local mobile timing, render-counter, and JS heap baselines before optimization work.

## Rules For Future Changes

- If user behavior changes, update or add a `.feature` scenario.
- If domain logic changes, update or add a unit test.
- If layout, picker, gesture, or sheet behavior changes, update or add a focused visual test when stable.
- If a bug is fixed, add the smallest reliable regression test that would have failed before the fix.
- Do not consider feature work complete until the relevant tests are updated and passing.
- Do not leave critical behavior as `@todo`; reserve `@todo` only for explicitly deferred product behavior.

## Core Gate Scope

The Core Gate is intentionally mobile-only for now, using an iPhone-sized Chromium context. It covers the critical local behavior that has caused regressions:

- trip creation, switching, archiving, and unarchiving
- starting travel creation and destination edits without duplicate base cities
- linked arrival, departure, stay check-in, and stay check-out visibility
- empty-day deletion versus confirmed destructive deletion
- activity places and the show-on-map option
- date and time picker close behavior
- destination rail ordering and map-list data
- focused visual states for trip cards, planner sheets, pickers, swipe affordances, and rails

This phase does not include CI, real-device iOS/Android runs, backend sync, or a broad desktop visual matrix.

## Performance Audit Guidance

Use `npm run test:perf` before and after optimization work, or when changing high-risk surfaces such as MapLibre rendering, destination rail interactions, trip drawer motion, planner sheet motion, or IndexedDB save behavior.

The performance audit is diagnostic. It prints timings and memory estimates so changes can be compared, but it does not currently enforce hard budgets. The memory numbers are Chromium JavaScript heap estimates only; they are not total phone RAM, GPU memory, or real iOS Safari PWA memory.

## Visual Test Guidance

Do not compare the full map as a visual baseline. Map tiles, labels, and canvas rendering can change independently of the app UI. Prefer screenshots of overlays and controls, and mask the map canvas where needed.

Visual baseline PNGs under `tests/visual/*-snapshots/` are part of the visual test source of truth and should be committed when intentionally created or updated. Keep them focused and small: do not add full-map snapshots, and review visual diffs before accepting a baseline update. Failure artifacts such as `test-results/` and `playwright-report/` stay ignored.

## Suggested Workflow

1. During exploration, use manual testing and small targeted scripts as needed.
2. When the intended behavior is settled, update the relevant unit, BDD, or visual tests.
3. Implement or finish the change.
4. Run the smallest relevant test script while iterating.
5. Before committing substantial work, run:
   - `npm run build`
   - `npm run test:unit`
   - `npm run test:bdd`
   - `npm run test:visual` when visual states changed
   - `npm run test:perf` when performance-sensitive code changed or before optimization comparisons
