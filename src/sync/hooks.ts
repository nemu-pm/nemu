/**
 * Sync Hooks - Direct imports from services, Zustand selectors for reactive state
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LocalChapterProgress, LocalMangaProgress } from "@/data/schema";
import { makeMangaProgressId } from "@/data/schema";
import { getSyncStore } from "@/stores/sync";
import { safeErrorCategory } from "@/lib/error-diagnostic";
import { signOut } from "./services";
import {
  useDataServices,
  useProgressStoreApi,
  useStores,
} from "@/data/services-provider";
export { useDataServices, useStores } from "@/data/services-provider";

type ProgressStoreState = ReturnType<
  ReturnType<typeof useProgressStoreApi>["getState"]
>;

// ============================================================================
// Service accessors (profile-scoped, provided by React Context)
// ============================================================================

export function useSignOut() {
  const { localStore } = useDataServices();
  return useCallback(
    (keepData: boolean, signOutRemotely: () => Promise<void>) =>
      signOut(localStore, keepData, signOutRemotely),
    [localStore],
  );
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
    // Only the two healthy states count as online. A limit or upgrade failure
    // means nothing is flowing, so it must not read as a live connection.
    isOnline: syncStatus === "syncing" || syncStatus === "synced",
    isSyncing: syncStatus === "syncing",
    isSynced: syncStatus === "synced",
    isLimitExceeded: syncStatus === "limit-exceeded",
    isClockInvalid: syncStatus === "clock-invalid",
    requiresReload:
      syncStatus === "upgrade-required" || syncStatus === "clock-invalid",
    isAuthenticated,
  };
}

export function useSyncStore() {
  return getSyncStore();
}

// ============================================================================
// Progress store selectors (context-backed)
// ============================================================================

function useProgressStore<T>(
  selector: (state: ProgressStoreState) => T,
): T {
  const store = useProgressStoreApi();
  return store(selector);
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
  sourceMangaId: string | undefined,
): LocalMangaProgress | undefined {
  const id =
    registryId && sourceId && sourceMangaId
      ? makeMangaProgressId(registryId, sourceId, sourceMangaId)
      : undefined;
  return useProgressStore((s) => (id ? s.get(id) : undefined));
}

// ============================================================================
// Chapter progress (on-demand loading - needs useEffect for async IDB read)
// ============================================================================

export function useChapterProgress(
  registryId: string | undefined,
  sourceId: string | undefined,
  sourceMangaId: string | undefined,
): { chapters: Record<string, LocalChapterProgress>; loading: boolean } {
  const historyStore = useStores().useHistoryStore;
  const syncGeneration = historyStore((state) => state.syncGeneration);
  const entries = historyStore((state) => state.entries);
  const [loadState, setLoadState] = useState<{
    store: typeof historyStore;
    generation: number | null;
    loading: boolean;
  } | null>(null);
  const hasIdentity = Boolean(registryId && sourceId && sourceMangaId);
  const chapters = useMemo(
    () =>
      !hasIdentity
        ? {}
        : Object.fromEntries(
            [...entries.values()]
              .filter(
                (entry) =>
                  entry.registryId === registryId &&
                  entry.sourceId === sourceId &&
                  entry.sourceMangaId === sourceMangaId,
              )
              .map((entry) => [entry.sourceChapterId, entry]),
          ),
    [entries, hasIdentity, registryId, sourceId, sourceMangaId],
  );

  useEffect(() => {
    let current = true;
    if (!registryId || !sourceId || !sourceMangaId) {
      setLoadState({
        store: historyStore,
        generation: syncGeneration,
        loading: false,
      });
      return () => {
        current = false;
      };
    }

    setLoadState({
      store: historyStore,
      generation: syncGeneration,
      loading: true,
    });
    historyStore
      .getState()
      .getMangaProgress(registryId, sourceId, sourceMangaId)
      .then(() => {
        if (!current) return;
        setLoadState({
          store: historyStore,
          generation: syncGeneration,
          loading: false,
        });
      })
      .catch((error) => {
        if (!current) return;
        console.error(
          "[useChapterProgress] Failed to load progress:",
          safeErrorCategory(error),
        );
        setLoadState({
          store: historyStore,
          generation: syncGeneration,
          loading: false,
        });
      });
    return () => {
      current = false;
    };
  }, [historyStore, registryId, sourceId, sourceMangaId, syncGeneration]);

  // Load state survives a React provider child re-render. Tag it with both the
  // immutable profile store and generation. Chapter rows themselves come from
  // the generation-gated Zustand cache, which is cleared synchronously by the
  // transition and cannot display the prior profile while this effect reloads.
  if (
    !loadState ||
    loadState.store !== historyStore ||
    loadState.generation !== syncGeneration
  ) {
    return { chapters, loading: hasIdentity };
  }
  return { chapters, loading: loadState.loading };
}

export function useChapterProgressLoader() {
  const historyStore = useStores().useHistoryStore;
  return useCallback(
    (registryId: string, sourceId: string, sourceMangaId: string) =>
      historyStore
        .getState()
        .getMangaProgress(registryId, sourceId, sourceMangaId),
    [historyStore],
  );
}
