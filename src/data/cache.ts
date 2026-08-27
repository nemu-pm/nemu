/**
 * Cache store for local-only data (WASMs, metadata, images, JSON)
 * Can be cleared without losing user data
 */
export interface CacheStore {
  get(key: string): Promise<ArrayBuffer | null>;
  set(key: string, data: ArrayBuffer): Promise<void>;
  getJson<T>(key: string): Promise<T | null>;
  setJson<T>(key: string, data: T): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

const PROFILE_CACHE_PREFIX = "profile-cache";

/**
 * Source packages are executable, account-independent artifacts. Keeping them
 * shared avoids downloading/compiling the same package again after an account
 * switch. Everything else may contain authenticated source data and must stay
 * inside the profile that created it.
 */
function isSharedSourcePackageKey(key: string): boolean {
  return key.startsWith("aix:");
}

/** Key prefix owning every user-content cache entry of one data profile. */
export function profileCacheKeyPrefix(profileId: string | undefined): string {
  const profile =
    profileId === undefined
      ? "anonymous"
      : `owned:${encodeURIComponent(profileId)}`;
  return `${PROFILE_CACHE_PREFIX}:${profile}:`;
}

function profileCacheKey(profileId: string | undefined, key: string): string {
  return `${profileCacheKeyPrefix(profileId)}${key}`;
}

/**
 * True for entries written before user content was namespaced per profile
 * (`image:…`, `manga:…`, `chapters:…`, …). Nothing reads them any more — the
 * profile-scoped store only ever looks under `profile-cache:…` — so they are
 * unreachable bytes that must be swept instead of leaking authenticated source
 * content forward forever. Shared source packages (`aix:…`) are still live.
 */
export function isLegacyUnscopedCacheKey(key: string): boolean {
  if (isSharedSourcePackageKey(key)) return false;
  return !key.startsWith(`${PROFILE_CACHE_PREFIX}:`);
}

/**
 * Bulk key maintenance, implemented by the real IndexedDB store only. It is
 * deliberately not part of `CacheStore`: read/write consumers (and their test
 * doubles) have no business enumerating other profiles' keys.
 */
export interface CacheStoreMaintenance {
  deleteMatchingKeys(predicate: (key: string) => boolean): Promise<number>;
}

/**
 * Binds user-content cache operations to one immutable data profile.
 *
 * The immutable binding is important during account switches: an async write
 * from a disposed source runtime continues writing to its original profile and
 * can never land in the newly-active account's namespace.
 */
export class ProfileScopedCacheStore implements CacheStore {
  private readonly store: CacheStore;
  private readonly profileId: string | undefined;

  constructor(
    store: CacheStore,
    profileId: string | undefined,
  ) {
    this.store = store;
    this.profileId = profileId;
  }

  private key(key: string): string {
    return isSharedSourcePackageKey(key)
      ? key
      : profileCacheKey(this.profileId, key);
  }

  get(key: string): Promise<ArrayBuffer | null> {
    return this.store.get(this.key(key));
  }

  set(key: string, data: ArrayBuffer): Promise<void> {
    return this.store.set(this.key(key), data);
  }

  getJson<T>(key: string): Promise<T | null> {
    return this.store.getJson<T>(this.key(key));
  }

  setJson<T>(key: string, data: T): Promise<void> {
    return this.store.setJson(this.key(key), data);
  }

  delete(key: string): Promise<void> {
    return this.store.delete(this.key(key));
  }

  /** Explicit cache clearing remains device-wide, matching the existing UI. */
  clear(): Promise<void> {
    return this.store.clear();
  }
}

const DB_NAME = "nemu-cache";
const DB_VERSION = 1;
const STORE_NAME = "cache";

/**
 * IndexedDB-backed cache store
 */
export class IndexedDBCacheStore implements CacheStore, CacheStoreMaintenance {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
      });
    }
    return this.dbPromise;
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? null);
    });
  }

  async set(key: string, data: ArrayBuffer): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(data, key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result ?? null);
      });
    } catch {
      return null;
    }
  }

  async setJson<T>(key: string, data: T): Promise<void> {
    try {
      const db = await this.getDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const request = store.put(data, key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch {
      // Silently fail - cache is best-effort
    }
  }

  async delete(key: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async clear(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * Delete every entry whose key satisfies `predicate`, in one transaction.
   * Resolves with the number of deleted entries.
   */
  async deleteMatchingKeys(predicate: (key: string) => boolean): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.openKeyCursor();
      let deleted = 0;

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const key = cursor.key;
        if (typeof key === "string" && predicate(key)) {
          store.delete(key);
          deleted += 1;
        }
        cursor.continue();
      };

      tx.onerror = () => reject(tx.error ?? new Error("Cache key sweep failed."));
      tx.onabort = () => reject(tx.error ?? new Error("Cache key sweep aborted."));
      tx.oncomplete = () => resolve(deleted);
    });
  }
}

let sharedMaintenanceStore: IndexedDBCacheStore | null = null;

function defaultMaintenanceStore(): CacheStoreMaintenance {
  sharedMaintenanceStore ??= new IndexedDBCacheStore();
  return sharedMaintenanceStore;
}

/**
 * Delete every cached user-content entry belonging to one data profile.
 *
 * Cached pages, covers and metadata for an authenticated profile can be
 * authenticated source content, so removing an account from this device has to
 * remove them too. Shared source packages (`aix:…`) are account-independent and
 * intentionally survive.
 */
export function deleteProfileCacheEntries(
  profileId: string | undefined,
  store: CacheStoreMaintenance = defaultMaintenanceStore(),
): Promise<number> {
  const prefix = profileCacheKeyPrefix(profileId);
  return store.deleteMatchingKeys((key) => key.startsWith(prefix));
}

const LEGACY_SWEEP_FLAG = "nemu:cache-legacy-sweep:v1";
let legacySweepPromise: Promise<number> | null = null;

/**
 * One-time garbage collection of pre-namespacing cache entries.
 *
 * Namespacing user content under `profile-cache:…` orphaned every entry written
 * by an older build: unreachable, unbounded, and potentially authenticated
 * source data. They cannot be attributed to a profile after the fact, so they
 * are deleted rather than migrated. Best-effort and idempotent — the flag only
 * avoids repeating the scan.
 */
export function sweepLegacyCacheEntries(
  store: CacheStoreMaintenance = defaultMaintenanceStore(),
): Promise<number> {
  return store.deleteMatchingKeys(isLegacyUnscopedCacheKey);
}

export function sweepLegacyCacheEntriesOnce(
  store: CacheStoreMaintenance = defaultMaintenanceStore(),
): Promise<number> {
  if (legacySweepPromise) return legacySweepPromise;

  let alreadySwept = false;
  try {
    alreadySwept = localStorage.getItem(LEGACY_SWEEP_FLAG) === "1";
  } catch {
    // No localStorage (private mode, RN): fall back to once per session.
  }
  if (alreadySwept) return Promise.resolve(0);

  legacySweepPromise = sweepLegacyCacheEntries(store)
    .then((deleted) => {
      try {
        localStorage.setItem(LEGACY_SWEEP_FLAG, "1");
      } catch {
        // ignore
      }
      if (deleted > 0) {
        console.log(`[cache] Removed ${deleted} un-namespaced legacy cache entries.`);
      }
      return deleted;
    })
    .catch((error) => {
      // Do not persist the flag: retry on the next launch.
      console.error("[cache] Legacy cache sweep failed:", error);
      legacySweepPromise = null;
      return 0;
    });

  return legacySweepPromise;
}

// Re-export CacheKeys from centralized keys module
export { CacheKeys } from "./keys";
