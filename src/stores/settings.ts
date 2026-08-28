import { create, type StoreApi, type UseBoundStore } from "zustand";
import { toast } from "sonner";
import i18n from "@/lib/i18n";
import type { MangaSource } from "@/lib/sources/types";
import type {
  RegistrySourceInfo,
  RegistryManager,
} from "@/lib/sources/registry";
import type { InstalledSource as InstalledSourceSchema } from "@/data/schema";
import { sourceInstallStore } from "./source-install";
import { nextSyncTimestamp } from "@nemu/core";
import { safeErrorCategory } from "@/lib/error-diagnostic";
import { extractAix } from "@nemu.pm/aidoku-runtime";
import {
  StoreGenerationGate,
  type StoreGenerationToken,
} from "./sync-generation-gate";

/** Minimal interface for settings store needs */
export interface SettingsStoreOps {
  getInstalledSources(): Promise<InstalledSourceSchema[]>;
  getInstalledSource(id: string): Promise<InstalledSourceSchema | null>;
  saveInstalledSource(
    source: InstalledSourceSchema,
    expectedGeneration?: number | null,
  ): Promise<void>;
  removeInstalledSource(
    id: string,
    registryId: string,
    expectedGeneration?: number | null,
  ): Promise<void>;
}
import type { CacheStore } from "@/data/cache";
import {
  Keys,
  CacheKeys,
  LOCAL_REGISTRY_ID,
  parseSourceKey,
} from "@/data/keys";
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
  // Reading preferences
  readingMode: ReadingMode;
  loading: boolean;
  error: string | null;
  syncGeneration: number | null;

  // Actions
  initialize: () => Promise<void>;
  prepareSyncGeneration: (
    generation: number,
    readiness?: Promise<unknown>,
  ) => void;
  replaceInstalledSourcesSnapshot: (
    sources: InstalledSource[],
    generation: number,
  ) => void;
  installSource: (registryId: string, sourceId: string) => Promise<void>;
  uninstallSource: (registryId: string, sourceId: string) => Promise<void>;
  getSource: (
    registryId: string,
    sourceId: string,
  ) => Promise<MangaSource | null>;
  reloadSource: (
    registryId: string,
    sourceId: string,
  ) => Promise<MangaSource | null>;
  installFromAix: (file: File) => Promise<void>;
  setReadingMode: (mode: ReadingMode) => void;
}

export type SettingsStore = UseBoundStore<StoreApi<SettingsState>>;

export function createSettingsStore(
  ops: SettingsStoreOps,
  cacheStore: CacheStore,
  manager: RegistryManager,
): SettingsStore {
  // Latest-initialize-wins guard. Prevents stale inits (e.g. during profile switches)
  // from overwriting the current state or reporting spurious errors.
  let initSeq = 0;
  const generationGate = new StoreGenerationGate();

  return create<SettingsState>((set, get) => {
    const beginAction = async (): Promise<StoreGenerationToken> => {
      const token = generationGate.capture();
      if (!(await generationGate.wait(token))) {
        throw new Error(
          "Source action cancelled because synced account data was reset.",
        );
      }
      return token;
    };
    const setIfCurrent = (
      token: StoreGenerationToken,
      update:
        | Partial<SettingsState>
        | ((state: SettingsState) => Partial<SettingsState>),
    ) => {
      if (generationGate.isCurrent(token)) set(update);
    };

    return {
      manager,
      availableSources: [],
      installedSources: [],
      readingMode: "rtl",
      loading: true,
      error: null,
      syncGeneration: null,

      prepareSyncGeneration: (generation, readiness) => {
        if (!generationGate.prepare(generation, readiness)) return;
        initSeq += 1;
        try {
          manager.disposeLoadedSources();
        } catch {
          // The visible/account state still fails closed if source disposal fails.
        }
        set((state) => ({
          installedSources: [],
          availableSources: state.availableSources.map((source) => ({
            ...source,
            installed: false,
          })),
          loading: true,
          error: null,
          syncGeneration: generation,
        }));
      },

      replaceInstalledSourcesSnapshot: (sources, generation) => {
        if (generationGate.currentGeneration !== generation) return;
        const installedIds = new Set(sources.map((source) => source.id));
        set((state) => ({
          installedSources: sources,
          availableSources: state.availableSources.map((source) => ({
            ...source,
            installed: installedIds.has(`${source.registryId}:${source.id}`),
          })),
          loading: false,
          error: null,
          syncGeneration: generation,
        }));
      },

      initialize: async () => {
        const { manager } = get();
        const seq = ++initSeq;
        const token = generationGate.capture();
        try {
          if (!(await generationGate.wait(token))) return;
          setIfCurrent(token, { loading: true, error: null });
          await manager.initialize();
          if (seq !== initSeq || !generationGate.isCurrent(token)) return;

          // Load installed sources from storage
          const installedSources = await ops.getInstalledSources();
          if (seq !== initSeq || !generationGate.isCurrent(token)) return;

          // Load reading mode from localStorage
          let readingMode: ReadingMode = "rtl";
          try {
            const stored = localStorage.getItem(READING_MODE_KEY);
            if (
              stored === "rtl" ||
              stored === "ltr" ||
              stored === "scrolling"
            ) {
              readingMode = stored;
            }
          } catch {
            // Ignore localStorage errors
          }

          // Get all available sources from registries
          const allSources = await manager.listAllSources();
          if (seq !== initSeq || !generationGate.isCurrent(token)) return;

          // Check for source updates and auto-update
          const updatedSources: string[] = [];
          for (const installed of installedSources) {
            const { registryId, sourceId } = parseSourceKey(installed.id);
            const registrySource = allSources.find(
              (s) => s.registryId === registryId && s.id === sourceId,
            );
            if (registrySource && registrySource.version > installed.version) {
              try {
                const registry = manager.getRegistry(registryId);
                if (registry) {
                  await registry.installSource(sourceId, token.generation);
                  if (!generationGate.isCurrent(token)) return;
                  updatedSources.push(registrySource.name);
                }
              } catch (e) {
                console.error(
                  "[SettingsStore] Failed to update a source:",
                  safeErrorCategory(e),
                );
              }
            }
          }

          if (!generationGate.isCurrent(token)) return;

          // Show toast if sources were updated
          if (updatedSources.length > 0) {
            toast.success(
              updatedSources.length === 1
                ? i18n.t("settings.sourceUpdated", { name: updatedSources[0] })
                : i18n.t("settings.sourcesUpdated", {
                    count: updatedSources.length,
                    names: updatedSources.join(", "),
                  }),
            );
          }

          // Reload installed sources after updates
          const finalInstalledSources =
            updatedSources.length > 0
              ? await ops.getInstalledSources()
              : installedSources;
          if (seq !== initSeq || !generationGate.isCurrent(token)) return;

          // InstalledSource.id is the composite key (registryId:sourceId)
          const installedIds = new Set(finalInstalledSources.map((s) => s.id));

          const availableSources: SourceInfo[] = allSources.map((s) => ({
            ...s,
            installed: installedIds.has(Keys.source(s.registryId, s.id)),
          }));

          setIfCurrent(token, {
            availableSources,
            installedSources: finalInstalledSources,
            readingMode,
            loading: false,
          });
        } catch (e) {
          if (seq !== initSeq || !generationGate.isCurrent(token)) return;
          console.error(
            "[SettingsStore] Initialize error:",
            safeErrorCategory(e),
          );
          setIfCurrent(token, {
            error: e instanceof Error ? e.message : String(e),
            loading: false,
          });
        }
      },

      installSource: async (registryId: string, sourceId: string) => {
        const token = await beginAction();
        const { manager, availableSources } = get();

        const registry = manager.getRegistry(registryId);
        if (!registry) throw new Error(`Registry not found: ${registryId}`);

        // Find source info for dialog
        const sourceInfo = availableSources.find(
          (s) => s.registryId === registryId && s.id === sourceId,
        );
        sourceInstallStore.getState().setInstalling({
          name: sourceInfo?.name ?? sourceId,
          icon: sourceInfo?.icon,
        });

        try {
          await registry.installSource(sourceId, token.generation);
          if (!generationGate.isCurrent(token)) return;

          // Reload installed sources
          const installedSources = await ops.getInstalledSources();
          const installedIds = new Set(installedSources.map((s) => s.id));

          setIfCurrent(token, (state) => ({
            installedSources,
            availableSources: state.availableSources.map((s) => ({
              ...s,
              installed: installedIds.has(Keys.source(s.registryId, s.id)),
            })),
          }));
        } finally {
          sourceInstallStore.getState().setInstalling(null);
        }
      },

      uninstallSource: async (registryId: string, sourceId: string) => {
        const token = await beginAction();
        const { manager } = get();
        const compositeId = Keys.source(registryId, sourceId);

        // Unload from registry (disposes and clears its cache)
        const registry = manager.getRegistry(registryId);
        if (registry) {
          registry.unloadSource(sourceId);
        }

        // Tombstone in storage (id is composite key)
        await ops.removeInstalledSource(
          compositeId,
          registryId,
          token.generation,
        );

        // Clear AIX cache
        await cacheStore.delete(CacheKeys.aix(registryId, sourceId));

        // Update state
        const installedSources = await ops.getInstalledSources();
        const installedIds = new Set(installedSources.map((s) => s.id));

        setIfCurrent(token, (state) => ({
          installedSources,
          availableSources: state.availableSources.map((s) => ({
            ...s,
            installed: installedIds.has(Keys.source(s.registryId, s.id)),
          })),
        }));
      },

      getSource: async (registryId: string, sourceId: string) => {
        const token = await beginAction();
        const { manager, availableSources } = get();

        // Registry is the single source of truth for loaded sources
        const registry = manager.getRegistry(registryId);
        if (!registry) return null;

        // Check if source needs installation (lazy install path)
        const isInstalled = await registry.isInstalled(sourceId);
        if (!generationGate.isCurrent(token)) return null;
        if (!isInstalled) {
          // Show install dialog for lazy installs
          const sourceInfo = availableSources.find(
            (s) => s.registryId === registryId && s.id === sourceId,
          );
          sourceInstallStore.getState().setInstalling({
            name: sourceInfo?.name ?? sourceId,
            icon: sourceInfo?.icon,
          });
        }

        try {
          if (!isInstalled) {
            // Keep the lazy-install persistence write on the same generation
            // token as this user action. registry.getSource() otherwise installs
            // through an unscoped callback after a reset has completed.
            await registry.installSource(sourceId, token.generation);
            if (!generationGate.isCurrent(token)) return null;
          }
          const source = await registry.getSource(sourceId);
          if (!generationGate.isCurrent(token)) return null;

          // If lazy install happened, refresh installedSources state
          if (!isInstalled && source) {
            const installedSources = await ops.getInstalledSources();
            const installedIds = new Set(installedSources.map((s) => s.id));
            setIfCurrent(token, (state) => ({
              installedSources,
              availableSources: state.availableSources.map((s) => ({
                ...s,
                installed: installedIds.has(Keys.source(s.registryId, s.id)),
              })),
            }));
          }

          return source;
        } finally {
          if (!isInstalled) {
            sourceInstallStore.getState().setInstalling(null);
          }
        }
      },

      reloadSource: async (registryId: string, sourceId: string) => {
        const token = await beginAction();
        const { manager } = get();

        const registry = manager.getRegistry(registryId);
        if (!registry) return null;

        // Unload from registry (disposes and clears its cache)
        registry.unloadSource(sourceId);

        // Load fresh from registry
        const source = await registry.getSource(sourceId);
        return generationGate.isCurrent(token) ? source : null;
      },

      installFromAix: async (file: File) => {
        const token = await beginAction();
        const registryId = LOCAL_REGISTRY_ID;
        const arrayBuffer = await file.arrayBuffer();
        if (!generationGate.isCurrent(token)) {
          throw new Error(
            "Source install cancelled because synced account data was reset.",
          );
        }

        // Extract to validate and get sourceId
        const { manifest } = extractAix(arrayBuffer);
        const sourceId = manifest.info?.id;
        if (!sourceId) {
          throw new Error("Invalid manifest: missing info.id");
        }

        // Cache the whole AIX package
        await cacheStore.set(CacheKeys.aix(registryId, sourceId), arrayBuffer);

        // Save to installed sources (id is composite key)
        await ops.saveInstalledSource(
          {
            id: Keys.source(registryId, sourceId),
            registryId,
            version: manifest.info?.version ?? 1,
            updatedAt: nextSyncTimestamp(),
          },
          token.generation,
        );

        // Reload installed sources
        const installedSources = await ops.getInstalledSources();
        setIfCurrent(token, { installedSources });
      },

      setReadingMode: (mode: ReadingMode) => {
        set({ readingMode: mode });
        try {
          localStorage.setItem(READING_MODE_KEY, mode);
        } catch {
          // Ignore localStorage errors
        }
      },
    };
  });
}
