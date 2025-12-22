/**
 * Registry system for managing manga source providers
 */
import type { MangaSource } from "./types";
import type { SourceRegistry } from "../../data/schema";
import type { UserDataStore } from "../../data/store";
import type { CacheStore } from "../../data/cache";
import { AidokuUrlRegistry, AIDOKU_REGISTRIES } from "./aidoku/url-registry";
import { TachiyomiDevRegistry, TACHIYOMI_DEV_REGISTRY_ID } from "./tachiyomi/dev-registry";

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
  installSource(sourceId: string): Promise<void>;
  getSource(sourceId: string): Promise<MangaSource | null>;
  isInstalled(sourceId: string): Promise<boolean>;
}

// ============ REGISTRY MANAGER ============

/**
 * Manages all source registries
 */
export class RegistryManager {
  private registries: Map<string, SourceRegistryProvider> = new Map();
  private registryStore: UserDataStore; // For registry metadata (always local)
  private installedSourceStore: UserDataStore; // For installed sources (can be Convex)
  private cacheStore: CacheStore;

  constructor(
    registryStore: UserDataStore,
    installedSourceStore: UserDataStore,
    cacheStore: CacheStore
  ) {
    this.registryStore = registryStore;
    this.installedSourceStore = installedSourceStore;
    this.cacheStore = cacheStore;
    // Add default Aidoku registries
    for (const def of AIDOKU_REGISTRIES) {
      const registry = new AidokuUrlRegistry(
        def.id,
        def.name,
        def.indexUrl,
        this.installedSourceStore,
        this.cacheStore
      );
      this.registries.set(def.id, registry);
    }
    
    // Add Tachiyomi dev registry (only in development mode)
    if (import.meta.env.DEV) {
      this.registries.set(
        TACHIYOMI_DEV_REGISTRY_ID,
        new TachiyomiDevRegistry(this.installedSourceStore, this.cacheStore)
      );
    }
  }

  /**
   * Update the store used for installed sources (called when auth state changes)
   */
  setInstalledSourceStore(store: UserDataStore): void {
    this.installedSourceStore = store;
    // Recreate registries with new store
    for (const def of AIDOKU_REGISTRIES) {
      const registry = new AidokuUrlRegistry(
        def.id,
        def.name,
        def.indexUrl,
        this.installedSourceStore,
        this.cacheStore
      );
      this.registries.set(def.id, registry);
    }
    
    // Update Tachiyomi dev registry if it exists
    if (import.meta.env.DEV) {
      const devRegistry = this.registries.get(TACHIYOMI_DEV_REGISTRY_ID);
      if (devRegistry instanceof TachiyomiDevRegistry) {
        devRegistry.setUserStore(store);
      }
    }
  }

  async initialize(): Promise<void> {
    // Load user-added registries from storage (always local)
    const savedRegistries = await this.registryStore.getRegistries();

    for (const registry of savedRegistries) {
      if (registry.type === "url" && !this.registries.has(registry.id)) {
        this.registries.set(
          registry.id,
          new AidokuUrlRegistry(
            registry.id,
            registry.name,
            registry.url,
            this.installedSourceStore,
            this.cacheStore
          )
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

  async addRegistry(registry: SourceRegistry): Promise<void> {
    if (registry.type === "builtin") {
      return;
    }

    await this.registryStore.saveRegistry(registry);

    if (registry.type === "url") {
      this.registries.set(
        registry.id,
        new AidokuUrlRegistry(
          registry.id,
          registry.name,
          registry.url,
          this.installedSourceStore,
          this.cacheStore
        )
      );
    }
  }

  async removeRegistry(id: string): Promise<void> {
    // Don't allow removing default registries
    if (AIDOKU_REGISTRIES.some((r) => r.id === id)) {
      return;
    }

    const registry = this.registries.get(id);
    if (registry && "dispose" in registry) {
      (registry as { dispose: () => void }).dispose();
    }

    this.registries.delete(id);

    await this.registryStore.removeRegistry(id);
  }

  /**
   * Get a source by ID, searching all registries
   */
  async getSource(sourceId: string): Promise<MangaSource | null> {
    const installed = await this.installedSourceStore.getInstalledSource(sourceId);

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
   * List all available sources from all registries
   */
  async listAllSources(): Promise<
    Array<RegistrySourceInfo & { registryId: string }>
  > {
    const results: Array<RegistrySourceInfo & { registryId: string }> = [];

    for (const [registryId, registry] of this.registries) {
      try {
        const sources = await registry.listSources();
        for (const source of sources) {
          results.push({ ...source, registryId });
        }
      } catch (e) {
        console.error(`Failed to list sources from ${registryId}:`, e);
      }
    }

    return results;
  }

  dispose(): void {
    for (const registry of this.registries.values()) {
      if ("dispose" in registry) {
        (registry as { dispose: () => void }).dispose();
      }
    }
    this.registries.clear();
  }
}
