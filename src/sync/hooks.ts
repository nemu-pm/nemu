import { useContext, useState, useEffect, useCallback } from "react";
import { SyncContext } from "./context";
import type { DataServices, StoreHooks, SyncContextValue, MangaProgressIndex } from "./types";
import type { LocalChapterProgress } from "@/data/schema";
import { getSyncStore } from "@/stores/sync";

export function useSyncContext(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    throw new Error("useSyncContext must be used within SyncProvider");
  }
  return ctx;
}

export function useDataServices(): DataServices {
  return useSyncContext().services;
}

export function useStores(): StoreHooks {
  return useSyncContext().stores;
}

export function useAuth() {
  const { isAuthenticated, isLoading } = useSyncContext();
  return { isAuthenticated, isLoading };
}

export function useSyncStatus() {
  const { syncStatus, isAuthenticated } = useSyncContext();
  return {
    status: syncStatus,
    isOnline: syncStatus !== "offline",
    isSyncing: syncStatus === "syncing",
    isSynced: syncStatus === "synced",
    isAuthenticated,
  };
}

export function useSignOut() {
  const { signOut } = useSyncContext();
  return signOut;
}

export function useSyncStore() {
  return getSyncStore();
}

/**
 * Get manga progress index (canonical).
 * Returns all manga_progress entries as a Map keyed by id.
 * Use for: sorting library by last read, continue-reading widgets.
 */
export function useMangaProgressIndex(): { index: MangaProgressIndex; loading: boolean } {
  const { mangaProgressIndex, mangaProgressLoading } = useSyncContext();
  return { index: mangaProgressIndex, loading: mangaProgressLoading };
}

/**
 * Load chapter progress on-demand for a specific source-manga.
 * Returns a map of chapterId -> LocalChapterProgress.
 * Use for: chapter list progress indicators, reader resume.
 */
export function useChapterProgress(
  registryId: string | undefined,
  sourceId: string | undefined,
  sourceMangaId: string | undefined
): { chapters: Record<string, LocalChapterProgress>; loading: boolean } {
  const { loadChapterProgress } = useSyncContext();
  const [chapters, setChapters] = useState<Record<string, LocalChapterProgress>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!registryId || !sourceId || !sourceMangaId) {
      setChapters({});
      return;
    }
    
    setLoading(true);
    loadChapterProgress(registryId, sourceId, sourceMangaId)
      .then(setChapters)
      .finally(() => setLoading(false));
  }, [registryId, sourceId, sourceMangaId, loadChapterProgress]);

  return { chapters, loading };
}

/**
 * Imperative chapter progress loader (for callbacks).
 */
export function useChapterProgressLoader() {
  const { loadChapterProgress } = useSyncContext();
  return useCallback(
    (registryId: string, sourceId: string, sourceMangaId: string) =>
      loadChapterProgress(registryId, sourceId, sourceMangaId),
    [loadChapterProgress]
  );
}
