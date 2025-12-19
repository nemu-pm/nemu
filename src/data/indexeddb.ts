import type { UserDataStore } from "./store";
import type {
  LibraryManga,
  ChapterProgress,
  InstalledSource,
  SourceRegistry,
  UserSettings,
} from "./schema";
import {
  LibraryMangaSchema,
  SourceRegistrySchema,
  UserSettingsSchema,
} from "./schema";

const DB_NAME = "nemu-user";
const DB_VERSION = 3; // Bumped for embedded history + settings

const STORES = {
  library: "library",
  settings: "settings",
  registries: "registries",
} as const;

const DEFAULT_SETTINGS: UserSettings = {
  readingMode: "rtl",
  installedSources: [],
};

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

          // Library store - keyed by id (history embedded)
          if (!db.objectStoreNames.contains(STORES.library)) {
            db.createObjectStore(STORES.library, { keyPath: "id" });
          }

          // Remove old history store if exists
          if (db.objectStoreNames.contains("history")) {
            db.deleteObjectStore("history");
          }

          // Remove old sources store if exists (now in settings)
          if (db.objectStoreNames.contains("sources")) {
            db.deleteObjectStore("sources");
          }

          // Settings store - single record with id="default"
          if (!db.objectStoreNames.contains(STORES.settings)) {
            db.createObjectStore(STORES.settings, { keyPath: "id" });
          }

          // Registries store - keyed by id (local only)
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

  // ============ CHAPTER PROGRESS (embedded in library) ============

  async getChapterProgress(mangaId: string, chapterId: string): Promise<ChapterProgress | null> {
    const manga = await this.getLibraryManga(mangaId);
    if (!manga) return null;
    return manga.history[chapterId] ?? null;
  }

  async saveChapterProgress(
    mangaId: string,
    chapterId: string,
    progress: ChapterProgress
  ): Promise<void> {
    const manga = await this.getLibraryManga(mangaId);
    if (!manga) return; // Can't save progress for non-library manga

    manga.history[chapterId] = progress;
    await this.saveLibraryManga(manga);
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
