/**
 * Sync Hooks - Direct imports from services, Zustand selectors for reactive state
 */

import { useCallback, useState, useEffect } from "react";
import type { LocalChapterProgress, LocalMangaProgress } from "@/data/schema";
import { makeMangaProgressId } from "@/data/schema";
import { getSyncStore } from "@/stores/sync";
import { loadChapterProgress, signOut } from "./services";
import { useDataServices, useProgressStoreApi } from "@/data/services-provider";
export { useDataServices, useStores } from "@/data/services-provider";

// ============================================================================
// Service accessors (profile-scoped, provided by React Context)
// ============================================================================

export function useSignOut() {
  const { localStore } = useDataServices();
  return useCallback((keepData: boolean) => signOut(localStore, keepData), [localStore]);
}

// ============================================================================
// Auth state (Zustand selectors)
// ============================================================================

export function useAuth() {
  const store = getSyncStore();
  const isAuthenticated = store((s) => s.isAuthenticated);
  const isLoading = store((s) => s.isLoading);
  return { isAuthenticated, isLoading };
}

export function useSyncStatus() {
  const store = getSyncStore();
  const syncStatus = store((s) => s.syncStatus);
  const isAuthenticated = store((s) => s.isAuthenticated);
  return {
    status: syncStatus,
    isOnline: syncStatus !== "offline",
    isSyncing: syncStatus === "syncing",
    isSynced: syncStatus === "synced",
    isAuthenticated,
  };
}

export function useSyncStore() {
  return getSyncStore();
}

// ============================================================================
// Progress store selectors (context-backed)
// ============================================================================

function useProgressStore<T>(selector: (s: { index: Map<string, LocalMangaProgress>; loading: boolean; get: (id: string) => LocalMangaProgress | undefined }) => T): T {
  const store = useProgressStoreApi();
  return store(selector as any);
}

// ============================================================================
// Manga progress (Zustand selectors - no useEffect!)
// ============================================================================

/** Get all manga progress as a Map (for library page sorting) */
export function useAllMangaProgress(): Map<string, LocalMangaProgress> {
  return useProgressStore((s) => s.index);
}

/** Get progress loading state */
export function useProgressLoading(): boolean {
  return useProgressStore((s) => s.loading);
}

/** Get progress for a source link */
export function useSourceLinkProgress(
  registryId: string | undefined,
  sourceId: string | undefined,
  sourceMangaId: string | undefined
): LocalMangaProgress | undefined {
  const id = registryId && sourceId && sourceMangaId
    ? makeMangaProgressId(registryId, sourceId, sourceMangaId)
    : undefined;
  return useProgressStore((s) => id ? s.get(id) : undefined);
}

// ============================================================================
// Chapter progress (on-demand loading - needs useEffect for async IDB read)
// ============================================================================

export function useChapterProgress(
  registryId: string | undefined,
  sourceId: string | undefined,
  sourceMangaId: string | undefined
): { chapters: Record<string, LocalChapterProgress>; loading: boolean } {
  const [chapters, setChapters] = useState<Record<string, LocalChapterProgress>>({});
  const [loading, setLoading] = useState(false);
  const { localStore } = useDataServices();

  useEffect(() => {
    if (!registryId || !sourceId || !sourceMangaId) {
      setChapters({});
      return;
    }
    
    setLoading(true);
    loadChapterProgress(localStore, registryId, sourceId, sourceMangaId)
      .then(setChapters)
      .finally(() => setLoading(false));
  }, [localStore, registryId, sourceId, sourceMangaId]);

  return { chapters, loading };
}

export function useChapterProgressLoader() {
  const { localStore } = useDataServices();
  return useCallback(
    (registryId: string, sourceId: string, sourceMangaId: string) =>
      loadChapterProgress(localStore, registryId, sourceId, sourceMangaId),
    [localStore]
  );
}
