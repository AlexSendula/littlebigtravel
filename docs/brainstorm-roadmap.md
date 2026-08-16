# Brainstorm Roadmap

Last updated: 2026-04-29

This document captures product ideas and roadmap status discussed during early development. It is intentionally high level. It should guide future planning, not act as a strict implementation spec.

> Superseded in part by `docs/vision.md`, which is now the product source of truth,
> and `docs/architecture.md`, which records technical decisions. This file is kept
> because its idea capture and third-party sourcing constraints are still useful.
> Where they disagree, those documents win.

## Current Roadmap Status

### Done

- Local-first trip data with IndexedDB.
- Multiple trips.
- Active trip selection.
- Swipe-down trip menu from the map card.
- Create, rename, archive, and unarchive trips.
- Map as the home screen.
- Trip planner tied to the active trip.
- Stays as first-class planner data.
- Auto-generated check-in and check-out stay moments.
- Auto-generated arrival and departure edge items.
- Show/hide linked auto-generated items with chain/broken-chain behavior.
- Activities can be map-relevant when they have a valid place.
- Basic offline local persistence while the app remains installed.

### Partially Done

- Offline support: local data works offline, but there is no full service worker/offline asset strategy or uninstall-safe backup yet.
- Flexible planning: activities and places exist, but there is no separate ideas or bucket-list space yet.
- Map relevance: valid places and show-on-map behavior exist, but the product rules still need refinement.
- Multiple-trip home: local trip management exists, but there is no cloud/account layer.

### Not Done Yet

- Users/accounts.
- Backend sync.
- Sharing with friends/family.
- Payments/subscriptions.
- Expected/actual cost tracking.
- Todo/bucket lists linked to items.
- Importing or saving loose ideas from Google Maps, Tripadvisor, Pinterest, YouTube, blogs, and similar sources.
- Backup/export/restore.
- Real offline sync conflict handling.

## Recommendation And Ideas Engine

The recommendation concept should be treated as its own product area, not just another planner field. The app can eventually recommend things because it knows:

- where the user is going;
- how long they are staying;
- what is already planned;
- what kind of traveler they are;
- what they save, ignore, delete, or complete.

The goal should be to recommend useful options without forcing users to hard-plan every day.

## Recommended Iterations

### 1. Ideas Bucket

Start with a simple ideas bucket before building smart recommendations.

Core behavior:

- Save a place, activity, restaurant, hike, museum, video, article, or note as an idea.
- Link the idea to a destination or base city.
- Add tags such as food, hike, museum, viewpoint, rainy day, quick stop, restaurant, nature, or nightlife.
- Let users move ideas into actual planner days later.
- Let ideas optionally appear on the map.

This creates the product surface without requiring a recommendation backend immediately.

### 2. Basic Recommendations

Add rule-based recommendations before machine learning.

Examples:

- If the destination is Bangkok, show popular places near Bangkok.
- If the user likes food, rank restaurants and markets higher.
- If the user likes hiking or nature, rank parks, viewpoints, and day trips higher.
- If the trip only has two days, avoid overwhelming the user with too many options.
- If something is far away, present it as a day trip rather than a casual activity.

This can work with curated or lightly indexed data before large-scale personalization.

### 3. Personalization

Add an explicit and implicit taste profile.

Explicit preferences:

- hikes;
- museums;
- food;
- ramen;
- fried chicken;
- beaches;
- nightlife;
- coffee;
- budget/luxury;
- relaxed/packed planning style.

Implicit preferences:

- saved ideas;
- dismissed recommendations;
- deleted suggestions;
- completed activities;
- repeated categories across trips.

The recommendation question becomes: what is useful for this user, in this destination, given this trip length and current plan?

### 4. External Sources

External sources should be integrated carefully.

Possible sources:

- Google Maps / Places;
- Tripadvisor;
- Pinterest;
- YouTube;
- blogs/articles;
- official tourism sources;
- curated internal lists.

Important constraints:

- Prefer official APIs where possible.
- Do not freely scrape or republish third-party content without checking permissions.
- Store and display only what the API/license allows.
- Use deep links back to the source.
- Attribute sources clearly.
- Let users paste links and create rich saved ideas from them.

For Google Maps, the better long-term path is likely place IDs and a Places API integration rather than trying to display Google Maps pages directly. For Tripadvisor or similar sources, use allowed APIs/links/metadata rather than copying full content.

## Large-Scale Requirements

For millions of concurrent users, recommendations become backend infrastructure, not a frontend-only feature.

Likely backend pieces:

- user accounts and auth;
- trip sync;
- POI/content database;
- search index;
- recommendation/ranking service;
- user preference service;
- trip-context service;
- ingestion/background jobs;
- caching and CDN;
- API rate limiting and cost controls;
- observability and monitoring;
- moderation/abuse protection;
- legal/licensing review for third-party content.

The frontend should not directly call every third-party recommendation source. A backend should handle source integration, caching, ranking, cost control, attribution, and licensing constraints.

## Suggested Product Sequence

1. Keep strengthening the planner and map.
2. Add an ideas bucket.
3. Add manual save-to-plan and show-on-map flows.
4. Add preference tags.
5. Add simple local/curated recommendations.
6. Add link saving and rich previews.
7. Add backend sync/accounts when sharing, backup, or payments require it.
8. Add backend-powered recommendations.
9. Add larger ingestion, search, and ranking infrastructure.

## Product Principle

Keep the app useful without requiring an account too early. The local-first planner should remain valuable on its own. Accounts, payments, sharing, and recommendations should add clear value rather than become friction before the core trip-planning experience is strong.
