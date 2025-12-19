import type {
  LibraryManga,
  ReadingHistory,
  InstalledSource,
  SourceRegistry,
} from "./schema";

/**
 * User data store interface
 * Abstraction over storage - currently IndexedDB, could be cloud-synced later
 */
export interface UserDataStore {
  // Library
  getLibrary(): Promise<LibraryManga[]>;
  getLibraryManga(id: string): Promise<LibraryManga | null>;
  saveLibraryManga(manga: LibraryManga): Promise<void>;
  removeLibraryManga(id: string): Promise<void>;

  // History
  getHistory(
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string
  ): Promise<ReadingHistory | null>;
  getHistoryForManga(
    registryId: string,
    sourceId: string,
    mangaId: string
  ): Promise<ReadingHistory[]>;
  saveHistory(history: ReadingHistory): Promise<void>;

  // Installed Sources
  getInstalledSources(): Promise<InstalledSource[]>;
  getInstalledSource(id: string): Promise<InstalledSource | null>;
  saveInstalledSource(source: InstalledSource): Promise<void>;
  removeInstalledSource(id: string): Promise<void>;

  // Registries
  getRegistries(): Promise<SourceRegistry[]>;
  getRegistry(id: string): Promise<SourceRegistry | null>;
  saveRegistry(registry: SourceRegistry): Promise<void>;
  removeRegistry(id: string): Promise<void>;
}
