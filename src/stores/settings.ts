import { create, type StoreApi, type UseBoundStore } from "zustand";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import type { MangaSource } from "@/lib/sources/types";
import type { RegistrySourceInfo, RegistryManager } from "@/lib/sources/registry";
import type { InstalledSource as InstalledSourceSchema } from "@/data/schema";

/** Minimal interface for settings store needs */
export interface SettingsStoreOps {
  getInstalledSources(): Promise<InstalledSourceSchema[]>;
  getInstalledSource(id: string): Promise<InstalledSourceSchema | null>;
  saveInstalledSource(source: InstalledSourceSchema): Promise<void>;
  removeInstalledSource(id: string): Promise<void>;
}
import type { CacheStore } from "@/data/cache";
import { Keys, CacheKeys, LOCAL_REGISTRY_ID, parseSourceKey } from "@/data/keys";
import type { InstalledSource } from "@/data/schema";
import type { ReadingMode } from "@/data/schema";

const READING_MODE_KEY = "nemu:reader:readingMode";

export interface SourceInfo extends RegistrySourceInfo {
  registryId: string;
  installed: boolean;
}

interface SettingsState {
  manager: RegistryManager;
  // All available sources from registries
  availableSources: SourceInfo[];
  // Currently installed sources
  installedSources: InstalledSource[];
  // Loaded source instances (keyed by registryId:sourceId)
  loadedSources: Map<string, MangaSource>;
  // Reading preferences
  readingMode: ReadingMode;
  loading: boolean;
  error: string | null;

  // Actions
  initialize: () => Promise<void>;
  installSource: (registryId: string, sourceId: string) => Promise<void>;
  uninstallSource: (registryId: string, sourceId: string) => Promise<void>;
  getSource: (registryId: string, sourceId: string) => Promise<MangaSource | null>;
  reloadSource: (registryId: string, sourceId: string) => Promise<MangaSource | null>;
  installFromAix: (file: File) => Promise<void>;
  setReadingMode: (mode: ReadingMode) => void;
}

export type SettingsStore = UseBoundStore<StoreApi<SettingsState>>;

export function createSettingsStore(
  ops: SettingsStoreOps,
  cacheStore: CacheStore,
  manager: RegistryManager
): SettingsStore {
  return create<SettingsState>((set, get) => ({
    manager,
    availableSources: [],
    installedSources: [],
    loadedSources: new Map(),
    readingMode: "rtl",
    loading: true,
    error: null,

    initialize: async () => {
      const { manager } = get();
      try {
        set({ loading: true, error: null });
        await manager.initialize();

        // Load installed sources from storage
        const installedSources = await ops.getInstalledSources();

        // Load reading mode from localStorage
        let readingMode: ReadingMode = "rtl";
        try {
          const stored = localStorage.getItem(READING_MODE_KEY);
          if (stored === "rtl" || stored === "ltr" || stored === "scrolling") {
            readingMode = stored;
          }
        } catch {
          // Ignore localStorage errors
        }

        // Get all available sources from registries
        const allSources = await manager.listAllSources();
        
        // Check for source updates and auto-update
        const updatedSources: string[] = [];
        for (const installed of installedSources) {
          const { registryId, sourceId } = parseSourceKey(installed.id);
          const registrySource = allSources.find(
            (s) => s.registryId === registryId && s.id === sourceId
          );
          if (registrySource && registrySource.version > installed.version) {
            try {
              const registry = manager.getRegistry(registryId);
              if (registry) {
                await registry.installSource(sourceId);
                updatedSources.push(registrySource.name);
              }
            } catch (e) {
              console.error(`[SettingsStore] Failed to update source ${sourceId}:`, e);
            }
          }
        }
        
        // Show toast if sources were updated
        if (updatedSources.length > 0) {
          toast.success(
            updatedSources.length === 1
              ? i18n.t("settings.sourceUpdated", { name: updatedSources[0] })
              : i18n.t("settings.sourcesUpdated", { 
                  count: updatedSources.length, 
                  names: updatedSources.join(", ") 
                })
          );
        }
        
        // Reload installed sources after updates
        const finalInstalledSources = updatedSources.length > 0 
          ? await ops.getInstalledSources()
          : installedSources;
        
        // InstalledSource.id is the composite key (registryId:sourceId)
        const installedIds = new Set(finalInstalledSources.map((s) => s.id));

        const availableSources: SourceInfo[] = allSources.map((s) => ({
          ...s,
          installed: installedIds.has(Keys.source(s.registryId, s.id)),
        }));

        set({
          availableSources,
          installedSources: finalInstalledSources,
          readingMode,
          loading: false,
        });
      } catch (e) {
        console.error("[SettingsStore] Initialize error:", e);
        set({
          error: e instanceof Error ? e.message : String(e),
          loading: false,
        });
      }
    },

    installSource: async (registryId: string, sourceId: string) => {
      const { manager } = get();

      const registry = manager.getRegistry(registryId);
      if (!registry) throw new Error(`Registry not found: ${registryId}`);

      await registry.installSource(sourceId);

      // Reload installed sources
      const installedSources = await ops.getInstalledSources();
      const installedIds = new Set(installedSources.map((s) => s.id));

      set((state) => ({
        installedSources,
        availableSources: state.availableSources.map((s) => ({
          ...s,
          installed: installedIds.has(Keys.source(s.registryId, s.id)),
        })),
      }));
    },

    uninstallSource: async (registryId: string, sourceId: string) => {
      const { loadedSources } = get();
      const compositeId = Keys.source(registryId, sourceId);

      // Dispose loaded source if exists
      const loaded = loadedSources.get(compositeId);
      if (loaded) {
        loaded.dispose();
        loadedSources.delete(compositeId);
      }

      // Remove from storage (id is composite key)
      await ops.removeInstalledSource(compositeId);

      // Clear cache
      await cacheStore.delete(CacheKeys.aix(registryId, sourceId));

      // Update state
      const installedSources = await ops.getInstalledSources();
      const installedIds = new Set(installedSources.map((s) => s.id));

      set((state) => ({
        installedSources,
        loadedSources: new Map(loadedSources),
        availableSources: state.availableSources.map((s) => ({
          ...s,
          installed: installedIds.has(Keys.source(s.registryId, s.id)),
        })),
      }));
    },

    getSource: async (registryId: string, sourceId: string) => {
      const { manager, loadedSources } = get();
      const compositeId = Keys.source(registryId, sourceId);

      // Check if already loaded
      const cached = loadedSources.get(compositeId);
      if (cached) return cached;

      // Load from specific registry
      const registry = manager.getRegistry(registryId);
      if (!registry) return null;

      const source = await registry.getSource(sourceId);
      if (source) {
        loadedSources.set(compositeId, source);
        set({ loadedSources: new Map(loadedSources) });
      }

      return source;
    },

    reloadSource: async (registryId: string, sourceId: string) => {
      const { manager, loadedSources } = get();
      const compositeId = Keys.source(registryId, sourceId);

      // Get registry first
      const registry = manager.getRegistry(registryId);
      if (!registry) return null;

      // Unload from registry (disposes and clears its cache)
      registry.unloadSource(sourceId);

      // Clear from settings store cache too
      loadedSources.delete(compositeId);
      set({ loadedSources: new Map(loadedSources) });

      // Load fresh from registry
      const source = await registry.getSource(sourceId);
      if (source) {
        loadedSources.set(compositeId, source);
        set({ loadedSources: new Map(loadedSources) });
      }

      return source;
    },

    installFromAix: async (file: File) => {
      const registryId = LOCAL_REGISTRY_ID;
      const { extractAix } = await import("@nemu.pm/aidoku-runtime");
      const arrayBuffer = await file.arrayBuffer();
      
      // Extract to validate and get sourceId
      const { manifest } = extractAix(arrayBuffer);
      const sourceId = manifest.info?.id;
      if (!sourceId) {
        throw new Error("Invalid manifest: missing info.id");
      }

      // Cache the whole AIX package
      await cacheStore.set(CacheKeys.aix(registryId, sourceId), arrayBuffer);

      // Save to installed sources (id is composite key)
      await ops.saveInstalledSource({
        id: Keys.source(registryId, sourceId),
        registryId,
        version: manifest.info?.version ?? 1,
      });

      // Reload installed sources
      const installedSources = await ops.getInstalledSources();
      set({ installedSources });
    },

    setReadingMode: (mode: ReadingMode) => {
      set({ readingMode: mode });
      try {
        localStorage.setItem(READING_MODE_KEY, mode);
      } catch {
        // Ignore localStorage errors
      }
    },
  }));
}
