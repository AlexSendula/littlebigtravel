# Agent Working Rules

This project is a mobile-first travel planner PWA. Treat tests as behavior contracts for accepted behavior and as the local regression gate before feature work is considered complete.

Project-local testing skill: `.codex/skills/lbt-testing-gate/SKILL.md`. Use it when deciding or updating test coverage for this repository.

During exploratory feature work, it is fine to iterate on implementation before locking the tests. Before committing, or when the behavior is considered done, the relevant tests must be updated and passing.

Once the intended behavior is accepted, or before committing:

- Check whether a BDD scenario, unit test, or visual test should be added or updated.
- Add a regression test for bug fixes when the bug can be reproduced in a stable way.
- Use unit tests for pure trip/date/time/place/map logic.
- Use Cucumber + Playwright for user-visible flows.
- Use focused Playwright visual snapshots for sheets, cards, pickers, rails, and swipe states.
- Use the performance audit for map, gesture, drawer, planner, bundle, or persistence performance work.
- Avoid full-map visual snapshots; mask or ignore map canvas rendering when possible.

Exception: for tricky bug fixes or high-risk domain logic, write or update the failing test early when it helps prove the fix.

For commit-level changes, run the smallest relevant test set plus the applicable gate:

- `npm run build`
- `npm run test:unit`
- `npm run test:bdd`
- `npm run test:visual` when layout, picker, sheet, rail, or swipe presentation changed
- `npm run test:perf` when performance-sensitive code changed or when comparing optimizations

Do not leave critical Cucumber scenarios tagged `@todo` in completed work.
