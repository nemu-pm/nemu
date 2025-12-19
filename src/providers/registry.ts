/**
 * Registry system for managing manga source providers
 */
import type { MangaSource } from "./types";
import type { SourceRegistry } from "../data/schema";
import { getUserDataStore } from "../data/indexeddb";
import { AidokuUrlRegistry, AIDOKU_REGISTRIES } from "./aidoku/url-registry";

// ============ TYPES ============

export interface RegistrySourceInfo {
  id: string;
  name: string;
  version: number;
  icon?: string;
  languages?: string[];
  contentRating?: number;
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

  constructor() {
    // Add default Aidoku registries
    for (const def of AIDOKU_REGISTRIES) {
      const registry = new AidokuUrlRegistry(def.id, def.name, def.indexUrl);
      this.registries.set(def.id, registry);
    }
  }

  async initialize(): Promise<void> {
    // Load user-added registries from storage
    const userStore = getUserDataStore();
    const savedRegistries = await userStore.getRegistries();

    for (const registry of savedRegistries) {
      if (registry.type === "url" && !this.registries.has(registry.id)) {
        this.registries.set(
          registry.id,
          new AidokuUrlRegistry(registry.id, registry.name, registry.url)
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

    const userStore = getUserDataStore();
    await userStore.saveRegistry(registry);

    if (registry.type === "url") {
      this.registries.set(
        registry.id,
        new AidokuUrlRegistry(registry.id, registry.name, registry.url)
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

    const userStore = getUserDataStore();
    await userStore.removeRegistry(id);
  }

  /**
   * Get a source by ID, searching all registries
   */
  async getSource(sourceId: string): Promise<MangaSource | null> {
    const userStore = getUserDataStore();
    const installed = await userStore.getInstalledSource(sourceId);

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

// Singleton instance
let registryManagerInstance: RegistryManager | null = null;

export function getRegistryManager(): RegistryManager {
  if (!registryManagerInstance) {
    registryManagerInstance = new RegistryManager();
  }
  return registryManagerInstance;
}
