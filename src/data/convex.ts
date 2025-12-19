import type { ConvexReactClient } from "convex/react";
import type { UserDataStore } from "./store";
import type {
  LibraryManga,
  ChapterProgress,
  InstalledSource,
  SourceRegistry,
  UserSettings,
} from "./schema";
import { api } from "../../convex/_generated/api";

/**
 * Convex implementation of UserDataStore
 * Used when user is signed in
 */
export class ConvexUserDataStore implements UserDataStore {
  constructor(private client: ConvexReactClient) {}

  // ============ LIBRARY ============

  async getLibrary(): Promise<LibraryManga[]> {
    const result = await this.client.query(api.library.list);
    return result.map((item) => ({
      id: item.mangaId,
      title: item.title,
      cover: item.cover,
      addedAt: item.addedAt,
      sources: item.sources,
      activeRegistryId: item.activeRegistryId,
      activeSourceId: item.activeSourceId,
      history: item.history as Record<string, ChapterProgress>,
    }));
  }

  async getLibraryManga(id: string): Promise<LibraryManga | null> {
    const item = await this.client.query(api.library.get, { mangaId: id });
    if (!item) return null;
    return {
      id: item.mangaId,
      title: item.title,
      cover: item.cover,
      addedAt: item.addedAt,
      sources: item.sources,
      activeRegistryId: item.activeRegistryId,
      activeSourceId: item.activeSourceId,
      history: item.history as Record<string, ChapterProgress>,
    };
  }

  async saveLibraryManga(manga: LibraryManga): Promise<void> {
    await this.client.mutation(api.library.save, {
      mangaId: manga.id,
      title: manga.title,
      cover: manga.cover,
      addedAt: manga.addedAt,
      sources: manga.sources,
      activeRegistryId: manga.activeRegistryId,
      activeSourceId: manga.activeSourceId,
      history: manga.history,
    });
  }

  async removeLibraryManga(id: string): Promise<void> {
    await this.client.mutation(api.library.remove, { mangaId: id });
  }

  // ============ CHAPTER PROGRESS ============

  async getChapterProgress(
    mangaId: string,
    chapterId: string
  ): Promise<ChapterProgress | null> {
    const manga = await this.getLibraryManga(mangaId);
    if (!manga) return null;
    return manga.history[chapterId] ?? null;
  }

  async saveChapterProgress(
    mangaId: string,
    chapterId: string,
    progress: ChapterProgress
  ): Promise<void> {
    await this.client.mutation(api.library.saveChapterProgress, {
      mangaId,
      chapterId,
      progress,
    });
  }

  // ============ SETTINGS ============

  async getSettings(): Promise<UserSettings> {
    const result = await this.client.query(api.settings.get);
    return {
      readingMode: result.readingMode,
      installedSources: result.installedSources,
    };
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    await this.client.mutation(api.settings.save, settings);
  }

  // ============ INSTALLED SOURCES ============

  async getInstalledSources(): Promise<InstalledSource[]> {
    const settings = await this.getSettings();
    return settings.installedSources;
  }

  async getInstalledSource(id: string): Promise<InstalledSource | null> {
    const settings = await this.getSettings();
    return settings.installedSources.find((s) => s.id === id) ?? null;
  }

  async saveInstalledSource(source: InstalledSource): Promise<void> {
    await this.client.mutation(api.settings.addInstalledSource, { source });
  }

  async removeInstalledSource(id: string): Promise<void> {
    await this.client.mutation(api.settings.removeInstalledSource, {
      sourceId: id,
    });
  }

  // ============ REGISTRIES (local only - delegate to IndexedDB) ============
  // Registries are NOT synced per SYNC.md, so these throw
  // The actual implementation uses a local-only IndexedDB store for registries

  async getRegistries(): Promise<SourceRegistry[]> {
    throw new Error(
      "Registries are local-only. Use IndexedDBUserDataStore for registries."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getRegistry(id: string): Promise<SourceRegistry | null> {
    throw new Error(
      "Registries are local-only. Use IndexedDBUserDataStore for registries."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async saveRegistry(registry: SourceRegistry): Promise<void> {
    throw new Error(
      "Registries are local-only. Use IndexedDBUserDataStore for registries."
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async removeRegistry(id: string): Promise<void> {
    throw new Error(
      "Registries are local-only. Use IndexedDBUserDataStore for registries."
    );
  }
}

