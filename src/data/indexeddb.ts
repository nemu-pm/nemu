import type { UserDataStore } from "./store";
import type {
  LibraryManga,
  ReadingHistory,
  InstalledSource,
  SourceRegistry,
} from "./schema";
import {
  LibraryMangaSchema,
  ReadingHistorySchema,
  InstalledSourceSchema,
  SourceRegistrySchema,
} from "./schema";

const DB_NAME = "nemu-user";
const DB_VERSION = 2; // Bumped for registryId in history

const STORES = {
  library: "library",
  history: "history",
  sources: "sources",
  registries: "registries",
} as const;

/**
 * IndexedDB implementation of UserDataStore
 */
export class IndexedDBUserDataStore implements UserDataStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);

        request.onupgradeneeded = (event) => {
          const db = (event.target as IDBOpenDBRequest).result;

          // Library store - keyed by id
          if (!db.objectStoreNames.contains(STORES.library)) {
            db.createObjectStore(STORES.library, { keyPath: "id" });
          }

          // History store - keyed by composite key (now includes registryId)
          if (db.objectStoreNames.contains(STORES.history)) {
            db.deleteObjectStore(STORES.history);
          }
          const historyStore = db.createObjectStore(STORES.history, {
            keyPath: ["registryId", "sourceId", "mangaId", "chapterId"],
          });
          historyStore.createIndex("byManga", ["registryId", "sourceId", "mangaId"]);

          // Sources store - keyed by id
          if (!db.objectStoreNames.contains(STORES.sources)) {
            db.createObjectStore(STORES.sources, { keyPath: "id" });
          }

          // Registries store - keyed by id
          if (!db.objectStoreNames.contains(STORES.registries)) {
            db.createObjectStore(STORES.registries, { keyPath: "id" });
          }
        };
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

  // ============ HISTORY ============

  async getHistory(
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string
  ): Promise<ReadingHistory | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.history, "readonly");
      const store = tx.objectStore(STORES.history);
      const request = store.get([registryId, sourceId, mangaId, chapterId]);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        const parsed = ReadingHistorySchema.safeParse(request.result);
        resolve(parsed.success ? parsed.data : null);
      };
    });
  }

  async getHistoryForManga(
    registryId: string,
    sourceId: string,
    mangaId: string
  ): Promise<ReadingHistory[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.history, "readonly");
      const store = tx.objectStore(STORES.history);
      const index = store.index("byManga");
      const request = index.getAll([registryId, sourceId, mangaId]);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const results = request.result
          .map((item) => {
            const parsed = ReadingHistorySchema.safeParse(item);
            return parsed.success ? parsed.data : null;
          })
          .filter((item): item is ReadingHistory => item !== null);
        resolve(results);
      };
    });
  }

  async saveHistory(history: ReadingHistory): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.history, "readwrite");
      const store = tx.objectStore(STORES.history);
      const request = store.put(history);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // ============ INSTALLED SOURCES ============

  async getInstalledSources(): Promise<InstalledSource[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.sources, "readonly");
      const store = tx.objectStore(STORES.sources);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const results = request.result
          .map((item) => {
            const parsed = InstalledSourceSchema.safeParse(item);
            return parsed.success ? parsed.data : null;
          })
          .filter((item): item is InstalledSource => item !== null);
        resolve(results);
      };
    });
  }

  async getInstalledSource(id: string): Promise<InstalledSource | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.sources, "readonly");
      const store = tx.objectStore(STORES.sources);
      const request = store.get(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        const parsed = InstalledSourceSchema.safeParse(request.result);
        resolve(parsed.success ? parsed.data : null);
      };
    });
  }

  async saveInstalledSource(source: InstalledSource): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.sources, "readwrite");
      const store = tx.objectStore(STORES.sources);
      const request = store.put(source);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async removeInstalledSource(id: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.sources, "readwrite");
      const store = tx.objectStore(STORES.sources);
      const request = store.delete(id);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // ============ REGISTRIES ============

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

// Singleton instance
let userDataStoreInstance: UserDataStore | null = null;

export function getUserDataStore(): UserDataStore {
  if (!userDataStoreInstance) {
    userDataStoreInstance = new IndexedDBUserDataStore();
  }
  return userDataStoreInstance;
}
