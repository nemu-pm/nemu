/**
 * Sync Services - Module-level singletons (no React)
 *
 * All services are created once at module load time.
 * Components import directly - no context needed.
 */

import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import { IndexedDBUserDataStore } from "@/data/indexeddb";
import {
  IndexedDBCacheStore,
  ProfileScopedCacheStore,
  type CacheStore,
} from "@/data/cache";
import type {
  LocalLibraryItem,
  LocalSourceLink,
  LocalChapterProgress,
  LocalCollection,
} from "@/data/schema";
import {
  makeChapterProgressId,
  makeSourceLinkId,
} from "@/data/schema";
import {
  chunkCollectionMutationItems,
  mangaProgressFromChapterProgress,
  nextSyncTimestamp,
  toCloudHistorySaveInput,
  toCloudInstalledSource,
  toCloudLibrarySaveInput,
  toCloudLibrarySaveInputBatches,
} from "@nemu/core";
import { RegistryManager } from "@/lib/sources/registry";
import { createLibraryStore, type CanonicalLibraryOps } from "@/stores/library";
import { createHistoryStore, type HistoryStoreOps } from "@/stores/history";
import { createSettingsStore, type SettingsStoreOps } from "@/stores/settings";
import {
  createCollectionsStore,
  type CanonicalCollectionsOps,
} from "@/stores/collections";
import { createProgressStore } from "@/stores/progress";
import { getSyncStore } from "@/stores/sync";
import {
  clearSourceSettingsProfile,
  getSourceSettingsStoreForProfile,
  type SourceSettingsStore,
} from "@/stores/source-settings";
import type { StoreHooks } from "./types";
import {
  isSyncAccountOperationIdentityCurrent,
  isSyncMutationIdentityCurrent,
  type SyncAccountOperationIdentity,
} from "./mutation-context";
import {
  setSyncSubscriptionsStopped,
  subscriptionStoppedRef,
} from "./subscription-gate";
import { orchestrateRemoteFirstSignOut } from "./sign-out-orchestration";
import { getImportOfferedSessionKey } from "./import-offer";
import { runSyncMutation } from "./sync-error-recovery";
export {
  getSyncSubscriptionsStopped,
  setSyncSubscriptionsStopped,
  subscribeSyncSubscriptionsStopped,
  subscriptionStoppedRef,
} from "./subscription-gate";

// ============================================================================
// Module-level refs (set by SyncSetup)
// ============================================================================
export const convexRef: { current: ConvexReactClient | null } = {
  current: null,
};
export const isAuthenticatedRef: { current: boolean } = { current: false };
export const effectiveProfileIdRef: { current: string | undefined } = {
  current: undefined,
};
export const sessionUserIdRef: { current: string | undefined } = {
  current: undefined,
};
export const authSessionIdRef: { current: string | undefined } = {
  current: undefined,
};
export const authSessionRevisionRef: { current: number } = { current: 0 };

type ActiveLocalSignOut = {
  operationId: object;
  userId: string;
  authSessionRevision: number;
  controller: AbortController;
};

let activeLocalSignOut: ActiveLocalSignOut | null = null;

export function updateObservedAuthSession(
  authenticated: boolean,
  userId: string | undefined,
  sessionId: string | undefined,
): void {
  if (
    isAuthenticatedRef.current !== authenticated ||
    sessionUserIdRef.current !== userId ||
    authSessionIdRef.current !== sessionId
  ) {
    authSessionRevisionRef.current += 1;
  }
  isAuthenticatedRef.current = authenticated;
  sessionUserIdRef.current = userId;
  authSessionIdRef.current = sessionId;
  const signOut = activeLocalSignOut;
  if (
    signOut &&
    authenticated &&
    userId === signOut.userId &&
    authSessionRevisionRef.current !== signOut.authSessionRevision
  ) {
    signOut.controller.abort();
  }
}
export function resumeSyncAfterFailedSignOut(): void {
  setSyncSubscriptionsStopped(false);
}

const LAST_PROFILE_ID_KEY = "nemu:last-profile-id";
const IMPORT_DECISION_KEY_PREFIX = "nemu:import-local-library:decision:";
export const LOCAL_PROFILE_IMPORT_EVENT = "nemu:local-profile-imported";

export const lastProfileIdRef: { current: string | undefined } = {
  current: undefined,
};

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
  cacheStore: CacheStore;
  registryManager: RegistryManager;
  sourceSettingsStore: SourceSettingsStore;
  stores: StoreHooks;
  useProgressStore: ReturnType<typeof createProgressStore>;
  dispose: () => void;
};

function mutationContext(
  localStore: IndexedDBUserDataStore,
  generation: number | null,
): {
  convex: ConvexReactClient;
  expectedUserId: string;
  generation: number;
} | null {
  const convex = convexRef.current;
  const identity = {
    authenticated: isAuthenticatedRef.current,
    subscriptionStopped: subscriptionStoppedRef.current,
    sessionUserId: sessionUserIdRef.current,
    effectiveProfileId: effectiveProfileIdRef.current,
    localProfileId: localStore.profileId,
    generation,
  };
  if (
    !convex ||
    generation === null ||
    !isSyncMutationIdentityCurrent(identity)
  ) {
    return null;
  }
  return {
    convex,
    expectedUserId: identity.sessionUserId,
    generation,
  };
}

// ============================================================================
// Ops (use refs for dynamic values)
// ============================================================================
function createCanonicalLibraryOps(
  localStore: IndexedDBUserDataStore,
): CanonicalLibraryOps {
  return {
    getLibraryEntries: () => localStore.getLibraryEntries(),
    getLibraryItem: (id) => localStore.getLibraryItem(id),
    getSourceLinksForItem: (id) => localStore.getSourceLinksForLibraryItem(id),

    saveLibraryItem: async (item: LocalLibraryItem) => {
      const { generation } = await localStore.runWithSyncWrite(async () => {
        const existing = await localStore.getLibraryItem(item.libraryItemId);
        const localItem =
          !existing || item.updatedAt > existing.updatedAt
            ? item
            : { ...item, updatedAt: nextSyncTimestamp(existing.updatedAt) };
        await localStore.saveLibraryItem(localItem);
        return { generation: await localStore.getSyncGeneration() };
      });

      const context = mutationContext(localStore, generation);
      if (context) {
        // IMPORTANT: don't write library_items to cloud without at least one source link.
        // That creates a transient invalid state for other devices (item exists, no links yet).
        // During add flow, the subsequent saveSourceLink() call will upsert item+link atomically.
        const [latestItem, allLinks] = await Promise.all([
          localStore.getLibraryItem(item.libraryItemId),
          localStore.getAllSourceLinks(),
        ]);
        if (!latestItem || latestItem.inLibrary === false) return;
        const links = allLinks.filter(
          (link) => link.libraryItemId === item.libraryItemId,
        );
        if (links.length === 0) return;

        // The reads above yield back to React/auth. Re-acquire the context at
        // the actual mutation boundary so profile A cannot be sent through a
        // Convex client whose session switched to profile B in the meantime.
        for (const input of toCloudLibrarySaveInputBatches(latestItem, links)) {
          const currentContext = mutationContext(localStore, generation);
          if (!currentContext) return;
          await runSyncMutation(() => currentContext.convex.mutation(api.library.save, {
            expectedUserId: currentContext.expectedUserId,
            ...input,
            generation: currentContext.generation,
          }));
        }
      }
    },

    removeLibraryItem: async (libraryItemId: string) => {
      const { updatedAt, generation } = await localStore.runWithSyncWrite(async () => {
        const [existing, collectionItems] = await Promise.all([
          localStore.getLibraryItem(libraryItemId),
          localStore.getCollectionItems(),
        ]);
        const updatedAt = nextSyncTimestamp(
          existing?.updatedAt,
          ...collectionItems
            .filter((item) => item.libraryItemId === libraryItemId)
            .map((item) => item.updatedAt),
        );
        await localStore.deleteLibraryItemAndLinks(libraryItemId, updatedAt);
        return { updatedAt, generation: await localStore.getSyncGeneration() };
      });

      const context = mutationContext(localStore, generation);
      if (context) {
        await runSyncMutation(() => context.convex.mutation(api.library.remove, {
          expectedUserId: context.expectedUserId,
          libraryItemId,
          updatedAt,
          generation: context.generation,
        }));
      }
    },

    saveSourceLink: async (link: LocalSourceLink) => {
      const { generation } = await localStore.runWithSyncWrite(async () => {
        const existing = await localStore.getSourceLink(link.id);
        const localLink =
          !existing || link.updatedAt > existing.updatedAt
            ? link
            : { ...link, updatedAt: nextSyncTimestamp(existing.updatedAt) };
        await localStore.saveSourceLink(localLink);
        return { generation: await localStore.getSyncGeneration() };
      });

      const context = mutationContext(localStore, generation);
      if (context) {
        const [item, latestLink] = await Promise.all([
          localStore.getLibraryItem(link.libraryItemId),
          localStore.getSourceLink(link.id),
        ]);
        if (item && item.inLibrary !== false && latestLink) {
          const currentContext = mutationContext(localStore, generation);
          if (!currentContext) return;
          await runSyncMutation(() => currentContext.convex.mutation(api.library.save, {
            expectedUserId: currentContext.expectedUserId,
            ...toCloudLibrarySaveInput(item, [latestLink]),
            generation: currentContext.generation,
          }));
        }
      }
    },

    removeSourceLink: async (
      registryId: string,
      sourceId: string,
      sourceMangaId: string,
    ) => {
      const id = makeSourceLinkId(registryId, sourceId, sourceMangaId);
      const { existing, updatedAt, generation } = await localStore.runWithSyncWrite(async () => {
        const existing = await localStore.getSourceLink(id);
        const updatedAt = nextSyncTimestamp(existing?.updatedAt);
        await localStore.deleteSourceLink(id, updatedAt);
        return { existing, updatedAt, generation: await localStore.getSyncGeneration() };
      });

      const context = mutationContext(localStore, generation);
      if (context) {
        await runSyncMutation(() => context.convex.mutation(api.library.removeSourceLink, {
          expectedUserId: context.expectedUserId,
          registryId,
          sourceId,
          sourceMangaId,
          libraryItemId: existing?.libraryItemId,
          createdAt: existing?.createdAt,
          updatedAt,
          generation: context.generation,
        }));
      }
    },
  };
}

function createHistoryOps(localStore: IndexedDBUserDataStore): HistoryStoreOps {
  return {
    getChapterProgress: async (
      registryId: string,
      sourceId: string,
      mangaId: string,
      chapterId: string,
    ): Promise<LocalChapterProgress | null> => {
      const progressId = makeChapterProgressId(
        registryId,
        sourceId,
        mangaId,
        chapterId,
      );
      return localStore.getChapterProgressEntry(progressId);
    },

    saveChapterProgress: async (progress: LocalChapterProgress) => {
      const { localProgress, generation } = await localStore.runWithSyncWrite(async () => {
        const existing = await localStore.getChapterProgressEntry(progress.id);
        const updatedAt =
          !existing || progress.updatedAt > existing.updatedAt
            ? progress.updatedAt
            : nextSyncTimestamp(existing.updatedAt);
        const localProgress =
          updatedAt === progress.updatedAt
            ? progress
            : { ...progress, lastReadAt: updatedAt, updatedAt };
        await localStore.saveChapterProgressEntry(localProgress);

        // Update manga progress summary in the same reset-ordered local phase.
        const derived = mangaProgressFromChapterProgress(localProgress);
        const existingManga = (await localStore.getAllMangaProgress()).find(
          (entry) => entry.id === derived.id,
        );
        const mangaProgress = {
          ...derived,
          updatedAt:
            !existingManga || localProgress.updatedAt > existingManga.updatedAt
              ? localProgress.updatedAt
              : nextSyncTimestamp(existingManga.updatedAt),
        };
        await localStore.saveMangaProgressEntry(mangaProgress);
        return { localProgress, generation: await localStore.getSyncGeneration() };
      });

      const context = mutationContext(localStore, generation);
      if (context) {
        await runSyncMutation(() => context.convex.mutation(api.history.save, {
          expectedUserId: context.expectedUserId,
          ...toCloudHistorySaveInput(localProgress),
          generation: context.generation,
        }));
      }
    },

    getMangaChapterProgress: async (
      registryId: string,
      sourceId: string,
      mangaId: string,
    ): Promise<Record<string, LocalChapterProgress>> => {
      return localStore.getChapterProgressForManga(
        registryId,
        sourceId,
        mangaId,
      );
    },
  };
}

function createSettingsOps(
  localStore: IndexedDBUserDataStore,
): SettingsStoreOps {
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

    saveInstalledSource: async (
      source: Parameters<IndexedDBUserDataStore["saveInstalledSource"]>[0],
    ) => {
      const { generation } = await localStore.runWithSyncWrite(async () => {
        // Save to local IDB first (ensures removed=false or undefined).
        const existing = await localStore.getInstalledSource(source.id);
        const localSource = {
          ...source,
          updatedAt: Math.max(
            source.updatedAt ?? 0,
            nextSyncTimestamp(existing?.updatedAt),
          ),
        };
        await localStore.saveInstalledSource(localSource);
        return { generation: await localStore.getSyncGeneration() };
      });

      // Push per-item mutation to cloud
      const context = mutationContext(localStore, generation);
      if (context) {
        const latest = await localStore.getInstalledSource(source.id);
        if (!latest || latest.removed) return;
        const currentContext = mutationContext(localStore, generation);
        if (!currentContext) return;
        await runSyncMutation(() => currentContext.convex.mutation(api.settings.saveInstalledSource, {
          expectedUserId: currentContext.expectedUserId,
          source: toCloudInstalledSource(latest),
          generation: currentContext.generation,
        }));
      }
    },

    removeInstalledSource: async (id: string, registryId: string) => {
      const { updatedAt, generation } = await localStore.runWithSyncWrite(async () => {
        // Tombstone locally (sets removed=true with updatedAt).
        const existing = await localStore.getInstalledSource(id);
        const updatedAt = nextSyncTimestamp(existing?.updatedAt);
        await localStore.removeInstalledSource(id, registryId, updatedAt);
        return { updatedAt, generation: await localStore.getSyncGeneration() };
      });

      // Push tombstone to cloud
      const context = mutationContext(localStore, generation);
      if (context) {
        await runSyncMutation(() => context.convex.mutation(api.settings.removeInstalledSource, {
          expectedUserId: context.expectedUserId,
          id,
          registryId,
          updatedAt,
          generation: context.generation,
        }));
      }
    },
  };
}

function createCanonicalCollectionsOps(
  localStore: IndexedDBUserDataStore,
): CanonicalCollectionsOps {
  return {
    getCollections: () => localStore.getCollections(),
    getCollectionItems: () => localStore.getCollectionItems(),

    saveCollection: async (collection: LocalCollection) => {
      const { generation } = await localStore.runWithSyncWrite(async () => {
        const existing = (await localStore.getCollections()).find(
          (item) => item.collectionId === collection.collectionId,
        );
        const localCollection =
          !existing || collection.updatedAt > existing.updatedAt
            ? collection
            : { ...collection, updatedAt: nextSyncTimestamp(existing.updatedAt) };
        await localStore.saveCollection(localCollection);
        return { generation: await localStore.getSyncGeneration() };
      });

      const context = mutationContext(localStore, generation);
      if (context) {
        const latest = await localStore.getCollections().then((collections) =>
          collections.find((item) => item.collectionId === collection.collectionId),
        );
        if (!latest) return;
        const currentContext = mutationContext(localStore, generation);
        if (!currentContext) return;
        await runSyncMutation(() => currentContext.convex.mutation(api.collections.save, {
          expectedUserId: currentContext.expectedUserId,
          collectionId: latest.collectionId,
          name: latest.name,
          createdAt: latest.createdAt,
          updatedAt: latest.updatedAt,
          removed: latest.removed,
          generation: currentContext.generation,
        }));
      }
    },

    removeCollection: async (collectionId: string) => {
      const { updatedAt, generation } = await localStore.runWithSyncWrite(async () => {
        const [collection, items] = await Promise.all([
          localStore.getCollections().then((collections) =>
            collections.find((item) => item.collectionId === collectionId),
          ),
          localStore.getCollectionItems(),
        ]);
        const updatedAt = nextSyncTimestamp(
          collection?.updatedAt,
          ...items
            .filter((item) => item.collectionId === collectionId)
            .map((item) => item.updatedAt),
        );
        await localStore.deleteCollection(collectionId, updatedAt);
        return { updatedAt, generation: await localStore.getSyncGeneration() };
      });

      const context = mutationContext(localStore, generation);
      if (context) {
        await runSyncMutation(() => context.convex.mutation(api.collections.remove, {
          expectedUserId: context.expectedUserId,
          collectionId,
          updatedAt,
          generation: context.generation,
        }));
      }
    },

    addCollectionItems: async (
      collectionId: string,
      libraryItemIds: string[],
    ) => {
      const { updatedAt, generation } = await localStore.runWithSyncWrite(async () => {
        const items = await localStore.getCollectionItems();
        const updatedAt = nextSyncTimestamp(
          ...items
            .filter(
              (item) =>
                item.collectionId === collectionId &&
                libraryItemIds.includes(item.libraryItemId),
            )
            .map((item) => item.updatedAt),
        );
        await localStore.addCollectionItems(collectionId, libraryItemIds, updatedAt);
        return { updatedAt, generation: await localStore.getSyncGeneration() };
      });

      const context = mutationContext(localStore, generation);
      if (context) {
        const collection = (await localStore.getCollections()).find(
          (item) => item.collectionId === collectionId,
        );
        if (!collection || collection.removed) return;
        const currentContext = mutationContext(localStore, generation);
        if (!currentContext) return;
        for (const batch of chunkCollectionMutationItems(libraryItemIds)) {
          await runSyncMutation(() => currentContext.convex.mutation(api.collections.addItems, {
            expectedUserId: currentContext.expectedUserId,
            collectionId,
            libraryItemIds: batch,
            updatedAt,
            generation: currentContext.generation,
          }));
        }
      }
    },

    removeCollectionItems: async (
      collectionId: string,
      libraryItemIds: string[],
    ) => {
      const { updatedAt, generation } = await localStore.runWithSyncWrite(async () => {
        const items = await localStore.getCollectionItems();
        const updatedAt = nextSyncTimestamp(
          ...items
            .filter(
              (item) =>
                item.collectionId === collectionId &&
                libraryItemIds.includes(item.libraryItemId),
            )
            .map((item) => item.updatedAt),
        );
        await localStore.removeCollectionItems(collectionId, libraryItemIds, updatedAt);
        return { updatedAt, generation: await localStore.getSyncGeneration() };
      });

      const context = mutationContext(localStore, generation);
      if (context) {
        for (const batch of chunkCollectionMutationItems(libraryItemIds)) {
          await runSyncMutation(() => context.convex.mutation(api.collections.removeItems, {
            expectedUserId: context.expectedUserId,
            collectionId,
            libraryItemIds: batch,
            updatedAt,
            generation: context.generation,
          }));
        }
      }
    },
  };
}

export function createServicesContainer(
  profileId: ProfileId,
): ServicesContainer {
  const localStore = new IndexedDBUserDataStore(profileId);
  const profileCacheStore = new ProfileScopedCacheStore(cacheStore, profileId);
  const sourceSettingsStore = getSourceSettingsStoreForProfile(profileId);
  const registryManager = new RegistryManager(
    localStore,
    localStore,
    profileCacheStore,
    sourceSettingsStore,
  );

  // Zustand stores must capture THIS container's stores/ops (avoid closing over mutable module exports).
  const settingsOps = createSettingsOps(localStore);
  registryManager.setInstalledSourceStore(settingsOps);

  const useLibraryStore = createLibraryStore(
    createCanonicalLibraryOps(localStore),
  );
  const useHistoryStore = createHistoryStore(createHistoryOps(localStore));
  const useSettingsStore = createSettingsStore(
    settingsOps,
    profileCacheStore,
    registryManager,
  );
  const useCollectionsStore = createCollectionsStore(
    createCanonicalCollectionsOps(localStore),
  );
  const useProgressStore = createProgressStore({
    getAllMangaProgress: () => localStore.getAllMangaProgress(),
  });

  const stores: StoreHooks = {
    useLibraryStore,
    useHistoryStore,
    useSettingsStore,
    useCollectionsStore,
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

  return {
    profileId,
    localStore,
    cacheStore: profileCacheStore,
    registryManager,
    sourceSettingsStore,
    stores,
    useProgressStore,
    dispose,
  };
}

// NOTE: profile-scoped services are no longer module singletons.
// They are created and owned by a React Provider (see `src/data/services-provider.tsx`).

// ============================================================================
// signOut function
// ============================================================================
function prepareLocalSignOut(
  currentLocalStore: IndexedDBUserDataStore,
  keepData: boolean,
  operation: ActiveLocalSignOut,
): () => Promise<void> {
  const currentProfileId = effectiveProfileIdRef.current;
  const currentUserId = sessionUserIdRef.current;
  const currentAuthSessionRevision = authSessionRevisionRef.current;

  // A dialog can outlive the provider/store that created its callback. Never
  // copy or clear that stale store after the authenticated profile changed.
  if (
    !currentProfileId ||
    !currentUserId ||
    currentProfileId !== `user:${currentUserId}` ||
    currentLocalStore.profileId !== currentProfileId
  ) {
    throw new Error("Cannot sign out using a stale account data store.");
  }

  // Pause cloud reads/writes before starting the remote request, but do not
  // mutate local account data yet. If the remote request fails, the
  // orchestration helper reopens this gate and leaves the profile untouched.
  if (activeLocalSignOut && activeLocalSignOut.operationId !== operation.operationId) {
    throw new Error("Another local sign-out finalization is already active.");
  }
  setSyncSubscriptionsStopped(true);
  activeLocalSignOut = operation;

  const sameAccountHasNewSession = () =>
    authSessionRevisionRef.current !== currentAuthSessionRevision &&
    isAuthenticatedRef.current &&
    sessionUserIdRef.current === currentUserId;
  const clearImportOfferedSessionMarker = () => {
    try {
      sessionStorage.removeItem(getImportOfferedSessionKey(currentUserId));
    } catch {
      // ignore storage cleanup failures
    }
  };

  // Capture the validated account/store now. Better Auth may publish the
  // logged-out session and cause DataServicesProvider to switch profiles before
  // the remote promise returns; the commit must not consult those changing
  // refs when deciding which database to copy/clear.
  return async () => {
    let supersededBySameAccountSession = sameAccountHasNewSession();
    let accountDataCleared = false;
    if (supersededBySameAccountSession) {
      clearImportOfferedSessionMarker();
      setSyncSubscriptionsStopped(false);
      return;
    }

    await currentLocalStore.runWithSyncWrite(async () => {
      if (sameAccountHasNewSession()) {
        supersededBySameAccountSession = true;
        return;
      }
      // An already-started user write finishes before this copy/clear phase. It
      // therefore cannot land in the signed-out profile after account data was
      // removed, and keepData copies one internally consistent local boundary.
      const snapshot = await currentLocalStore.exportAccountDataSnapshot();
      if (sameAccountHasNewSession()) {
        supersededBySameAccountSession = true;
        return;
      }
      const restoreAccountData = async () => {
        if (!accountDataCleared) return;
        await currentLocalStore.mergeAccountDataSnapshot(snapshot, {
          restoreSyncGeneration: true,
        });
        accountDataCleared = false;
      };
      if (keepData) {
        const localProfile = new IndexedDBUserDataStore();
        await localProfile.mergeAccountDataSnapshot(snapshot);
      }

      if (sameAccountHasNewSession()) {
        supersededBySameAccountSession = true;
        return;
      }

      try {
        await currentLocalStore.clearAccountData(operation.controller.signal);
      } catch (error) {
        if (operation.controller.signal.aborted && sameAccountHasNewSession()) {
          supersededBySameAccountSession = true;
          return;
        }
        throw error;
      }
      accountDataCleared = true;
      if (sameAccountHasNewSession()) {
        await restoreAccountData();
        supersededBySameAccountSession = true;
        return;
      }
      try {
        await clearSourceSettingsProfile(
          currentProfileId,
          operation.controller.signal,
        );
      } catch (error) {
        if (operation.controller.signal.aborted && sameAccountHasNewSession()) {
          await restoreAccountData();
          supersededBySameAccountSession = true;
          return;
        }
        throw error;
      }
    });

    if (supersededBySameAccountSession || sameAccountHasNewSession()) {
      clearImportOfferedSessionMarker();
      setSyncSubscriptionsStopped(false);
      return;
    }

    if (keepData && typeof window !== "undefined") {
      // The anonymous provider may already have loaded while remote sign-out
      // was completing. Publish the atomic import so its Zustand views reload
      // immediately instead of remaining stale until a page refresh.
      // Construct the event in the target window's own realm: dispatchEvent
      // rejects events built by another realm's Event constructor.
      const EventCtor = typeof window.Event === "function" ? window.Event : Event;
      window.dispatchEvent(new EventCtor(LOCAL_PROFILE_IMPORT_EVENT));
    }

    // A different account may have signed in while the captured account was
    // being finalized. Only clear global profile/session state if it still
    // belongs to the account that initiated this sign-out.
    const activeUserId = sessionUserIdRef.current;
    const activeProfileId = effectiveProfileIdRef.current;
    const newerAccountIsActive =
      sameAccountHasNewSession() ||
      (activeUserId !== undefined && activeUserId !== currentUserId) ||
      (activeProfileId !== undefined &&
        activeProfileId.startsWith("user:") &&
        activeProfileId !== currentProfileId);

    try {
      localStorage.removeItem(`${IMPORT_DECISION_KEY_PREFIX}${currentUserId}`);
    } catch {
      // ignore storage cleanup failures
    }

    if (newerAccountIsActive) {
      clearImportOfferedSessionMarker();
      // The successful sign-out no longer owns the global gate. Do not leave a
      // newly signed-in account's subscriptions paused.
      setSyncSubscriptionsStopped(false);
      return;
    }

    if (lastProfileIdRef.current === currentProfileId) {
      lastProfileIdRef.current = undefined;
    }
    try {
      if (localStorage.getItem(LAST_PROFILE_ID_KEY) === currentProfileId) {
        localStorage.removeItem(LAST_PROFILE_ID_KEY);
      }
    } catch {
      // ignore storage cleanup failures
    }

    clearImportOfferedSessionMarker();
    getSyncStore().getState().reset();

    // Keep subscriptions stopped until Convex auth observes the already-
    // confirmed remote sign-out. Re-enabling here leaves an authenticated
    // window in which the just-cleared profile can be repopulated from cloud.
  };
}

export async function signOut(
  currentLocalStore: IndexedDBUserDataStore,
  keepData: boolean,
  signOutRemotely: () => Promise<void>,
): Promise<void> {
  const operation: ActiveLocalSignOut = {
    operationId: {},
    userId: sessionUserIdRef.current ?? "",
    authSessionRevision: authSessionRevisionRef.current,
    controller: new AbortController(),
  };
  try {
    await orchestrateRemoteFirstSignOut({
      prepareLocalSignOut: () =>
        prepareLocalSignOut(currentLocalStore, keepData, operation),
      signOutRemotely,
      resumeAfterRemoteFailure: resumeSyncAfterFailedSignOut,
    });
  } finally {
    if (activeLocalSignOut?.operationId === operation.operationId) {
      activeLocalSignOut = null;
    }
  }
}

// ============================================================================
// Helper functions
// ============================================================================
export function makeProfileId(
  userId: string | null | undefined,
): string | undefined {
  return userId ? `user:${userId}` : undefined;
}

export function loadChapterProgress(
  localStore: IndexedDBUserDataStore,
  registryId: string,
  sourceId: string,
  sourceMangaId: string,
) {
  return localStore.getChapterProgressForManga(
    registryId,
    sourceId,
    sourceMangaId,
  );
}

export function getDebugInfo() {
  return {
    sessionProfileId: sessionUserIdRef.current
      ? `user:${sessionUserIdRef.current}`
      : undefined,
    effectiveProfileId: effectiveProfileIdRef.current,
    userDbName: effectiveProfileIdRef.current
      ? `nemu-user::${effectiveProfileIdRef.current}`
      : "nemu-user",
  };
}

// ============================================================================
// Convex actions (quarantined here - UI components should not import Convex)
// ============================================================================

/** Clear all cloud data for current user */
export async function clearCloudData(
  localStore: IndexedDBUserDataStore,
): Promise<void> {
  const expectedIdentity: SyncAccountOperationIdentity = {
    authenticated: isAuthenticatedRef.current,
    sessionUserId: sessionUserIdRef.current,
    effectiveProfileId: effectiveProfileIdRef.current,
    localProfileId: localStore.profileId,
    client: convexRef.current,
  };
  const operationIsCurrent = () =>
    isSyncAccountOperationIdentityCurrent(expectedIdentity, {
      authenticated: isAuthenticatedRef.current,
      sessionUserId: sessionUserIdRef.current,
      effectiveProfileId: effectiveProfileIdRef.current,
      localProfileId: localStore.profileId,
      client: convexRef.current,
    });
  if (!operationIsCurrent() || !convexRef.current) {
    throw new Error("Cannot clear cloud data after the active account changed.");
  }
  const convex = convexRef.current;
  let generation = await localStore.getSyncGeneration();
  if (!operationIsCurrent()) {
    throw new Error("Cloud clear cancelled because the active account changed.");
  }
  if (generation === null) {
    const remote = await convex.query(api.sync.generation, {});
    if (!operationIsCurrent()) {
      throw new Error("Cloud clear cancelled because the active account changed.");
    }
    const decision = await localStore.prepareSyncGeneration(remote.generation);
    if (decision === "stale" || decision === null) return;
    generation = remote.generation;
  }
  // Convex retries one mutation promise until confirmation and guarantees the
  // backend executes it once, so a lost response cannot advance twice.
  if (!operationIsCurrent()) {
    throw new Error("Cloud clear cancelled because the active account changed.");
  }
  const result = await convex.mutation(api.sync.clearAll, {
    expectedUserId: expectedIdentity.sessionUserId!,
    expectedGeneration: generation,
  });
  await localStore.prepareSyncGeneration(result.generation);
  // The generation transition is the logical reset boundary. beginSyncReset
  // atomically schedules the durable bounded cleanup; driving the same chain
  // from the client would block sign-out and duplicate hundreds of mutations.
}

/** Search MangaUpdates (client-side via CORS proxy) */
export { searchMangaUpdatesRaw as searchMangaUpdates } from "@/lib/metadata/providers/mangaupdates";
