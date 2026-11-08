/**
 * Registry system for managing manga source providers
 */
import type { MangaSource } from "./types";
import type { SourceRegistry } from "../../data/schema";
import type { CacheStore } from "../../data/cache";
import {
  AidokuUrlRegistry,
  AIDOKU_REGISTRIES,
  type InstalledSourceStore,
} from "./aidoku/url-registry";
import {
  TachiyomiLocalRegistry,
  TACHIYOMI_LOCAL_REGISTRY_ID,
} from "./tachiyomi/local-registry";
import {
  getSourceSettingsStore,
  type SourceSettingsStore,
} from "@/stores/source-settings";
import { safeErrorCategory } from "@/lib/error-diagnostic";
import {
  NEMU_RECOMMENDED_REGISTRY,
  type AidokuRegistryDefinition,
} from "@nemu/core/sources";
import { nextSyncTimestamp } from "@nemu/core";

/**
 * Directories the web always has. The nemu recommended directory matches
 * mobile's built-in (same id and URL), so a source installed during mobile
 * onboarding loads here; the two legacy Aidoku directories stay built in for
 * the web onboarding picks. Synced records with these ids or URLs never
 * create a second row.
 */
export const WEB_BUILT_IN_SOURCE_DIRECTORIES: readonly AidokuRegistryDefinition[] = [
  NEMU_RECOMMENDED_REGISTRY,
  ...AIDOKU_REGISTRIES,
];

// Re-export for convenience
export type { InstalledSourceStore };

// ============ TYPES ============

export interface RegistrySourceInfo {
  id: string;
  name: string;
  version: number;
  icon?: string;
  languages?: string[];
  contentRating?: number;
  /** Requires authentication/login to work properly */
  hasAuthentication?: boolean;
  /** Uses Cloudflare bypass - may not work without browser extension */
  hasCloudflare?: boolean;
}

export interface SourceRegistryProvider {
  readonly info: SourceRegistry;
  listSources(): Promise<RegistrySourceInfo[]>;
  installSource(
    sourceId: string,
    expectedGeneration?: number | null,
  ): Promise<void>;
  unloadSource(sourceId: string): void;
  getSource(sourceId: string): Promise<MangaSource | null>;
  /** Synchronous check for an already-live source instance (skips storage). */
  isLoaded(sourceId: string): boolean;
  isInstalled(sourceId: string): Promise<boolean>;
}

// ============ REGISTRY MANAGER ============

/**
 * Manages all source registries
 */
/** Minimal interface for registry metadata storage */
export interface RegistryMetadataStore {
  getRegistries(): Promise<SourceRegistry[]>;
  getRegistry(id: string): Promise<SourceRegistry | null>;
  saveRegistry(registry: SourceRegistry): Promise<void>;
  removeRegistry(id: string): Promise<void>;
}

export class RegistryManager {
  private registries: Map<string, SourceRegistryProvider> = new Map();
  private registryStore: RegistryMetadataStore;
  private installedSourceStore: InstalledSourceStore;
  private cacheStore: CacheStore;
  private sourceSettingsStore: SourceSettingsStore;
  /** Stored (user-added or synced) directory ids that have a registry. */
  private userDirectoryIds = new Set<string>();
  /** Disabled or removed directories: loadable, never listed. */
  private hiddenDirectoryIds = new Set<string>();
  private directoryListeners = new Set<() => void>();

  constructor(
    registryStore: RegistryMetadataStore,
    installedSourceStore: InstalledSourceStore,
    cacheStore: CacheStore,
    sourceSettingsStore: SourceSettingsStore = getSourceSettingsStore(),
  ) {
    this.registryStore = registryStore;
    this.installedSourceStore = installedSourceStore;
    this.cacheStore = cacheStore;
    this.sourceSettingsStore = sourceSettingsStore;
    for (const def of WEB_BUILT_IN_SOURCE_DIRECTORIES) {
      this.registries.set(def.id, this.createUrlRegistry(def.id, def.name, def.indexUrl));
    }

    // Add Tachiyomi local registry (only in development mode with path configured)
    if (import.meta.env.DEV && import.meta.env.VITE_TACHIYOMI_LOCAL_PATH) {
      this.registries.set(
        TACHIYOMI_LOCAL_REGISTRY_ID,
        new TachiyomiLocalRegistry(
          this.installedSourceStore,
          this.cacheStore,
          this.sourceSettingsStore,
        ),
      );
    }
  }

  /**
   * Update the store used for installed sources (called when auth state changes)
   */
  setInstalledSourceStore(store: InstalledSourceStore): void {
    this.installedSourceStore = store;
    // Recreate registries with new store
    for (const def of WEB_BUILT_IN_SOURCE_DIRECTORIES) {
      this.registries.set(def.id, this.createUrlRegistry(def.id, def.name, def.indexUrl));
    }
    for (const id of this.userDirectoryIds) {
      const info = this.registries.get(id)?.info;
      if (info?.type !== "url") continue;
      this.registries.set(id, this.createUrlRegistry(id, info.name, info.url));
    }

    // Update Tachiyomi local registry if it exists
    if (import.meta.env.DEV && import.meta.env.VITE_TACHIYOMI_LOCAL_PATH) {
      const localRegistry = this.registries.get(TACHIYOMI_LOCAL_REGISTRY_ID);
      if (localRegistry instanceof TachiyomiLocalRegistry) {
        localRegistry.setInstalledSourceStore(store);
      }
    }
  }

  private createUrlRegistry(
    id: string,
    name: string,
    indexUrl: string,
  ): AidokuUrlRegistry {
    return new AidokuUrlRegistry(
      id,
      name,
      indexUrl,
      this.installedSourceStore,
      this.cacheStore,
      this.sourceSettingsStore,
    );
  }

  private isBuiltIn(id: string): boolean {
    return WEB_BUILT_IN_SOURCE_DIRECTORIES.some((def) => def.id === id);
  }

  private disposeRegistry(id: string): void {
    const registry = this.registries.get(id);
    if (registry && "dispose" in registry) {
      (registry as { dispose: () => void }).dispose();
    }
    this.registries.delete(id);
  }

  async initialize(): Promise<void> {
    await this.reloadDirectories();
  }

  /**
   * Makes the loaded registries follow the stored directory rows (user-added
   * or synced). A disabled or removed directory keeps a registry so sources
   * installed from it still load, but is hidden from listings and updates.
   */
  async reloadDirectories(): Promise<void> {
    const savedRegistries = await this.registryStore.getRegistries();
    const seen = new Set<string>();
    for (const registry of savedRegistries) {
      if (registry.type !== "url" || this.isBuiltIn(registry.id)) continue;
      seen.add(registry.id);
      const current = this.registries.get(registry.id);
      if (
        !current ||
        current.info.type !== "url" ||
        current.info.url !== registry.url ||
        current.info.name !== registry.name
      ) {
        if (current) this.disposeRegistry(registry.id);
        this.registries.set(
          registry.id,
          this.createUrlRegistry(registry.id, registry.name, registry.url),
        );
      }
      if (registry.disabled || registry.removed) {
        this.hiddenDirectoryIds.add(registry.id);
      } else {
        this.hiddenDirectoryIds.delete(registry.id);
      }
    }
    for (const id of this.userDirectoryIds) {
      if (seen.has(id)) continue;
      this.disposeRegistry(id);
      this.hiddenDirectoryIds.delete(id);
    }
    this.userDirectoryIds = seen;
  }

  /** Listeners run after a local directory edit (add, remove, enable). */
  onDirectoriesChanged(listener: () => void): () => void {
    this.directoryListeners.add(listener);
    return () => {
      this.directoryListeners.delete(listener);
    };
  }

  private notifyDirectoriesChanged(): void {
    for (const listener of this.directoryListeners) {
      try {
        listener();
      } catch (error) {
        console.error(
          "[RegistryManager] Directory listener failed:",
          safeErrorCategory(error),
        );
      }
    }
  }

  getRegistry(id: string): SourceRegistryProvider | null {
    return this.registries.get(id) ?? null;
  }

  getAllRegistries(): SourceRegistryProvider[] {
    return Array.from(this.registries.values());
  }

  /** Adds (or re-adds) a directory; it syncs to the account. */
  async addRegistry(registry: SourceRegistry): Promise<void> {
    if (registry.type !== "url" || this.isBuiltIn(registry.id)) {
      return;
    }
    const previous = await this.registryStore.getRegistry(registry.id);
    const previousRow = previous?.type === "url" ? previous : null;
    const next = { ...registry };
    delete next.removed;
    await this.registryStore.saveRegistry({
      ...next,
      addedAt:
        previousRow && !previousRow.removed
          ? (previousRow.addedAt ?? Date.now())
          : Date.now(),
      updatedAt: nextSyncTimestamp(previousRow?.updatedAt, registry.updatedAt),
    });
    await this.reloadDirectories();
    this.notifyDirectoriesChanged();
  }

  async setRegistryEnabled(id: string, enabled: boolean): Promise<void> {
    const previous = await this.registryStore.getRegistry(id);
    if (previous?.type !== "url" || previous.removed) return;
    if ((previous.disabled !== true) === enabled) return;
    const next = { ...previous, updatedAt: nextSyncTimestamp(previous.updatedAt) };
    if (enabled) delete next.disabled;
    else next.disabled = true;
    await this.registryStore.saveRegistry(next);
    await this.reloadDirectories();
    this.notifyDirectoriesChanged();
  }

  /**
   * Forgets a directory. The row stays as a tombstone so the removal syncs;
   * sources installed from it keep loading, as on mobile.
   */
  async removeRegistry(id: string): Promise<void> {
    if (this.isBuiltIn(id)) return;
    const previous = await this.registryStore.getRegistry(id);
    if (previous?.type !== "url" || previous.removed) return;
    await this.registryStore.saveRegistry({
      ...previous,
      removed: true,
      updatedAt: nextSyncTimestamp(previous.updatedAt),
    });
    await this.reloadDirectories();
    this.notifyDirectoriesChanged();
  }

  /**
   * Get a source by ID, searching all registries
   */
  async getSource(sourceId: string): Promise<MangaSource | null> {
    const installed =
      await this.installedSourceStore.getInstalledSource(sourceId);

    if (installed) {
      const registry = this.registries.get(installed.registryId);
      if (registry) {
        return registry.getSource(sourceId);
      }
    }

    // Fall back to searching all registries
    for (const registry of this.registries.values()) {
      const source = await registry.getSource(sourceId);
      if (source) {
        return source;
      }
    }

    return null;
  }

  /**
   * List all available sources from all registries. The example directory
   * is never listed on the web: it is built in only so sources installed from
   * it on mobile load here.
   */
  async listAllSources(): Promise<
    Array<RegistrySourceInfo & { registryId: string }>
  > {
    const results: Array<RegistrySourceInfo & { registryId: string }> = [];

    for (const [registryId, registry] of this.registries) {
      if (this.hiddenDirectoryIds.has(registryId)) continue;
      if (registryId === NEMU_RECOMMENDED_REGISTRY.id) continue;
      try {
        const sources = await registry.listSources();
        for (const source of sources) {
          results.push({ ...source, registryId });
        }
      } catch (e) {
        console.error(
          "Failed to list sources from a registry:",
          safeErrorCategory(e),
        );
      }
    }

    return results;
  }

  /**
   * Dispose loaded source instances without clearing registries.
   * Safe to call during React Strict Mode double-mounting.
   */
  disposeLoadedSources(): void {
    for (const registry of this.registries.values()) {
      if ("unloadAll" in registry) {
        (registry as { unloadAll: () => void }).unloadAll();
      }
    }
  }

  /**
   * Full dispose - clears all registries. Only call on true unmount.
   */
  dispose(): void {
    for (const registry of this.registries.values()) {
      if ("dispose" in registry) {
        (registry as { dispose: () => void }).dispose();
      }
    }
    this.registries.clear();
  }
}
