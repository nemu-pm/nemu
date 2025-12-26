### Phase 7 (Option A) — **full implementation plan (UI migrated to canonical tables)**



#### Goal (what “Phase 7 done” means)

- **SyncCore is the single owner** of: pull/apply/push loop, cursors, pending ops, retries.

- **UI reads only local canonical tables**:

  - `library_items` (+ `source_links`)

  - `chapter_progress` (+ `manga_progress` for “last read”)

- **No “legacy library/history snapshot”** is required for correctness anymore.

- **Account/profile isolation** remains correct (Phase 6.6).



---



## 0) Lock the architecture choice (do this first)

**Decision**: Option A only.

- `SyncProvider` does not subscribe to `transport.use*Since` and does not apply deltas.

- `SyncCore` uses only **one-shot pulls** (`transport.pull*`) on interval/manual triggers.

- UI does not import Convex for sync logic; it reads local state from IndexedDB-backed stores only.



**Exit criteria**

- There is exactly **one codepath** that advances cursors: `SyncCore` + `SyncMetaRepo`.

- There is exactly **one codepath** that applies remote → local: `src/sync/core/apply.ts`.



---



## 1) Fix the core wiring: Provider becomes truly “thin”

### 1.1 Remove reactive subscriptions from `SyncProvider`

**Files**

- `src/sync/provider.tsx`

- (optional cleanup) `src/sync/transport.ts` (remove subscription hook types later)



**Actions**

- Delete the entire “Transport hooks → applyRemoteDelta” section:

  - `transport.useLibraryItemsSince(...)`

  - `transport.useSourceLinksSince(...)`

  - `transport.useChapterProgressSince(...)`

  - `transport.useMangaProgressSince(...)`

  - legacy `transport.useHistorySince(...)` conversion



**Keep**

- The auth wiring: choose `ConvexTransport` vs `NullTransport`.

- `syncCore.start()` / `syncCore.stop()`.

- `signingOut` / dialog logic.



**Exit criteria**

- Provider no longer calls `syncCore.applyRemoteDelta(...)`.

- No `useQuery`-style subscription hooks are used from provider.



### 1.2 Fix “profile leak” on long-lived singletons

**Problem to avoid**: `RegistryManager` (or other services) capturing the *old* `localStore` when `profileId` changes.



**Action**

- Anything created with `useState(() => new X(localStore))` must be moved to:

  - `useMemo(() => new X(localStore), [localStore])`

  - and disposed/recreated if it has internal state.



**Exit criteria**

- Switching accounts never mixes reads/writes across `IndexedDBUserDataStore(profileA)` and `...(profileB)`.



---



## 2) Make SyncCore push actually work (fix the payload mismatch)

Right now `SyncProvider` enqueues `{ manga, options, clocks }` but `SyncCore.pushOp()` expects `PushLibraryItem`.



### 2.1 Choose one owner for “op encoding”

**Rule**: The *same layer* that writes the canonical local record should also enqueue a canonical push payload.



**Implementation choice**

- Create a small “op encoder” module:

  - `src/sync/core/encode.ts` (or `src/sync/core/ops.ts`)

  - Input: canonical local types + action intent (add/remove/edit)

  - Output: `PendingOp` with `data` shaped exactly like transport push types (`PushLibraryItem`, `PushSourceLink`, `PushChapterProgress`)



**Exit criteria**

- `SyncCore.pushOp()` never needs to interpret random `{ manga, options }` shapes.

- Every `PendingOp.data` is already transport-ready.



---



## 3) Migrate UI to canonical library tables (stop using `LibraryManga`)

### 3.1 Introduce new UI-facing domain types (canonical)

**Files**

- `src/data/schema.ts` (or better: `src/data/models.ts` / `src/data/view.ts`)



**New types (suggested)**

- `LibraryItem` = `LocalLibraryItem` (canonical membership + overrides clocks)

- `LibrarySourceLink` = `LocalSourceLink`

- `LibraryEntry` (UI join) = `{ item: LibraryItem; sources: LibrarySourceLink[] }`



**Important**

- `LibraryManga` (legacy) should become deprecated and then removed.

- Existing helpers like `getEffectiveMetadata`, `getEffectiveCover`, `hasAnySourceUpdate`, `getMostRecentSource` must be rewritten to accept `LibraryEntry` (or split helpers into canonical equivalents).



**Exit criteria**

- No UI code imports/uses `LibraryManga` or `STORES.library`.



### 3.2 Update IndexedDB store read APIs used by UI

**Files**

- `src/data/indexeddb.ts`



**Add/ensure**

- Efficient canonical reads:

  - `getAllLibraryItems()` (already exists)

  - `getSourceLinksByLibraryItemId(libraryItemId)` (add if missing; with index)

  - `getAllSourceLinks()` (optional)

- A single “join” helper:

  - `getLibraryEntries(): Promise<LibraryEntry[]>` (recommended)



**Exit criteria**

- Library UI can render fully from canonical tables without any legacy store reads.



### 3.3 Rewrite `LibraryStore` to operate on `LibraryEntry[]`

**Files**

- `src/stores/library.ts`



**Actions**

- State becomes `entries: LibraryEntry[]` (or `items + links`, but joined is easier for UI).

- `load()` reads canonical join.

- `add/remove/addSource/removeSource/updateLatestChapter/acknowledgeUpdate/updateMetadata/updateOverrides/clearOverrides`

  - must update canonical tables only:

    - `library_items` for item-level fields

    - `source_links` for per-source fields



**Exit criteria**

- Library page + library-manga page + manga page can be implemented without legacy store data.



### 3.4 Update pages to canonical

**Files**

- `src/pages/library.tsx`

- `src/pages/library-manga.tsx`

- `src/pages/manga.tsx`

- any shared components (`MangaCard`, `CoverImage` usage)



**Actions**

- Replace usage of `manga.sources` etc with `entry.sources`.

- Replace helper calls to canonical helper equivalents.



**Exit criteria**

- App navigates and renders library screens correctly using only canonical data.



---



## 4) Migrate UI to canonical history/progress tables (stop using legacy `HistoryEntry` store for sync)

Option A means SyncCore pulls `chapter_progress`/`manga_progress`. If UI still reads legacy history, it won’t reflect sync.



### 4.1 Define the new UI “history” API (canonical)

**Recommended UI needs**

- For library cards:

  - “last read chapter id/number/title”

  - “last read at”

  - per-chapter progress map for a selected manga/source



**Implementation**

- Use `chapter_progress` as detailed per-chapter truth.

- Use `manga_progress` as fast summary (“continue reading” and sort keys).



**Files**

- `src/data/indexeddb.ts`

- `src/stores/history.ts`

- `src/data/context.tsx` (`useLibraryHistory`)



**Actions**

- Rewrite `useLibraryHistory` to be built from canonical progress stores (likely `manga_progress`).

- Rewrite `HistoryStore.getMangaProgress(...)` to query canonical tables.

- Update reader + manga page to write canonical progress (enqueue push ops accordingly).



**Exit criteria**

- Two devices sync reading progress without relying on legacy history sync at all.



---



## 5) Wire UI reactivity to SyncCore applies (required for Option A)

Without reactive Convex hooks, UI must refresh when SyncCore applies remote changes.



### 5.1 Add “applied” notifications from SyncCore

**Files**

- `src/sync/core/SyncCore.ts`



**Add**

- `onApplied(cb)` event, invoked when apply changes local tables:

  - include `{ table, affectedCount, affectedIds? }`



**Provider behavior**

- Subscribe to `syncCore.onApplied` and call:

  - `stores.useLibraryStore.getState().load(/*keepLoading?*/)`

  - `stores.useHistoryStore.getState().refreshFromLocal()`

  - (or incremental patch-in if you want)



**Exit criteria**

- After a remote change arrives, UI updates within one sync tick without a reload.



---



## 6) Remove legacy sync paths + legacy tables (cleanup stage)

**Files**

- `src/data/schema.ts` (delete `LibraryManga`, legacy helpers)

- `src/data/indexeddb.ts` (stop writing/reading `STORES.library` + `STORES.history`)

- `src/data/store.ts` (replace `UserDataStore` with canonical operations)

- `src/sync/transport.ts` (remove legacy full snapshot + subscription hook types if no longer used)

- `src/sync/convex-transport.ts` (delete legacy `useQuery` hooks if Option A-only)



**Exit criteria**

- No code references:

  - `STORES.library`, `STORES.history`

  - `CloudLibraryItem`, `CloudHistoryEntry`, legacy `api.library.list`, legacy `api.history.listSince` for sync

- Convex transport only exposes pull/push used by SyncCore.



---



## 7) Tests (high-level but rigorous, junior can implement)

### 7.1 Unit tests: pure apply + HLC semantics

**Already present**: `src/sync/hlc.test.ts` (keep + expand)



Add tests for:

- `applyLibraryItems`:

  - metadataClock vs coverUrlClock independence

  - explicit clear (`null`) wins only when clock wins

  - `undefined` never wipes

- `applySourceLinks`:

  - tombstone deletes don’t resurrect

- cursors:

  - max cursor updates correctly for equal updatedAt tie-breakers



### 7.2 SyncCore integration tests with `TestTransport`

**Goal**: deterministic “scripted pages in, local DB out”.



Test cases:

- **pull-only catch-up**: multiple pages per table, verify local DB content and cursor persistence

- **push retry**: inject push failures, ensure retries increment, eventual success removes op

- **crash/restart**: simulate by recreating SyncCore with same repos; pending ops still push

- **account isolation**: two profileIds; ensure no cursor/pending cross-contamination



### 7.3 UI integration sanity (not e2e server)

- Build `LibraryStore` + `HistoryStore` using an in-memory repo adapter and validate derived view models.

- Optional: Playwright later, but keep it out of Phase 7 if you want.



---



## Work order (what the junior should do, in sequence)

1) Provider: remove reactive subscriptions; fix singleton/profile leaks.

2) SyncCore: add “applied” events; remove any duplicate pull logic conflicts.

3) Canonical UI types + helpers.

4) LibraryStore + pages migrate to canonical library tables.

5) HistoryStore + reader/manga pages migrate to canonical progress tables.

6) Encode pending ops correctly (push payloads canonical).

7) Delete legacy schema + legacy sync paths.

8) Add TestTransport-based SyncCore tests + expand apply/HLC tests.