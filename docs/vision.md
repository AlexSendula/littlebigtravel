# Vision

Last updated: 2026-08-15

This document describes what LittleBigTravel (LBT) is, who it is for, and the
principles that decide what gets built. It is the product source of truth.
`docs/brainstorm-roadmap.md` remains a useful earlier idea dump, but where the
two disagree, this document wins.

## What LBT Is

A mobile-first travel planner that works on your phone, on a plane, and in a
hotel with bad wifi. The map is the home screen. The planner is tied to the
active trip. Your data lives on your device.

## Who It Is For

People planning real multi-stop trips who currently do it across a notes app,
a spreadsheet, a chat thread, and twelve browser tabs. The target user is
planning weeks ahead, then actually travelling with the thing in their pocket.

## Principles

These are the decisions that should not quietly erode.

1. **Local-first, not local-only.** The device holds the authoritative copy for
   everything the user sees and edits. The network makes the app better; it is
   never required for the app to work. A server copy exists so trips can reach
   other devices, other people, and backups.

2. **Offline is a feature, not a degraded mode.** Full editing with no signal.
   Reading an itinerary on a plane, adding a restaurant while walking around a
   city with no data. This is the scenario the architecture is built around.

3. **Useful without an account.** The planner must be worth using before any
   sign-up or sync exists. Accounts arrive when sharing or backup genuinely
   need them — not as a growth funnel.

4. **The map is the home.** Trip structure is spatial before it is a list.

5. **Do not hard-plan every day.** The product should support loose intent
   (ideas, maybes, bucket lists) as a first-class thing, not force everything
   into a rigid schedule.

6. **Own the data.** Export, backup, and deletion are user rights. Collect as
   little as possible.

## What LBT Is Not

- Not a booking engine. It links out; it does not resell.
- Not a social network. Sharing is with the people on your trip.
- Not a content farm. Third-party content is attributed and deep-linked, never
  scraped or republished.
- Not a collaborative document editor. Trip sharing is a small group editing a
  shared list, not real-time multi-cursor editing.

## What Works Today

Everything in this section is built, tested and usable right now:

- Multiple trips: create, rename, switch, archive, unarchive
- Map as the home screen, with a swipe-down trip menu
- Planner tied to the active trip: stays, activities, travel legs
- Auto-generated check-in/check-out and arrival/departure items, with
  show/hide chain behaviour
- Activities can appear on the map when they have a valid place
- Local persistence in IndexedDB, surviving reloads while installed

Everything else on this page is **not built**. The rest of this document
describes intent, not capability.

## Product Arc

Each stage should be independently useful. Nothing later is allowed to make
something earlier worse.

### 1. Planner — BUILT

Trips, stays, activities, travel legs, arrivals and departures, map relevance.
Local, single device. This is the foundation and it must be good on its own.

Caveat on "offline": trip data is genuinely local, but there is no service
worker, so the app shell currently only loads without a network by luck of the
browser HTTP cache. Stage 2 fixes that.

### 2. Real offline — NOT BUILT (next)

Manifest, service worker, cached app shell, cached map tiles. The app opens and
works with the phone in airplane mode. Today this only works by accident of the
browser HTTP cache; it needs to work by design.

### 3. Ideas and loose planning — NOT BUILT

A bucket for places, links, notes and maybes that are not yet scheduled. Tagged,
optionally on the map, promotable into planner days. This is the surface that
recommendations later plug into.

### 4. Accounts, sync, sharing, backup — NOT BUILT

Trips reach a second device and the people you are travelling with. Backup stops
an uninstall from destroying a trip. Roles: owner, editor, viewer.

### 5. Personalised suggestions — NOT BUILT

Curated suggestions for a day, aware of where you are, how long you are there,
what is already planned, and what kind of traveller you are. Weather-aware: a
day planned around good weather should adapt when the forecast turns.

This is the one area with real per-request cost, since it depends on external
place data. Source selection, caching, and usage limits matter here in a way
they do not elsewhere in the app.

### 6. Agent integration — NOT BUILT (speculative)

Expose trips to ChatGPT, Claude and Gemini through MCP, so a trip can be read
and updated from the assistant someone is already planning in. Built on top of
the app's own API rather than as a parallel implementation.

## Open Questions

- Is the planner compelling enough on its own to build an audience?
- Which suggestion sources are licensable and affordable at small scale?
- Does an app-store presence matter, or is an installed PWA enough?
- How much curation is needed before suggestions feel useful rather than generic?

## Related Documents

- `docs/architecture.md` — how this is built, and why
- `docs/go-live-checklist.md` — what must be resolved before commercial launch
- `docs/brainstorm-roadmap.md` — earlier idea capture, kept for context
