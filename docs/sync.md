### Sync architecture (status quo + improvements)

This document describes:
- **How library + history are stored** locally and in Convex
- **How sync works today** (write path, read path, sign-in merge)
- **What’s awkward / risky** about the current architecture
- **A concrete path to improve it** without a big rewrite

---

### Naming + glossary (important: avoid “mangaId” ambiguity)

Today the code uses `mangaId` in two different meanings:
- **Library ID**: a UUID for “the thing in your library”
- **Source manga ID**: the identifier used by a source (Aidoku/Tachiyomi/etc)

In this doc (and in the “ideal schema”), we use names that prevent confusion:

- **`libraryItemId`**: UUID identifying the user’s library entry (current: `LibraryManga.id`, Convex `library.mangaId`)
- **`sourceMangaId`**: the id inside a specific source (current: `SourceLink.mangaId`)
- **`sourceChapterId`**: the id inside a specific source (current: `HistoryEntry.chapterId`)
- **`sourceRef`**: `{ registryId, sourceId }`
- **`sourceMangaRef`**: `{ registryId, sourceId, sourceMangaId }`

For “chapter ordering” / “updated detection”, avoid the confusing term “chapterKey”.
Use:
- **`chapterSortKey`**: a monotonic-ish key used only for ordering/comparison (not identity).
  - Example implementation idea: a string derived from `(volumeNumber, chapterNumber, publishedAt?, sourceChapterId)` where available.
  - If a source does not provide numeric chapter numbers, `chapterSortKey` may fall back to `publishedAt` or “unknown”, and the UI should degrade gracefully.

---

### Data storage (what exists, where)

#### Local (device) IndexedDB databases

- **`nemu-user`** (primary user data; `src/data/indexeddb.ts`)
  - **Stores**
    - `library`: `LibraryManga` keyed by `id` (UUID)
    - `history`: `HistoryEntry` keyed by encoded composite id (`makeHistoryKey`)
      - Indexes: `by_dateRead`, `by_manga` (`[registryId, sourceId, mangaId]`)
    - `settings`: single record (`id="default"`) containing `installedSources[]`
    - `registries`: local-only registry config
  - **Notes**
    - This DB includes careful handling for blocked upgrades and compatibility fallbacks.

- **`nemu-sync`** (pending sync queue; `src/sync/engine.ts`)
  - **Stores**
    - `sync_pending`: queued changes to push to cloud (library/history/settings)
    - `sync_meta`: reserved for metadata/cursors (currently minimal)

- Other local DBs (not central to library/history sync)
  - `nemu-cache` (source cache)
  - `nemu-source-settings` (per-source settings)
  - `nemu-plugins` (plugin data)

#### Cloud (Convex) tables

Defined in `convex/schema.ts`:
- **`library`**
  - One row per `mangaId` in the user’s library.
  - Contains **availability-only** per source:
    - `latestChapter`
    - `updateAcknowledged`
  - Supports soft delete via `deletedAt`.
- **`history`**
  - One row per (registryId, sourceId, mangaId, chapterId).
  - Contains progress fields + optional chapter metadata for display.
- **`settings`**
  - Contains `installedSources[]`.

---

### Status quo schema (current local + Convex)

This is a “what fields exist” snapshot of today’s shape, not a proposal.

#### Local schema (IndexedDB: `nemu-user`)

- **Object stores**
  - `library` (key: `id` / UUID)
  - `history` (key: encoded composite id; indexes: `by_dateRead`, `by_manga`)
  - `settings` (key: `id="default"`)
  - `registries` (key: `id`)

- **`library` record (`LibraryManga`)**
  - `id: string` (UUID; **library item identity**)
  - `addedAt: number`
  - `metadata: { title, cover?, authors?, artists?, description?, tags?, status?, url? }`
  - `overrides?: Partial<metadata>`
  - `coverCustom?: string`
  - `externalIds?: { mangaUpdates?, aniList?, mal? }`
  - `sources: SourceLink[]`

- **`library.sources[]` record (`SourceLink`)**
  - `registryId: string`
  - `sourceId: string`
  - `mangaId: string` (**source manga id**; should be read as `sourceMangaId`)
  - `latestChapter?: { id, title?, chapterNumber?, volumeNumber? }`
  - `updateAcknowledged?: { id, title?, chapterNumber?, volumeNumber? }`

- **`history` record (`HistoryEntry`)**
  - `id: string` (encoded composite id)
  - `registryId: string`
  - `sourceId: string`
  - `mangaId: string` (**source manga id**; should be read as `sourceMangaId`)
  - `chapterId: string` (**source chapter id**; should be read as `sourceChapterId`)
  - `progress: number`
  - `total: number`
  - `completed: boolean`
  - `dateRead: number`
  - optional cached metadata: `chapterNumber?`, `volumeNumber?`, `chapterTitle?`

#### Cloud schema (Convex)

From `convex/schema.ts` (logical shape):

- **`library` table**
  - `userId: string`
  - `mangaId: string` (UUID; **library item identity**; should be read as `libraryItemId`)
  - `addedAt: number`
  - `metadata`, `overrides?`, `coverCustom?`, `externalIds?`
  - `sources: SourceLink[]` (same availability fields as local)
  - `updatedAt?`, `deletedAt?`

- **`history` table**
  - `userId: string`
  - `registryId`, `sourceId`
  - `mangaId` (**source manga id**)
  - `chapterId` (**source chapter id**)
  - `progress`, `total`, `completed`, `dateRead`
  - `updatedAt?`
  - optional chapter metadata: `chapterNumber?`, `volumeNumber?`, `chapterTitle?`

- **`settings` table**
  - `userId`
  - `installedSources[]`
  - `updatedAt?`

---

### Core data model semantics

#### Library (`LibraryManga`)
Stored locally in `nemu-user/library` and in Convex `library`.

- **Identity**
  - Local uses `LibraryManga.id` (UUID).
  - Convex uses `library.mangaId` (same UUID).

- **Purpose**
  - “Things the user has saved.”
  - Contains metadata, overrides, cover custom key, source bindings.

- **Important: what it does NOT store**
  - It does **not** store reading progress.
  - Reading progress is derived from `history`.

#### History (`HistoryEntry`)
Stored locally in `nemu-user/history` and in Convex `history`.

- **Identity**
  - Composite key: `registryId:sourceId:mangaId:chapterId`
  - Local key uses **encoded components** (`makeHistoryKey`) to avoid ambiguity.

- **Merge semantics (intended)**
  - “High-water mark” progress:
    - progress: max
    - total: max
    - completed: OR
    - dateRead: max
  - This matches server behavior in `convex/history.save`.

#### Availability / “Updated” badge
The app tracks **new chapter availability** in library sources:
- `latestChapter`: what the app observed during refresh/background fetch
- `updateAcknowledged`: what the user has “seen” (usually set when visiting manga detail)

Current implementation uses `chapterNumber` comparisons, which can be missing for some sources.

---

### Sync mechanism (status quo)

There are two distinct flows:
- **Write path**: local → pending queue → cloud
- **Read/subscription path**: cloud → local persistence + UI state

#### Write path (offline-first)

Actors:
- UI stores (`src/stores/*`)
- Sync-aware `userStore` wrapper created in `src/sync/provider.tsx`
- `SyncEngine` (`src/sync/engine.ts`)

Steps (library/history/settings):
1. UI calls `userStore.saveX(...)` (or store action that delegates to it).
2. The sync-aware wrapper forwards to `SyncEngine.saveX(...)`.
3. `SyncEngine.saveX(...)`:
   - writes immediately to **`nemu-user`** (so app works offline)
   - enqueues an item into **`nemu-sync/sync_pending`**
   - triggers `syncNow()` if online
4. `syncNow()` drains `sync_pending` and calls Convex mutations:
   - `api.library.save/remove`
   - `api.history.save`
   - `api.settings.save`

#### Read path (cloud → local + UI)

When authenticated, `SyncProvider` subscribes with Convex `useQuery(...)`:

- Library
  - Query: `api.library.list`
  - Handler: `syncEngine.mergeCloudLibrary(...)`
    - Persists into `nemu-user/library`
    - Updates the in-memory Zustand `useLibraryStore` state

- History
  - Query: `api.history.getForLibrary`
    - Returns grouped `LibraryHistoryMap` shape (not a flat list of entries)
  - Provider does two things:
    - merges cloud grouped history into in-memory `libraryHistory` state (UI shape)
    - **persists deltas into `nemu-user/history`** by flattening changed chapters and calling:
      - `syncEngine.mergeCloudHistory(deltas)`

- Settings
  - Query: `api.settings.get`
  - Provider merges settings into in-memory settings store.

#### Sign-in merge (one-time per session)

On first sign-in in a session, `SyncEngine.onSignIn()` runs:
- pulls cloud library + settings
- merges into local IndexedDB
- enqueues local-only items for upload
- drains pending queue

Important detail:
- `api.library.list` returns soft-deleted entries; sign-in merge must treat them as deletions (not additions).

---

### Auth, sign-in/out semantics, and multi-account model (proposal)

This is the “clean end goal” interpretation of auth in an offline-first system.

#### Core principle: auth toggles transport, not local truth

- **Local data is always authoritative for rendering and offline use.**
- **Signing in** means: “attach a remote transport to the current local dataset and begin convergence”.
- **Signing out** means: “detach remote transport; the app continues to work from local data”.

If you treat sign-in as “switch the app’s truth to cloud”, multi-account gets messy fast.

#### Internal “profiles” (storage namespaces), not a user-facing concept

Introduce an internal **profileId** (storage namespace) concept:
- `profileId`: stable identifier for a local dataset.
  - examples: `"local"` (anonymous), `"user:<convexUserId>"` (account-bound)
- A profile owns:
  - local canonical tables + local settings
  - its own `pending_ops` queue
  - its own `sync_meta` cursors
  - its own HLC state (Phase 6.5)

**Important UX constraint:** the app does **not** expose “profile selection” as a primary concept.
The active `profileId` is chosen implicitly from auth state:
- logged out → `"local"`
- logged in as X → `"user:X"`

Implementation options:
- **DB-per-profile** (recommended):
  - IndexedDB name includes profileId, e.g. `nemu-user::<profileId>`
  - prevents accidental cross-account leakage by construction
- **Single DB partitioned by profileId**:
  - every row has `profileId` and all indexes include it
  - more complex and easier to get wrong

#### Sign-in flow (with internal profiles)

When user signs in to account X:
- Activate `"user:X"` (create it if missing)
- Attach transport authenticated as X
- Run catch-up convergence:
  - pull deltas → apply to local profile
  - push local pending ops for that profile

#### “Import local library into account” is a separate explicit action

To avoid accidental mixing when multiple accounts exist:
- Do **not** automatically merge `"local"` into `"user:X"` on sign-in.
- Provide explicit UX:
  - “Import this device’s local library into your account”
  - This action creates a one-time batch of ops from `"local"` and pushes them to X.

This is the clean replacement for the current “first sign-in merge local into cloud” behavior.

#### Sign-out flow (keep current local data by default)

When user signs out:
- Stop transport (Convex/auth detached)
- **Keep showing the current local dataset** (works offline, even while logged out)
- Offer a privacy option to remove local data for this account from this device
- Pending ops remain queued (but won’t sync until sign-in)

This matches the existing UI pattern: a sign-out dialog with:
- “Keep data on this device” (default)
- “Remove data from this device”

#### Switching accounts

Switching accounts is just switching the active storage namespace (internally):
- stop current transport
- flush/persist local state
- activate `"user:Y"`
- attach transport for Y and converge

Invariant: profiles are disjoint; you never “merge accounts” unless explicitly requested.

---

### Why this is awkward (architecture critique)

#### 1) “History” exists in multiple shapes
- **Cloud**: flat rows per chapter
- **Local DB**: flat rows per chapter
- **UI**: grouped map per manga with extra “last read” fields

Convex `getForLibrary` returns the **UI shape**, but local persistence wants the **flat shape**.
This forces conversion glue in the provider (diff snapshot → compute deltas → flatten → persist).

#### 2) Sync responsibilities are split across layers
- `SyncEngine` owns: queueing + write-through + some merge helpers
- `SyncProvider` owns: subscriptions + UI merges + persistence of subscription deltas

This makes “what is the sync algorithm?” harder to answer because it’s distributed across effects.

#### 3) Subscription returns full snapshot, not incremental feed
`api.history.getForLibrary` is a full grouped snapshot, so:
- it scales poorly with large histories
- it encourages diffing in React (awkward and easy to get wrong)
- it’s hard to ensure “exactly once” persistence behavior

#### 4) Conflict semantics can silently diverge
If any client-side merge differs from server semantics, history can oscillate.
You need to consistently apply the high-water mark rule everywhere.

#### 5) Availability logic depends on `chapterNumber`
Some sources don’t provide reliable chapter numbers.
Using `chapterNumber` as the only monotonic comparator can make “Updated” unreliable.

---

### How to make it better (concrete roadmap)

Goal: **one canonical representation** for syncing (flat entries with cursors), and do UI grouping locally.

This section is a *directional summary*. The concrete, enforced rollout is in **“Migration plan (status quo → ideal)”** below.

Summary of the changes we want:
- Replace snapshot-shaped history feeds with **cursor-based flat deltas** (`listSince` / `updatedAt` cursor).
- Centralize merge + persistence in a **sync module**, not React effects.
- Make UI read **local DB as the only truth**; compute grouped views as selectors.
- Improve “Updated” detection with a comparator designed for ordering (`chapterSortKey`), not identity.
- Simplify sign-in merge by pulling deltas (cursors), not full tables.

---

### Ideal (“Jeff Dean-approved”) schema

Principles:
- **Normalize** hot mutable lists (avoid `sources[]` arrays that require “replace the whole blob”).
- **Incremental sync** by `updatedAt` cursor (no full snapshots in hot paths).
- **Canonical truth is flat rows** (per-chapter progress), plus optional materialized summaries.
- **Idempotent writes** and merge semantics defined in exactly one place (server mutation).
- **Tombstones** for deletes (`deletedAt`) so sync can converge offline.

#### Ideal architecture boundaries (decouple sync logic from UI)

Goal: UI can *call* Convex queries (we can’t prevent that), but **sync correctness + merge rules** should not live in UI components/effects.

Recommended separation:

- **Domain layer (pure, no Convex/React)**
  - Types: `LibraryItem`, `LibrarySourceLink`, `ChapterProgress`, `MangaProgress`
  - Merge rules: “high-water mark” logic, tombstone handling, etc.

- **Local repository layer (IndexedDB)**
  - `libraryRepo`, `progressRepo`, `settingsRepo`
  - Bulk upserts + indexed reads (e.g. “progress by source manga”)
  - Works fully while logged out.

- **Sync module (cloud adapter)**
  - Owns:
    - pending queue (write-behind)
    - cursors (`sync_meta`)
    - background pull (“listSince(cursor)”)
    - push of queued operations
  - Exposes a small surface:
    - `start(authClient)` / `stop()`
    - `enqueue(op)` for offline writes
    - `pullOnce()` (optional)
    - status (`offline|syncing|pending|synced`)

- **Transport abstraction (Convex is just one implementation)**
  - Define a small `SyncTransport` interface (pull deltas, push ops).
  - Implement:
    - `ConvexTransport` (today)
    - `HttpTransport` (self-hosted REST + polling/WebSocket)
    - `SqliteTransport` (if you run a sync server backed by SQLite)
  - The rest of the app depends only on `SyncTransport`, not on Convex types.

- **UI**
  - Uses repositories (or stores backed by repositories) as the source of truth.
  - May subscribe to Convex, but only as a transport feeding the sync module/repositories.
  - Should not do “diff snapshots → flatten → persist” logic.

This keeps Convex-specific code at the edges and makes the system easier to test.

#### Logged-out mode: must be perfect

In the ideal state, **logged-out is the default**:
- The app reads/writes local repositories exactly the same way whether logged in or not.
- The sync module is simply **disabled** when unauthenticated.
- All features still work offline:
  - library add/remove
  - metadata overrides
  - custom covers
  - reading progress
  - “updated” badges (best effort; depends on availability refresh)

This requires one invariant:
- **Local DB is always the authoritative source of truth for the UI.**
  - Cloud only ever merges into local; UI renders local.

#### Metadata overrides + custom covers (ideal handling)

- `metadata` vs `overrides`:
  - `metadata` is the best-known snapshot (from source fetches, imports, etc).
  - `overrides` stores only user edits.
  - Effective fields are always computed as: `overrides` wins over `metadata`.
  - Sync should treat `overrides` as first-class user data (mergeable per-field if desired, otherwise “last writer wins” via `updatedAt`).

- `coverCustom`:
  - Keep as a separate field, never overwritten by source refresh.
  - Sync as a pointer/key; the binary lives elsewhere (R2/etc).
  - Tombstone semantics should preserve user intent (deleting the cover is a real action).

#### Ideal cloud schema (Convex)

##### `library_items` (one row per user library entry)
- Keys / identity
  - `userId: string`
  - `libraryItemId: string` (UUID)
- Metadata
  - `metadata: MangaMetadata` (best-known snapshot)
  - `overrides?: Partial<MangaMetadata>`
  - `coverCustom?: string`
  - `externalIds?: ExternalIds`
- Sync fields
  - `createdAt: number`
  - `updatedAt: number`
  - `deletedAt?: number`

Indexes:
- `by_user_item(userId, libraryItemId)` (uniqueness / point reads)
- `by_user_updated(userId, updatedAt)` (incremental sync feed)

##### `library_source_links` (normalized bindings + availability per source)
- Keys / identity
  - `userId: string`
  - `libraryItemId: string` (FK)
  - `registryId: string`
  - `sourceId: string`
  - `sourceMangaId: string`
- Availability tracking
  - `latestChapter?: ChapterSummary`
  - `latestChapterSortKey?: string` (**order/comparison**, not identity)
  - `latestFetchedAt?: number`
  - `updateAckChapter?: ChapterSummary`
  - `updateAckChapterSortKey?: string`
  - `updateAckAt?: number`
- Sync fields
  - `createdAt: number`
  - `updatedAt: number`
  - `deletedAt?: number`

Indexes:
- `by_user_item(userId, libraryItemId)`
- `by_user_source_manga(userId, registryId, sourceId, sourceMangaId)` (reverse lookup)
- `by_user_updated(userId, updatedAt)` (incremental sync feed)

##### `chapter_progress` (canonical truth: per chapter)
- Keys / identity
  - `userId: string`
  - `registryId: string`
  - `sourceId: string`
  - `sourceMangaId: string`
  - `sourceChapterId: string`
  - Optional `libraryItemId?: string` (denormalized link if this chapter belongs to a library item)
- Progress (mergeable)
  - `progress: number` (high-water mark)
  - `total: number`
  - `completed: boolean`
  - `lastReadAt: number` (user clock)
- Cached chapter metadata (optional)
  - `chapterNumber?`, `volumeNumber?`, `chapterTitle?`
- Sync fields
  - `updatedAt: number` (server clock)
  - `deletedAt?: number` (optional; usually progress is additive, but can exist)

Indexes:
- `by_user_updated(userId, updatedAt)`
- `by_user_source_manga(userId, registryId, sourceId, sourceMangaId)`

##### (Optional) `manga_progress` (materialized “last read” for fast library UI)
This is a derived summary to avoid scanning all chapters when rendering/sorting library.

- Keys / identity
  - `userId`
  - `registryId`, `sourceId`, `sourceMangaId`
  - `libraryItemId?: string`
- Summary fields
  - `lastReadAt`
  - `lastReadSourceChapterId`
  - optional metadata: `lastReadChapterNumber?`, `lastReadVolumeNumber?`, `lastReadChapterTitle?`
- Sync fields
  - `updatedAt`

Indexes:
- `by_user_updated(userId, updatedAt)`
- `by_user_recent(userId, lastReadAt)` (or `updatedAt`) for “continue reading”

#### Ideal local schema (IndexedDB mirror)

Mirror the same normalized tables locally (one DB is enough; no need for a separate `nemu-sync` DB in the ideal world):
- `library_items`
- `library_source_links`
- `chapter_progress`
- `manga_progress` (optional)
- `settings`, `registries`
- `pending_ops` (write-behind queue) + `sync_meta` (cursors)

Key point: the UI should derive “grouped history” from local tables, not rely on a special server-provided grouped shape.

---

### Migration plan (status quo → ideal)

This is intentionally incremental (one release at a time). The goal is to avoid any “big bang” rewrite.

#### Non-negotiable guarantees (must hold in *every* phase)

These are the promises you asked for. The plan below is designed so they are true *by construction*:

- **Logged-out mode is first-class**
  - The UI must be able to read/write library, overrides, covers, and history using **local repositories only**.
  - No UI flow should require a Convex query to function (Convex is an enhancement when logged in).

- **Local-first truth**
  - UI renders local state as authoritative.
  - Cloud data only ever **merges into local**; the UI does not “switch to cloud truth”.

- **User intent is preserved**
  - `overrides` always win over `metadata`.
  - `coverCustom` is never overwritten by source refresh or cloud merges.
  - Delete intent is represented as tombstones (e.g. `deletedAt`) so convergence works offline.

- **Sync logic is a decoupled module**
  - UI may call Convex hooks, but:
    - merge rules + conflict resolution live in the sync/domain layer
    - UI does not do “diff snapshots → flatten → persist”

- **Safe rollout**
  - All cutovers are behind a flag and have a “fall back to old path” escape hatch until proven stable.

#### Phase exit criteria (how we enforce the guarantees)

Each phase below has an implicit “stop the rollout if these aren’t true” checklist:
- **Offline / logged-out smoke**: add/remove library items, edit overrides, continue reading, reopen app → state is correct.
- **No data loss**: after sync, local and cloud converge; overrides and custom covers remain intact.
- **No UI-owned sync**: persistence and conflict logic are not implemented inside React effects beyond transport glue.

#### Phase 0: Naming cleanup (code + APIs)
Even before schema changes, standardize names in new code:
- Use `libraryItemId` for the UUID library id.
- Use `sourceMangaId` / `sourceChapterId` for source identifiers.
- Use `chapterSortKey` for ordering-only comparators.

This prevents “mangaId means two things” problems from spreading.

#### Phase 1: Add new Convex tables (no client cutover yet)
Add the ideal tables:
- `library_items`
- `library_source_links`
- `chapter_progress`
- (optional) `manga_progress`

Add indexes for:
- per-user incremental sync (`by_user_updated`)
- per-entity point reads and joins (`by_user_item`, `by_user_item` on links)

Guarantee note:
- This phase is schema-only; logged-out and local behavior is unchanged.

#### Phase 2: Dual-write on the server (new tables kept in sync)
Update Convex mutations (or add new ones) so that:
- any write to the old `library` / `history` also updates the new tables
- merge semantics are enforced in one place (server)
- `updatedAt` is always set (server clock)

This makes the new schema correct even before any client switches.

Guarantee notes:
- Dual-write protects **no data loss** during migration.
- Server-side merge rules ensure consistent semantics across clients.

#### Phase 3: Backfill existing cloud data
Run one-time Convex migrations:
- Backfill `library_items` from old `library`
- Backfill `library_source_links` from old `library.sources[]`
- Backfill `chapter_progress` from old `history`
- Backfill `manga_progress` by aggregating the latest `chapter_progress` per `(sourceMangaRef)`

After backfill, keep dual-write enabled to stay consistent.

Guarantee note:
- Backfill + dual-write ensures the new schema becomes complete without changing logged-out UX.

**Phase 3.1: Dev/prod Convex migration runbook (operational, actionable)**

Convex “migrations” are **just Convex functions** (`convex/migrations.ts`, `convex/migrations/*`).
They run against **one deployment at a time**:
- dev deployment (what `convex dev` points at)
- prod deployment (what `convex deploy` points at)

**3.1.1 — Deploy order (dev and prod)**
- Deploy schema + dual-write code **first** (Phase 1 + Phase 2).
  - Rationale: while you backfill, dual-write keeps new tables correct for any new writes.
- Then run the one-time migrations (below).

**3.1.2 — Commands to run (per deployment)**

Backfill canonical tables:
- `npx convex run migrations:backfillLibraryItems`
- `npx convex run migrations:backfillLibrarySourceLinks`
- `npx convex run migrations:backfillChapterProgress`
- `npx convex run migrations:backfillMangaProgress`

Phase 6 cursorId fixup (only needed if you created rows before cursorId was being populated):
- `npx convex run migrations/backfill_cursor_ids:backfillAll`

Phase 6.5.5 normalization cleanup (only needed if you ever wrote legacy fields into `library_items`):
- `npx convex run migrations:migrateLibraryItemsToNormalizedOverrides`

**3.1.3 — Verification (small dataset version)**
- Spot check row counts:
  - `library_items` roughly matches `library` (including removed items if you keep them as `inLibrary=false`)
  - `library_source_links` roughly matches sum of `library.sources[]`
  - `chapter_progress` roughly matches `history`
- Spot check a few users:
  - a removed library item stays removed (no resurrection)
  - overrides and cover overrides survive backfill

Notes:
- Today it’s “small”; these migrations use `collect()` in places. If/when prod grows, convert them to cursor+limit batch loops.

#### Phase 4: Introduce incremental sync endpoints
Add Convex queries:
- `library_items.listSince({ cursor })`
- `library_source_links.listSince({ cursor })`
- `chapter_progress.listSince({ cursor })`
- `settings.get` already exists; optionally make it cursor-based too.

All should be:
- ordered by `updatedAt`
- return `nextCursor` (usually last `updatedAt` + tie-breaker if needed)

Guarantee notes:
- This enables the sync module to pull deltas without UI snapshot diffing.
- Endpoints are additive; the app can keep using the old APIs until cutover.
- Convex-specific code is now confined to a **transport** surface: these `listSince` queries are exactly what a future backend would also implement (HTTP/WebSocket/SQLite server).

#### Phase 5: Client cutover (reads first, then writes)
Client changes:
- Introduce a `SyncTransport` interface and a `ConvexTransport` implementation.
  - It is **allowed** (and expected) that `ConvexTransport` uses Convex APIs (including reactive queries if desired),
    but the rest of the codebase depends only on `SyncTransport`.
- Replace `api.history.getForLibrary` subscription with incremental consumption of `chapter_progress.listSince`
  *via the transport* (polling or reactive is an implementation detail of the transport).
- Persist deltas directly into local tables (batch writes).
- Derive UI `LibraryHistoryMap` from local `chapter_progress` / `manga_progress`.
- Replace old library list usage with incremental `library_items` + `library_source_links`.

Only after reads are stable:
- switch writes to new mutations
- remove reliance on old `library`/`history` shapes in the client.

Guarantee notes:
- Reads-first means the UI is still local-first; cloud is only feeding local repos.
- Keep the old path behind a flag as a rollback until metrics/bug reports are clean.
- Ensure logged-out behavior stays identical: when not authenticated, the incremental pull loop is disabled and UI reads local repos.
- Using Convex `useQuery` is still fine, but it should live inside a single boundary module (the Convex transport / adapter),
  not be spread through feature UI as “sync logic”.

#### Phase 6: Cursor correctness + canonical local tables (make it “provably safe”)

This phase is about removing the biggest correctness footguns (cursor gaps) and making local storage match the new canonical schema.
It directly addresses:
- **Cursor correctness** (no missing rows / no infinite re-processing)
- **Clean boundaries** (UI is not responsible for merge/persist correctness)
- **Logged-out correctness** (local canonical tables always exist)

**Phase 6 invariants (must hold throughout Phase 6)**
- **Deterministic ordering**: every incremental feed has a stable total order:
  - order by `(updatedAt, cursorId)` ascending
- **No missed rows**: for a fixed table, repeated pulls using the returned `nextCursor` eventually return *all* rows with `(updatedAt, cursorId)` greater than the starting cursor.
- **Cursor monotonicity**: stored cursors only move forward (never decrease).
- **Idempotent apply**: applying the same remote delta page twice produces identical local state (upserts keyed by `cursorId`).
- **Local-first truth**: UI can render correctly with transport disabled; cloud only merges into local.
- **User-intent safety**: `overrides` and `coverCustom` are never erased by a merge unless there is an explicit newer tombstone/version.

**6.1 — Define canonical identity fields (no ambiguous “key vs id”)**
- For each normalized table, define a stable unique identifier string used for:
  - deterministic pagination tie-breakers
  - local primary keys
  - idempotent upserts
- Recommended fields (examples):
  - `library_items.cursorId = libraryItemId`
  - `library_source_links.cursorId = "${registryId}:${sourceId}:${sourceMangaId}"`
  - `chapter_progress.cursorId = "${registryId}:${sourceId}:${sourceMangaId}:${sourceChapterId}"`
  - `manga_progress.cursorId = "${registryId}:${sourceId}:${sourceMangaId}"`

**6.2 — Upgrade incremental endpoints to a composite cursor**
- Replace “cursor is only `updatedAt`” with:
  - `cursor = { updatedAt: number, cursorId: string }`
- Add indexes to support it (Convex):
  - `by_user_cursor(userId, updatedAt, cursorId)`
- Update server queries to implement correct pagination:
  - Return rows where:
    - `(updatedAt > cursor.updatedAt) OR (updatedAt == cursor.updatedAt AND cursorId > cursor.cursorId)`
  - Always return a **next cursor** equal to the last returned row’s `(updatedAt, cursorId)`.
  - This guarantees: **no misses** even when many rows share the same `updatedAt`.

**6.3 — Normalize local IndexedDB schema (mirror canonical tables)**
- Add local stores in `nemu-user` (or a new `nemu-user-v2` migration) matching cloud tables:
  - `library_items`, `library_source_links`, `chapter_progress`, `manga_progress`
  - plus `pending_ops`, `sync_meta` (cursors), `settings`, `registries`
- Define local primary keys using the same `cursorId` strings as above.
- Keep the existing `library` / `history` local stores temporarily as **derived/compat** (read-only) until Phase 8 cleanup.

**6.4 — Make merges “field-safe” for overrides / custom cover**
- Clean end goal: cloud merges must never “erase” user intent by accident.
- Add explicit timestamps (or versions) for user-edited fields, e.g.:
  - `overridesUpdatedAt`, `coverCustomUpdatedAt`
  - optional tombstones: `coverCustomDeletedAt` (if you allow user to remove a custom cover)
- Define merge rule:
  - For each field group, choose the value with the newest group timestamp.
  - Never treat `undefined` as a newer value unless it is an explicit tombstone.

**Phase 6 exit criteria (objective “go/no-go”)**
- **Cursor pagination correctness (unit/property test)**
  - Create a dataset where:
    - \(N \ge 10{,}000\) rows share the same `updatedAt`
    - `cursorId` spans a wide range (and includes edge cases like `:` in ids)
  - Pull pages with `limit` (small, e.g. 37) until `hasMore=false`.
  - Assert:
    - the union of all returned `cursorId`s equals the expected set
    - no duplicates across pages
    - `nextCursor` is strictly increasing in the total order
- **Cross-table cursor correctness (integration test)**
  - When syncing 4 tables in one “tick”, prove the sync loop cannot skip slower tables.
  - If a batched endpoint exists, prove it uses a correct shared cursor (or use per-table cursors instead).
- **Local canonical read path**
  - With transport disabled, the following flows work end-to-end from local canonical tables:
    - render library list (cover + overrides applied)
    - show “Updated” badge based on local `library_source_links` fields
    - show continue-reading/last-read based on local `manga_progress` (or derived selector from `chapter_progress`)
- **Field-safe merges**
  - Construct cases where cloud has older `overrides`/`coverCustom` and local has newer; after merge local must win.
  - Construct explicit tombstone cases; prove deletions propagate and do not resurrect.

#### Phase 6.5: Replace booleans/tombstones with explicit state + intent clocks (HLC)

Phase 6 gets us deterministic pagination + “state-based with tombstones”.
Phase 6.5 is the **clean** model: treat deletion/clears as explicit state transitions ordered by a client-generated clock, not “arrival time”.

This directly addresses:
- the “clear arrives late and incorrectly wins” offline bug
- the desire to stop inventing ad-hoc `clearX` flags over time
- multi-account correctness (each profile has its own clock)

##### Phase 6.5 proposal: HLC as `IntentClock`

Use an HLC (Hybrid Logical Clock) for user-intent ordering.

- **`IntentClock` format (string, comparable)**
  - `"{wallMsPadded}:{counterPadded}:{nodeId}"`
  - Example: `"00001703497912345:000012:device-9f3c"`
  - Lexicographic compare implements total order.
- **Where it lives**
  - Local: store `hlc_state` per profile (last wallMs + counter + nodeId) in local DB.
  - Cloud: store intent clocks per field-group in canonical tables (only for user-intent fields).
- **Why HLC**
  - Works offline.
  - Respects user action order better than server “receipt time”.
  - Allows convergence without central sequencing.

##### Phase 6.5 schema: explicit states (no “clear flag” needed)

Instead of optional fields + booleans, represent the state explicitly and order it by intent clock.

For `library_items` (canonical):
- **Membership**
  - `inLibrary: boolean`
  - `inLibraryClock: IntentClock`
  - (This replaces `deletedAt` for “removed from library” convergence; GC is a separate concern.)
- **Overrides (consistent shape, independent field-group clocks)**
  - `overrides: { metadata, metadataClock, coverUrl, coverUrlClock }`
  - `overrides.metadata: Partial<MangaMetadata> | null`
    - `null` means “explicitly cleared metadata overrides”.
  - `overrides.metadataClock: IntentClock`
  - `overrides.coverUrl: string | null`
    - `null` means “explicitly cleared cover override → use source-derived cover”.
  - `overrides.coverUrlClock: IntentClock`

Notes:
- “Custom cover storage backend” is **not** part of the schema contract.
  - Today it might be an R2 URL; tomorrow it might be a self-hosted URL.
  - The schema stores a URL that the client can fetch without source secrets.
- Source-derived cover is still fetched by `{registryId, sourceId, sourceMangaId}` using source adapters (headers, referer, etc.).

##### Phase 6.5 merge rules (clean, uniform)

For each field-group:
- If `incoming.clock > existing.clock`: accept incoming value (including `null`).
- Else: ignore incoming.

This removes the need for:
- `clearOverrides: true`
- `overridesDeletedAt`/`coverCustomDeletedAt` (those were a transitional representation of “null + clock”).

##### Phase 6.5 invariants
- **User action order wins** (as approximated by HLC), not “arrival time”.
- **No ad-hoc clear flags**: “clear” is `value=null` with a newer clock.
- **Field groups are independent**: clearing overrides does not affect cover override ordering.
- **Deterministic conflict resolution**: same inputs → same final state.

##### Phase 6.5 exit criteria
- Two-device test:
  - A clears overrides offline at time \(t\), B edits overrides online at \(t+\epsilon\).
  - When A comes online later, B’s edit must win (because its HLC is larger).
- A/B test with clock skew (device clocks off by minutes) still converges deterministically.

##### How Phase 6.5 maps to today (incremental)
- Phase 6 “tombstones + updatedAt” is an intermediate implementation.
- Phase 6.5 replaces:
  - `clearOverrides` → `overrides.metadata=null` + bump `overrides.metadataClock`
  - `clearCoverCustom` → `overrides.coverUrl=null` + bump `overrides.coverUrlClock`
  - `deletedAt` for library membership → `inLibrary=false` + `inLibraryClock`

##### Phase 6.5.5: Remove never-shipped legacy compat fields (clean schema surface)

During Phase 6 we introduced some **transitional local fields** to bridge the old model:
- `coverCustom`
- `deletedAt`
- `overridesUpdatedAt`
- `coverCustomUpdatedAt`
- `overridesDeletedAt`
- `coverCustomDeletedAt`

These were part of uncommitted WIP and were **never in production**, so we can safely remove them without a migration burden.

**Intent (doc-only):**
- Remove the above fields from local schemas/types (e.g. `LocalLibraryItemSchema`).
- Standardize on the Phase 6.5 overrides shape:
  - `overrides.metadata`, `overrides.metadataClock`
  - `overrides.coverUrl`, `overrides.coverUrlClock`
- Any “clear” intent is expressed as `null` + a newer clock (no `*DeletedAt`, no `clear*` booleans).

---

#### Phase 6.6: Internal profiles + account-scoped local data (guarantee multi-account correctness)

Phase 6.6 turns the “Auth, sign-in/out semantics, and multi-account model” section into an executable plan.
It is a prerequisite for Phase 7 because `SyncCore` must operate within a single, isolated profile.

**Goal:** prevent data/cursor/queue leakage between accounts, while keeping logged-out/offline perfect.

**Phase 6.6 invariants**
- **Profile isolation**: data, cursors, and pending ops for profile A can never be read/written by profile B.
- **Auth != data**: sign-in/out only attaches/detaches transport; it does not implicitly delete local data.
- **Explicit import**: merging `"local"` into `"user:X"` is only via a user-confirmed import action (never automatic).
- **Deterministic switching**: switching accounts is “stop transport → flush profile → switch profile → attach transport”.

**6.6.1 — Introduce `profileId`**
- Define:
  - `"local"` (anonymous profile)
  - `"user:<userId>"` (account profile)

**6.6.2 — Implement DB-per-profile (recommended)**
- IndexedDB names are suffixed by `profileId`:
  - `nemu-user::<profileId>`
  - `nemu-sync::<profileId>` (until Phase 8.4 unification)
- This enforces isolation by construction.

**6.6.3 — Profile selection rules (implicit)**
- On app cold start:
  - if authenticated: activate `"user:<id>"`
  - else: activate **last active profile** (usually the last signed-in account’s cached data), because logged-out still works offline.
    - If no prior profile exists, fall back to `"local"`.

**6.6.4 — Sign-in UX changes**
- Remove the implicit “first sign-in merge local into cloud”.
- Replace with explicit UI:
  - “You have a local library on this device. Import it into this account?”
  - choices: Import / Not now / View details

**6.6.5 — Sign-out UX changes**
- Sign-out should default to:
  - detach transport
  - keep the current local dataset active (offline continues seamlessly)
  - prompt the user whether to remove local account data from this device
  - (this is an explicit privacy decision, not a “profile” decision)

**Phase 6.6 exit criteria (objective “go/no-go”)**
- **Multi-account leakage test**
  - Create account A and B.
  - Add unique items/progress to each (including overrides and cover override).
  - Switch accounts repeatedly and verify:
    - library lists never mix
    - cursors/pending counts never cross-contaminate
- **Profile selection correctness (last-active profile)**
  - After signing in as account A, verify the app persists “last active profile = user:A”.
  - Sign out with **Keep data**:
    - restart app while logged out
    - verify the app still opens the last active profile (A’s local DB) and shows the same library/history offline
  - Sign out with **Remove data**:
    - verify local user-scoped data is removed from device
    - verify the app no longer selects the last active account profile while logged out (falls back to `"local"` / empty)
- **Sign-in/out semantics**
  - Sign out does not destroy local state.
  - Sign in does not import `"local"` unless explicitly confirmed.
  - “Keep data” sign-out path works as intended:
    - sign out (keep data)
    - restart app while logged out
    - verify the same library renders from local-only data and no authenticated queries run
- **Import correctness**
  - Import produces deterministic ops and converges without duplicating items on repeated import attempts.

---

#### Phase 7: True sync-core boundary + transport isolation (Convex becomes “one implementation”)

This phase makes the architecture maintainable/extendable (Convex, HTTP, self-hosted, etc.) without rewriting app logic.

**Phase 7 invariants (must hold throughout Phase 7)**
- **Transport isolation**: the only place that knows about Convex (or any backend SDK) is the transport implementation.
- **No UI-owned sync**: React effects/components do not:
  - compute merge/conflict rules
  - persist remote data into local tables
  - directly mutate sync cursors
- **Single writer for sync metadata**: only `SyncCore` updates:
  - `pending_ops` queue
  - `sync_meta` cursors
- **Logged-out correctness**: `NullTransport` must be sufficient for full functionality; `SyncCore` can be stopped without breaking UI.
- **Profile-scoped correctness**: `SyncCore` operates on exactly one active profile at a time (from Phase 6.6).

**Phase 7 deliverables**
- A backend-agnostic `SyncCore` module that is the *only* owner of:
  - sync loops (pull/apply/push scheduling)
  - cursor persistence
  - pending-op persistence + retry/backoff
- A `SyncTransport` interface + implementations:
  - `ConvexTransport` (Convex SDK + `useQuery`)
  - `NullTransport` (logged out)
  - `TestTransport` (in-memory for tests)
- A thin `SyncProvider` that only:
  - selects an active profile (Phase 6.6)
  - wires `SyncCore` to a transport
  - exposes status + actions via context/hooks

**7.1 — Introduce `SyncCore` (backend-agnostic)**
- Create a “sync core” module whose dependencies are only:
  - local repos (IDB implementations)
  - `SyncTransport` interface
  - pure merge/domain functions
- `SyncCore` responsibilities:
  - maintain per-table cursors in `sync_meta`
  - pull remote deltas in a deterministic order:
    - `library_items` → `library_source_links` → `chapter_progress` → `manga_progress`
  - apply in batched local transactions
  - push local `pending_ops` (writes) via transport
  - retry/backoff + observability hooks

**7.1.1 — Concrete module boundaries (recommended layout)**

- `src/sync/core/SyncCore.ts`
  - owns the state machine + scheduling
- `src/sync/core/types.ts`
  - `SyncCoreStatus`, `SyncRunReason`, `SyncCoreConfig`, metrics events
- `src/sync/core/apply.ts`
  - pure “apply remote delta → local stores” functions (calls into repos)
- `src/sync/core/push.ts`
  - pure “pending op → transport mutation(s)” functions
- `src/sync/transports/transport.ts`
  - `SyncTransport` interface (already exists; keep it here long-term)
- `src/sync/transports/convex/ConvexTransport.ts`
  - the only place allowed to import Convex SDK + generated `api`
- `src/sync/transports/null/NullTransport.ts`
- `src/sync/transports/test/TestTransport.ts`
  - deterministic scripted pages + capture pushes for assertions

**7.1.2 — What `SyncCore` API should look like (actionable)**

Minimal API:
- `start({ transport, profileId })`
- `stop()`
- `setTransport(transport)` (optional convenience)
- `setProfile(profileId)` (stop + switch + start internally)
- `syncNow(reason)` (manual trigger)
- `getStatus()` / subscribe to status events

Suggested config:
- `pullIntervalMs` (e.g. 15–60s)
- `maxInFlight` = 1 (avoid concurrent loops)
- `pageLimit` (e.g. 100)
- `maxPagesPerTick` (avoid starving UI thread)
- `retryPolicy` (exponential backoff + jitter)

**7.1.3 — Sync loop algorithm (deterministic and testable)**

Within a “tick”:
- **Pull phase** (remote → local):
  - iterate tables in a fixed order:
    - `library_items` → `library_source_links` → `chapter_progress` → `manga_progress`
  - for each table:
    - read cursor from `sync_meta`
    - pull a page via transport
    - apply to local canonical store (idempotent upsert)
    - advance cursor to returned `nextCursor` (monotonic)
    - repeat until `hasMore=false` or `maxPagesPerTick` reached
- **Push phase** (local → remote):
  - drain `pending_ops` in order (stable FIFO)
  - each op is either applied once or retried with backoff
  - ops are removed only after server ack

**Important**: “apply” is allowed to call `receiveIntentClock()` for any incoming clocked fields so local HLC moves forward.

**7.2 — Make `SyncProvider` thin**
- `SyncProvider` should:
  - initialize local repos (always)
  - select a transport:
    - logged out: a `NullTransport` that is always “not ready”
    - logged in: `ConvexTransport` (or future `HttpTransport`)
  - start/stop `SyncCore` based on auth/online state
- `SyncProvider` should **not**:
  - encode merge semantics
  - convert UI-shaped snapshots
  - maintain separate “cloud truth” copies of the library/history

**7.2.1 — What stays in UI vs moves into SyncCore**
- UI **may**:
  - read local canonical stores (selectors)
  - show sync status + last synced time
  - call domain actions (add/remove/update overrides) that enqueue pending ops
- UI **must not**:
  - compute merge rules
  - write remote deltas into IndexedDB
  - own sync cursors

**7.3 — Keep Convex queries, but quarantine them**
- It is still OK to use Convex `useQuery`, but only inside:
  - `ConvexTransport` (or a dedicated `ConvexTransportProvider`)
- The rest of the app should import:
  - domain types
  - repos
  - `SyncCore`
  - `SyncTransport` (interface)

**7.3.1 — Enforce the boundary (make it hard to regress)**
- Add a lint rule (or a simple CI grep) that fails if any file outside:
  - `src/sync/transports/**`
  - `src/sync/provider.tsx` (if needed temporarily)
  imports:
  - `convex/*` or `../../convex/_generated/api`

**Phase 7 exit criteria (objective “go/no-go”)**
- **Backend swap test**
  - Implement `TestTransport` (in-memory) that replays scripted delta pages and accepts pushed ops.
  - Run sync-core tests without importing Convex anywhere in the sync-core path.
- **Boundary enforcement check**
  - Audit rule: outside the transport module(s), there should be no imports from `convex/*`.
  - If you enforce via lint rule, Phase 7 exit requires that rule is enabled and passing.
- **Logged-out equivalence**
  - With `NullTransport`, the same local canonical flows from Phase 6 exit criteria work, and writes land in local `pending_ops`.
- **Single truth**
  - UI selectors read local canonical tables only; there is no parallel “cloud library/history” state used for rendering.
- **Account switching correctness**
  - With profiles enabled, switching between `"user:A"` and `"user:B"` does not require special-case sync logic in UI.
  - `SyncCore` + profile boundary are sufficient.

**Phase 7 exit criteria (add more “do this, verify that”)**
- **Deterministic cursor progression**
  - property test: random page sizes, random interleavings, assert no missed rows per table
- **At-least-once push semantics**
  - kill the app mid-push, restart, ensure pending ops are retried and are idempotent server-side
- **Offline behavior**
  - start with `NullTransport`, perform writes, ensure they land in pending ops and UI stays correct
  - sign in, ensure pending ops drain and state converges

**Phase 7 test plan (high-level but rigorous)**

The goal is that once `SyncCore` exists, correctness is enforced by tests, not by “it seems to work”.

**7.T1 — Deterministic transport harness (`TestTransport`)**
- Provide scripted pages per table: `{cursor → page(entries, nextCursor, hasMore)}`
- Capture pushes as an append-only log
- Allow injecting failures: transient errors, timeouts, partial pages, reordered delivery

**7.T2 — Property tests: cursor correctness**
- For each table, generate random datasets with:
  - many shared `updatedAt` values
  - random `cursorId` distributions
  - random page limits per pull
- Assert:
  - no missed ids
  - no duplicates across pages
  - cursor monotonicity

**7.T3 — Property tests: clock merge correctness (HLC)**
- Generate random sequences of operations across two devices:
  - set metadata overrides
  - clear metadata overrides (null)
  - set coverUrl override
  - clear coverUrl (null)
  - toggle membership add/remove
- Deliver ops in random arrival order.
- Assert convergence:
  - both devices end in the same state
  - `undefined` never wipes state; only `null` clears
  - newest clock wins per field-group

**7.T4 — Crash/restart tests (at-least-once push)**
- Simulate killing the app:
  - after enqueue, before push
  - mid-push (server ack lost)
  - after push, before local pending deletion
- Restart and assert:
  - pending ops are retried
  - server state is idempotent
  - local state stays consistent

**7.T5 — Multi-account isolation tests**
- Two profiles A and B:
  - writes + pulls never cross-contaminate data, cursors, or pending ops
- Sign out “keep data”:
  - logged out restart renders from local without authenticated queries
- Sign out “remove data”:
  - local account data cleared (legacy + canonical + HLC + sync cursors)

**7.T6 — Integration tests (happy path)**
- One device, online:
  - library add/remove
  - set/clear overrides + cover
  - progress writes
  - verify UI selectors can be derived from canonical local stores only

#### Phase 8: Nuke cursor-based sync — use Convex subscriptions directly

**Lesson learned:** Cursor-based incremental sync is over-engineered for this use case. We reimplemented what Convex already provides (real-time subscriptions) and introduced countless bugs:
- Cursor corruption on server rollback/restore
- Race conditions between cursor persistence and data apply
- Partial wipes leaving cursors ahead of data
- Complex recovery logic that itself had bugs

### Phase 8 goal: Simplify radically

**New model:**
1. **Server is truth** — Convex already has real-time subscriptions
2. **Local is cache** — mirror server state to IDB for offline viewing
3. **Kill cursors entirely** — no `nemu-sync::*` DB, no cursor tracking, no `sync_meta`
4. **No custom pending ops** — Convex handles offline writes automatically

**Architecture:**
```
[Convex] ←subscription→ [SyncSetup] →write→ [Local IDB] ←read← [UI / Stores]
              ↑                                    ↑
         [services.ts] ←―――――――――――――――――――――――――┘
              ↓                             (user actions)
         Convex mutation
```

**Key principle: UI is unaware of Convex.** UI/stores only read from local IDB.

- **`SyncSetup`** (sibling component) owns all Convex subscriptions:
  - Subscribes to Convex queries (`useQuery`)
  - Writes server state to local IDB
- **`services.ts`** (module singletons) handles mutations:
  - Store ops call Convex mutations when authenticated
  - Quarantines all Convex imports
- **UI / Stores** only interact with local IDB:
  - Read library, progress, etc. from IDB
  - User actions → call store methods → services.ts handles Convex

**Flow:**
- Online: Convex subscription fires → SyncSetup writes to IDB → store refreshes → UI updates
- Offline: UI reads stale IDB, user actions call services.ts → Convex queues mutations
- Reconnect: Convex retries mutations + subscription fires → IDB updated → UI updates

### Phase 8 invariants
- **No cursors**: delete `sync_meta`, `CURSOR_KEYS`, composite cursor logic
- **No `nemu-sync::*` DB**: only `nemu-user::*` for local cache
- **No custom pending ops**: Convex client handles offline mutation queuing
- **Subscription-driven**: Convex `useQuery` subscriptions write to local IDB
- **Offline viewing works**: local IDB is readable without connection (may be stale)

### What we keep from Phase 1-7
- Canonical tables (`library_items`, `library_source_links`, `chapter_progress`, `manga_progress`)
- Profile isolation (`nemu-user::<profileId>`)
- Local IDB as the single source of truth for UI
- Stores read from IDB only (unaware of Convex)

### What we delete
- `nemu-sync::*` databases
- `sync_meta` store and cursor tracking
- `pending_ops` store (Convex handles offline writes)
- `SyncCore` entirely (or reduce to thin status wrapper)
- `pullLibraryItems`, `pullSourceLinks`, etc. transport methods
- All `listSince` cursor-based endpoints (can keep for admin/debug)
- Composite cursor types and helpers
- `createSyncMetaRepo`, `createPendingOpsRepo`
- HLC clocks (`IntentClock`, `inLibraryClock`, `metadataClock`, etc.) — Convex handles conflict resolution
- `hlc.ts`, `createHLCManager`
- `deletedAt` fields (tombstones) — subscription-based sync doesn't need them, use hard deletes
- `cursorId` fields in Convex — only needed for cursor-based pagination (local IDB renames to `id`)
- `by_user_cursor` indexes

---

### Phase 8 checklist ✅

#### 8.1 Delete sync infrastructure ✅
- [x] Delete `SyncCore` class (or gut it to bare minimum)
- [x] Remove `CURSOR_KEYS`, `CompositeCursor` types
- [x] Remove `sync_meta` and `pending_ops` stores
- [x] Remove `createSyncMetaRepo`, `createPendingOpsRepo`
- [x] Remove `clearSyncState`
- [x] Delete `nemu-sync::*` DB creation entirely
- [x] Delete HLC infrastructure (`hlc.ts`, `IntentClock`, `createHLCManager`)
- [x] Remove clock fields from schema (`inLibraryClock`, `metadataClock`, `coverUrlClock`)
- [x] Remove `deletedAt` fields — use hard deletes instead of soft deletes
- [x] Remove `cursorId` fields from Convex (local IDB renames to `id`)
- [x] Remove `by_user_cursor` indexes

#### 8.2 Add subscription-based sync (SyncSetup) ✅
- [x] In `SyncSetup`, subscribe to canonical tables via `useQuery`:
  - `api.sync.libraryItemsAll` (or paginated if needed)
  - `api.sync.sourceLinksAll`
  - `api.sync.chapterProgressAll` (or by-manga on-demand)
  - `api.sync.mangaProgressAll`
- [x] On subscription update: batch-write entire result set to local IDB
- [x] Trigger store refresh after IDB write (so UI updates)
- [x] No diffing, no cursors — just overwrite local with server state

#### 8.3 Simplify writes (services.ts handles Convex) ✅
- [x] Store actions call services.ts ops (not Convex directly)
- [x] services.ts writes to local IDB + calls Convex mutation
- [x] No local pending ops queue — Convex client handles offline
- [x] UI/stores remain unaware of Convex

#### 8.4 Simplify local storage ✅
- [x] Only `nemu-user::*` databases (one per profile)
- [x] Local IDB = cache for offline viewing only
- [x] "Clear all data" just clears `nemu-user::*`

---

---

### Phase 8 migration plan (dev + prod)

Both dev and prod Convex deployments currently have Phase 7 schema with clock fields.
Migration must be done carefully to avoid breaking running clients.

#### 8.M1 Deploy code that ignores clock fields (backwards compatible) ✅
- [x] Client stops reading/writing clock fields
- [x] Server mutations stop requiring clock fields (make optional)
- [x] Server still accepts clock fields (old clients) but ignores them
- [x] Deploy to dev, verify
- [x] Deploy to prod, verify

#### 8.M2 Remove Phase 7 fields from existing documents ✅
- [x] Migrations ran on dev and prod
- [x] All Phase 7 fields removed from documents

#### 8.M3 Remove Phase 7 fields from Convex schema ✅
- [x] Update `convex/schema.ts`:
  - Remove `inLibraryClock`, `metadataClock`, `coverUrlClock` from `library_items`
  - Remove `deletedAt` from `library_source_links`, `chapter_progress`, `manga_progress`
  - Remove `cursorId` from `library_source_links`, `chapter_progress`, `manga_progress` (Convex uses `_id`)
  - Remove `by_user_cursor` indexes from all tables
- [x] Deploy schema change to dev
- [x] Deploy schema change to prod

#### 8.M4 Cleanup client code ✅
- [x] Delete `src/sync/hlc.ts`
- [x] Delete `IntentClock` type
- [x] Delete `createHLCManager`
- [x] Remove clock fields from `LocalLibraryItem` schema
- [x] Remove `deletedAt` from local schema types
- [x] Rename `cursorId` → `id` in local schema types
- [x] Rename `makeSourceLinkCursorId` → `makeSourceLinkId`
- [x] Rename `makeChapterProgressCursorId` → `makeChapterProgressId`
- [x] Rename `makeMangaProgressCursorId` → `makeMangaProgressId`
- [x] Update `CanonicalLibraryOps.removeSourceLink(cursorId)` → `removeSourceLink(id)`
- [x] Remove clock merge logic from apply functions
- [x] Remove tombstone handling logic

---

### Phase 8 exit criteria ✅
- [x] No `SyncCore`, no `sync_meta`, no `pending_ops`, no HLC
- [x] No `nemu-sync::*` databases
- [x] No clock fields in Convex schema or documents
- [x] No `deletedAt` fields — hard deletes only
- [x] No `cursorId` fields in Convex schema (local uses `id` with natural composite keys)
- [x] No `by_user_cursor` indexes
- [x] No clock fields in local schema
- [x] Server rollback/restore works: subscription fires → local repopulates
- [x] Offline viewing works: local IDB readable (stale)
- [x] Offline writes work: Convex queues mutations automatically
- [x] Tests pass

---

### Why this is better

| Old (over-engineered) | New (Convex-native) |
|----------------------|---------------------|
| Complex cursor pagination | Simple full sync |
| `cursorId` + `by_user_cursor` indexes in Convex | Convex `_id`, local `id` (natural composite keys) |
| Cursor corruption on rollback | Subscription just fires |
| Custom pending ops queue | Convex handles offline writes |
| HLC clocks for conflict resolution | Convex handles conflicts |
| Soft deletes + tombstones | Hard deletes |
| `nemu-sync` + `nemu-user` coordination | Single DB per profile |
| `SyncCore` (800+ lines) | Delete it |
| `hlc.ts`, clock fields everywhere | Delete it |
| Hundreds of lines of sync logic | Convex does it for us |

**Trade-off:** More data transferred on each subscription update. Acceptable for:
- Library: typically < 1000 items
- Progress: can be fetched on-demand per manga

If scale becomes an issue later, revisit — but don't prematurely optimize with cursors again.

---

## Phase 9: Legacy Cleanup ✅ COMPLETED

### 9.1 Delete legacy `library` table ✅
- [x] Verify no code reads from `library` table (only `library_items`)
- [x] Verify no code writes to `library` table (only `library_items`)
- [x] Remove `library` table from `convex/schema.ts`
- [x] Remove dual-write code from `library.save` and `library.remove`
- [x] Legacy table data will be GC'd by Convex

### 9.2 Delete legacy `history` table ✅
- [x] Verify no code reads from `history` table (only `chapter_progress` / `manga_progress`)
- [x] Verify no code writes to `history` table (only new tables)
- [x] Remove `history` table from `convex/schema.ts`
- [x] Remove dual-write code from `history.save`
- [x] Legacy table data will be GC'd by Convex

### 9.3 Remove backward-compat clock validators ✅
- [x] Remove `inLibraryClock` from `library.save` args
- [x] Remove `metadataClock`, `coverUrlClock` from `normalizedOverrides` in args
- [x] All clock-related code removed

### 9.4 Delete migrations.ts ✅
- [x] All migrations ran on prod
- [x] Deleted `convex/migrations.ts` entirely

### 9.5 Cleanup local IDB ✅
- [x] Removed `hlcState` store from STORES constant
- [x] Kept migration code for v6-v10 -> v11 (drops and recreates stores with `id` keyPath)
- [x] Legacy `library` and `history` stores kept for clearing (harmless)

### Phase 9 exit criteria ✅
- [x] No `library` table in Convex schema
- [x] No `history` table in Convex schema  
- [x] No backward-compat clock validators
- [x] No `migrations.ts`
- [x] Simplified IDB schema (no hlcState)
- [x] All code uses canonical tables only

---

## Phase 10: Client-Side Legacy Cleanup

Phase 9 cleaned up Convex. Now clean up the client-side legacy types and IDB stores.

### 10.1 Remove legacy `SourceLinkSchema` ✅
The old embedded source link format:
```ts
// LEGACY (schema.ts) - REMOVED
SourceLinkSchema = {
  mangaId: string,           // → sourceMangaId
  updateAcknowledged: ...,   // → updateAckChapter
}
```

- [x] Remove `SourceLinkSchema` from `src/data/schema.ts`
- [x] Remove `hasSourceUpdate(source: SourceLink)` function (legacy type)
- [x] Remove `SourceLink` type export
- [x] Update `LegacyLibraryMangaSchema` in indexeddb.ts to inline the schema (migration only)

### 10.2 Remove legacy conversion helpers ✅
- [x] Remove `sourceLinkToLegacy()` from `src/data/view.ts`
- [x] Remove `getEntrySourcesAsLegacy()` from `src/data/view.ts`

### 10.3 Migrate `HistoryEntry` → `LocalChapterProgress` ✅
The local IDB still uses legacy `history` store with `HistoryEntry` type:
```ts
// LEGACY (schema.ts) - REMOVED from public API
HistoryEntrySchema = {
  mangaId: string,    // → sourceMangaId
  chapterId: string,  // → sourceChapterId
  dateRead: number,   // → lastReadAt
}
```

UI components now use `LocalChapterProgress`:
- [x] Update `src/components/chapter-grid.tsx` to use minimal progress type
- [x] Update `src/stores/history.ts` (`HistoryStoreOps`, `HistoryStore`) to use canonical types
- [x] Update `src/data/store.ts` (`UserDataStore` interface) - removed legacy history methods

### 10.4 Migrate IDB history methods ✅
The legacy `history` IDB store duplicates `chapter_progress`:
- [x] Remove `getHistoryEntry()` - use `getChapterProgressEntry()` instead
- [x] Remove `saveHistoryEntry()` - use `saveChapterProgressEntry()` instead  
- [x] Remove `getMangaHistory()` - use `getChapterProgressForManga()` instead
- [x] Remove `getRecentHistory()` - no longer needed (use manga_progress)
- [x] Remove dual-write in `provider.tsx` (now only writes to canonical stores)

### 10.5 Legacy IDB stores kept for backward compat
Legacy `history` and `library` stores kept in IDB for:
- Reading data during import dialog (getAllLegacyHistory, getLibrary)
- Backward compatibility during migration
- Harmless overhead, can be cleaned up later

### 10.6 HistoryEntrySchema scoped to migration ✅
- [x] `LegacyHistoryEntrySchema` defined inline in indexeddb.ts (not exported)
- [x] `getAllLegacyHistory()` migration helper uses internal schema
- [x] `HistoryEntry` type removed from public exports

### Phase 10 exit criteria ✅
- [x] No `SourceLinkSchema` or `SourceLink` type (except migration)
- [x] No `HistoryEntry` type in public API (except migration)
- [x] No legacy conversion helpers (`sourceLinkToLegacy`, etc.)
- [x] UI uses `LocalChapterProgress` instead of `HistoryEntry`
- [x] `history` IDB store only used for one-time migration read
- [x] All IDB reads/writes use canonical stores (`chapter_progress`, `manga_progress`)
- [x] No dual-writes to legacy stores

