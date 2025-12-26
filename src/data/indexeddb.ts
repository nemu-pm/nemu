import type { UserDataStore } from "./store";
import type {
  HistoryEntry,
  InstalledSource,
  SourceRegistry,
  UserSettings,
  LocalLibraryItem,
  LocalSourceLink,
  LocalChapterProgress,
  LocalMangaProgress,
} from "./schema";
import {
  HistoryEntrySchema,
  SourceRegistrySchema,
  UserSettingsSchema,
  LocalLibraryItemSchema,
  LocalSourceLinkSchema,
  LocalChapterProgressSchema,
  LocalMangaProgressSchema,
  MangaMetadataSchema,
  ExternalIdsSchema,
  SourceLinkSchema,
} from "./schema";
import { z } from "zod";

// ============================================================================
// Legacy LibraryManga type (internal only - for migration)
// ============================================================================
const LegacyLibraryMangaSchema = z.object({
  id: z.string(),
  addedAt: z.number(),
  metadata: MangaMetadataSchema,
  overrides: MangaMetadataSchema.partial().optional(),
  coverCustom: z.string().optional(),
  externalIds: ExternalIdsSchema.optional(),
  sources: z.array(SourceLinkSchema).min(1),
});
type LegacyLibraryManga = z.infer<typeof LegacyLibraryMangaSchema>;

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
/**
 * Default DB name for backwards compatibility (local profile).
 * Profile-specific DBs use getUserDbName(profileId) instead.
 */
const DEFAULT_DB_NAME = "nemu-user";
/**
 * Schema version for `nemu-user`.
 *
 * IMPORTANT:
 * - Bumping this will cause browsers to run `onupgradeneeded` for users whose DB is older.
 * - That upgrade can be BLOCKED by other tabs; we surface that via the `nemu:idb-blocked` UI event.
 */
const DB_VERSION = 11;
// Note: We always upgrade to DB_VERSION if the existing DB is older. This ensures
// canonical stores are created even for DBs that existed before they were added.
// The old MIN_COMPAT_VERSION approach caused bugs where local profile DBs at v4-v6
// would never get the canonical stores (libraryItems, sourceLinks, etc.).
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
  // Normalized canonical tables (mirrors Convex schema)
  libraryItems: "library_items",
  sourceLinks: "source_links",
  chapterProgress: "chapter_progress",
  mangaProgress: "manga_progress",
  // HLC state per profile
  hlcState: "hlc_state",
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
      emitIdbUiEvent({ dbName: DEFAULT_DB_NAME, requestedVersion: DB_VERSION, kind: "blocked" });
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
      // Close our DB if another tab is upgrading it (handles profile-specific DB names)
      if (msg.type === "close-db" && lastOpenedUserDb && lastOpenedUserDb.name === msg.dbName) {
        try {
          lastOpenedUserDb.close();
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
 * IndexedDB implementation of UserDataStore.
 *
 * Phase 6.6: Supports profile-specific databases via profileId parameter.
 * Each profile gets its own isolated DB: "nemu-user" (default) or "nemu-user::user:<id>".
 */
export class IndexedDBUserDataStore implements UserDataStore {
  private dbPromise: Promise<IDBDatabase> | null = null;
  readonly profileId: string;
  readonly dbName: string;

  /**
   * @param profileId - Optional profile ID. If provided, DB name becomes "nemu-user::{profileId}".
   *                    Typically "user:<userId>" for authenticated users, omit for local/anonymous.
   */
  constructor(profileId?: string) {
    this.profileId = profileId ?? "";
    this.dbName = this.profileId ? `${DEFAULT_DB_NAME}::${this.profileId}` : DEFAULT_DB_NAME;
    console.log("[IndexedDB] CREATED IndexedDBUserDataStore with profileId:", this.profileId, "dbName:", this.dbName);
  }

  /**
   * Get the DB name for this store (includes profile suffix if set).
   */
  private getDbName(): string {
    return this.dbName;
  }

  private getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      const dbName = this.getDbName();
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
            idbBroadcast?.postMessage({ type: "close-db", dbName: dbName, senderId: IDB_SENDER_ID });
          } catch {
            // ignore
          }

          let upgradeRequest: IDBOpenDBRequest;
          try {
            upgradeRequest = indexedDB.open(dbName, DB_VERSION);
          } catch (e) {
            reject(e);
            return;
          }

          // A versioned open was blocked by another tab's existing connection(s).
          // UI should tell the user to close other tabs/windows and reload.
          upgradeRequest.onblocked = () => {
            emitIdbUiEvent({ dbName: dbName, requestedVersion: DB_VERSION, kind: "blocked" });
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

            // Add normalized canonical stores (v5 -> v6)
            // library_items: keyed by libraryItemId
            if (!db.objectStoreNames.contains(STORES.libraryItems)) {
              const store = db.createObjectStore(STORES.libraryItems, { keyPath: "libraryItemId" });
              store.createIndex("by_updatedAt", "updatedAt", { unique: false });
            }

            // source_links: keyed by id (registryId:sourceId:sourceMangaId)
            if (!db.objectStoreNames.contains(STORES.sourceLinks)) {
              const store = db.createObjectStore(STORES.sourceLinks, { keyPath: "id" });
              store.createIndex("by_libraryItemId", "libraryItemId", { unique: false });
              store.createIndex("by_updatedAt", "updatedAt", { unique: false });
            }

            // chapter_progress: keyed by id (registryId:sourceId:sourceMangaId:sourceChapterId)
            if (!db.objectStoreNames.contains(STORES.chapterProgress)) {
              const store = db.createObjectStore(STORES.chapterProgress, { keyPath: "id" });
              store.createIndex("by_sourceManga", ["registryId", "sourceId", "sourceMangaId"], { unique: false });
              store.createIndex("by_lastReadAt", "lastReadAt", { unique: false });
              store.createIndex("by_updatedAt", "updatedAt", { unique: false });
            }

            // manga_progress: keyed by id (registryId:sourceId:sourceMangaId)
            if (!db.objectStoreNames.contains(STORES.mangaProgress)) {
              const store = db.createObjectStore(STORES.mangaProgress, { keyPath: "id" });
              store.createIndex("by_lastReadAt", "lastReadAt", { unique: false });
              store.createIndex("by_updatedAt", "updatedAt", { unique: false });
            }

            // HLC state store (keyed by profileId, default "default") (v6 -> v7)
            if (!db.objectStoreNames.contains(STORES.hlcState)) {
              db.createObjectStore(STORES.hlcState, { keyPath: "profileId" });
            }

            // Migration: Rename cursorId -> id in normalized stores (v6-v10 -> v11)
            // These stores were created with keyPath: "cursorId" but we renamed to "id".
            // We need to drop and recreate them - data will resync from cloud.
            // Note: v8-v10 DBs may also have wrong keyPath if created during dev transition.
            console.log("[IDB] Checking cursorId->id migration: oldVersion =", oldVersion, "condition =", oldVersion >= 6 && oldVersion < 11);
            if (oldVersion >= 6 && oldVersion < 11) {
              console.log("[IDB] Running cursorId->id migration - dropping and recreating stores with keyPath: id");
              // Drop and recreate source_links
              if (db.objectStoreNames.contains(STORES.sourceLinks)) {
                console.log("[IDB] Dropping source_links store");
                db.deleteObjectStore(STORES.sourceLinks);
              }
              {
                const store = db.createObjectStore(STORES.sourceLinks, { keyPath: "id" });
                store.createIndex("by_libraryItemId", "libraryItemId", { unique: false });
                store.createIndex("by_updatedAt", "updatedAt", { unique: false });
              }

              // Drop and recreate chapter_progress
              if (db.objectStoreNames.contains(STORES.chapterProgress)) {
                db.deleteObjectStore(STORES.chapterProgress);
              }
              {
                const store = db.createObjectStore(STORES.chapterProgress, { keyPath: "id" });
                store.createIndex("by_sourceManga", ["registryId", "sourceId", "sourceMangaId"], { unique: false });
                store.createIndex("by_lastReadAt", "lastReadAt", { unique: false });
                store.createIndex("by_updatedAt", "updatedAt", { unique: false });
              }

              // Drop and recreate manga_progress
              if (db.objectStoreNames.contains(STORES.mangaProgress)) {
                db.deleteObjectStore(STORES.mangaProgress);
              }
              {
                const store = db.createObjectStore(STORES.mangaProgress, { keyPath: "id" });
                store.createIndex("by_lastReadAt", "lastReadAt", { unique: false });
                store.createIndex("by_updatedAt", "updatedAt", { unique: false });
              }

              // Drop HLC state store (no longer needed in Phase 8)
              if (db.objectStoreNames.contains(STORES.hlcState)) {
                console.log("[IDB] Dropping hlcState store");
                db.deleteObjectStore(STORES.hlcState);
              }
              console.log("[IDB] cursorId->id migration complete");
            }
            
            // Debug: log store keyPaths after upgrade
            console.log("[IDB] Final store list:", Array.from(db.objectStoreNames));
          };
        };

        // Open current DB version first to avoid getting stuck behind a blocked versionchange
        // request. We'll only attempt a DB_VERSION open when necessary (fresh install or
        // existing DB is older than MIN_COMPAT_VERSION).
        let currentSawUpgradeNeeded = false;
        const currentRequest = indexedDB.open(dbName);

        try {
          currentRequest.onblocked = () => {
            emitIdbUiEvent({ dbName: dbName, kind: "blocked" });
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
            // If this DB is older than DB_VERSION, upgrade to get all stores/indexes.
            // Without this, DBs created before canonical stores were added would never upgrade.
            if (db.version > 0 && db.version < DB_VERSION) {
              try { db.close(); } catch { /* ignore */ }
              startUpgradeOpen();
              return;
            }
            db.onversionchange = () => {
              try { db.close(); } catch { /* ignore */ }
              emitIdbUiEvent({ dbName: dbName, kind: "versionchange" });
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

  // ============ LEGACY LIBRARY (internal only - for migration) ============

  /**
   * @internal Read legacy library data (for migration to canonical tables)
   * @deprecated Use getLibraryEntries() instead
   */
  async getLibrary(): Promise<LegacyLibraryManga[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.library, "readonly");
      const store = tx.objectStore(STORES.library);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const results = request.result
          .map((item) => {
            const parsed = LegacyLibraryMangaSchema.safeParse(item);
            return parsed.success ? parsed.data : null;
          })
          .filter((item): item is LegacyLibraryManga => item !== null);
        resolve(results);
      };
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

  // ============ PHASE 6: NORMALIZED CANONICAL STORES ============

  // ============ LIBRARY ITEMS ============

  async getLibraryItem(libraryItemId: string): Promise<LocalLibraryItem | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.libraryItems)) {
        resolve(null);
        return;
      }
      const tx = db.transaction(STORES.libraryItems, "readonly");
      const store = tx.objectStore(STORES.libraryItems);
      const request = store.get(libraryItemId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        const parsed = LocalLibraryItemSchema.safeParse(request.result);
        resolve(parsed.success ? parsed.data : null);
      };
    });
  }

  async getAllLibraryItems(options?: { includeRemoved?: boolean }): Promise<LocalLibraryItem[]> {
    console.log("[IndexedDB] getAllLibraryItems() called on store with profileId:", this.profileId, "dbName:", this.dbName);
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.libraryItems)) {
        console.log("[IndexedDB] getAllLibraryItems() - store does not exist, returning []");
        resolve([]);
        return;
      }
      const tx = db.transaction(STORES.libraryItems, "readonly");
      const store = tx.objectStore(STORES.libraryItems);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        console.log("[IndexedDB] getAllLibraryItems() raw results:", request.result.length);
        const parsed = request.result
          .map((item) => {
            const parsed = LocalLibraryItemSchema.safeParse(item);
            return parsed.success ? parsed.data : null;
          })
          .filter((item): item is LocalLibraryItem => item !== null);
        console.log("[IndexedDB] getAllLibraryItems() after parse:", parsed.length);

        if (options?.includeRemoved) {
          resolve(parsed);
          return;
        }

        const filtered = parsed.filter((item) => item.inLibrary !== false);
        console.log("[IndexedDB] getAllLibraryItems() after filter inLibrary:", filtered.length);
        resolve(filtered);
      };
    });
  }

  async saveLibraryItem(item: LocalLibraryItem): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.libraryItems)) {
        resolve();
        return;
      }
      const tx = db.transaction(STORES.libraryItems, "readwrite");
      const store = tx.objectStore(STORES.libraryItems);
      const request = store.put(item);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async saveLibraryItemsBatch(items: LocalLibraryItem[]): Promise<void> {
    if (items.length === 0) return;
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.libraryItems)) {
        resolve();
        return;
      }
      const tx = db.transaction(STORES.libraryItems, "readwrite");
      const store = tx.objectStore(STORES.libraryItems);
      
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();

      for (const item of items) {
        store.put(item);
      }
    });
  }

  async removeLibraryItem(libraryItemId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.libraryItems)) {
        resolve();
        return;
      }
      const tx = db.transaction(STORES.libraryItems, "readwrite");
      const store = tx.objectStore(STORES.libraryItems);
      const request = store.delete(libraryItemId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // ============ SOURCE LINKS ============

  async getSourceLink(id: string): Promise<LocalSourceLink | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.sourceLinks)) {
        resolve(null);
        return;
      }
      const tx = db.transaction(STORES.sourceLinks, "readonly");
      const store = tx.objectStore(STORES.sourceLinks);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        const parsed = LocalSourceLinkSchema.safeParse(request.result);
        resolve(parsed.success ? parsed.data : null);
      };
    });
  }

  async getSourceLinksForLibraryItem(libraryItemId: string): Promise<LocalSourceLink[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.sourceLinks)) {
        resolve([]);
        return;
      }
      const tx = db.transaction(STORES.sourceLinks, "readonly");
      const store = tx.objectStore(STORES.sourceLinks);
      
      let request: IDBRequest<IDBCursorWithValue | null>;
      try {
        const index = store.index("by_libraryItemId");
        request = index.openCursor(IDBKeyRange.only(libraryItemId));
      } catch {
        // Fallback if index doesn't exist
        request = store.openCursor();
      }

      const results: LocalSourceLink[] = [];
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(results);
          return;
        }
        const parsed = LocalSourceLinkSchema.safeParse(cursor.value);
        if (parsed.success && parsed.data.libraryItemId === libraryItemId) {
          results.push(parsed.data);
        }
        cursor.continue();
      };
    });
  }

  async saveSourceLink(link: LocalSourceLink): Promise<void> {
    const db = await this.getDB();
    console.log("[IDB] saveSourceLink called with link:", { id: link.id, hasId: "id" in link, keys: Object.keys(link) });
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.sourceLinks)) {
        resolve();
        return;
      }
      const tx = db.transaction(STORES.sourceLinks, "readwrite");
      const store = tx.objectStore(STORES.sourceLinks);
      console.log("[IDB] sourceLinks store keyPath:", store.keyPath);
      const request = store.put(link);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async saveSourceLinksBatch(links: LocalSourceLink[]): Promise<void> {
    if (links.length === 0) return;
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.sourceLinks)) {
        resolve();
        return;
      }
      const tx = db.transaction(STORES.sourceLinks, "readwrite");
      const store = tx.objectStore(STORES.sourceLinks);
      
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();

      for (const link of links) {
        store.put(link);
      }
    });
  }

  async deleteSourceLink(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.sourceLinks)) {
        resolve();
        return;
      }
      const tx = db.transaction(STORES.sourceLinks, "readwrite");
      const store = tx.objectStore(STORES.sourceLinks);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getAllSourceLinks(): Promise<LocalSourceLink[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.sourceLinks)) {
        resolve([]);
        return;
      }
      const tx = db.transaction(STORES.sourceLinks, "readonly");
      const store = tx.objectStore(STORES.sourceLinks);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const parsed = request.result
          .map((item) => {
            const parsed = LocalSourceLinkSchema.safeParse(item);
            return parsed.success ? parsed.data : null;
          })
          .filter((item): item is LocalSourceLink => item !== null);
        resolve(parsed);
      };
    });
  }

  /**
   * Get all library entries (items joined with their source links).
   * This is the canonical way to load library data for UI.
   */
  async getLibraryEntries(): Promise<Array<{ item: LocalLibraryItem; sources: LocalSourceLink[] }>> {
    console.log("[IndexedDB] getLibraryEntries() called on store with profileId:", this.profileId);
    const [items, allLinks] = await Promise.all([
      this.getAllLibraryItems(),
      this.getAllSourceLinks(),
    ]);
    console.log("[IndexedDB] getLibraryEntries() got items:", items.length, "links:", allLinks.length);

    // Group source links by libraryItemId
    const linksByItem = new Map<string, LocalSourceLink[]>();
    for (const link of allLinks) {
      const existing = linksByItem.get(link.libraryItemId) ?? [];
      existing.push(link);
      linksByItem.set(link.libraryItemId, existing);
    }

    // Join items with their sources
    const result = items
      .filter((item) => item.inLibrary !== false)
      .map((item) => ({
        item,
        sources: linksByItem.get(item.libraryItemId) ?? [],
      }));
    const missing = result.filter((e) => e.sources.length === 0);
    if (missing.length > 0) {
      console.warn(
        "[IndexedDB] getLibraryEntries(): found entries missing source links (corrupt).",
        { profileId: this.profileId, count: missing.length, libraryItemIds: missing.map((e) => e.item.libraryItemId) }
      );
    }
    console.log("[IndexedDB] getLibraryEntries() returning:", result.length, "entries");
    return result;
  }

  // ============ CHAPTER PROGRESS ============

  async getChapterProgressEntry(id: string): Promise<LocalChapterProgress | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.chapterProgress)) {
        resolve(null);
        return;
      }
      const tx = db.transaction(STORES.chapterProgress, "readonly");
      const store = tx.objectStore(STORES.chapterProgress);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        const parsed = LocalChapterProgressSchema.safeParse(request.result);
        resolve(parsed.success ? parsed.data : null);
      };
    });
  }

  async getChapterProgressForManga(
    registryId: string,
    sourceId: string,
    sourceMangaId: string
  ): Promise<Record<string, LocalChapterProgress>> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.chapterProgress)) {
        resolve({});
        return;
      }
      const tx = db.transaction(STORES.chapterProgress, "readonly");
      const store = tx.objectStore(STORES.chapterProgress);
      
      let request: IDBRequest<IDBCursorWithValue | null>;
      try {
        const index = store.index("by_sourceManga");
        const range = IDBKeyRange.only([registryId, sourceId, sourceMangaId]);
        request = index.openCursor(range);
      } catch {
        // Fallback: scan all
        request = store.openCursor();
      }

      const result: Record<string, LocalChapterProgress> = {};
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) {
          resolve(result);
          return;
        }
        const parsed = LocalChapterProgressSchema.safeParse(cursor.value);
        if (parsed.success) {
          if (
            parsed.data.registryId === registryId &&
            parsed.data.sourceId === sourceId &&
            parsed.data.sourceMangaId === sourceMangaId
          ) {
            result[parsed.data.sourceChapterId] = parsed.data;
          }
        }
        cursor.continue();
      };
    });
  }

  async getRecentChapterProgress(limit: number): Promise<LocalChapterProgress[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.chapterProgress)) {
        resolve([]);
        return;
      }
      const tx = db.transaction(STORES.chapterProgress, "readonly");
      const store = tx.objectStore(STORES.chapterProgress);
      const index = store.index("by_lastReadAt");
      const request = index.openCursor(null, "prev"); // Descending

      const results: LocalChapterProgress[] = [];
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && results.length < limit) {
          const parsed = LocalChapterProgressSchema.safeParse(cursor.value);
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

  async getAllChapterProgress(): Promise<LocalChapterProgress[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.chapterProgress)) {
        resolve([]);
        return;
      }
      const tx = db.transaction(STORES.chapterProgress, "readonly");
      const store = tx.objectStore(STORES.chapterProgress);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const results = request.result
          .map((item) => {
            const parsed = LocalChapterProgressSchema.safeParse(item);
            return parsed.success ? parsed.data : null;
          })
          .filter((item): item is LocalChapterProgress => item !== null);
        resolve(results);
      };
    });
  }

  async saveChapterProgressEntry(entry: LocalChapterProgress): Promise<void> {
    const db = await this.getDB();
    console.log("[IDB] saveChapterProgressEntry called with entry:", { id: entry.id, hasId: "id" in entry, keys: Object.keys(entry) });
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.chapterProgress)) {
        resolve();
        return;
      }
      const tx = db.transaction(STORES.chapterProgress, "readwrite");
      const store = tx.objectStore(STORES.chapterProgress);
      console.log("[IDB] chapterProgress store keyPath:", store.keyPath);

      // High-water mark merge on save
      const getRequest = store.get(entry.id);
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => {
        const existing = getRequest.result as LocalChapterProgress | undefined;
        const merged: LocalChapterProgress = existing
          ? {
              ...entry,
              progress: Math.max(existing.progress, entry.progress),
              total: Math.max(existing.total, entry.total),
              completed: existing.completed || entry.completed,
              lastReadAt: Math.max(existing.lastReadAt, entry.lastReadAt),
              updatedAt: Math.max(existing.updatedAt, entry.updatedAt),
            }
          : entry;

        const putRequest = store.put(merged);
        putRequest.onerror = () => reject(putRequest.error);
        putRequest.onsuccess = () => resolve();
      };
    });
  }

  async saveChapterProgressBatch(entries: LocalChapterProgress[]): Promise<void> {
    if (entries.length === 0) return;
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.chapterProgress)) {
        resolve();
        return;
      }
      const tx = db.transaction(STORES.chapterProgress, "readwrite");
      const store = tx.objectStore(STORES.chapterProgress);
      
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();

      // For batch, we do simple upserts without merge (caller is responsible for merging)
      for (const entry of entries) {
        store.put(entry);
      }
    });
  }

  async removeChapterProgress(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.chapterProgress)) {
        resolve();
        return;
      }
      const tx = db.transaction(STORES.chapterProgress, "readwrite");
      const store = tx.objectStore(STORES.chapterProgress);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // ============ MANGA PROGRESS ============

  async getMangaProgressEntry(id: string): Promise<LocalMangaProgress | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.mangaProgress)) {
        resolve(null);
        return;
      }
      const tx = db.transaction(STORES.mangaProgress, "readonly");
      const store = tx.objectStore(STORES.mangaProgress);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        const parsed = LocalMangaProgressSchema.safeParse(request.result);
        resolve(parsed.success ? parsed.data : null);
      };
    });
  }

  async getRecentMangaProgress(limit: number): Promise<LocalMangaProgress[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.mangaProgress)) {
        resolve([]);
        return;
      }
      const tx = db.transaction(STORES.mangaProgress, "readonly");
      const store = tx.objectStore(STORES.mangaProgress);
      const index = store.index("by_lastReadAt");
      const request = index.openCursor(null, "prev"); // Descending

      const results: LocalMangaProgress[] = [];
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && results.length < limit) {
          const parsed = LocalMangaProgressSchema.safeParse(cursor.value);
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

  async getAllMangaProgress(): Promise<LocalMangaProgress[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.mangaProgress)) {
        resolve([]);
        return;
      }
      const tx = db.transaction(STORES.mangaProgress, "readonly");
      const store = tx.objectStore(STORES.mangaProgress);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const results = request.result
          .map((item) => {
            const parsed = LocalMangaProgressSchema.safeParse(item);
            return parsed.success ? parsed.data : null;
          })
          .filter((item): item is LocalMangaProgress => item !== null);
        resolve(results);
      };
    });
  }

  async saveMangaProgressEntry(entry: LocalMangaProgress): Promise<void> {
    const db = await this.getDB();
    console.log("[IDB] saveMangaProgressEntry called with entry:", { id: entry.id, hasId: "id" in entry, keys: Object.keys(entry) });
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.mangaProgress)) {
        resolve();
        return;
      }
      const tx = db.transaction(STORES.mangaProgress, "readwrite");
      const store = tx.objectStore(STORES.mangaProgress);
      console.log("[IDB] mangaProgress store keyPath:", store.keyPath);

      // Only update if newer (materialized summary)
      const getRequest = store.get(entry.id);
      getRequest.onerror = () => reject(getRequest.error);
      getRequest.onsuccess = () => {
        const existing = getRequest.result as LocalMangaProgress | undefined;
        const shouldUpdate = !existing || entry.lastReadAt >= existing.lastReadAt;
        
        if (shouldUpdate) {
          const putRequest = store.put(entry);
          putRequest.onerror = () => reject(putRequest.error);
          putRequest.onsuccess = () => resolve();
        } else {
          resolve();
        }
      };
    });
  }

  async saveMangaProgressBatch(entries: LocalMangaProgress[]): Promise<void> {
    if (entries.length === 0) return;
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.mangaProgress)) {
        resolve();
        return;
      }
      const tx = db.transaction(STORES.mangaProgress, "readwrite");
      const store = tx.objectStore(STORES.mangaProgress);
      
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();

      for (const entry of entries) {
        store.put(entry);
      }
    });
  }

  async removeMangaProgress(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.mangaProgress)) {
        resolve();
        return;
      }
      const tx = db.transaction(STORES.mangaProgress, "readwrite");
      const store = tx.objectStore(STORES.mangaProgress);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Clear user-scoped data from this device.
   *
   * Used by "Sign out → Remove data from this device".
   *
   * Intentionally does NOT clear:
   * - registries (local-only app data)
   */
  async clearAccountData(): Promise<void> {
    const db = await this.getDB();

    const candidates: string[] = [
      STORES.library,
      STORES.history,
      STORES.settings,
      STORES.libraryItems,
      STORES.sourceLinks,
      STORES.chapterProgress,
      STORES.mangaProgress,
      STORES.hlcState,
    ];
    const storeNames = candidates.filter((name) => db.objectStoreNames.contains(name));
    if (storeNames.length === 0) return;

    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeNames, "readwrite");
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();

      for (const name of storeNames) {
        tx.objectStore(name).clear();
      }
    });
  }

  // ============ DIAGNOSTICS / INTEGRITY CHECKS ============

  private async countStore(storeName: string): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(storeName)) {
        resolve(0);
        return;
      }
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const request = store.count();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  /**
   * Raw counts of canonical tables (no filtering).
   *
   * Used by SyncProvider to detect "local wiped but cursors still advanced"
   * and force a full re-pull.
   */
  async getCanonicalCounts(): Promise<{
    libraryItems: number;
    sourceLinks: number;
    chapterProgress: number;
    mangaProgress: number;
  }> {
    const [libraryItems, sourceLinks, chapterProgress, mangaProgress] = await Promise.all([
      this.countStore(STORES.libraryItems),
      this.countStore(STORES.sourceLinks),
      this.countStore(STORES.chapterProgress),
      this.countStore(STORES.mangaProgress),
    ]);
    return { libraryItems, sourceLinks, chapterProgress, mangaProgress };
  }

  // ============ PHASE 6.6: PROFILE UTILITIES ============

  /**
   * Check if this profile has any library data.
   * Used to determine whether to prompt for import on sign-in.
   */
  async hasLibraryData(): Promise<boolean> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      if (!db.objectStoreNames.contains(STORES.library)) {
        resolve(false);
        return;
      }
      const tx = db.transaction(STORES.library, "readonly");
      const store = tx.objectStore(STORES.library);
      const request = store.count();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result > 0);
      };
    });
  }

}
