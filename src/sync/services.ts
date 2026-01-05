/**
 * Sync Services - Module-level singletons (no React)
 * 
 * All services are created once at module load time.
 * Components import directly - no context needed.
 */

import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import { IndexedDBUserDataStore } from "@/data/indexeddb";
import { IndexedDBCacheStore } from "@/data/cache";
import type { LocalLibraryItem, LocalSourceLink, LocalMangaProgress, LocalChapterProgress, UserSettings } from "@/data/schema";
import { makeChapterProgressId, makeMangaProgressId, makeSourceLinkId } from "@/data/schema";
import { RegistryManager } from "@/lib/sources/registry";
import { createLibraryStore, type CanonicalLibraryOps } from "@/stores/library";
import { createHistoryStore, type HistoryStoreOps } from "@/stores/history";
import { createSettingsStore, type SettingsStoreOps } from "@/stores/settings";
import { createProgressStore } from "@/stores/progress";
import { getSyncStore } from "@/stores/sync";
import type { StoreHooks } from "./types";

// ============================================================================
// Module-level refs (set by SyncSetup)
// ============================================================================
export const convexRef: { current: ConvexReactClient | null } = { current: null };
export const isAuthenticatedRef: { current: boolean } = { current: false };
export const effectiveProfileIdRef: { current: string | undefined } = { current: undefined };
export const sessionUserIdRef: { current: string | undefined } = { current: undefined };
export const subscriptionStoppedRef: { current: boolean } = { current: false };

const LAST_PROFILE_ID_KEY = "nemu:last-profile-id";
const IMPORT_DECISION_KEY_PREFIX = "nemu:import-local-library:decision:";

export const lastProfileIdRef: { current: string | undefined } = { current: undefined };

// Initialize from localStorage
try {
  const raw = localStorage.getItem(LAST_PROFILE_ID_KEY) ?? undefined;
  lastProfileIdRef.current = raw && raw.startsWith("user:") ? raw : undefined;
} catch {
  lastProfileIdRef.current = undefined;
}

// ============================================================================
// Singletons
// ============================================================================
export const cacheStore = new IndexedDBCacheStore();
export type ProfileId = string | undefined;

export type ServicesContainer = {
  profileId: ProfileId;
  localStore: IndexedDBUserDataStore;
  cacheStore: IndexedDBCacheStore;
  registryManager: RegistryManager;
  stores: StoreHooks;
  useProgressStore: ReturnType<typeof createProgressStore>;
  dispose: () => void;
};

// ============================================================================
// Ops (use refs for dynamic values)
// ============================================================================
function createCanonicalLibraryOps(localStore: IndexedDBUserDataStore): CanonicalLibraryOps {
  return {
    getLibraryEntries: () => localStore.getLibraryEntries(),
    getLibraryItem: (id) => localStore.getLibraryItem(id),
    getSourceLinksForItem: (id) => localStore.getSourceLinksForLibraryItem(id),

    saveLibraryItem: async (item: LocalLibraryItem) => {
      await localStore.saveLibraryItem(item);
      
      if (isAuthenticatedRef.current && convexRef.current) {
        // IMPORTANT: don't write library_items to cloud without at least one source link.
        // That creates a transient invalid state for other devices (item exists, no links yet).
        // During add flow, the subsequent saveSourceLink() call will upsert item+link atomically.
        const links = await localStore.getSourceLinksForLibraryItem(item.libraryItemId);
        if (links.length === 0) return;

        await convexRef.current.mutation(api.library.save, {
          libraryItemId: item.libraryItemId,
          createdAt: item.createdAt,
          metadata: item.metadata,
          overrides: item.overrides,
          externalIds: item.externalIds,
          sourceOrder: item.sourceOrder,
          sources: links.map((link) => ({
            registryId: link.registryId,
            sourceId: link.sourceId,
            sourceMangaId: link.sourceMangaId,
            latestChapter: link.latestChapter,
            updateAckChapter: link.updateAckChapter,
          })),
          sourcesMode: "merge",
        });
      }
    },

    removeLibraryItem: async (libraryItemId: string) => {
      // Hard-delete locally (cache semantics) so UI updates immediately.
      await localStore.deleteLibraryItemAndLinks(libraryItemId);

      if (isAuthenticatedRef.current && convexRef.current) {
        await convexRef.current.mutation(api.library.remove, { libraryItemId });
      }
    },

    saveSourceLink: async (link: LocalSourceLink) => {
      await localStore.saveSourceLink(link);
      
      if (isAuthenticatedRef.current && convexRef.current) {
        const item = await localStore.getLibraryItem(link.libraryItemId);
        if (item) {
          await convexRef.current.mutation(api.library.save, {
            libraryItemId: link.libraryItemId,
            createdAt: item.createdAt,
            metadata: item.metadata,
            sources: [{
              registryId: link.registryId,
              sourceId: link.sourceId,
              sourceMangaId: link.sourceMangaId,
              latestChapter: link.latestChapter,
              updateAckChapter: link.updateAckChapter,
            }],
            sourcesMode: "merge",
          });
        }
      }
    },

    removeSourceLink: async (registryId: string, sourceId: string, sourceMangaId: string) => {
      const id = makeSourceLinkId(registryId, sourceId, sourceMangaId);
      await localStore.deleteSourceLink(id);

      if (isAuthenticatedRef.current && convexRef.current) {
        await convexRef.current.mutation(api.library.removeSourceLink, {
          registryId,
          sourceId,
          sourceMangaId,
        });
      }
    },
  };
}

function createHistoryOps(localStore: IndexedDBUserDataStore): HistoryStoreOps {
  return {
    getChapterProgress: async (registryId: string, sourceId: string, mangaId: string, chapterId: string): Promise<LocalChapterProgress | null> => {
      const progressId = makeChapterProgressId(registryId, sourceId, mangaId, chapterId);
      return localStore.getChapterProgressEntry(progressId);
    },
    
    saveChapterProgress: async (progress: LocalChapterProgress) => {
      await localStore.saveChapterProgressEntry(progress);
      
      // Update manga progress summary
      const mangaId = makeMangaProgressId(progress.registryId, progress.sourceId, progress.sourceMangaId);
      const mangaProgress: LocalMangaProgress = {
        id: mangaId,
        registryId: progress.registryId,
        sourceId: progress.sourceId,
        sourceMangaId: progress.sourceMangaId,
        lastReadAt: progress.lastReadAt,
        lastReadSourceChapterId: progress.sourceChapterId,
        lastReadChapterNumber: progress.chapterNumber,
        lastReadVolumeNumber: progress.volumeNumber,
        lastReadChapterTitle: progress.chapterTitle,
        updatedAt: Date.now(),
      };
      await localStore.saveMangaProgressEntry(mangaProgress);
      
      if (isAuthenticatedRef.current && convexRef.current) {
        await convexRef.current.mutation(api.history.save, {
          registryId: progress.registryId,
          sourceId: progress.sourceId,
          sourceMangaId: progress.sourceMangaId,
          sourceChapterId: progress.sourceChapterId,
          progress: progress.progress,
          total: progress.total,
          completed: progress.completed,
          lastReadAt: progress.lastReadAt,
          chapterNumber: progress.chapterNumber,
          volumeNumber: progress.volumeNumber,
          chapterTitle: progress.chapterTitle,
        });
      }
    },
    
    getMangaChapterProgress: async (registryId: string, sourceId: string, mangaId: string): Promise<Record<string, LocalChapterProgress>> => {
      return localStore.getChapterProgressForManga(registryId, sourceId, mangaId);
    },
  };
}

function createSettingsOps(localStore: IndexedDBUserDataStore): SettingsStoreOps {
  return {
    // Filter out tombstones (removed=true) for UI consumers
    getInstalledSources: async () => {
      const all = await localStore.getInstalledSources();
      return all.filter((s) => !s.removed);
    },
    getInstalledSource: async (id: string) => {
      const source = await localStore.getInstalledSource(id);
      return source && !source.removed ? source : null;
    },
    
    saveInstalledSource: async (source: Parameters<IndexedDBUserDataStore["saveInstalledSource"]>[0]) => {
      // Save to local IDB first (ensures removed=false or undefined)
      await localStore.saveInstalledSource(source);
      
      // Push per-item mutation to cloud
      if (isAuthenticatedRef.current && convexRef.current) {
        await convexRef.current.mutation(api.settings.saveInstalledSource, { source });
      }
    },
    
    removeInstalledSource: async (id: string, registryId: string) => {
      // Tombstone locally (sets removed=true with updatedAt)
      await localStore.removeInstalledSource(id);
      
      // Push tombstone to cloud
      if (isAuthenticatedRef.current && convexRef.current) {
        await convexRef.current.mutation(api.settings.removeInstalledSource, { id, registryId });
      }
    },
  };
}

export function createServicesContainer(profileId: ProfileId): ServicesContainer {
  const localStore = new IndexedDBUserDataStore(profileId);
  const registryManager = new RegistryManager(localStore, localStore, cacheStore);

  // Zustand stores must capture THIS container's stores/ops (avoid closing over mutable module exports).
  const settingsOps = createSettingsOps(localStore);
  registryManager.setInstalledSourceStore(settingsOps);

  const useLibraryStore = createLibraryStore(createCanonicalLibraryOps(localStore));
  const useHistoryStore = createHistoryStore(createHistoryOps(localStore));
  const useSettingsStore = createSettingsStore(settingsOps, cacheStore, registryManager);
  const useProgressStore = createProgressStore({
    getAllMangaProgress: () => localStore.getAllMangaProgress(),
  });

  const stores: StoreHooks = {
    useLibraryStore,
    useHistoryStore,
    useSettingsStore,
  };

  const dispose = () => {
    // Best-effort cleanup of loaded source instances to avoid background work leaking across profiles.
    // Use disposeLoadedSources() not dispose() to avoid clearing registries (React Strict Mode safe).
    try {
      registryManager.disposeLoadedSources();
    } catch {
      // ignore
    }
  };

  return { profileId, localStore, cacheStore, registryManager, stores, useProgressStore, dispose };
}

// NOTE: profile-scoped services are no longer module singletons.
// They are created and owned by a React Provider (see `src/data/services-provider.tsx`).

// ============================================================================
// signOut function
// ============================================================================
export async function signOut(currentLocalStore: IndexedDBUserDataStore, keepData: boolean): Promise<void> {
  const currentProfileId = effectiveProfileIdRef.current;
  const currentUserId = sessionUserIdRef.current;
  const syncStore = getSyncStore();
  

  lastProfileIdRef.current = undefined;
  try { localStorage.removeItem(LAST_PROFILE_ID_KEY); } catch {}
  
  subscriptionStoppedRef.current = true;
  
  if (keepData && currentProfileId) {
    const localProfile = new IndexedDBUserDataStore();
    
    const items = await currentLocalStore.getAllLibraryItems({ includeRemoved: true });
    for (const item of items) await localProfile.saveLibraryItem(item);
    
    const links = await currentLocalStore.getAllSourceLinks();
    for (const link of links) await localProfile.saveSourceLink(link);
    
    const chapters = await currentLocalStore.getAllChapterProgress();
    for (const ch of chapters) await localProfile.saveChapterProgressEntry(ch);
    
    const mangas = await currentLocalStore.getAllMangaProgress();
    for (const m of mangas) await localProfile.saveMangaProgressEntry(m);
    
    const settings = await currentLocalStore.getSettings();
    await localProfile.saveSettings(settings as UserSettings);
  }
  
  await currentLocalStore.clearAccountData();
  try {
    if (currentUserId) localStorage.removeItem(`${IMPORT_DECISION_KEY_PREFIX}${currentUserId}`);
  } catch {}
  
  sessionStorage.removeItem("nemu:import-offered-session");
  syncStore.getState().reset();

  // Allow future sign-ins without requiring a full reload.
  // (The subscription guard already checks auth state; this flag is only for "stop everything during destructive actions".)
  subscriptionStoppedRef.current = false;
}

// ============================================================================
// Helper functions
// ============================================================================
export function makeProfileId(userId: string | null | undefined): string | undefined {
  return userId ? `user:${userId}` : undefined;
}

export function loadChapterProgress(
  localStore: IndexedDBUserDataStore,
  registryId: string,
  sourceId: string,
  sourceMangaId: string
) {
  return localStore.getChapterProgressForManga(registryId, sourceId, sourceMangaId);
}

export function getDebugInfo() {
  return {
    sessionProfileId: sessionUserIdRef.current ? `user:${sessionUserIdRef.current}` : undefined,
    effectiveProfileId: effectiveProfileIdRef.current,
    userDbName: effectiveProfileIdRef.current ? `nemu-user::${effectiveProfileIdRef.current}` : "nemu-user",
  };
}

// ============================================================================
// Convex actions (quarantined here - UI components should not import Convex)
// ============================================================================

/** Clear all cloud data for current user */
export async function clearCloudData(): Promise<void> {
  if (!isAuthenticatedRef.current || !convexRef.current) return;
  await convexRef.current.mutation(api.library.clearAll, {});
}

/** Search MangaUpdates (client-side via CORS proxy) */
export { searchMangaUpdatesRaw as searchMangaUpdates } from "@/lib/metadata/providers/mangaupdates";

