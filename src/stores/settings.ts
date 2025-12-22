import { create, type StoreApi, type UseBoundStore } from "zustand";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import type { MangaSource } from "@/lib/sources/types";
import type { RegistrySourceInfo, RegistryManager } from "@/lib/sources/registry";
import type { UserDataStore } from "@/data/store";
import type { CacheStore } from "@/data/cache";
import { Keys, CacheKeys, LOCAL_REGISTRY_ID, parseSourceKey } from "@/data/keys";
import type { InstalledSource } from "@/data/schema";
import type { ReadingMode } from "@/data/schema";
import type { Setting } from "@/lib/settings";
import { getSourceSettingsStore } from "./source-settings";

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
  installFromAix: (file: File) => Promise<void>;
  setReadingMode: (mode: ReadingMode) => void;
}

export type SettingsStore = UseBoundStore<StoreApi<SettingsState>>;

export function createSettingsStore(
  userStore: UserDataStore,
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
        const installedSources = await userStore.getInstalledSources();

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
          ? await userStore.getInstalledSources()
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
      const installedSources = await userStore.getInstalledSources();
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
      await userStore.removeInstalledSource(compositeId);

      // Clear cache
      await cacheStore.delete(CacheKeys.wasm(registryId, sourceId));
      await cacheStore.delete(CacheKeys.manifest(registryId, sourceId));

      // Update state
      const installedSources = await userStore.getInstalledSources();
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

    installFromAix: async (file: File) => {
      const registryId = LOCAL_REGISTRY_ID;
      const { unzipSync } = await import("fflate");
      const arrayBuffer = await file.arrayBuffer();
      const files = unzipSync(new Uint8Array(arrayBuffer));

      const manifestData = files["Payload/source.json"];
      const wasmData = files["Payload/main.wasm"];
      const settingsData = files["Payload/settings.json"];

      if (!manifestData || !wasmData) {
        throw new Error("Invalid .aix package: missing source.json or main.wasm");
      }

      const manifest = JSON.parse(new TextDecoder().decode(manifestData));
      const sourceId = manifest.info?.id;
      if (!sourceId) {
        throw new Error("Invalid manifest: missing info.id");
      }

      // Save to cache
      await cacheStore.set(
        CacheKeys.wasm(registryId, sourceId),
        wasmData.buffer.slice(0) as ArrayBuffer
      );
      await cacheStore.set(
        CacheKeys.manifest(registryId, sourceId),
        manifestData.buffer.slice(0) as ArrayBuffer
      );
      
      // Cache settings.json if present and save schema
      if (settingsData) {
        const settingsBuffer = settingsData.buffer.slice(0) as ArrayBuffer;
        await cacheStore.set(CacheKeys.settings(registryId, sourceId), settingsBuffer);
        
        // Parse and save schema to source settings store
        try {
          const schema = JSON.parse(new TextDecoder().decode(settingsData)) as Setting[];
          const sourceKey = Keys.source(registryId, sourceId);
          await getSourceSettingsStore().getState().setSchema(sourceKey, schema);
        } catch {
          // Ignore schema parsing errors
        }
      }

      // Save to installed sources (id is composite key)
      await userStore.saveInstalledSource({
        id: Keys.source(registryId, sourceId),
        registryId,
        version: manifest.info?.version ?? 1,
      });

      // Reload installed sources
      const installedSources = await userStore.getInstalledSources();
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
