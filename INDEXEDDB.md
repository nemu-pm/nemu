# IndexedDB (local user storage)

Nemu stores all local-first user data in **IndexedDB**.

## Database

- **Name**: `nemu-user`
- **Current version**: `5` (see `src/data/indexeddb.ts`)

## Object stores

### `library`

- **keyPath**: `id`
- **Value**: `LibraryManga`

### `history`

- **keyPath**: `id` (composite key)
- **Indexes**
  - `by_dateRead` on `dateRead`
  - `by_manga` on `["registryId", "sourceId", "mangaId"]` (fast per-manga history lookup)
- **Value**: `HistoryEntry`

#### History key format

`history.id` is a composite key built from:

`registryId`, `sourceId`, `mangaId`, `chapterId`

Each part is encoded with `encodeURIComponent()` and joined with `:` to avoid ambiguity when ids contain reserved characters (like `:`).

### `settings`

- **keyPath**: `id` (single record with `id="default"`)
- **Value**: `UserSettings`

### `registries`

- **keyPath**: `id`
- **Value**: `SourceRegistry`

## Migrations / schema changes

- **v5**: adds `history.by_manga` index and switches `history.id` to an encoded composite key. Existing history rows are re-keyed on upgrade, and reads/writes also support lazy migration from the legacy unencoded key.

### How to do future schema bumps (migration DX)

When you need to change IndexedDB:

- **1) Decide compatibility**
  - **Compatible change** (preferred): the new app code can still run against an older DB version (maybe slower) via fallbacks.
    - Example: adding an index with a scan fallback.
  - **Incompatible change**: the new app code **cannot** safely run against older DBs (missing stores, key format changes without dual-read, required fields/invariants, etc).

- **2) Bump `DB_VERSION`**
  - Update `DB_VERSION` in `src/data/indexeddb.ts`.

- **3) Add a migration step in `onupgradeneeded`**
  - Keep migrations **monotonic** and **idempotent** (check `objectStoreNames` / `indexNames` before creating).
  - Prefer small steps per version (e.g. “v6 adds X”, “v7 rewrites Y”).

- **4) If the change is incompatible: set a minimum compatible version**
  - Update `MIN_COMPAT_VERSION` in `src/data/indexeddb.ts`.
  - `getDB()` will refuse to proceed on DBs older than this and will trigger a real versioned open so migrations run (and the lock dialog will show if another tab blocks the upgrade).

- **5) If the change is compatible: add a runtime fallback**
  - Example pattern (already used): `try { store.index("new_index") ... } catch { scan cursor ... }`.

## Lock / blocked upgrade UX

If another tab/window is holding an IndexedDB connection, a schema upgrade can be **blocked** (or a `versionchange` can be requested). The IDB layer dispatches a window event:

- **Event name**: `nemu:idb-blocked`
- **Detail**: `{ dbName, requestedVersion?, kind: "blocked" | "versionchange" }`

The app listens in `src/sync/provider.tsx` and shows a **responsive dialog/drawer** instructing the user to close other Nemu tabs/windows and reload.

## Dev-only: reproducing a real blocked upgrade (dialog/drawer)

There’s a dev-only repro hook to exercise a **real** IndexedDB blocked upgrade (i.e. `indexedDB.open(..., higherVersion).onblocked` fires because another tab holds a live connection).

### Flags

- `?idbHoldLock=1`: **Tab A** holds a connection open to a dev-only throwaway DB (`nemu-user__mock-block`).
- `?idbMockUpgrade=1`: **Tab B** attempts to `deleteDatabase("nemu-user__mock-block")`; if it’s blocked (because Tab A is holding a live connection), it emits the `nemu:idb-blocked` UI event for the real DB (`nemu-user`) so we exercise the real UX without wedging local storage.

### Steps

1. Open Nemu in **Tab A** with `?idbHoldLock=1` (example: `/browse?idbHoldLock=1`) and keep it open.
2. Open Nemu in **Tab B** with `?idbMockUpgrade=1` (example: `/browse?idbMockUpgrade=1`).
3. You should see the **Storage locked** dialog (desktop) or drawer (mobile viewport).
4. Close **Tab A**, then press **Reload** in **Tab B**.

## Dev-only: force-show the dialog UI (no real IDB block)

If you only want to verify the dialog/drawer layout without depending on IndexedDB behavior:

- Use `?idbForceDialog=1`

