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

const DB_NAME = "nemu-user";
const DB_VERSION = 4; // Bumped for separate history store

const STORES = {
  library: "library",
  history: "history",
  settings: "settings",
  registries: "registries",
} as const;

const DEFAULT_SETTINGS: UserSettings = {
  installedSources: [],
};

/** Create composite key for history entry */
export function makeHistoryKey(
  registryId: string,
  sourceId: string,
  mangaId: string,
  chapterId: string
): string {
  return `${registryId}:${sourceId}:${mangaId}:${chapterId}`;
}

/** Create prefix for manga history queries */
function makeMangaHistoryPrefix(
  registryId: string,
  sourceId: string,
  mangaId: string
): string {
  return `${registryId}:${sourceId}:${mangaId}:`;
}

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
          const tx = (event.target as IDBOpenDBRequest).transaction!;
          const oldVersion = event.oldVersion;

          // Library store - keyed by id
          if (!db.objectStoreNames.contains(STORES.library)) {
            db.createObjectStore(STORES.library, { keyPath: "id" });
          }

          // History store - keyed by composite id, indexed by dateRead
          if (!db.objectStoreNames.contains(STORES.history)) {
            const historyStore = db.createObjectStore(STORES.history, { keyPath: "id" });
            historyStore.createIndex("by_dateRead", "dateRead", { unique: false });
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

  // ============ HISTORY (separate from library) ============

  async getHistoryEntry(
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string
  ): Promise<HistoryEntry | null> {
    const db = await this.getDB();
    const key = makeHistoryKey(registryId, sourceId, mangaId, chapterId);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.history, "readonly");
      const store = tx.objectStore(STORES.history);
      const request = store.get(key);

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
  }

  async saveHistoryEntry(entry: HistoryEntry): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.history, "readwrite");
      const store = tx.objectStore(STORES.history);
      const request = store.put(entry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getMangaHistory(
    registryId: string,
    sourceId: string,
    mangaId: string
  ): Promise<Record<string, HistoryEntry>> {
    const db = await this.getDB();
    const prefix = makeMangaHistoryPrefix(registryId, sourceId, mangaId);
    
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORES.history, "readonly");
      const store = tx.objectStore(STORES.history);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result: Record<string, HistoryEntry> = {};
        for (const item of request.result) {
          if ((item.id as string).startsWith(prefix)) {
            const parsed = HistoryEntrySchema.safeParse(item);
            if (parsed.success) {
              result[parsed.data.chapterId] = parsed.data;
            }
          }
        }
        resolve(result);
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
