import type {
  InstalledSource,
  SourceRegistry,
  UserSettings,
} from "./schema";

/**
 * User data store interface
 * Note: Library + History operations migrated to canonical tables via LibraryStore + CanonicalLibraryOps.
 * This interface is now primarily used for settings and registries.
 */
export interface UserDataStore {
  // Settings (reading mode + installed sources)
  getSettings(): Promise<UserSettings>;
  saveSettings(settings: UserSettings): Promise<void>;

  // Installed Sources (convenience, stored in settings)
  getInstalledSources(): Promise<InstalledSource[]>;
  getInstalledSource(id: string): Promise<InstalledSource | null>;
  saveInstalledSource(source: InstalledSource): Promise<void>;
  removeInstalledSource(id: string, registryId?: string): Promise<void>;

  // Registries (local only, not synced)
  getRegistries(): Promise<SourceRegistry[]>;
  getRegistry(id: string): Promise<SourceRegistry | null>;
  saveRegistry(registry: SourceRegistry): Promise<void>;
  removeRegistry(id: string): Promise<void>;
}
