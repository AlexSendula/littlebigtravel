# Commercial Go-Live Checklist

Last updated: 2026-08-15

This document tracks requirements and decisions that must be resolved before LBT is launched commercially. It is intentionally broader than the current product state so important launch concerns do not get lost during feature work.

For product intent see `docs/vision.md`. For technical decisions and rationale see `docs/architecture.md`.

Status legend:

- `[ ]` Not started
- `[~]` Partially done or needs review
- `[x]` Done

## Launch Position

- `[~]` Keep development costs low while the product is still pre-launch.
- `[~]` Prefer free or low-cost providers during development.
- `[ ]` Before commercial launch, replace or license any provider that is not suitable for paid production use.
- `[~]` Confirm whether the first commercial launch is web-only PWA, app-store PWA wrapper, native wrapper, or both. Current direction is installed PWA first; an app-store presence is far future. Keeping the client a static bundle preserves the Capacitor option at no cost, since Capacitor cannot wrap a server-rendered app.

## Map, Tiles, Geocoding, And Places

Current direction:

- Keep MapLibre as the renderer.
- Add a provider abstraction so map tiles, geocoding, and places can be swapped without rewriting planner or map UI.
- Use free providers only for development where terms allow it.
- Choose production-safe providers before commercial launch.

Checklist:

- `[x]` Use MapLibre GL JS as the map renderer.
- `[x]` Add a small provider abstraction for map style/tile providers.
- `[x]` Add a provider abstraction for geocoding/place search.
- `[~]` Add a provider abstraction for future places/recommendation sources.
- `[ ]` Verify current basemap provider terms before any commercial use.
- `[ ]` Verify current geocoder provider terms before any commercial use.
- `[ ]` Current development providers are not automatically approved for commercial launch.
- `[ ]` Do not rely on official OpenStreetMap public tile servers for production traffic.
- `[ ]` Decide production basemap provider:
  - MapTiler
  - Stadia Maps
  - Mapbox
  - self-hosted Protomaps/PMTiles
  - other licensed provider
- `[ ]` Decide development basemap provider:
  - OpenFreeMap or another free provider if terms and reliability fit development use
  - current provider only if terms remain acceptable for the intended use
- `[ ]` Verify attribution requirements for map tiles, geocoding, and places.
- `[ ]` Display required attribution in the app.
- `[ ]` Revisit production map and geocoder choices before launch.
- `[ ]` Decide whether globe projection remains acceptable or should switch to Mercator / conditional projection to avoid polar artifacts.
- `[ ]` Define production usage limits and cost alerts for map/geocoding/places providers.
- `[ ]` Document provider API keys, environments, quotas, and fallback behavior.

Current development provider notes:

- Map style provider: `carto-positron-dev`, using the existing CARTO Positron style URL.
- Inactive map style alternative: `openfreemap-dev`, configured only for later development visual testing.
- Geocoding provider: `photon-dev`, using Photon search without an API key.
- Future recommendations provider: placeholder only; no external recommendation source is implemented.
- Before commercial use, attribution, quotas, caching rules, cost, provider terms, and production suitability must be checked per provider.

## Data Ownership, Backup, And Offline

- `[x]` Store local trip data in IndexedDB while the app remains installed.
- `[ ]` Add export/import for user backup.
- `[ ]` Add uninstall-safe backup strategy before users depend on the app for real trips.
- `[ ]` Add a full PWA service worker/offline asset strategy.
- `[ ]` Define what works offline:
  - existing trips
  - map view
  - planner edits
  - place search
  - saved places
  - recommendations
- `[x]` Define offline conflict rules before adding cloud sync. Per-item last-write-wins with tombstones; offline edits queue locally and flush on reconnect.
- `[ ]` Add a clear data recovery path if local data is lost or corrupted.

## Accounts, Sync, And Sharing

- `[ ]` Decide whether accounts are required at launch or optional.
- `[ ]` Keep user data minimal by design.
- `[ ]` Define required account data:
  - email or passkey identity
  - display name
  - billing status
  - shared trip permissions
- `[x]` Add cloud sync only when backup or sharing requires it. Still deferred; nothing yet requires it.
- `[x]` Decide the sync architecture. IndexedDB remains the local replica and the app's only read/write path; Postgres becomes the canonical server copy. Data is stored as relational rows, not CRDT blobs, because the MCP server, suggestions, and access control all need queryable trip data. ElectricSQL for the read path, writes through the API. See `docs/architecture.md`.
- `[x]` Add audit/conflict strategy for collaborative edits. Per-item last-write-wins with tombstones. The conflict profile is a small group adding mostly different items, which does not justify CRDT complexity.
- `[ ]` Define shared-trip roles:
  - owner
  - editor
  - viewer
- `[ ]` Add invitation and revocation flows for friends/family.

## Payments And Subscriptions

- `[ ]` Decide pricing model:
  - free trial
  - one-time purchase
  - subscription
  - freemium limits
- `[ ]` Decide payment processor.
- `[ ]` Define what is paid:
  - multiple trips
  - cloud backup
  - sharing
  - recommendations
  - offline maps
  - advanced budget tracking
- `[ ]` Keep billing entitlement server-side, not only in frontend local flags.
- `[ ]` Add refund/cancellation handling.
- `[ ]` Add invoices/receipts if required.
- `[ ]` Review app-store payment rules if launching through app stores.

## Privacy, Legal, And Compliance

- `[ ]` Write privacy policy.
- `[ ]` Write terms of service.
- `[ ]` Decide what analytics are collected, if any.
- `[ ]` Avoid collecting precise location unless the feature clearly needs it.
- `[ ]` Add explicit permission prompts for location-based features.
- `[ ]` Define data retention and deletion rules.
- `[ ]` Add account deletion and data export if accounts exist.
- `[ ]` Review third-party API licenses for:
  - maps
  - geocoding
  - places
  - recommendations
  - link previews
  - Tripadvisor/Google/Pinterest/YouTube/blog integrations
- `[ ]` Avoid scraping or republishing third-party content without permission.
- `[ ]` Store only third-party data allowed by each provider's terms.

## Product Readiness

- `[~]` Mobile-first planner and map interaction.
- `[~]` Multiple local trips.
- `[~]` Stays, activities, starting travel, arrivals/departures.
- `[~]` Map-relevant activities.
- `[ ]` Trip export/shareable itinerary.
- `[ ]` Cost tracking:
  - expected costs
  - actual costs
  - item-level costs
  - trip totals
- `[ ]` Todo/bucket lists linked to trips and planner items.
- `[ ]` Ideas bucket for flexible planning.
- `[ ]` Recommendation engine plan before adding third-party content at scale.
- `[ ]` Onboarding for first-time users.
- `[ ]` Empty states reviewed for all core screens.
- `[ ]` Error states reviewed for offline/provider failures.

## Quality Gate

- `[x]` Testing strategy documented.
- `[x]` Test inventory documented.
- `[x]` Unit test foundation.
- `[x]` BDD/Cucumber + Playwright foundation.
- `[x]` Focused visual snapshot foundation.
- `[x]` Performance audit foundation.
- `[ ]` Core regression gate consistently passing before commercial release.
- `[ ]` Real-device mobile QA checklist:
  - iPhone Safari/PWA install
  - Android Chrome/PWA install
  - offline use
  - keyboard behavior
  - gestures
  - map performance
  - low battery / low memory behavior
- `[ ]` Accessibility review:
  - readable contrast
  - focus states
  - keyboard navigation where relevant
  - screen-reader labels for controls
  - reduced-motion behavior
- `[ ]` Browser support matrix defined.

## Performance And Reliability

- `[x]` Baseline performance audit exists.
- `[~]` App shell split and planner lazy loading started.
- `[~]` Map performance instrumentation started.
- `[ ]` Set launch performance budgets:
  - first usable map/card
  - planner open time
  - trip drawer open time
  - destination rail interaction
  - IndexedDB save latency
  - JS heap budget
  - bundle size budget
- `[ ]` Real-device Safari performance profiling.
- `[ ]` Real-device Android performance profiling.
- `[ ]` Crash/error reporting plan.
- `[ ]` Provider outage fallback plan.
- `[ ]` Rate-limit and quota-exceeded handling.

## Security

- `[ ]` Define authentication approach before accounts.
- `[ ]` Use secure token/session storage.
- `[ ]` Do not store secrets in frontend code.
- `[ ]` Add backend authorization checks before sharing or paid features.
- `[ ]` Validate all synced planner data server-side once a backend exists.
- `[ ]` Add abuse protection for public or shared content.

## Operations

- `[x]` Decide hosting platform. Dokploy on an existing Hetzner VPS, with bundled Traefik and Let's Encrypt, behind Cloudflare DNS at SSL Full (Strict). Same host as Viva Croatia.
- `[x]` Decide build/packaging approach. Explicit multi-stage Dockerfile serving the static Vite build; not Nixpacks.
- `[~]` Decide domain. Leaning `littlebigtravel.net` via Cloudflare; `.com` unavailable and the hyphenated `.com` is not worth its price.
- `[ ]` Decide deployment environments:
  - local
  - staging
  - production
- `[ ]` Add CI before external users.
- `[ ]` Add production monitoring.
- `[ ]` Add backup strategy for backend data once backend exists.
- `[ ]` Add provider cost monitoring and alerts. Priority is map tile loads and places API calls; storage and egress are negligible by comparison.
- `[ ]` Add incident rollback process, and perform the rollback once rather than only documenting it.

## Decisions To Revisit Before Launch

- `[ ]` Which map tile provider is production-safe and affordable?
- `[ ]` Which geocoder is good enough for global travel planning?
- `[ ]` Should places/recommendations use Google, Tripadvisor, curated data, or a mixed backend approach?
- `[ ]` Is the app valuable enough without accounts at first launch?
- `[ ]` Which paid feature is compelling enough to charge for?
- `[ ]` What happens if a user uninstalls the PWA before cloud backup exists?
- `[ ]` What data do we absolutely need to collect, and what can we avoid collecting?
