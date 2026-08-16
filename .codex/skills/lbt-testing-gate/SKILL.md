---
name: lbt-testing-gate
description: Project-local testing workflow for the LBT travel planner app. Use when Codex is changing behavior, fixing a bug, updating planner/map/trip UI, adding or modifying tests, preparing to commit, or deciding which Vitest, Cucumber/Playwright, or visual snapshot tests must be updated for this repository.
---

# LBT Testing Gate

## Purpose

Use this skill only for the LBT travel planner project. It turns the repo's testing docs into an execution checklist so behavior changes finish with the right regression coverage.

## Required Context

Before deciding test scope, inspect:

- `AGENTS.md` for the project testing rule.
- `docs/testing-strategy.md` for the stack and gate policy.
- `docs/test-inventory.md` for existing specs, selectors, helpers, and known gaps.

## Test Selection

Choose the smallest set that protects the behavior:

- Use `npm run test:unit` for pure domain logic in `src/domain/trip`, repository/store logic, date/time/place formatting, generated linked-item rules, timeline ordering, and map data derivation.
- Use `npm run test:bdd` for user-visible planner, trip drawer, linked-item, picker, archive/delete, and map-list flows.
- Use `npm run test:visual` when layout, cards, sheets, popovers, rails, swipe exposed states, or mobile presentation changes.
- Use `npm run test:visual:update` to create or refresh visual baselines after accepting a visual state. Commit intentional `tests/visual/*-snapshots/` PNG changes because they are the visual source of truth.
- Always run `npm run build` before considering commit-level work complete.

When a bug is stable enough to reproduce, add or update a regression test. If a gesture is too physics-sensitive to test directly, expose a deterministic test hook or test the state it produces.

## Workflow

1. Identify the accepted behavior or bug fix.
2. Search `docs/test-inventory.md`, `features/`, `tests/unit/`, `tests/bdd/`, and `tests/visual/` for existing coverage.
3. Update the implementation.
4. Add or update the relevant test layer.
5. Update `docs/test-inventory.md` whenever a test, helper, selector, snapshot, or known gap changes.
6. Run the relevant commands.
7. Report exactly what passed and anything not run.

## BDD Rules

- Keep feature text readable as product behavior documentation.
- Prefer user-level language over implementation details.
- Reuse BDD helpers in `tests/bdd/support/actions.ts` before adding new step mechanics.
- Keep browser storage clean per scenario.
- Prefer role/text selectors; add `data-testid` only where text/role selectors are brittle.

## Visual Rules

- Keep visual tests mobile-first.
- Do not snapshot the full map canvas. Mask or avoid unstable map rendering.
- Snapshot stable overlays, sheets, cards, pickers, rails, and exposed swipe states.
- Treat snapshot PNGs as committed baselines. Keep failure artifacts such as `test-results/` and `playwright-report/` out of commits.
- Disable animations in visual tests unless the animation state itself is being tested.
- If snapshots change intentionally, state why.

## Completion Checklist

Before commit or final handoff for completed behavior:

- Relevant tests are updated.
- `docs/test-inventory.md` reflects the current suite.
- `npm run build` passes.
- The smallest relevant test commands pass.
- No critical completed behavior remains only manually tested.
