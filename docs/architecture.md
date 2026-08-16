# Architecture

Last updated: 2026-08-15

How LBT is built today, the decisions behind it, and where it is going. Product
intent lives in `docs/vision.md`.

## Current State

A client-only React single-page app. No backend exists yet.

| Layer | Choice |
| --- | --- |
| Build | Vite 7 |
| UI | React 19 + TypeScript 5.9 (strict, ES2022) |
| Map | MapLibre GL |
| Icons | lucide-react |
| Storage | IndexedDB |
| Styling | Modular CSS per feature, no CSS-in-JS |
| Package manager | npm |

Roughly 48 TypeScript/TSX files, ~13,000 lines. First-load transfer is about
**416 KB gzipped** (1.5 MB raw), dominated by MapLibre.

### Structure

```
src/
├─ domain/        pure logic: trips, dates, places, timeline, generated items
├─ stores/        usePlannerStore + indexedDbPlannerRepository
├─ providers/     map, geocoding, place-recommendation abstractions
├─ features/      planner, trips, map UI
├─ styles/        per-feature CSS
└─ performance/   perf instrumentation
```

Three properties matter more than the file layout, because everything below
depends on them:

- **Persistence sits behind an interface.** `PlannerRepository` has exactly one
  implementation, `indexedDbPlannerRepository`. No component touches IndexedDB
  directly.
- **Domain logic is pure.** `src/domain/` has no React and no IO. Its unit tests
  run with `environment: "node"`.
- **External services sit behind providers.** Map style, geocoding and future
  place sources are swappable without touching planner or map UI.

### Not yet present

- No router. Navigation is panels and sheets within one view.
- No service worker, no web app manifest, no `public/` directory.
- No accounts, no server, no sync.

## Decisions

Each decision below is tagged with whether it is **in effect** (true of the code
today) or **committed** (agreed, but nothing is built yet). Nothing tagged
*committed* should be assumed to exist when reading the codebase.

| Decision | Status |
| --- | --- |
| Vite; planner client stays static | **In effect** |
| Dokploy / Hetzner / Cloudflare hosting | **Committed** — phase 1 |
| IndexedDB local + Postgres canonical | **Committed** — phase 4 |
| Relational rows, not CRDT blobs | **Committed** — phase 4 |
| ElectricSQL for sync | **Committed** — phase 5 |
| MCP over the app's own API | **Committed** — phase 7 |

### Stay on Vite; the planner client stays static

**Status: in effect.** This is how the app is built today.

Next.js was seriously considered and rejected **for the planner app**.

The planner must produce a static bundle, because three requirements all depend
on it: a service worker precaching a fixed set of files (real offline), a small
container with no runtime (cheap hosting), and a possible Capacitor wrap later
(the App Store path needs static assets — Capacitor cannot run a Node server
inside the app).

Next.js is optimised for server rendering, server data fetching and server
routing. This app's data never touches a server on the read path. Adopting it
would mean turning off the parts that justify it while still paying the
client/server boundary tax on every component.

Next.js is expected to arrive later as a **second app** for marketing and
accounts — where SEO and server-side session handling make it the right tool.
It does not replace the planner.

### IndexedDB stays; Postgres is added, not substituted

**Status: committed, not built.** Today there is only IndexedDB and no server of
any kind. Everything below describes the intended phase 4 shape.

The app always reads and writes IndexedDB, never a remote database directly.
That is what keeps editing instant and functional with no signal — the network
is never in the path of a user action.

Postgres becomes the canonical server-side copy so that trips can reach other
devices, other people, backups, and server-side features that cannot reach a
phone's browser.

```
Device                          Server
┌──────────────────┐           ┌──────────────────┐
│ IndexedDB        │ ◄──sync──►│ Postgres         │
│ local replica    │           │ canonical store  │
│ every read/write │           │ + accounts       │
│ works offline    │           │ + sharing perms  │
└──────────────────┘           └──────────────────┘
```

The sync-aware repository wraps the existing one: writes hit IndexedDB
immediately, then queue for sync. Nothing above `PlannerRepository` changes.

### Relational rows, not CRDT blobs

**Status: committed, not built.** No server schema exists yet.

Automerge/Yjs-style CRDTs store a document as one opaque binary blob. That makes
merging automatic but makes the data unqueryable by anything other than the CRDT
runtime.

Three things need to read trip data server-side: the MCP server answering
"what's planned Tuesday?", the suggestions feature needing trip context, and
access control needing to know who owns and can see what. All three want
ordinary SQL.

The conflict profile also does not justify CRDTs. Family members sharing a trip
almost always add *different* items; this is a shared list, not collaborative
text. Per-item last-write-wins with tombstones is sufficient.

### Sync engine: ElectricSQL

**Status: committed, not built.** Provisional — this is the current preference,
not a locked choice, and it is the decision most likely to change once phase 4
makes the requirements concrete.

Postgres is the source of truth; Electric streams query subsets ("shapes") to
the client, resumably. It is Apache-2.0 and self-hostable as a container next to
Postgres — a natural fit for the existing Dokploy host.

Writes are not Electric's job: they go optimistically to IndexedDB, then through
the API. That split is explicit and debuggable, which matters for a solo
maintainer.

Hand-rolling last-write-wins sync is a viable alternative and a better learning
exercise, but sync is easy to get subtly wrong. Either way it lives behind
`PlannerRepository`, so the choice is reversible.

### Agent integration requires server-side data

**Status: committed, not built.** No MCP server, no API, no agent integration
exists. This decision is recorded because it constrains phase 4 — it is the
reason trip data must be queryable server-side.

ChatGPT connectors only reach **remote HTTPS MCP servers**; local stdio servers
are unsupported and `localhost` URLs are rejected. A cloud-hosted assistant
cannot reach IndexedDB on a phone.

WebMCP (`navigator.modelContext`) plus a localhost relay does let a desktop
agent reach browser-local data, and is worth supporting for power users — but it
does not serve the main case of someone planning in the ChatGPT mobile app.

So: trips must exist server-side for this feature. MCP is then a thin adapter
over the app's own HTTP API, never a parallel implementation of it.

### Infrastructure

**Status: committed, being built now (phase 1).** Nothing is deployed yet; there
is no Dockerfile, no CI, and no domain configured.

Dokploy on a Hetzner VPS, with Traefik and Let's Encrypt bundled, behind
Cloudflare DNS with SSL Full (Strict). Explicit Dockerfile rather than Nixpacks —
the container contents should be understood, not generated.

This mirrors the existing Viva Croatia deployment on the same host.

## Cost Model

**Status: projection, not observed.** There are no users and no bills yet. These
are estimates used to decide where cost control matters, not measurements.

Trip data is JSON in the order of 10 KB per trip. Storage and egress are
effectively free at any plausible scale: 100,000 users at five trips each is
about 50 GB, and Hetzner cloud instances include 20 TB of traffic per month,
with Cloudflare absorbing most static asset delivery at the edge.

The real costs are per-use, and both sit in the suggestions area:

| Item | Cost driver |
| --- | --- |
| Map tile loads | Free today (OpenFreeMap/CARTO); commercial providers price per map load and would become the largest running cost |
| Places / TripAdvisor API | Roughly $17 per 1,000 requests |
| Trip storage and sync | Negligible |

Consequence: cost control belongs around tile loads and place lookups, not
around storage or sync. Cache map tiles in the service worker for cost reasons
as well as offline ones.

## Target Shape

```
littlebigtravel/
├─ packages/domain/     pure TS: trip model, planner rules, validation
├─ apps/planner/        Vite PWA           → app.littlebigtravel.net
├─ apps/site/           Next.js + API+MCP  → littlebigtravel.net
└─ infra/               Dockerfiles, compose
```

`src/domain/` lifts into `packages/domain` essentially unchanged, and both apps
import it. A shared typed core is what makes two frameworks a deliberate split
rather than duplicated logic.

## Build Order

| Phase | Work |
| --- | --- |
| 1 | Deploy the static planner: Dockerfile, CI, Cloudflare, domain |
| 2 | PWA: manifest, service worker, tile caching — real offline |
| 3 | Product baseline; unpark Gmail import from `feature/gmail-import` |
| 4 | Monorepo split, Next.js site, Postgres, auth |
| 5 | Electric sync, family sharing, backup |
| 6 | Personalised suggestions |
| 7 | MCP server over the existing API |

Phase 1 is unchanged by every later decision — the static planner container is
the first box in the target diagram, not a stepping stone that gets thrown away.

## Deferred Deliberately

- Accounts and sync, until sharing or backup actually need them
- Any CRDT machinery, unless the conflict profile turns out to be harder
- Kubernetes, multi-region, autoscaling — one credible deployment first
- App Store packaging; static output keeps the option open at no cost
