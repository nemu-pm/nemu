import type {
  LibraryManga,
  ChapterProgress,
  InstalledSource,
  SourceRegistry,
  UserSettings,
} from "./schema";

/**
 * User data store interface
 * Abstraction over storage - IndexedDB locally, Convex when signed in
 */
export interface UserDataStore {
  // Library (with embedded history)
  getLibrary(): Promise<LibraryManga[]>;
  getLibraryManga(id: string): Promise<LibraryManga | null>;
  saveLibraryManga(manga: LibraryManga): Promise<void>;
  removeLibraryManga(id: string): Promise<void>;

  // Chapter progress (convenience methods for embedded history)
  getChapterProgress(mangaId: string, chapterId: string): Promise<ChapterProgress | null>;
  saveChapterProgress(mangaId: string, chapterId: string, progress: ChapterProgress): Promise<void>;

  // Settings (reading mode + installed sources)
  getSettings(): Promise<UserSettings>;
  saveSettings(settings: UserSettings): Promise<void>;

  // Installed Sources (convenience, stored in settings)
  getInstalledSources(): Promise<InstalledSource[]>;
  getInstalledSource(id: string): Promise<InstalledSource | null>;
  saveInstalledSource(source: InstalledSource): Promise<void>;
  removeInstalledSource(id: string): Promise<void>;

  // Registries (local only, not synced)
  getRegistries(): Promise<SourceRegistry[]>;
  getRegistry(id: string): Promise<SourceRegistry | null>;
  saveRegistry(registry: SourceRegistry): Promise<void>;
  removeRegistry(id: string): Promise<void>;
}
