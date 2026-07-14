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

function profileCacheKey(profileId: string | undefined, key: string): string {
  const profile =
    profileId === undefined
      ? "anonymous"
      : `owned:${encodeURIComponent(profileId)}`;
  return `${PROFILE_CACHE_PREFIX}:${profile}:${key}`;
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
export class IndexedDBCacheStore implements CacheStore {
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
}

// Re-export CacheKeys from centralized keys module
export { CacheKeys } from "./keys";
