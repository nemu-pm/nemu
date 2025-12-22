import type { UserDataStore } from "./store";
import type {
  LibraryManga,
  HistoryEntry,
  InstalledSource,
  SourceRegistry,
  UserSettings,
} from "./schema";
import {
  LibraryMangaSchema,
  HistoryEntrySchema,
  SourceRegistrySchema,
  UserSettingsSchema,
} from "./schema";

/**
 * =========================
 * IndexedDB schema metadata
 * =========================
 *
 * READ THIS BEFORE MODIFYING ANYTHING IN THIS FILE
 * -----------------------------------------------
 * This file is deliberately defensive because IndexedDB has two sharp edges:
 * 1) **Blocked upgrades**: a second tab can keep an old connection open, causing
 *    version-change opens to stall and leaving the app "blank" if you await that open.
 * 2) **Partial compatibility**: new code often *can* operate on older schema versions
 *    if you add runtime fallbacks — but *sometimes* it cannot, and then you MUST run
 *    an upgrade (onupgradeneeded) before letting the app proceed.
 *
 * The current design goals:
 * - Never wedge startup behind a blocked upgrade open; instead, surface a blocking dialog.
 * - Keep compatible schema changes non-fatal with runtime fallbacks.
 * - Make incompatible schema changes explicit via MIN_COMPAT_VERSION.
 *
 * If you change the schema, also update INDEXEDDB.md.
 */
const DB_NAME = "nemu-user";
/**
 * Schema version for `nemu-user`.
 *
 * IMPORTANT:
 * - Bumping this will cause browsers to run `onupgradeneeded` for users whose DB is older.
 * - That upgrade can be BLOCKED by other tabs; we surface that via the `nemu:idb-blocked` UI event.
 */
const DB_VERSION = 5; // Bumped for history index + safe composite ids
/**
 * Minimum DB version that the current app code can safely operate on *without* running migrations.
 *
 * Why this exists:
 * - We intentionally try to open "current version" first (indexedDB.open(name) with no version)
 *   to avoid getting stuck behind a blocked version-change request at startup.
 * - But if the existing DB is *too old*, the app code may be incorrect or crash without migrations.
 *   In that case we must force a versioned open to run migrations (and show the lock dialog if blocked).
 *
 * Guidelines for future edits:
 * - If your change is **compatible** (you add fallbacks), MIN_COMPAT_VERSION can stay the same.
 * - If your change is **incompatible** (missing store/index/fields breaks correctness),
 *   bump MIN_COMPAT_VERSION to the oldest DB version the new code can safely tolerate.
 *
 * Today:
 * - v3 stored history embedded in `library` (no standalone `history` store) → incompatible.
 * - v4 is compatible (we have fallbacks for missing `by_manga` index + legacy history ids).
 */
const MIN_COMPAT_VERSION = 4;
/**
 * Dev-only repro DB used for `idbHoldLock`/`idbMockUpgrade` so we don't wedge the real DB.
 *
 * NOTE:
 * These dev repro flags exist because testing real IndexedDB blocked upgrade behavior is hard once a
 * dev machine has already upgraded. We intentionally keep the "mock" separate from `nemu-user`.
 */
const MOCK_BLOCK_DB_NAME = "nemu-user__mock-block";
const MOCK_BLOCK_STICKY_KEY = "nemu:idb-mock-blocked-sticky";
const MOCK_LOCK_HELD_KEY = "nemu:idb-mock-lock-held";

const STORES = {
  library: "library",
  history: "history",
  settings: "settings",
  registries: "registries",
} as const;

const DEFAULT_SETTINGS: UserSettings = {
  installedSources: [],
};

/**
 * Window event used to surface IndexedDB lock / blocked upgrade to the UI layer.
 *
 * IMPORTANT:
 * - This event should only be emitted in response to *real* browser IndexedDB events
 *   (onblocked/onversionchange) so it is not noisy.
 * - The UI listens and shows a non-dismissible dialog telling the user to close other tabs/windows.
 *
 * Detail: { dbName: string; requestedVersion?: number; kind: 'blocked' | 'versionchange' }
 */
export const IDB_UI_EVENT = "nemu:idb-blocked";
const IDB_UI_EVENT_BUFFER_KEY = "nemu:idb-ui-event";

type IdbUiEventDetail = {
  dbName: string;
  requestedVersion?: number;
  kind: "blocked" | "versionchange";
};

/**
 * Emit the IDB UI event and buffer it in sessionStorage.
 *
 * Why buffer?
 * - React StrictMode / refresh timing can cause the IDB layer to emit before the UI effect attaches.
 * - Buffering lets the UI "replay" the most recent event on mount so we don't miss showing the dialog.
 *
 * Constraints:
 * - Must be non-fatal; never throw (storage APIs can throw in some environments).
 */
function emitIdbUiEvent(detail: IdbUiEventDetail) {
  // Buffer the last event so UI can still show the dialog even if the event fires
  // before React effects attach (StrictMode / refresh timing).
  try {
    sessionStorage.setItem(
      IDB_UI_EVENT_BUFFER_KEY,
      JSON.stringify({ detail, timestamp: Date.now() })
    );
  } catch {
    // ignore
  }

  try {
    window.dispatchEvent(new CustomEvent(IDB_UI_EVENT, { detail }));
  } catch {
    // ignore
  }
}

/**
 * ============================
 * Dev-only blocked-upgrade repro
 * ============================
 *
 * `?idbHoldLock=1`:
 * - Open and hold a connection to MOCK_BLOCK_DB_NAME in Tab A.
 *
 * `?idbMockUpgrade=1`:
 * - After `nemu-user` is successfully opened, Tab B calls deleteDatabase(MOCK_BLOCK_DB_NAME).
 * - If Tab A holds a live connection, deleteDatabase().onblocked fires reliably.
 * - We then emit the real UI event (for DB_NAME) so the real UX is exercised without risking real data.
 *
 * IMPORTANT: we start the repro only AFTER `getDB()` settles to avoid interfering with startup opens.
 */
let mockUpgradeReproStarted = false;
function maybeStartMockUpgradeReproAfterDbOpen() {
  if (mockUpgradeReproStarted) return;
  const shouldMock =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    typeof window.location?.search === "string" &&
    window.location.search.includes("idbMockUpgrade=1");
  if (!shouldMock) return;
  mockUpgradeReproStarted = true;

  try {
    // IMPORTANT: use a throwaway DB for the mock so we never wedge the real `nemu-user` DB.
    // We use deleteDatabase() because its onblocked behavior is more deterministic for this repro.
    const delReq = indexedDB.deleteDatabase(MOCK_BLOCK_DB_NAME);
    delReq.onblocked = () => {
      try { sessionStorage.setItem(MOCK_BLOCK_STICKY_KEY, "1"); } catch { /* ignore */ }
      emitIdbUiEvent({ dbName: DB_NAME, requestedVersion: DB_VERSION, kind: "blocked" });
    };
    delReq.onsuccess = () => {
      // Only clear sticky if Tab A is no longer holding the mock lock.
      // Some browsers can unblock deleteDatabase by force-closing connections; for the repro harness
      // we still want the dialog to persist while Tab A indicates the lock is held.
      let lockHeld = false;
      try { lockHeld = localStorage.getItem(MOCK_LOCK_HELD_KEY) === "1"; } catch { /* ignore */ }
      if (!lockHeld) {
        try { sessionStorage.removeItem(MOCK_BLOCK_STICKY_KEY); } catch { /* ignore */ }
      }
    };
    delReq.onerror = () => {
      // keep sticky as-is; if we're still blocked, onblocked should have fired.
    };
  } catch {
    // ignore
  }
}

/**
 * Best-effort cross-tab coordination to avoid IndexedDB version-change deadlocks.
 *
 * Key property:
 * - We ONLY broadcast "close-db" when we are *actually* attempting a versioned upgrade open.
 *   Do not broadcast on every startup; that can cause other tabs to close the DB unexpectedly
 *   and create weird secondary effects (like images not loading).
 *
 * Non-goals:
 * - Perfect reliability across all browsers. This is a hint mechanism; the UI dialog remains the
 *   primary recovery path when a real lock exists.
 */
const IDB_BC_NAME = "nemu:idb";
let idbBroadcast: BroadcastChannel | null = null;
let lastOpenedUserDb: IDBDatabase | null = null;
let lastOpenedMockBlockDb: IDBDatabase | null = null;

const IDB_SENDER_ID =
  (typeof crypto !== "undefined" && "randomUUID" in crypto && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `sender_${Math.random().toString(36).slice(2)}`);

const shouldHoldIdbLock =
  import.meta.env.DEV &&
  typeof window !== "undefined" &&
  typeof window.location?.search === "string" &&
  window.location.search.includes("idbHoldLock=1");

// Dev-only: explicitly hold an IndexedDB connection open to reproduce blocked upgrades.
// Use `?idbHoldLock=1` in one tab (Tab A), then `?idbMockUpgrade=1` in another tab (Tab B).
if (shouldHoldIdbLock) {
  try {
    const holdReq = indexedDB.open(MOCK_BLOCK_DB_NAME);
    holdReq.onsuccess = () => {
      lastOpenedMockBlockDb = holdReq.result;
      try {
        // Keep a strong reference across dev HMR/reloads so the lock remains held.
        (window as any).__nemuMockBlockDb = lastOpenedMockBlockDb;
      } catch {
        // ignore
      }
      try {
        localStorage.setItem(MOCK_LOCK_HELD_KEY, "1");
        const clear = () => {
          try { localStorage.removeItem(MOCK_LOCK_HELD_KEY); } catch { /* ignore */ }
        };
        window.addEventListener("pagehide", clear, { once: true });
        window.addEventListener("beforeunload", clear, { once: true });
      } catch {
        // ignore
      }
      // Intentionally do not close.
      lastOpenedMockBlockDb.onversionchange = () => {
        // Intentionally do not close in hold-lock mode.
      };
    };
    holdReq.onerror = () => {
      // ignore
    };
  } catch {
    // ignore
  }
}
try {
  if (typeof BroadcastChannel !== "undefined") {
    idbBroadcast = new BroadcastChannel(IDB_BC_NAME);
    idbBroadcast.onmessage = (ev) => {
      const msg = ev.data as any;
      if (!msg || typeof msg !== "object") return;
      if (msg.senderId && msg.senderId === IDB_SENDER_ID) return;
      if (msg.type === "close-db" && msg.dbName === DB_NAME) {
        try {
          lastOpenedUserDb?.close();
          lastOpenedUserDb = null;
        } catch {
          // ignore
        }
      }
    };
  }
} catch {
  idbBroadcast = null;
}

/** Create composite key for history entry */
export function makeHistoryKey(
  registryId: string,
  sourceId: string,
  mangaId: string,
  chapterId: string
): string {
  // Important: ids may contain ":" (or other reserved chars). Encode each component so the
  // composite key is unambiguous and stable.
  const enc = (s: string) => encodeURIComponent(s);
  return `${enc(registryId)}:${enc(sourceId)}:${enc(mangaId)}:${enc(chapterId)}`;
}

/** Legacy history key format (pre-encoding). Used for lazy migration. */
function makeLegacyHistoryKey(
  registryId: string,
  sourceId: string,
  mangaId: string,
  chapterId: string
): string {
  return `${registryId}:${sourceId}:${mangaId}:${chapterId}`;
}

/**
 * IndexedDB implementation of UserDataStore
 */
export class IndexedDBUserDataStore implements UserDataStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        /**
         * ===================
         * DB open strategy
         * ===================
         *
         * We do TWO kinds of opens:
         *
         * (A) "Current version" open:
         *     indexedDB.open(DB_NAME) (no version)
         *     - This does NOT request a versionchange and is less likely to be stuck behind another tab.
         *     - If it succeeds, the app can start immediately using fallbacks for any newer features.
         *
         * (B) "Upgrade" open:
         *     indexedDB.open(DB_NAME, DB_VERSION)
         *     - This runs migrations (onupgradeneeded) but CAN be blocked by other tabs.
         *     - When blocked, we emit IDB_UI_EVENT so UI can instruct the user to close other tabs.
         *
         * Critical invariant:
         * - We NEVER want startup to hang silently behind a blocked upgrade open. If you change this,
         *   verify the "two tabs with older connection" scenario still yields a dialog, not a blank app.
         */
        let settled = false;
        const settleOk = (db: IDBDatabase, _winner: "upgrade" | "current") => {
          if (settled) {
            try { db.close(); } catch { /* ignore */ }
            return;
          }
          settled = true;
          lastOpenedUserDb = db;
          // Important: only start the mock upgrade repro AFTER we have a usable connection.
          // Starting a blocked versionchange request too early can stall the initial open on refresh.
          maybeStartMockUpgradeReproAfterDbOpen();
          resolve(db);
        };

        let upgradeStarted = false;
        const startUpgradeOpen = () => {
          if (upgradeStarted) return;
          upgradeStarted = true;

          // Ask other tabs to close the user DB if they have it open (helps unblock schema upgrades).
          // IMPORTANT: only do this when we are actually attempting a DB_VERSION open.
          try {
            idbBroadcast?.postMessage({ type: "close-db", dbName: DB_NAME, senderId: IDB_SENDER_ID });
          } catch {
            // ignore
          }

          let upgradeRequest: IDBOpenDBRequest;
          try {
            upgradeRequest = indexedDB.open(DB_NAME, DB_VERSION);
          } catch (e) {
            reject(e);
            return;
          }

          // A versioned open was blocked by another tab's existing connection(s).
          // UI should tell the user to close other tabs/windows and reload.
          upgradeRequest.onblocked = () => {
            emitIdbUiEvent({ dbName: DB_NAME, requestedVersion: DB_VERSION, kind: "blocked" });
          };

          upgradeRequest.onerror = () => {
            reject(upgradeRequest.error);
          };
          upgradeRequest.onsuccess = () => {
            const db = upgradeRequest.result;
            db.onversionchange = () => {
              try { db.close(); } catch { /* ignore */ }
            };
            settleOk(db, "upgrade");
          };

          upgradeRequest.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            const tx = (event.target as IDBOpenDBRequest).transaction!;
            const oldVersion = event.oldVersion;
            /**
             * Migration rules:
             * - Always check for existence before creating stores/indexes (idempotent).
             * - Never assume previous migrations have run (users can jump versions).
             * - Prefer doing structural changes here rather than "on the fly" at read time,
             *   unless you intentionally design a lazy migration path (like legacy history ids).
             *
             * If you introduce an incompatible change, also update MIN_COMPAT_VERSION above.
             */

            // Library store - keyed by id
            if (!db.objectStoreNames.contains(STORES.library)) {
              db.createObjectStore(STORES.library, { keyPath: "id" });
            }

            // History store - keyed by composite id, indexed by dateRead
            if (!db.objectStoreNames.contains(STORES.history)) {
              const historyStore = db.createObjectStore(STORES.history, { keyPath: "id" });
              historyStore.createIndex("by_dateRead", "dateRead", { unique: false });
              // Composite index for fast per-manga history lookups (no full-store scan).
              historyStore.createIndex("by_manga", ["registryId", "sourceId", "mangaId"], {
                unique: false,
              });
            }
            // Ensure the by_manga index exists when upgrading older DBs.
            {
              const historyStore = tx.objectStore(STORES.history);
              if (!historyStore.indexNames.contains("by_manga")) {
                historyStore.createIndex("by_manga", ["registryId", "sourceId", "mangaId"], {
                  unique: false,
                });
              }
            }

            // Settings store - single record with id="default"
            if (!db.objectStoreNames.contains(STORES.settings)) {
              db.createObjectStore(STORES.settings, { keyPath: "id" });
            }

            // Registries store - keyed by id (local only)
            if (!db.objectStoreNames.contains(STORES.registries)) {
              db.createObjectStore(STORES.registries, { keyPath: "id" });
            }

            // Remove old sources store if exists (now in settings)
            if (db.objectStoreNames.contains("sources")) {
              db.deleteObjectStore("sources");
            }

            // Migration: Extract embedded history from library items (v3 -> v4)
            if (oldVersion >= 3 && oldVersion < 4) {
              const libraryStore = tx.objectStore(STORES.library);
              const historyStore = tx.objectStore(STORES.history);
              
              const cursorReq = libraryStore.openCursor();
              cursorReq.onsuccess = () => {
                const cursor = cursorReq.result;
                if (cursor) {
                  const item = cursor.value;
                  // Migrate embedded history to separate store
                  if (item.history && typeof item.history === "object") {
                    // Parse id to extract registryId, sourceId, mangaId
                    // Format: registryId:sourceId:mangaId
                    const parts = (item.id as string).split(":");
                    if (parts.length >= 3) {
                      const [registryId, sourceId, mangaId] = parts;
                      for (const [chapterId, progress] of Object.entries(item.history)) {
                        const historyEntry: HistoryEntry = {
                          id: makeHistoryKey(registryId, sourceId, mangaId, chapterId),
                          registryId,
                          sourceId,
                          mangaId,
                          chapterId,
                          progress: (progress as any).progress ?? 0,
                          total: (progress as any).total ?? 0,
                          completed: (progress as any).completed ?? false,
                          dateRead: (progress as any).dateRead ?? Date.now(),
                        };
                        historyStore.put(historyEntry);
                      }
                    }
                    // Remove history from library item
                    delete item.history;
                    cursor.update(item);
                  }
                  cursor.continue();
                }
              };
            }

            // Migration: Re-key history ids to safe encoded composite keys (v4 -> v5)
            if (oldVersion >= 4 && oldVersion < 5) {
              const historyStore = tx.objectStore(STORES.history);
              const cursorReq = historyStore.openCursor();
              let seen = 0;
              cursorReq.onsuccess = () => {
                const cursor = cursorReq.result as IDBCursorWithValue | null;
                if (!cursor) {
                  return;
                }
                const entry = cursor.value as HistoryEntry;
                const newId = makeHistoryKey(
                  entry.registryId,
                  entry.sourceId,
                  entry.mangaId,
                  entry.chapterId
                );

                if (entry.id !== newId) {
                  const updated: HistoryEntry = { ...entry, id: newId };
                  // Delete old key then insert updated record under new key.
                  historyStore.delete(entry.id);
                  historyStore.put(updated);
                }

                seen += 1;
                cursor.continue();
              };
            }
          };
        };

        // Open current DB version first to avoid getting stuck behind a blocked versionchange
        // request. We'll only attempt a DB_VERSION open when necessary (fresh install or
        // existing DB is older than MIN_COMPAT_VERSION).
        let currentSawUpgradeNeeded = false;
        const currentRequest = indexedDB.open(DB_NAME);

        try {
          currentRequest.onblocked = () => {
            emitIdbUiEvent({ dbName: DB_NAME, kind: "blocked" });
          };
          currentRequest.onupgradeneeded = (event) => {
            currentSawUpgradeNeeded = true;
            try {
              (event.target as IDBOpenDBRequest).transaction?.abort();
            } catch {
              // ignore
            }
          };
          currentRequest.onsuccess = () => {
            const db = currentRequest.result;
            // If this DB is too old for the current code to function safely, do not proceed.
            // Instead, attempt a real upgrade open so onupgradeneeded can run migrations.
            if (db.version > 0 && db.version < MIN_COMPAT_VERSION) {
              try { db.close(); } catch { /* ignore */ }
              startUpgradeOpen();
              return;
            }
            db.onversionchange = () => {
              try { db.close(); } catch { /* ignore */ }
              emitIdbUiEvent({ dbName: DB_NAME, kind: "versionchange" });
            };
            settleOk(db, "current");
          };
          currentRequest.onerror = () => {
            // If this was a fresh install (DB didn't exist), we intentionally aborted the v1 open.
            // Now retry as a proper DB_VERSION create.
            if (currentSawUpgradeNeeded) {
              startUpgradeOpen();
              return;
            }
            reject(currentRequest.error);
          };
        } catch (e) {
          reject(e);
          return;
        }
      });
    }
    return this.dbPromise;
  }

  // ============ LIBRARY ============

  async getLibrary(): Promise<LibraryManga[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.library, "readonly");
      const store = tx.objectStore(STORES.library);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const results = request.result
          .map((item) => {
            const parsed = LibraryMangaSchema.safeParse(item);
            return parsed.success ? parsed.data : null;
          })
          .filter((item): item is LibraryManga => item !== null);
        resolve(results);
      };
    });
  }

  async getLibraryManga(id: string): Promise<LibraryManga | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.library, "readonly");
      const store = tx.objectStore(STORES.library);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        const parsed = LibraryMangaSchema.safeParse(request.result);
        resolve(parsed.success ? parsed.data : null);
      };
    });
  }

  async saveLibraryManga(manga: LibraryManga): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.library, "readwrite");
      const store = tx.objectStore(STORES.library);
      const request = store.put(manga);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async removeLibraryManga(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.library, "readwrite");
      const store = tx.objectStore(STORES.library);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // ============ HISTORY (separate from library) ============

  async getHistoryEntry(
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string
  ): Promise<HistoryEntry | null> {
    const db = await this.getDB();
    const key = makeHistoryKey(registryId, sourceId, mangaId, chapterId);
    const legacyKey = makeLegacyHistoryKey(registryId, sourceId, mangaId, chapterId);

    const readOne = (k: string) =>
      new Promise<HistoryEntry | null>((resolve, reject) => {
        const tx = db.transaction(STORES.history, "readonly");
        const store = tx.objectStore(STORES.history);
        const request = store.get(k);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          if (!request.result) {
            resolve(null);
            return;
          }
          const parsed = HistoryEntrySchema.safeParse(request.result);
          resolve(parsed.success ? parsed.data : null);
        };
      });

    const entry = await readOne(key);
    if (entry) return entry;
    if (legacyKey !== key) return await readOne(legacyKey);
    return null;
  }

  async saveHistoryEntry(entry: HistoryEntry): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.history, "readwrite");
      const store = tx.objectStore(STORES.history);
      
      const legacyId = makeLegacyHistoryKey(
        entry.registryId,
        entry.sourceId,
        entry.mangaId,
        entry.chapterId
      );

      // High-water mark protection: read existing entry first and merge.
      // Also lazily migrate legacy ids → encoded ids on write.
      const getRequest = store.get(entry.id);
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => {
        const existing = getRequest.result as any | undefined;

        const mergeWith = (base: any | undefined): HistoryEntry => {
          return base
            ? {
                ...entry,
                progress: Math.max(base.progress ?? 0, entry.progress),
                total: Math.max(base.total ?? 0, entry.total),
                completed: !!base.completed || entry.completed,
                dateRead: Math.max(base.dateRead ?? 0, entry.dateRead),
              }
            : entry;
        };

        if (existing) {
          const merged = mergeWith(existing);
          const putRequest = store.put(merged);
          putRequest.onerror = () => reject(putRequest.error);
          putRequest.onsuccess = () => resolve();
          return;
        }

        // If legacy key differs, check legacy entry and migrate it.
        if (legacyId !== entry.id) {
          const legacyReq = store.get(legacyId);
          legacyReq.onerror = () => reject(legacyReq.error);
          legacyReq.onsuccess = () => {
            const legacyExisting = legacyReq.result as any | undefined;
            const merged = mergeWith(legacyExisting);

            if (legacyExisting) {
              try {
                store.delete(legacyId);
              } catch {
                // ignore
              }
            }

            const putRequest = store.put(merged);
            putRequest.onerror = () => reject(putRequest.error);
            putRequest.onsuccess = () => resolve();
          };
          return;
        }

        // No existing, no legacy mismatch
        const putRequest = store.put(entry);
        putRequest.onerror = () => reject(putRequest.error);
        putRequest.onsuccess = () => resolve();
      };
    });
  }

  async getMangaHistory(
    registryId: string,
    sourceId: string,
    mangaId: string
  ): Promise<Record<string, HistoryEntry>> {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.history, "readonly");
      const store = tx.objectStore(STORES.history);
      let request: IDBRequest<IDBCursorWithValue | null>;
      try {
        const index = store.index("by_manga");
        const range = IDBKeyRange.only([registryId, sourceId, mangaId]);
        request = index.openCursor(range);
      } catch {
        // Fallback (e.g. if upgrade is blocked and index doesn't exist yet): scan store.
        request = store.openCursor();
      }

      const result: Record<string, HistoryEntry> = {};
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result as IDBCursorWithValue | null;
        if (!cursor) {
          resolve(result);
          return;
        }

        const parsed = HistoryEntrySchema.safeParse(cursor.value);
        if (parsed.success) {
          // If we fell back to scanning the whole store, filter by fields.
          if (
            parsed.data.registryId === registryId &&
            parsed.data.sourceId === sourceId &&
            parsed.data.mangaId === mangaId
          ) {
            result[parsed.data.chapterId] = parsed.data;
          }
        }
        cursor.continue();
      };
    });
  }

  async getRecentHistory(limit: number): Promise<HistoryEntry[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.history, "readonly");
      const store = tx.objectStore(STORES.history);
      const index = store.index("by_dateRead");
      const request = index.openCursor(null, "prev"); // Descending order

      const results: HistoryEntry[] = [];
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && results.length < limit) {
          const parsed = HistoryEntrySchema.safeParse(cursor.value);
          if (parsed.success) {
            results.push(parsed.data);
          }
          cursor.continue();
        } else {
          resolve(results);
        }
      };
    });
  }

  // ============ SETTINGS ============

  async getSettings(): Promise<UserSettings> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.settings, "readonly");
      const store = tx.objectStore(STORES.settings);
      const request = store.get("default");

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (!request.result) {
          resolve(DEFAULT_SETTINGS);
          return;
        }
        const parsed = UserSettingsSchema.safeParse(request.result);
        resolve(parsed.success ? parsed.data : DEFAULT_SETTINGS);
      };
    });
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.settings, "readwrite");
      const store = tx.objectStore(STORES.settings);
      const request = store.put({ id: "default", ...settings });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // ============ INSTALLED SOURCES (convenience, stored in settings) ============

  async getInstalledSources(): Promise<InstalledSource[]> {
    const settings = await this.getSettings();
    return settings.installedSources;
  }

  async getInstalledSource(id: string): Promise<InstalledSource | null> {
    const settings = await this.getSettings();
    return settings.installedSources.find((s) => s.id === id) ?? null;
  }

  async saveInstalledSource(source: InstalledSource): Promise<void> {
    const settings = await this.getSettings();
    const existing = settings.installedSources.findIndex((s) => s.id === source.id);
    if (existing >= 0) {
      settings.installedSources[existing] = source;
    } else {
      settings.installedSources.push(source);
    }
    await this.saveSettings(settings);
  }

  async removeInstalledSource(id: string): Promise<void> {
    const settings = await this.getSettings();
    settings.installedSources = settings.installedSources.filter((s) => s.id !== id);
    await this.saveSettings(settings);
  }

  // ============ REGISTRIES (local only) ============

  async getRegistries(): Promise<SourceRegistry[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.registries, "readonly");
      const store = tx.objectStore(STORES.registries);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const results = request.result
          .map((item) => {
            const parsed = SourceRegistrySchema.safeParse(item);
            return parsed.success ? parsed.data : null;
          })
          .filter((item): item is SourceRegistry => item !== null);
        resolve(results);
      };
    });
  }

  async getRegistry(id: string): Promise<SourceRegistry | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.registries, "readonly");
      const store = tx.objectStore(STORES.registries);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        const parsed = SourceRegistrySchema.safeParse(request.result);
        resolve(parsed.success ? parsed.data : null);
      };
    });
  }

  async saveRegistry(registry: SourceRegistry): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.registries, "readwrite");
      const store = tx.objectStore(STORES.registries);
      const request = store.put(registry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async removeRegistry(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.registries, "readwrite");
      const store = tx.objectStore(STORES.registries);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}
