/**
 * Repository adapters (Phase 7)
 *
 * Bridges between IndexedDBUserDataStore and SyncCore's repository interfaces.
 * This allows SyncCore to work with the existing local storage implementation.
 */

import type { IndexedDBUserDataStore } from "@/data/indexeddb";
import type { CompositeCursor, IntentClock } from "@/data/schema";
import type { UserSettings } from "@/data/schema";
import type {
  LibraryItemRepo,
  SourceLinkRepo,
  ChapterProgressRepo,
  MangaProgressRepo,
} from "./apply";
import type { SyncMetaRepo, PendingOpsRepo, HLCManager } from "./SyncCore";
import type { PendingOp } from "./types";
import { HLC } from "../hlc";

// ============================================================================
// Sync meta repository adapter (cursors)
// ============================================================================

const PENDING_STORE = "sync_pending";
const SYNC_META_STORE = "sync_meta";
const DEFAULT_SYNC_DB_NAME = "nemu-sync";
const DB_VERSION = 1;

/**
 * Clear all SyncCore state for a profile (pending ops + cursors).
 *
 * Used by: "Sign out → Remove data from this device".
 *
 * Note: we clear stores instead of deleteDatabase() to avoid "blocked" issues
 * when other tabs or open connections exist.
 */
export async function clearSyncState(profileId?: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const dbName = profileId ? `${DEFAULT_SYNC_DB_NAME}::${profileId}` : DEFAULT_SYNC_DB_NAME;

  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        db.createObjectStore(PENDING_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SYNC_META_STORE)) {
        db.createObjectStore(SYNC_META_STORE, { keyPath: "key" });
      }
    };
  });

  const stores = [PENDING_STORE, SYNC_META_STORE].filter((s) => db.objectStoreNames.contains(s));
  if (stores.length === 0) return;

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(stores, "readwrite");
    tx.onerror = () => reject(tx.error);
    tx.oncomplete = () => resolve();
    for (const s of stores) {
      tx.objectStore(s).clear();
    }
  });
}

/**
 * Creates a SyncMetaRepo adapter backed by IndexedDB.
 * Stores composite cursors in a separate sync DB.
 */
export function createSyncMetaRepo(profileId?: string): SyncMetaRepo {
  const dbName = profileId ? `${DEFAULT_SYNC_DB_NAME}::${profileId}` : DEFAULT_SYNC_DB_NAME;
  let dbPromise: Promise<IDBDatabase> | null = null;

  const getDB = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(PENDING_STORE)) {
            db.createObjectStore(PENDING_STORE, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(SYNC_META_STORE)) {
            db.createObjectStore(SYNC_META_STORE, { keyPath: "key" });
          }
        };
      });
    }
    return dbPromise;
  };

  return {
    async getCompositeCursor(key: string): Promise<CompositeCursor> {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(SYNC_META_STORE, "readonly");
        const store = tx.objectStore(SYNC_META_STORE);
        const request = store.get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const result = request.result as { key: string; value: CompositeCursor } | undefined;
          if (!result) {
            resolve({ updatedAt: 0, cursorId: "" });
            return;
          }
          // Handle legacy number-only cursor
          if (typeof result.value === "number") {
            resolve({ updatedAt: result.value, cursorId: "" });
            return;
          }
          resolve(result.value);
        };
      });
    },

    async setCompositeCursor(key: string, cursor: CompositeCursor): Promise<void> {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(SYNC_META_STORE, "readwrite");
        const store = tx.objectStore(SYNC_META_STORE);
        const request = store.put({ key, value: cursor });
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },
  };
}

// ============================================================================
// Pending operations repository adapter
// ============================================================================

/**
 * Creates a PendingOpsRepo adapter backed by IndexedDB.
 */
export function createPendingOpsRepo(profileId?: string): PendingOpsRepo {
  const dbName = profileId ? `${DEFAULT_SYNC_DB_NAME}::${profileId}` : DEFAULT_SYNC_DB_NAME;
  let dbPromise: Promise<IDBDatabase> | null = null;

  const getDB = (): Promise<IDBDatabase> => {
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, DB_VERSION);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(PENDING_STORE)) {
            db.createObjectStore(PENDING_STORE, { keyPath: "id" });
          }
          if (!db.objectStoreNames.contains(SYNC_META_STORE)) {
            db.createObjectStore(SYNC_META_STORE, { keyPath: "key" });
          }
        };
      });
    }
    return dbPromise;
  };

  return {
    async addPendingOp(op: Omit<PendingOp, "id">): Promise<string> {
      const db = await getDB();
      const id = `${op.table}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const pending: PendingOp = { ...op, id };

      return new Promise((resolve, reject) => {
        const tx = db.transaction(PENDING_STORE, "readwrite");
        const store = tx.objectStore(PENDING_STORE);
        const request = store.put(pending);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(id);
      });
    },

    async getPendingOps(): Promise<PendingOp[]> {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PENDING_STORE, "readonly");
        const store = tx.objectStore(PENDING_STORE);
        const request = store.getAll();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const sorted = (request.result as PendingOp[]).sort(
            (a, b) => a.timestamp - b.timestamp
          );
          resolve(sorted);
        };
      });
    },

    async removePendingOp(id: string): Promise<void> {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PENDING_STORE, "readwrite");
        const store = tx.objectStore(PENDING_STORE);
        const request = store.delete(id);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    },

    async updatePendingOpRetries(id: string, retries: number): Promise<void> {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PENDING_STORE, "readwrite");
        const store = tx.objectStore(PENDING_STORE);
        const getReq = store.get(id);
        getReq.onsuccess = () => {
          if (getReq.result) {
            const updated = { ...getReq.result, retries };
            const putReq = store.put(updated);
            putReq.onerror = () => reject(putReq.error);
            putReq.onsuccess = () => resolve();
          } else {
            resolve();
          }
        };
        getReq.onerror = () => reject(getReq.error);
      });
    },

    async getPendingCount(): Promise<number> {
      const db = await getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(PENDING_STORE, "readonly");
        const store = tx.objectStore(PENDING_STORE);
        const request = store.count();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
    },
  };
}

// ============================================================================
// HLC manager adapter
// ============================================================================

/**
 * Creates an HLCManager adapter backed by IndexedDBUserDataStore.
 */
export function createHLCManager(localStore: IndexedDBUserDataStore, profileId: string = "default"): HLCManager {
  const hlc = new HLC();
  let initialized = false;

  const ensureInitialized = async (): Promise<void> => {
    if (initialized) return;
    try {
      const persisted = await localStore.getHLCState(profileId);
      if (persisted) {
        hlc.restore(persisted);
      }
      initialized = true;
    } catch (error) {
      console.error("[HLCManager] Failed to initialize:", error);
      initialized = true; // Continue with default state
    }
  };

  return {
    async generateIntentClock(): Promise<IntentClock> {
      await ensureInitialized();
      const clock = hlc.now();
      // Persist updated state (fire-and-forget)
      localStore.saveHLCState(hlc.getState(), profileId).catch((err) => {
        console.error("[HLCManager] Failed to persist HLC state:", err);
      });
      return clock;
    },

    async receiveIntentClock(remoteClock: IntentClock): Promise<void> {
      await ensureInitialized();
      hlc.receive(remoteClock);
      // Persist updated state (fire-and-forget)
      localStore.saveHLCState(hlc.getState(), profileId).catch((err) => {
        console.error("[HLCManager] Failed to persist HLC state:", err);
      });
    },
  };
}

// ============================================================================
// Data repository adapters (delegate to IndexedDBUserDataStore)
// ============================================================================

/**
 * Creates a LibraryItemRepo adapter backed by IndexedDBUserDataStore.
 */
export function createLibraryItemRepo(localStore: IndexedDBUserDataStore): LibraryItemRepo {
  return {
    getLibraryItem: (id) => localStore.getLibraryItem(id),
    saveLibraryItem: (item) => localStore.saveLibraryItem(item),
  };
}

/**
 * Creates a SourceLinkRepo adapter backed by IndexedDBUserDataStore.
 */
export function createSourceLinkRepo(localStore: IndexedDBUserDataStore): SourceLinkRepo {
  return {
    getSourceLink: (cursorId) => localStore.getSourceLink(cursorId),
    saveSourceLink: (link) => localStore.saveSourceLink(link),
    removeSourceLink: (cursorId) => localStore.removeSourceLink(cursorId),
  };
}

/**
 * Creates a ChapterProgressRepo adapter backed by IndexedDBUserDataStore.
 */
export function createChapterProgressRepo(localStore: IndexedDBUserDataStore): ChapterProgressRepo {
  return {
    getChapterProgressEntry: (cursorId) => localStore.getChapterProgressEntry(cursorId),
    saveChapterProgressEntry: (entry) => localStore.saveChapterProgressEntry(entry),
  };
}

/**
 * Creates a MangaProgressRepo adapter backed by IndexedDBUserDataStore.
 */
export function createMangaProgressRepo(localStore: IndexedDBUserDataStore): MangaProgressRepo {
  return {
    saveMangaProgressEntry: (entry) => localStore.saveMangaProgressEntry(entry),
  };
}

// ============================================================================
// Full SyncCoreRepos factory
// ============================================================================

import type { SyncCoreRepos } from "./SyncCore";

/**
 * Creates all repositories needed by SyncCore from an IndexedDBUserDataStore.
 */
export function createSyncCoreRepos(
  localStore: IndexedDBUserDataStore,
  profileId?: string
): SyncCoreRepos {
  return {
    libraryItems: createLibraryItemRepo(localStore),
    sourceLinks: createSourceLinkRepo(localStore),
    chapterProgress: createChapterProgressRepo(localStore),
    mangaProgress: createMangaProgressRepo(localStore),
    syncMeta: createSyncMetaRepo(profileId),
    pendingOps: createPendingOpsRepo(profileId),
    hlc: createHLCManager(localStore, profileId ?? "default"),
    settings: {
      getSettings: () => localStore.getSettings() as Promise<UserSettings>,
      saveSettings: (s) => localStore.saveSettings(s),
    },
  };
}

