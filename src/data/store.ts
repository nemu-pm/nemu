import type {
  HistoryEntry,
  InstalledSource,
  SourceRegistry,
  UserSettings,
} from "./schema";

/**
 * User data store interface
 * Note: Library operations migrated to canonical tables via LibraryStore + CanonicalLibraryOps.
 * This interface is now primarily used for history, settings, and registries.
 */
export interface UserDataStore {
  // History (legacy - will be migrated to canonical progress tables)
  getHistoryEntry(
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string
  ): Promise<HistoryEntry | null>;
  saveHistoryEntry(entry: HistoryEntry): Promise<void>;
  getMangaHistory(
    registryId: string,
    sourceId: string,
    mangaId: string
  ): Promise<Record<string, HistoryEntry>>;
  getRecentHistory(limit: number): Promise<HistoryEntry[]>;

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
