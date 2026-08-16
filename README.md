# LittleBigTravel

**[littlebigtravel.net](https://littlebigtravel.net)**

A mobile-first, local-first travel planner. The map is the home screen, the
planner is tied to the active trip, and your data lives on your device.

Built as a React single-page app. No backend — trips are stored in IndexedDB
in the browser.

## Status

Pre-launch, but deployed. Live at the link above; no accounts, no users, and
nothing leaves your device.

**Works today:** multiple trips, map home screen, planner with stays,
activities and travel legs, auto-generated arrival/departure and check-in/out
items, map-relevant activities, local persistence in IndexedDB.

**Not built:** service worker / installable PWA, accounts, sync, sharing,
backup, suggestions, agent integration. Gmail import exists but is parked on a
branch.

`docs/vision.md` and `docs/architecture.md` describe where this is going. Both
label every item as built or planned — treat anything unlabelled there as
planned.

## Quick Start

```bash
npm install
npm run dev
```

The dev server binds `0.0.0.0` so it is reachable from a phone on the same
network, which is the intended way to work on it.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) then production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run test:unit` | Vitest — pure domain logic |
| `npm run test:bdd` | Cucumber + Playwright — user-visible flows |
| `npm run test:visual` | Playwright — focused UI snapshots |
| `npm run test:visual:update` | Update visual baselines |
| `npm run test:perf` | Playwright performance audit |
| `npm run test:all` | unit + bdd + visual |

Before committing substantial work, run `npm run build`, `npm run test:unit` and
`npm run test:bdd`, plus `test:visual` if presentation changed. See `AGENTS.md`
for the full gate.

## Project Structure

```
src/
├─ domain/        pure trip/date/place/timeline logic — no React, no IO
├─ stores/        usePlannerStore + indexedDbPlannerRepository
├─ providers/     map, geocoding, place-recommendation abstractions
├─ features/      planner, trips, map UI
├─ styles/        per-feature CSS
└─ performance/   perf instrumentation

tests/
├─ unit/          Vitest, node environment
├─ bdd/           Cucumber step definitions and support
├─ visual/        Playwright snapshot specs
└─ performance/   Playwright performance audit

features/         Gherkin .feature files
docs/             Project documentation
```

Two conventions worth knowing before changing anything:

- **Nothing touches IndexedDB except `indexedDbPlannerRepository`.** All
  persistence goes through the `PlannerRepository` interface.
- **`src/domain/` stays pure.** No React, no browser APIs — that is why its
  tests run in a node environment.

## Documentation

| Document | Contents |
| --- | --- |
| [`docs/vision.md`](docs/vision.md) | What this is, who it is for, product arc, business model |
| [`docs/architecture.md`](docs/architecture.md) | How it is built and why; target architecture |
| [`docs/go-live-checklist.md`](docs/go-live-checklist.md) | What must be resolved before commercial launch |
| [`docs/testing-strategy.md`](docs/testing-strategy.md) | Test layers and rules |
| [`docs/test-inventory.md`](docs/test-inventory.md) | Every protected behaviour, per test file |
| [`docs/performance-audit.md`](docs/performance-audit.md) | Performance baselines and findings queue |
| [`docs/brainstorm-roadmap.md`](docs/brainstorm-roadmap.md) | Earlier product idea capture, kept for context |
| [`AGENTS.md`](AGENTS.md) | Working rules for AI agents on this repo |

## Branches

| Branch | Contents |
| --- | --- |
| `main` | The planner. Clean, no Gmail import. |
| `feature/gmail-import` | Parked Gmail auto-import: OAuth, extraction, PDF attachments, LLM extraction hook, eval fixtures |

Gmail import was separated from `main` deliberately so the core planner could be
deployed and iterated on without it. It is unfinished, not abandoned — see
phase 3 in `docs/architecture.md`.

## Environment

No environment variables are required to run the planner. `.env` is gitignored.

Note that Vite compiles any `VITE_*` variable into the client bundle at build
time — they ship to every visitor and are not secrets.

## Deployment

Built as a container and served as static files:

```bash
docker build -t littlebigtravel .
docker run -p 8080:8080 littlebigtravel
```

`Dockerfile` is a two-stage build — `node:20-alpine` compiles the bundle, and
the runtime image is `nginx-unprivileged` with no Node present (~84 MB, running
as uid 101). `infra/nginx.conf` handles SPA fallback, immutable caching for
content-hashed assets, and a `/health` endpoint.

Deployed to Dokploy on a Hetzner VPS, behind Traefik for TLS and Cloudflare for
DNS.

## Licence

**All rights reserved.**

The source is public so it can be read, reviewed, and learned from — it is not
licensed for reuse, redistribution, or derivative works. No open source licence
is granted, and the absence of a `LICENSE` file is deliberate rather than an
oversight.

If you want to use part of it, ask.
