# Brainstorm: Gmail Import Rebuild And Mobile Platform Direction

Last updated: 2026-08-23

This document captures a full working session revisiting the Gmail auto-import feature on
`feature/gmail-import`. What began as "why is import so inconsistent?" turned into a platform
decision, because the two questions turned out to be the same question.

> Companion to `docs/brainstorm-roadmap.md` (product ideas), `docs/vision.md` (product source of
> truth), and `docs/architecture.md` (technical decisions). This file records the reasoning and
> evidence behind a direction change; once decisions here are executed, `architecture.md` should
> be updated to reflect them.

---

## 1. Why We Revisited This

Gmail import was built, tested manually on a phone, and judged "kinda working but very bad and very
inconsistent". The working hypothesis going in was that the local model (believed to be a Gemma
3B-class model) was too weak for the task.

That hypothesis turned out to be false, which reframed everything downstream.

---

## 2. What The Feature Is Today

Backend-free Gmail import. The browser does OAuth directly with Google (`gmail.readonly`), pulls
booking emails, parses them locally, and writes high-confidence results straight into the active
trip's planner. No review queue, by design. State lives in `localStorage` under
`lbt-gmail-import-state-v1`, keyed per trip.

| Stage | File | Behaviour |
|---|---|---|
| Trigger | `src/features/imports/useGmailAutoImport.ts` | Trip switch, tab-visible, `online`, and a 60s interval |
| Query build | `src/domain/imports/gmailQueries.ts` | Up to 8 queries: `(keywords) "<place term>" newer_than:18m` |
| Fetch | `src/providers/gmailApiClient.ts` | History API if available, else full search; metadata GET per id; full GET for top 12; PDF.js text from ≤3 PDFs |
| Score & select | `src/domain/imports/extraction.ts:530` | Keyword-weighted score, threshold 0.45 |
| Extract | `extraction.ts` / `llmExtraction.ts` | Regex extractor, or LLM engine if a runtime is configured |
| Trip filter | `src/providers/gmailImportProvider.ts:318` | Candidate must overlap trip dates ±14d **and** mention a trip place term |
| Apply | `src/domain/imports/applyImport.ts` | Confidence ≥ 0.86 auto-applies; creates bases; dedupes on booking reference |
| UI | `src/features/trips/TripMenu.tsx:892` | Status row, read-only debug panel, "Check now" |

---

## 3. Problems Found

### 3.1 The false premise: the model was never connected

The single most important finding. **No local model has ever been wired to this app.**

Evidence gathered:

- `.env` contains only `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. No
  `VITE_IMPORT_EXTRACTOR`, `VITE_IMPORT_LLM_ENDPOINT`, or `VITE_IMPORT_LLM_MODEL`.
- Every reference to `window.__lbtImportLlm` in the repository is a type declaration, a consumer,
  a documentation example, or a test mock — never an implementation. Confirmed across all branches
  and all commits, including the two pre-rebase ones.
- No `web-llm`, `transformers.js`, `@mlc-ai`, MediaPipe, or ONNX has ever appeared in the lockfile.
  No stashes, no deleted files.
- The development machine has no Ollama, llama.cpp, or LM Studio installed.
- There is no service worker and no `manifest.json`; "add to homescreen" used Safari's bookmark via
  the `apple-mobile-web-app-capable` meta tag and downloaded nothing but the ~1.3MB JS bundle.

`getImportExtractionEngine()` (`src/providers/importExtractionProvider.ts:63`) returns the
deterministic engine unless `window.__lbtImportLlm.generateJson` exists or
`VITE_IMPORT_LLM_ENDPOINT` is set. Neither was.

Compounding this, `createLlmExtractionEngine` (`src/domain/imports/llmExtraction.ts:261`) wraps the
whole call in `catch { return fallback }`. A model that 404s, times out, or returns unparseable JSON
produces output identical to no model at all. **There is no observable difference between "the model
was bad" and "the model was never called."**

The observed behaviour on the phone — connect, "downloading", scanning, importing — is fully
consistent with this: connecting Gmail immediately triggers a scan that downloads emails *and PDF
attachments*, and PDF.js lazy-loads its worker chunk at that moment.

**Conclusion: every bad import observed came from the regex extractor. No evidence exists either way
about small-model quality on this task.**

### 3.2 Extraction defects

1. **It is a line-oriented regex parser.** `findField` anchors on `^alias:` and needs
   `Departure: 29 Apr 2026` on its own line. Real airline and hotel emails are HTML tables;
   `stripHtml` flattens them into prose where those line shapes rarely survive.

2. **The eval fixtures encode a format real email does not have.** Every fixture in
   `tests/fixtures/importEmailFixtures.ts` is hand-written `Field: value` text. The extractor and
   the fixtures were designed against each other, so the tests cannot fail. This is why it looks
   healthy in CI and falls apart on a real inbox.

3. **Activities can never auto-apply.** Confidence is hardcoded per branch — 0.94/0.88 transport,
   0.92/0.86 stay, **0.78 activity** — against an auto-apply threshold of 0.86.

4. **JSON-LD is deleted before anything reads it.** See section 4.4.

### 3.3 Pipeline defects

5. **Results churn between runs.** `gmailApiClient.ts:439` takes the first 12 messages clearing
   score 0.2 — *unsorted*, in Gmail's return order. Combined with the 60s interval and a query
   signature that is invalidated every time an import adds a base, each run scans a different
   arbitrary 12 emails. Same inbox, same trip, different outcome. This is the most likely single
   cause of the observed inconsistency.

6. **The place filter silently eats good candidates.** A candidate must mention a trip place term,
   derived from the trip name plus existing planner labels. A flight extracted as
   `Amsterdam Schiphol → Santiago Arturo Merino Benitez` is rejected by a trip named
   "Patagonia, Chile & Argentina" because no term matches an *airport* name. Whether import works
   depends on what you named the trip.

   The eval tests never exercise this filter — it lives in the provider, not the domain. The BDD
   tests use names like "Import Test" whose words are all in `GENERIC_TRIP_NAME_TERMS`, which makes
   the filter a no-op.

7. **A near-miss is permanently burned.** Anything below 0.86 becomes `needs-user-fix`, but there is
   no review UI — only a read-only debug panel. `gmailImportProvider.ts:566` adds that source to
   `importedSourceIds` anyway, and the revisit check only exempts sources that produced actual
   planner items. A candidate that misses the bar once is never reconsidered for that trip.

8. **Stays land on the wrong base.** `findBaseForCandidate` (`applyImport.ts:213`) falls back to
   `customBases[0]`. Because that is truthy, `createStay` never reaches its address-inference path,
   so a hotel whose city matches no base attaches to whichever base is chronologically first.

9. **Throughput.** Up to 8 serial list calls, then up to 160 serial metadata GETs, then 12 full GETs
   plus attachments — repeating every 60 seconds. Slow and quota-hungry. Not measured against real
   limits.

---

## 4. Research Findings

### 4.1 Consumer AI subscriptions cannot be used by third-party apps

Anthropic prohibits subscription-based OAuth for any third-party product, banning Free/Pro/Max
tokens outside Claude Code and Claude.ai; enforcement began April 2026. ChatGPT Plus has never
included API access. The only partial exception is OpenAI's Codex OAuth path for local agent
harnesses, which does not extend to a consumer travel app.

The workable version of the idea is bring-your-own API key, where the user supplies their own
credentials.

### 4.2 The phone's built-in assistant model is not reachable

Siri runs on **Google Gemini**, not OpenAI — Apple pays roughly $1B/year for a custom 1.2T-parameter
model hosted inside Apple's own Private Cloud Compute. Apple evaluated OpenAI and Anthropic and
chose Google. (This corrected an assumption held going into the session.)

Either way it is unreachable from a web app:

- **Apple Foundation Models** is a Swift/native framework with no WebKit or JavaScript surface.
- **Chrome's Prompt API / Gemini Nano** is desktop-only — explicitly unsupported on Android and iOS,
  and requires ~22GB free disk and a 4GB-VRAM GPU. The Chrome team's public position on mobile is
  "stay tuned in 2026".

### 4.3 On-device inference in a mobile browser is possible but tightly capped

- WebGPU shipped by default in Safari on iOS 26; mobile coverage is roughly 70–75%.
- iPhone's Metal backend caps WebGPU buffers at **256MB** (iPad Pro ~993MB). Weights must be sharded
  below that.
- Realistic ceiling is **≤1.5B parameters at 4-bit**. A 3B-class model is over the line.
- Browser inference runs 5–10× slower than native.
- transformers.js has open iOS crash and memory-leak issues.
- First-run model download is ~1GB and takes minutes — the largest drop-off point in browser AI.

### 4.4 Booking emails carry schema.org structured data

This is the highest-leverage finding of the session.

Booking senders embed **schema.org JSON-LD** in confirmation emails, which is how Gmail builds its
flight and hotel cards. `FlightReservation` provides `flightNumber`, `departureAirport.iataCode`,
`departureTime`, and `reservationNumber`. `LodgingReservation` provides `checkinDate`,
`checkoutDate`, hotel `name`, and a full `PostalAddress`. Outlook supports the same curated set.

It arrives as `<script type="application/ld+json">` inside the HTML part. `stripHtml`
(`src/providers/gmailApiClient.ts:201`) deletes it on the second line:

```js
.replace(/<script[\s\S]*?<\/script>/gi, " ")
```

The exact, machine-readable answer is destroyed before any extractor sees it, and then a regex
attempts to reconstruct it from flattened prose. For every email carrying markup this is a solved
problem currently being solved the hard way.

Caveat: the actual coverage rate across a real inbox is unknown. Measuring it is day-one work for
the eval corpus.

### 4.5 Native on-device models are free, pre-installed, and schema-constrained

| | Apple | Android |
|---|---|---|
| API | Foundation Models (Swift) | ML Kit GenAI → AICore → Gemini Nano |
| Model | ~3B on-device | Gemini Nano (shared system model) |
| Download | **None** — already on device | **None** — shipped with the OS |
| Structured output | Guided generation (`@Generable`/`@Guide`) | Structured Output API (I/O '26) |
| Requires | iOS 26+, iPhone 15 Pro+, Apple Intelligence on | Recent flagship (Pixel 8+, Galaxy S24+) |
| Context window | **4,096 tokens**, shared input + output | Not established |

**Guided generation** constrains the *decoder*: at each token, only tokens keeping the output valid
against the declared schema are permitted. The model cannot emit anything that fails to parse.
Concretely this deletes `parseImportLlmCandidates`' defensive machinery — the fence-stripping, the
`{[\s\S]*}` regex hunt, the field-by-field validation in `llmExtraction.ts:166`. Apple reports it
also improves accuracy and speed, because model capacity goes to values rather than syntax.

**The 4,096-token context window is a hard design constraint.** The current code truncates source
text at 12,000 characters (~3,000 tokens) in `llmExtraction.ts:126`, before the prompt and schema
are added. A booking email with PDF attachment text will not fit. Input must be aggressively
pre-filtered — which is a further argument for tier 1 carrying the load.

**Fine-tuning is available on this path.** Apple ships an adapter training toolkit: rank-32 LoRA,
trained offline on an Apple silicon Mac (32GB+) or Linux GPU via a Python CLI, exported as
`.fmadapter` and delivered through Background Assets. Each adapter is locked to a specific base
model version and must be retrained when Apple updates the base. Apple's own guidance is to reach
for adapters only after exhausting the base model and prompt engineering — which matches the
evals-first sequencing decided below.

### 4.6 Tooling and testing

- **Foundation Models works in the iOS Simulator**, delegating inference to the *host Mac's* ML
  stack. This means no iPhone 15 Pro is required to develop or test tier 2 — but the host Mac must
  run **macOS 26+** and be Apple Intelligence-capable.
- **EAS Build** compiles in the cloud: free tier is 15 iOS + 15 Android builds/month with a 45-minute
  timeout. This removes local Xcode from the day-to-day loop.
- The Android emulator is the heaviest tool in the stack and should be avoided on 16GB.

---

## 5. Decisions Made

1. **Extraction runs on-device by default, with an option to escalate to a better model.**
   Stated preference: strictly on-device as the default behaviour.

2. **No bring-your-own API key.** Judged unrealistic — most users will not obtain and paste an API
   key for this.

3. **No cloud LLM inference, including via our own proxy.** Rejected on cost: per-token spend
   scales with every user, forever.

   This is specifically about **inference**. It does not rule out the general application backend
   already on the roadmap — Postgres, ElectricSQL sync, Auth.js + passkeys, family sharing, backup,
   and later an MCP server over that API. That runs on the Dokploy/Hetzner box at a fixed few euros
   a month regardless of user count, and it does not conflict with on-device extraction: extraction
   stays on the phone, the backend handles sync and sharing.

4. Consequently the architecture is **tier 1 + tier 2 only**:
   - **Tier 1** — schema.org JSON-LD/microdata extraction, then sender-aware heuristics. On-device,
     free, instant, works on every device.
   - **Tier 2** — the system on-device model (Apple Foundation Models, later ML Kit GenAI) for
     whatever tier 1 cannot parse.

5. **Platform: Expo / React Native.** Chosen over Capacitor, Flutter, Kotlin Multiplatform, and
   native-twice. Explicit framing given: *"building it properly, no deadline"* — rewrite cost is not
   a constraint.

6. **Both tiers require extensive testing.** An eval harness over a corpus of real booking emails is
   a prerequisite, not an optional extra.

7. **Fine-tuning is deferred, not rejected.** It is a stated learning goal and it sits on the native
   path (Apple's adapter toolkit), but it comes after evals establish a baseline and prove the base
   model insufficient.

8. **Android is deferred in two specific senses**: Android *testing* (use a physical device, never
   the emulator) and Android *tier 2* (ML Kit GenAI is a separate API, later phase). Android
   *builds* come free with Expo from day one, and tier 1 runs there identically.

9. **The web build survives as `apps/web`.** Decided on portfolio grounds. The repository is public
   and used when applying for roles; a live URL is what gets clicked in the first thirty seconds,
   and a native app has no equivalent — nobody installs a TestFlight build to evaluate a candidate.
   The monorepo makes keeping both natural rather than a hack: one domain package, two thin UI
   layers. The web build may lag on features; it exists to be clickable.

10. **freya-devkit runs on `main` before the migration**, for a specific purpose: capturing
   undocumented interaction behaviour (chain visibility rules, gesture semantics, generated-item
   logic) that the UI rewrite would otherwise destroy, plus a security scan of the publicly deployed
   app. Structural artifacts (code-graph, architecture docs) will need regenerating after the
   migration and are lower value now. Note `main` does not contain the Gmail work.

---

## 6. Rejected Options And Why

| Option | Why rejected |
|---|---|
| Consumer AI subscriptions | Prohibited by provider terms; enforced |
| Bring-your-own API key | Users won't do it for a travel app |
| Cloud LLM inference via our own proxy | Per-token cost scaling with every user. Note this rejects *inference* only — the planned application backend (Postgres, sync, auth) is a fixed cost and remains on the roadmap |
| Apple/Chrome built-in models from the web app | Native-only and desktop-only respectively |
| In-browser model download (WebLLM etc.) | ~1GB download, 256MB buffer cap, ≤1.5B params, 70–75% coverage, known iOS crashes — all of which the native path removes |
| Capacitor | Still a WebView; the gesture and haptic problems are inherent to it, not incidental. Also carries App Store Guideline 4.2 exposure |
| Flutter | Would require rewriting the domain layer in Dart — discarding the most valuable and best-tested code |
| Kotlin Multiplatform | Same domain-rewrite cost; weakest iOS UI story; unfamiliar |
| Native Swift + Kotlin separately | Extraction logic maintained twice in two languages |

---

## 7. Plan Shape

### Agreed order of work

1. **Run freya-devkit on the app** to map and document everything before the migration.
2. **Mobile native implementation** (Project B).
3. **Gmail import rebuild** (Projects A and C).
4. Other product features.

This inverts the A-before-B ordering originally argued below. The trade-off is recorded in
"Sequencing note" at the end of this section.

Running alongside, on its own branch: an **MCP server spike** — an experiment letting Claude create
and update trips in the app through MCP tools. Independent of the above, and useful as an early
proof of the shared-domain-package thesis, since the MCP server would be the domain layer's second
consumer.

### The three import projects

Three independently valuable projects, originally sequenced **A → B → C**.

### A. Import extraction core *(portable domain work)*

Build a corpus of real booking emails, an eval harness that scores extraction against it, then
rewrite tier 1: JSON-LD/microdata parsing plus proper heuristics. Lives entirely in the domain
layer, runs under vitest, touches no UI.

*Delivers: a measured baseline, and the answer to whether tier 2 is needed at all.*

**A goes first, before the platform migration**, for a non-obvious reason: the current web app has
working Gmail OAuth and is therefore the instrument used to *harvest the corpus*. Migrating first
would remove that instrument until B completes.

### B. Expo migration *(platform)*

Scaffold Expo, port the domain layer, rebuild the planner UI on `react-native-gesture-handler` and
`reanimated`, swap IndexedDB for SQLite, native Gmail OAuth with refresh tokens.

*Delivers: today's app, natively, with the interaction problems fixed.*

### C. On-device model tier *(requires B)*

An Expo module wrapping Apple Foundation Models (later ML Kit GenAI), with a guided-generation
schema mirroring `ImportCandidate`, and hard context-window management for the 4,096-token ceiling.
Graded by A's harness.

*Delivers: tier 2, with evidence of what it adds over tier 1.*

### D (possible, later). LoRA adapter training

Only if C's evals show the base model falling short.

### Target repository shape

```
packages/domain/    pure TS — extraction, apply, timeline, dates + vitest
apps/mobile/        Expo — UI, native modules, SQLite, OAuth
apps/web/           (optional) the current Vite app, if retained
```

npm workspaces is sufficient; no new tooling required.

Each package keeps its own test runner: **vitest** for `packages/domain` (pure TypeScript, no React
Native involvement, sub-second runs), **jest-expo** for `apps/mobile` component tests if wanted.

### What carries over

| Carries | Rewritten | Deleted |
|---|---|---|
| domain (after decoupling), types, tests, eval harness | storage layer, providers, map integration | all UI, ~4.8k lines of CSS, DOM gestures |

Measured sizes: domain 2,350 lines · providers 1,941 · features 8,567 · root UI 2,966 · styles 4,864.

### Prerequisite: decouple the domain layer

The domain layer is DOM-free but **not self-contained**. Four upward imports must be inverted before
it can become a standalone package:

```
applyImport.ts    → ../../providers/geocodingProviders   (that module performs network I/O)
trip/mapData.ts   → ../../tripData
trip/types.ts     → ../../tripData
trip/timeline.ts  → ../../planner
```

The fix is bounded: pull pure helpers (`findKnownPlace`, `normalizePlaceInput`, route formatting)
down into domain; move seed data and shared types out of `tripData.ts`. This is a genuine
architectural improvement that should happen regardless of platform, and it matches the intent
already recorded in `docs/architecture.md:212` — *"a shared typed core is what makes two frameworks
a deliberate split"*.

### Corpus privacy

The corpus is real personal email. It stays **out of git** — local only — with a small hand-redacted
subset committed as public fixtures so tests run on a clean checkout.

### Sequencing note: why B before A is acceptable

The original argument for doing A first was that the current web app has working Gmail OAuth and is
therefore the instrument used to harvest the email corpus; migrating first would remove that
instrument until B completed.

That argument is largely neutralised by decision 9 — **`apps/web` survives**. The web build keeps
its Gmail connection through the migration, so corpus harvesting stays available throughout.

Two residual risks remain, both manageable:

- **Portfolio timing.** For the AI engineering roles being targeted, the measured eval results from
  A are the centrepiece; the platform migration is plumbing that no AI hiring manager weighs. A long
  B phase delays the artifact that matters most. Mitigation: harvest the corpus early, even if the
  harness is built later.
- **Motivation risk.** B is a large rewrite with no user-visible progress until it lands. This is
  the most likely point for the project to stall.

---

## 8. Constraints

**Development machine:** MacBook Air M3, 16GB RAM, disk under pressure. Currently macOS 15.6 with
Xcode 26.3 and an iOS 26.3 simulator runtime installed.

Implications:

- **macOS 26 upgrade is a prerequisite for Project C** — Foundation Models in the Simulator requires
  an Apple Intelligence-capable host Mac running macOS 26+.
- Never run the iOS Simulator and an Android emulator concurrently.
- Lean on EAS Build so native compilation happens off-machine.
- Project A costs essentially nothing: vitest against pure TypeScript, no simulator, no Metro.

**Device availability for testing is not yet established** — see open questions.

---

## 9. Open Questions

- Which physical test devices are available? Determines whether tier 2 can be tested on real
  hardware (needs iPhone 15 Pro+) or only in the Simulator (needs the macOS 26 upgrade).
- What proportion of real booking emails actually carry schema.org markup? Day-one measurement for
  the eval corpus, and it determines how much tier 2 has to do.
- MapLibre React Native binding maturity — the map is the home screen, so this should be spiked
  early in Project B.
- Branch strategy: `feature/gmail-import` has diverged from `main`, and `main` is the deployed
  static app. Needs resolving before or during the migration.
- How far does `apps/web` lag the native app before it stops being a credible demo? It is kept for
  the live URL, not for parity, but there is a point past which a stale web build undersells the
  project rather than showcasing it.

---

## 10. Vision Context Carried Into This Session

Recorded here because it shaped the decisions above:

- The app is **mobile-first**; desktop use is not expected. This weakened the case for preserving a
  web-first architecture.
- Haptics and gesture feel were already producing problems in the web app. These are inherent
  WebView limitations, not fixable bugs — a major input into rejecting Capacitor.
- Learning goals are explicit: **evals and fine-tuning**, neither previously attempted. Both are
  served by the A → C → D sequence, and the fine-tuning path exists natively via Apple's adapter
  toolkit.
- The differentiator being invested in is **automatic booking import**, not interface polish. This
  is why validating extraction quality precedes the platform rewrite in ordering, even though the
  rewrite is agreed.
- Prior recorded architecture decisions — static Vite SPA, IndexedDB as the only read/write path,
  ElectricSQL sync later, Dokploy on Hetzner — are **partially superseded** by the Expo direction.
  `docs/architecture.md` needs updating once the migration is committed to. Note that SQLite suits
  the planned ElectricSQL sync better than IndexedDB does.

---

## Sources

- [Anthropic bans subscription auth for third-party tools](https://alternativeto.net/news/2026/2/anthropic-officially-bans-using-subscription-authentication-for-third-party-claude-use)
- [Google confirms Gemini-powered Siri](https://www.macrumors.com/2026/04/22/google-gemini-powered-siri-2026/)
- [Apple Foundation Models framework](https://developer.apple.com/documentation/foundationmodels)
- [Managing the context window](https://developer.apple.com/documentation/foundationmodels/managing-the-context-window)
- [Chrome Prompt API](https://developer.chrome.com/docs/ai/prompt-api)
- [Gmail markup — Flight Reservation](https://developers.google.com/workspace/gmail/markup/reference/flight-reservation)
- [Gmail markup — Hotel Reservation](https://developers.google.com/workspace/gmail/markup/reference/hotel-reservation)
- [schema.org/LodgingReservation](https://schema.org/LodgingReservation)
- [Gemini Nano on Android](https://developer.android.com/ai/gemini-nano)
- [ML Kit GenAI APIs](https://developers.google.com/ml-kit/genai)
