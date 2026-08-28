/**
 * Sync Services - Module-level singletons (no React)
 *
 * All services are created once at module load time.
 * Components import directly - no context needed.
 */

import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  IndexedDBUserDataStore,
  type LibraryItemMergeCommit,
  type PendingLibraryItemMerge,
} from "@/data/indexeddb";
import {
  IndexedDBCacheStore,
  ProfileScopedCacheStore,
  type CacheStore,
} from "@/data/cache";
import type { ProfileWriteFenceLease } from "@/data/profile-write-fence";
import type {
  LocalLibraryItem,
  LocalSourceLink,
  LocalChapterProgress,
  LocalCollection,
} from "@/data/schema";
import { makeChapterProgressId, makeSourceLinkId } from "@/data/schema";
import {
  chunkCollectionMutationItems,
  hasSyncServerTimeObservation,
  mangaProgressFromChapterProgress,
  nextSyncTimestamp,
  normalizeSyncClock,
  refreshSyncServerTime,
  supportsChapterProgressIntraPageSync,
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
import { getImportOfferedSessionKey } from "./import-offer";
import { safeErrorCategory } from "@/lib/error-diagnostic";
import { runSyncMutation } from "./sync-error-recovery";
import {
  flushPendingLibraryItemMerges,
  type LibraryMergeMutationRunner,
} from "./library-merge-outbox";
import {
  advancePendingSignOutCleanupToSourceSettings,
  deletePendingSignOutCleanup,
  listPendingSignOutCleanups,
  persistPendingSignOutCleanup,
  type PendingSignOutCleanup,
} from "./pending-signout-cleanup";
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

type ObservedSyncCapabilities = {
  convex: ConvexReactClient;
  localStore: object;
  profileId: string | undefined;
  userId: string | undefined;
  generation: number;
  chapterProgressIntraPageVersion?: unknown;
};

let observedSyncCapabilities: ObservedSyncCapabilities | null = null;

/**
 * Bind negotiated mutation capabilities to the exact account/store run that
 * observed them. A missing field is the expected response from an older
 * backend and deliberately keeps optional outbound fields disabled.
 */
export function updateObservedSyncCapabilities(
  capabilities: ObservedSyncCapabilities | null,
): void {
  observedSyncCapabilities = capabilities;
}

type ActiveLocalSignOut = {
  operationId: object;
  userId: string;
  authSessionRevision: number;
  controller: AbortController;
};

let activeLocalSignOut: ActiveLocalSignOut | null = null;
const activePendingCleanupAbortControllers = new Map<string, AbortController>();

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
    observedSyncCapabilities = null;
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
  if (authenticated && userId) {
    activePendingCleanupAbortControllers.get(userId)?.abort();
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
  includeChapterProgressIntraPageState: boolean;
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
    !hasSyncServerTimeObservation() ||
    !isSyncMutationIdentityCurrent(identity)
  ) {
    return null;
  }
  return {
    convex,
    expectedUserId: identity.sessionUserId,
    generation,
    includeChapterProgressIntraPageState:
      observedSyncCapabilities?.convex === convex &&
      observedSyncCapabilities.localStore === localStore &&
      observedSyncCapabilities.profileId === identity.effectiveProfileId &&
      observedSyncCapabilities.userId === identity.sessionUserId &&
      observedSyncCapabilities.generation === generation &&
      supportsChapterProgressIntraPageSync(
        observedSyncCapabilities.chapterProgressIntraPageVersion,
      ),
  };
}

async function assertLocalWriteGeneration(
  localStore: IndexedDBUserDataStore,
  expectedGeneration: number | null | undefined,
): Promise<void> {
  if (expectedGeneration === undefined) return;
  const currentGeneration = await localStore.getSyncGeneration();
  if (currentGeneration !== expectedGeneration) {
    throw new Error(
      "Local action cancelled because synced account data was reset.",
    );
  }
}

// ============================================================================
// Ops (use refs for dynamic values)
// ============================================================================
type LibraryMergeCloudContext = {
  convex: ConvexReactClient;
  expectedUserId: string;
  generation: number;
};

/**
 * Build the shared merge-outbox mutation boundary.
 *
 * The resolver runs twice for every mutation: once to capture the intended
 * client/account and again immediately before sending. This makes both normal
 * replay and the subscription-paused sign-out drain fail closed after an
 * account, generation, or Convex-client switch.
 */
function createLibraryMergeMutationRunner(
  resolveContext: (
    pending: PendingLibraryItemMerge,
  ) => Promise<LibraryMergeCloudContext | null>,
): LibraryMergeMutationRunner {
  return async (pending, mutation, args) => {
    const context = await resolveContext(pending);
    if (!context) return false;
    let completed = false;
    await runSyncMutation(async () => {
      const currentContext = await resolveContext(pending);
      if (
        !currentContext ||
        currentContext.convex !== context.convex ||
        currentContext.expectedUserId !== context.expectedUserId ||
        currentContext.generation !== context.generation
      ) {
        return;
      }
      await currentContext.convex.mutation(
        mutation as never,
        {
          ...args,
          expectedUserId: currentContext.expectedUserId,
          generation: currentContext.generation,
        } as never,
      );
      completed = true;
    });
    return completed;
  };
}

function createCanonicalLibraryOps(
  localStore: IndexedDBUserDataStore,
  onLocalMergeCommitted?: (commit: LibraryItemMergeCommit) => Promise<void>,
): CanonicalLibraryOps {
  // Serialize local merge commits with outbox draining for this profile. The
  // server phases are idempotent, but preserving source order here avoids a
  // chained merge racing an older target replay in the same tab.
  let mergeWorkQueue: Promise<void> = Promise.resolve();
  const enqueueMergeWork = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = mergeWorkQueue.then(operation);
    mergeWorkQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const runMergeMutation = createLibraryMergeMutationRunner(async (pending) => {
    if ((await localStore.getSyncGeneration()) !== pending.generation)
      return null;
    return mutationContext(localStore, pending.generation);
  });

  const drainMergeOutbox = async (): Promise<void> => {
    try {
      await flushPendingLibraryItemMerges({
        localStore,
        runMutation: runMergeMutation,
      });
    } catch (error) {
      // The local transaction and outbox are already durable. A reconnect,
      // library reload, or explicit later merge will replay from phase one.
      console.warn(
        "[LibraryStore] Cloud merge replay deferred:",
        safeErrorCategory(error),
      );
    }
  };

  return {
    getLibraryEntries: () => localStore.getLibraryEntries(),
    getLibraryItem: (id) => localStore.getLibraryItem(id),
    getSourceLinksForItem: (id) => localStore.getSourceLinksForLibraryItem(id),

    saveLibraryItem: async (item: LocalLibraryItem, expectedGeneration) => {
      const { generation, skipped } = await localStore.runWithSyncWrite(
        async (lease) => {
          await assertLocalWriteGeneration(localStore, expectedGeneration);
          const existing = await localStore.getLibraryItem(item.libraryItemId);
          if (existing?.mergedIntoLibraryItemId !== undefined) {
            // Permanent merge aliases outrank an arbitrary later stale-tab
            // clock. Resolve to validate the chain, then refuse resurrection.
            await localStore.resolveLibraryItemId(item.libraryItemId);
            return {
              generation: await localStore.getSyncGeneration(),
              skipped: true,
            };
          }
          const localItem =
            !existing || item.updatedAt > existing.updatedAt
              ? item
              : { ...item, updatedAt: nextSyncTimestamp(existing.updatedAt) };
          await localStore.saveLibraryItem(localItem, lease);
          return {
            generation: await localStore.getSyncGeneration(),
            skipped: false,
          };
        },
      );
      if (skipped) return;

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
          await runSyncMutation(() =>
            currentContext.convex.mutation(api.library.save, {
              expectedUserId: currentContext.expectedUserId,
              ...input,
              generation: currentContext.generation,
            }),
          );
        }
      }
    },

    removeLibraryItem: async (libraryItemId: string, expectedGeneration) => {
      const { updatedAt, generation } = await localStore.runWithSyncWrite(
        async (lease) => {
          await assertLocalWriteGeneration(localStore, expectedGeneration);
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
          await localStore.deleteLibraryItemAndLinks(
            libraryItemId,
            updatedAt,
            lease,
          );
          return {
            updatedAt,
            generation: await localStore.getSyncGeneration(),
          };
        },
      );

      const context = mutationContext(localStore, generation);
      if (context) {
        await runSyncMutation(() =>
          context.convex.mutation(api.library.remove, {
            expectedUserId: context.expectedUserId,
            libraryItemId,
            updatedAt,
            generation: context.generation,
          }),
        );
      }
    },

    saveSourceLink: async (link: LocalSourceLink, expectedGeneration) => {
      const { generation } = await localStore.runWithSyncWrite(
        async (lease) => {
          await assertLocalWriteGeneration(localStore, expectedGeneration);
          const canonicalLibraryItemId = await localStore.resolveLibraryItemId(
            link.libraryItemId,
          );
          const canonicalLink = {
            ...link,
            libraryItemId: canonicalLibraryItemId,
          };
          const existing = await localStore.getSourceLink(link.id);
          const localLink =
            !existing || canonicalLink.updatedAt > existing.updatedAt
              ? canonicalLink
              : {
                  ...canonicalLink,
                  updatedAt: nextSyncTimestamp(existing.updatedAt),
                };
          await localStore.saveSourceLink(localLink, lease);
          return { generation: await localStore.getSyncGeneration() };
        },
      );

      const context = mutationContext(localStore, generation);
      if (context) {
        // A concurrent merge can move this globally keyed link after the local
        // write. Follow the latest association at the mutation boundary so a
        // stale tab cannot move it back to the retired source item.
        const latestLink = await localStore.getSourceLink(link.id);
        if (latestLink && !latestLink.removed) {
          const item = await localStore.getLibraryItem(
            latestLink.libraryItemId,
          );
          if (!item || item.inLibrary === false) return;
          const currentContext = mutationContext(localStore, generation);
          if (!currentContext) return;
          await runSyncMutation(() =>
            currentContext.convex.mutation(api.library.save, {
              expectedUserId: currentContext.expectedUserId,
              ...toCloudLibrarySaveInput(item, [latestLink]),
              generation: currentContext.generation,
            }),
          );
        }
      }
    },

    removeSourceLink: async (
      registryId: string,
      sourceId: string,
      sourceMangaId: string,
      expectedGeneration?: number | null,
    ) => {
      const id = makeSourceLinkId(registryId, sourceId, sourceMangaId);
      const { existing, updatedAt, generation } =
        await localStore.runWithSyncWrite(async (lease) => {
          await assertLocalWriteGeneration(localStore, expectedGeneration);
          const existing = await localStore.getSourceLink(id);
          const updatedAt = nextSyncTimestamp(existing?.updatedAt);
          await localStore.deleteSourceLink(id, updatedAt, lease);
          return {
            existing,
            updatedAt,
            generation: await localStore.getSyncGeneration(),
          };
        });

      const context = mutationContext(localStore, generation);
      if (context) {
        await runSyncMutation(() =>
          context.convex.mutation(api.library.removeSourceLink, {
            expectedUserId: context.expectedUserId,
            registryId,
            sourceId,
            sourceMangaId,
            libraryItemId: existing?.libraryItemId,
            createdAt: existing?.createdAt,
            updatedAt,
            generation: context.generation,
          }),
        );
      }
    },

    mergeLibraryItems: async (
      targetLibraryItemId: string,
      sourceLibraryItemId: string,
      expectedGeneration?: number | null,
    ) =>
      enqueueMergeWork(async () => {
        const commit = await localStore.runWithSyncWrite(async (lease) => {
          await assertLocalWriteGeneration(localStore, expectedGeneration);
          const canonicalTargetLibraryItemId =
            await localStore.resolveLibraryItemId(targetLibraryItemId);
          const sourceItem =
            await localStore.getLibraryItem(sourceLibraryItemId);
          if (sourceItem?.mergedIntoLibraryItemId !== undefined) {
            const canonicalSourceLibraryItemId =
              await localStore.resolveLibraryItemId(sourceLibraryItemId);
            if (canonicalSourceLibraryItemId === canonicalTargetLibraryItemId) {
              return null;
            }
            throw new Error(
              "Library item was already merged into another survivor.",
            );
          }
          if (canonicalTargetLibraryItemId === sourceLibraryItemId) {
            return null;
          }
          return localStore.mergeLibraryItems(
            canonicalTargetLibraryItemId,
            sourceLibraryItemId,
            lease,
          );
        });
        if (!commit) return false;

        try {
          await onLocalMergeCommitted?.(commit);
        } catch (error) {
          // The canonical transaction is already committed. Related stores can
          // reload on the next snapshot; never misreport this as a failed merge.
          console.warn(
            "[LibraryStore] Post-merge view refresh deferred:",
            safeErrorCategory(error),
          );
        }
        await drainMergeOutbox();
        return true;
      }),

    retryPendingLibraryItemMerges: () => enqueueMergeWork(drainMergeOutbox),
  };
}

/**
 * Finish durable merge work before destroying the authenticated local profile.
 *
 * Sign-out intentionally pauses ordinary sync before its remote phase, so the
 * regular mutation context is unavailable here. This narrow path captures the
 * exact account/client/session revision instead, revalidates it and the local
 * generation before every mutation, and holds the profile write lease for the
 * full drain. A caller must abort remote sign-out and resume sync when this
 * throws; otherwise clearing the profile could discard the only replay data
 * for a partially completed cloud merge.
 */
export async function drainPendingLibraryMergesBeforeSignOut(
  localStore: IndexedDBUserDataStore,
  expectedAuthSessionRevision = authSessionRevisionRef.current,
  lease?: ProfileWriteFenceLease,
): Promise<void> {
  const expectedClient = convexRef.current;
  const expectedIdentity: SyncAccountOperationIdentity = {
    authenticated: isAuthenticatedRef.current,
    sessionUserId: sessionUserIdRef.current,
    effectiveProfileId: effectiveProfileIdRef.current,
    localProfileId: localStore.profileId,
    client: expectedClient,
  };
  const operationIsCurrent = () =>
    authSessionRevisionRef.current === expectedAuthSessionRevision &&
    isSyncAccountOperationIdentityCurrent(expectedIdentity, {
      authenticated: isAuthenticatedRef.current,
      sessionUserId: sessionUserIdRef.current,
      effectiveProfileId: effectiveProfileIdRef.current,
      localProfileId: localStore.profileId,
      client: convexRef.current,
    });

  await localStore.runWithSyncWrite(async (activeLease) => {
    // Check under the same lease used for replay so a merge queued just before
    // sign-out cannot slip between an optimistic empty check and local clear.
    if ((await localStore.getPendingLibraryItemMerges()).length === 0) return;
    if (!operationIsCurrent() || !expectedClient) {
      throw new Error(
        "Cannot finish pending library merges after the active account changed.",
      );
    }

    let generation = await localStore.getSyncGeneration();
    if (generation === null || !hasSyncServerTimeObservation()) {
      const remote = await refreshSyncServerTime(
        () => expectedClient.mutation(api.sync.observeGeneration, {}),
        operationIsCurrent,
      );
      if (!remote || !operationIsCurrent()) {
        throw new Error(
          "Cannot finish pending library merges after the active account changed.",
        );
      }
      const decision = await localStore.prepareSyncGeneration(
        remote.generation,
        operationIsCurrent,
        activeLease,
      );
      if (decision === "stale" || decision === null) {
        throw new Error(
          "Cannot finish pending library merges against a stale sync generation.",
        );
      }
      generation = await localStore.getSyncGeneration();
    }
    if (generation === null) {
      throw new Error(
        "Cannot finish pending library merges before sync initializes.",
      );
    }

    const expectedUserId = expectedIdentity.sessionUserId!;
    const runMutation = createLibraryMergeMutationRunner(async (pending) => {
      if (!operationIsCurrent() || pending.generation === null) return null;
      const currentGeneration = await localStore.getSyncGeneration();
      if (
        !operationIsCurrent() ||
        currentGeneration !== pending.generation ||
        currentGeneration !== generation
      ) {
        return null;
      }
      return {
        convex: expectedClient,
        expectedUserId,
        generation: currentGeneration,
      };
    });

    const result = await flushPendingLibraryItemMerges({
      localStore,
      runMutation,
      lease: activeLease,
    });
    if (!operationIsCurrent() || result.deferred) {
      throw new Error(
        "Pending library merges could not finish; sign-out was cancelled to preserve sync integrity.",
      );
    }
  }, lease);
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

    saveChapterProgress: async (
      progress: LocalChapterProgress,
      expectedGeneration,
    ) => {
      const { localProgress, generation } = await localStore.runWithSyncWrite(
        async (lease) => {
          await assertLocalWriteGeneration(localStore, expectedGeneration);
          const [existing, sourceLink] = await Promise.all([
            localStore.getChapterProgressEntry(progress.id),
            localStore.getSourceLink(
              makeSourceLinkId(
                progress.registryId,
                progress.sourceId,
                progress.sourceMangaId,
              ),
            ),
          ]);
          // The source link is the canonical current association. This closes
          // the save-vs-merge race in either order: a save before the atomic
          // merge is retargeted by that transaction; a save after it observes
          // the already-moved link instead of restoring a stale cache id.
          const linkedProgress: LocalChapterProgress = {
            ...progress,
            libraryItemId: sourceLink?.removed
              ? undefined
              : (sourceLink?.libraryItemId ?? progress.libraryItemId),
          };
          const updatedAt =
            !existing || linkedProgress.updatedAt > existing.updatedAt
              ? linkedProgress.updatedAt
              : nextSyncTimestamp(existing.updatedAt);
          const localProgress =
            updatedAt === linkedProgress.updatedAt
              ? linkedProgress
              : { ...linkedProgress, lastReadAt: updatedAt, updatedAt };
          const savedProgress = await localStore.saveChapterProgressEntry(
            localProgress,
            lease,
          );

          // Update manga progress summary in the same reset-ordered local phase.
          const derived = mangaProgressFromChapterProgress(savedProgress);
          const existingManga = await localStore.getMangaProgressEntry(
            derived.id,
          );
          const mangaProgress = {
            ...derived,
            updatedAt:
              !existingManga ||
              savedProgress.updatedAt > existingManga.updatedAt
                ? savedProgress.updatedAt
                : nextSyncTimestamp(existingManga.updatedAt),
          };
          await localStore.saveMangaProgressEntry(mangaProgress, lease);
          return {
            localProgress: savedProgress,
            generation: await localStore.getSyncGeneration(),
          };
        },
      );

      const context = mutationContext(localStore, generation);
      if (context) {
        await runSyncMutation(() =>
          context.convex.mutation(api.history.save, {
            expectedUserId: context.expectedUserId,
            ...toCloudHistorySaveInput(localProgress, {
              includeIntraPageState:
                context.includeChapterProgressIntraPageState,
            }),
            generation: context.generation,
          }),
        );
      }
      return localProgress;
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
      expectedGeneration?: number | null,
    ) => {
      const { generation } = await localStore.runWithSyncWrite(
        async (lease) => {
          await assertLocalWriteGeneration(localStore, expectedGeneration);
          // Save to local IDB first (ensures removed=false or undefined).
          const existing = await localStore.getInstalledSource(source.id);
          const localSource = {
            ...source,
            updatedAt: Math.max(
              normalizeSyncClock(source.updatedAt),
              nextSyncTimestamp(existing?.updatedAt),
            ),
          };
          await localStore.saveInstalledSource(localSource, lease);
          return { generation: await localStore.getSyncGeneration() };
        },
      );

      // Push per-item mutation to cloud
      const context = mutationContext(localStore, generation);
      if (context) {
        const latest = await localStore.getInstalledSource(source.id);
        if (!latest || latest.removed) return;
        const currentContext = mutationContext(localStore, generation);
        if (!currentContext) return;
        await runSyncMutation(() =>
          currentContext.convex.mutation(api.settings.saveInstalledSource, {
            expectedUserId: currentContext.expectedUserId,
            source: toCloudInstalledSource(latest),
            generation: currentContext.generation,
          }),
        );
      }
    },

    removeInstalledSource: async (
      id: string,
      registryId: string,
      expectedGeneration?: number | null,
    ) => {
      const { updatedAt, generation } = await localStore.runWithSyncWrite(
        async (lease) => {
          await assertLocalWriteGeneration(localStore, expectedGeneration);
          // Tombstone locally (sets removed=true with updatedAt).
          const existing = await localStore.getInstalledSource(id);
          const updatedAt = nextSyncTimestamp(existing?.updatedAt);
          await localStore.removeInstalledSource(
            id,
            registryId,
            updatedAt,
            lease,
          );
          return {
            updatedAt,
            generation: await localStore.getSyncGeneration(),
          };
        },
      );

      // Push tombstone to cloud
      const context = mutationContext(localStore, generation);
      if (context) {
        await runSyncMutation(() =>
          context.convex.mutation(api.settings.removeInstalledSource, {
            expectedUserId: context.expectedUserId,
            id,
            registryId,
            updatedAt,
            generation: context.generation,
          }),
        );
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

    saveCollection: async (collection: LocalCollection, expectedGeneration) => {
      const { generation } = await localStore.runWithSyncWrite(
        async (lease) => {
          await assertLocalWriteGeneration(localStore, expectedGeneration);
          const existing = (await localStore.getCollections()).find(
            (item) => item.collectionId === collection.collectionId,
          );
          const localCollection =
            !existing || collection.updatedAt > existing.updatedAt
              ? collection
              : {
                  ...collection,
                  updatedAt: nextSyncTimestamp(existing.updatedAt),
                };
          await localStore.saveCollection(localCollection, lease);
          return { generation: await localStore.getSyncGeneration() };
        },
      );

      const context = mutationContext(localStore, generation);
      if (context) {
        const latest = await localStore
          .getCollections()
          .then((collections) =>
            collections.find(
              (item) => item.collectionId === collection.collectionId,
            ),
          );
        if (!latest) return;
        const currentContext = mutationContext(localStore, generation);
        if (!currentContext) return;
        await runSyncMutation(() =>
          currentContext.convex.mutation(api.collections.save, {
            expectedUserId: currentContext.expectedUserId,
            collectionId: latest.collectionId,
            name: latest.name,
            createdAt: normalizeSyncClock(latest.createdAt),
            updatedAt: normalizeSyncClock(latest.updatedAt),
            removed: latest.removed,
            generation: currentContext.generation,
          }),
        );
      }
    },

    removeCollection: async (collectionId: string, expectedGeneration) => {
      const { updatedAt, generation } = await localStore.runWithSyncWrite(
        async (lease) => {
          await assertLocalWriteGeneration(localStore, expectedGeneration);
          const [collection, items] = await Promise.all([
            localStore
              .getCollections()
              .then((collections) =>
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
          await localStore.deleteCollection(collectionId, updatedAt, lease);
          return {
            updatedAt,
            generation: await localStore.getSyncGeneration(),
          };
        },
      );

      const context = mutationContext(localStore, generation);
      if (context) {
        await runSyncMutation(() =>
          context.convex.mutation(api.collections.remove, {
            expectedUserId: context.expectedUserId,
            collectionId,
            updatedAt,
            generation: context.generation,
          }),
        );
      }
    },

    addCollectionItems: async (
      collectionId: string,
      libraryItemIds: string[],
      expectedGeneration?: number | null,
    ) => {
      const { canonicalLibraryItemIds, updatedAt, generation } =
        await localStore.runWithSyncWrite(async (lease) => {
          await assertLocalWriteGeneration(localStore, expectedGeneration);
          const canonicalLibraryItemIds = [
            ...new Set(await localStore.resolveLibraryItemIds(libraryItemIds)),
          ];
          const items = await localStore.getCollectionItems();
          const updatedAt = nextSyncTimestamp(
            ...items
              .filter(
                (item) =>
                  item.collectionId === collectionId &&
                  canonicalLibraryItemIds.includes(item.libraryItemId),
              )
              .map((item) => item.updatedAt),
          );
          await localStore.addCollectionItems(
            collectionId,
            canonicalLibraryItemIds,
            updatedAt,
            lease,
          );
          return {
            canonicalLibraryItemIds,
            updatedAt,
            generation: await localStore.getSyncGeneration(),
          };
        });

      const context = mutationContext(localStore, generation);
      if (context) {
        const collection = (await localStore.getCollections()).find(
          (item) => item.collectionId === collectionId,
        );
        if (!collection || collection.removed) return;
        for (const batch of chunkCollectionMutationItems(
          canonicalLibraryItemIds,
        )) {
          const currentContext = mutationContext(localStore, generation);
          if (!currentContext) return;
          await runSyncMutation(() =>
            currentContext.convex.mutation(api.collections.addItems, {
              expectedUserId: currentContext.expectedUserId,
              collectionId,
              libraryItemIds: batch,
              updatedAt,
              generation: currentContext.generation,
            }),
          );
        }
      }
    },

    removeCollectionItems: async (
      collectionId: string,
      libraryItemIds: string[],
      expectedGeneration?: number | null,
    ) => {
      const { canonicalLibraryItemIds, updatedAt, generation } =
        await localStore.runWithSyncWrite(async (lease) => {
          await assertLocalWriteGeneration(localStore, expectedGeneration);
          const canonicalLibraryItemIds = [
            ...new Set(await localStore.resolveLibraryItemIds(libraryItemIds)),
          ];
          const items = await localStore.getCollectionItems();
          const updatedAt = nextSyncTimestamp(
            ...items
              .filter(
                (item) =>
                  item.collectionId === collectionId &&
                  canonicalLibraryItemIds.includes(item.libraryItemId),
              )
              .map((item) => item.updatedAt),
          );
          await localStore.removeCollectionItems(
            collectionId,
            canonicalLibraryItemIds,
            updatedAt,
            lease,
          );
          return {
            canonicalLibraryItemIds,
            updatedAt,
            generation: await localStore.getSyncGeneration(),
          };
        });

      const context = mutationContext(localStore, generation);
      if (context) {
        for (const batch of chunkCollectionMutationItems(
          canonicalLibraryItemIds,
        )) {
          const currentContext = mutationContext(localStore, generation);
          if (!currentContext) return;
          await runSyncMutation(() =>
            currentContext.convex.mutation(api.collections.removeItems, {
              expectedUserId: currentContext.expectedUserId,
              collectionId,
              libraryItemIds: batch,
              updatedAt,
              generation: currentContext.generation,
            }),
          );
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
  // Registries persist through the generation-aware service adapter from their
  // first lifetime. Passing the low-level IndexedDB store here would bypass
  // expected-generation checks until setInstalledSourceStore ran below.
  const settingsOps = createSettingsOps(localStore);
  const registryManager = new RegistryManager(
    localStore,
    settingsOps,
    profileCacheStore,
    sourceSettingsStore,
  );

  // Zustand stores must capture THIS container's stores/ops (avoid closing over mutable module exports).
  registryManager.setInstalledSourceStore(settingsOps);

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
  const refreshMergedRelationships = async (commit: LibraryItemMergeCommit) => {
    useHistoryStore
      .getState()
      .retargetLibraryItem(
        commit.sourceLibraryItemId,
        commit.targetLibraryItemId,
        commit.updatedAt,
        commit.generation,
      );
    await Promise.all([
      useCollectionsStore.getState().load(),
      useProgressStore.getState().load(),
    ]);
  };
  const libraryOps = createCanonicalLibraryOps(
    localStore,
    refreshMergedRelationships,
  );
  const useLibraryStore = createLibraryStore(libraryOps);
  const retryPendingLibraryMerges = () => {
    void libraryOps.retryPendingLibraryItemMerges?.();
  };
  if (typeof window !== "undefined") {
    window.addEventListener("online", retryPendingLibraryMerges);
  }

  const stores: StoreHooks = {
    useLibraryStore,
    useHistoryStore,
    useSettingsStore,
    useCollectionsStore,
  };

  const unsubscribeProfileRetired = localStore.subscribeProfileRetired(() => {
    const retiredGeneration = Number.MAX_SAFE_INTEGER;
    const ready = Promise.resolve();
    useLibraryStore.getState().prepareSyncGeneration(retiredGeneration, ready);
    useCollectionsStore
      .getState()
      .prepareSyncGeneration(retiredGeneration, ready);
    useSettingsStore.getState().prepareSyncGeneration(retiredGeneration, ready);
    useProgressStore.getState().prepareSyncGeneration(retiredGeneration, ready);
    useHistoryStore.getState().prepareSyncGeneration(retiredGeneration, ready);
  });

  const dispose = () => {
    unsubscribeProfileRetired();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", retryPendingLibraryMerges);
    }
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
): (
  cleanupMarker: PendingSignOutCleanup | null,
  lease: ProfileWriteFenceLease,
) => Promise<PendingSignOutCleanup | null> {
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
  if (
    activeLocalSignOut &&
    activeLocalSignOut.operationId !== operation.operationId
  ) {
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
  return async (initialCleanupMarker, existingLease) => {
    let cleanupMarker = initialCleanupMarker;
    const retirementCancelled = {};
    let supersededBySameAccountSession = sameAccountHasNewSession();
    let accountDataCleared = false;
    let sourceSettingsClearError: unknown = null;
    if (supersededBySameAccountSession) {
      clearImportOfferedSessionMarker();
      setSyncSubscriptionsStopped(false);
      return cleanupMarker;
    }

    try {
      await currentLocalStore.retireProfileWrites(async (lease) => {
        if (sameAccountHasNewSession()) {
          supersededBySameAccountSession = true;
          throw retirementCancelled;
        }
        // An already-started user write finishes before this copy/clear phase. It
        // therefore cannot land in the signed-out profile after account data was
        // removed, and keepData copies one internally consistent local boundary.
        const snapshot = await currentLocalStore.exportAccountDataSnapshot();
        if (sameAccountHasNewSession()) {
          supersededBySameAccountSession = true;
          throw retirementCancelled;
        }
        const restoreAccountData = async () => {
          if (!accountDataCleared) return;
          await currentLocalStore.mergeAccountDataSnapshot(
            snapshot,
            { restoreSyncGeneration: true },
            lease,
          );
          accountDataCleared = false;
        };
        if (keepData) {
          const localProfile = new IndexedDBUserDataStore();
          await localProfile.mergeAccountDataSnapshot(snapshot);
        }

        if (sameAccountHasNewSession()) {
          supersededBySameAccountSession = true;
          throw retirementCancelled;
        }

        try {
          await currentLocalStore.clearAccountData(
            operation.controller.signal,
            lease,
          );
        } catch (error) {
          if (
            operation.controller.signal.aborted &&
            sameAccountHasNewSession()
          ) {
            supersededBySameAccountSession = true;
            throw retirementCancelled;
          }
          throw error;
        }
        accountDataCleared = true;
        if (sameAccountHasNewSession()) {
          await restoreAccountData();
          supersededBySameAccountSession = true;
          throw retirementCancelled;
        }
        if (cleanupMarker) {
          try {
            cleanupMarker = await advancePendingSignOutCleanupToSourceSettings(
              cleanupMarker,
              lease,
            );
          } catch (error) {
            // The durable stage must describe the actual local state. Restore
            // the exact account snapshot before surfacing a failed stage write.
            await restoreAccountData();
            throw error;
          }
        }
        try {
          await clearSourceSettingsProfile(
            currentProfileId,
            operation.controller.signal,
            lease,
          );
        } catch (error) {
          if (
            operation.controller.signal.aborted &&
            sameAccountHasNewSession()
          ) {
            await restoreAccountData();
            supersededBySameAccountSession = true;
            throw retirementCancelled;
          }
          // Main data and durable stage 1 already committed. Let retirement
          // commit its future-lifetime barrier before surfacing this error;
          // rolling that barrier back would let an old tab resurrect main data
          // while retry correctly performs only the source-settings phase.
          sourceSettingsClearError = error;
        }
      }, existingLease);
    } catch (error) {
      if (error !== retirementCancelled) throw error;
    }

    if (sourceSettingsClearError) throw sourceSettingsClearError;

    if (supersededBySameAccountSession || sameAccountHasNewSession()) {
      clearImportOfferedSessionMarker();
      setSyncSubscriptionsStopped(false);
      return cleanupMarker;
    }

    if (keepData && typeof window !== "undefined") {
      // The anonymous provider may already have loaded while remote sign-out
      // was completing. Publish the atomic import so its Zustand views reload
      // immediately instead of remaining stale until a page refresh.
      // Construct the event in the target window's own realm: dispatchEvent
      // rejects events built by another realm's Event constructor.
      const EventCtor =
        typeof window.Event === "function" ? window.Event : Event;
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
      return cleanupMarker;
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
    return cleanupMarker;
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
  const finalizeLocalSignOut = prepareLocalSignOut(
    currentLocalStore,
    keepData,
    operation,
  );
  let cleanupMarker: PendingSignOutCleanup | null = null;
  let cleanupMarkerError: unknown = null;
  let remoteConfirmed = false;
  try {
    // One profile lease spans the last durable cloud replay, remote logout,
    // recovery marker, and destructive local finalization. No tab can enqueue
    // a merge/reset in a gap and have it erased without reaching the cloud.
    await currentLocalStore.runWithSyncWrite(async (lease) => {
      await drainPendingLibraryMergesBeforeSignOut(
        currentLocalStore,
        operation.authSessionRevision,
        lease,
      );

      try {
        await signOutRemotely();
        remoteConfirmed = true;
      } catch (error) {
        resumeSyncAfterFailedSignOut();
        throw error;
      }

      try {
        cleanupMarker = await persistPendingSignOutCleanup(
          {
            profileId: currentLocalStore.profileId,
            userId: operation.userId,
            keepData,
            expectedGeneration: await currentLocalStore.getSyncGeneration(),
            remoteConfirmedAt: Math.max(1, Date.now()),
          },
          lease,
        );
      } catch (error) {
        // Remote logout is already confirmed. Still make a best effort to
        // erase the old profile while the lease is held; aggregate this only
        // if local finalization also fails.
        cleanupMarkerError = error;
      }

      try {
        cleanupMarker = await finalizeLocalSignOut(cleanupMarker, lease);
      } catch (error) {
        if (cleanupMarkerError) {
          throw new AggregateError(
            [error, cleanupMarkerError],
            "Remote sign-out was confirmed, but local cleanup failed and its retry marker could not be persisted.",
          );
        }
        throw error;
      }
    });

    if (cleanupMarker) {
      try {
        await deletePendingSignOutCleanup(cleanupMarker);
      } catch (error) {
        console.error(
          "[sync] Completed sign-out cleanup marker removal failed:",
          safeErrorCategory(error),
        );
      }
    }
    if (cleanupMarkerError) {
      console.error(
        "[sync] Sign-out cleanup completed without a durable recovery marker:",
        safeErrorCategory(cleanupMarkerError),
      );
    }
  } catch (error) {
    if (!remoteConfirmed) resumeSyncAfterFailedSignOut();
    throw error;
  } finally {
    if (activeLocalSignOut?.operationId === operation.operationId) {
      activeLocalSignOut = null;
    }
  }
}

/**
 * Retry remote-confirmed local cleanup after a crash or storage failure.
 * A newly authenticated session for the same account supersedes the old
 * logout and removes its marker without touching that account's data.
 */
type PendingSignOutCleanupRetryResult = {
  completed: string[];
  superseded: string[];
  failed: string[];
};

let pendingSignOutCleanupRetryTail: Promise<void> = Promise.resolve();
const pendingSignOutCleanupRetries = new Map<
  string,
  Promise<PendingSignOutCleanupRetryResult>
>();

async function runPendingSignOutCleanupRetry(
  activeUserId?: string,
): Promise<PendingSignOutCleanupRetryResult> {
  const completed: string[] = [];
  const superseded: string[] = [];
  const failed: string[] = [];
  const markers = await listPendingSignOutCleanups();

  for (const marker of markers) {
    const sameUserIsActive = () =>
      activeUserId === marker.userId ||
      (sessionUserIdRef.current === marker.userId &&
        isAuthenticatedRef.current);
    if (sameUserIsActive()) {
      try {
        await deletePendingSignOutCleanup(marker);
        superseded.push(marker.profileId);
      } catch (error) {
        failed.push(marker.profileId);
        console.error(
          "[sync] Superseded sign-out cleanup marker removal failed:",
          safeErrorCategory(error),
        );
      }
      continue;
    }

    const accountStore = new IndexedDBUserDataStore(marker.profileId);
    const cleanupSuperseded = {};
    let markerToComplete = marker;
    let sourceSettingsClearError: unknown = null;
    const cleanupController = new AbortController();
    activePendingCleanupAbortControllers.set(marker.userId, cleanupController);
    if (sameUserIsActive()) cleanupController.abort();
    try {
      await accountStore.retireProfileWrites(async (lease) => {
        if (sameUserIsActive()) throw cleanupSuperseded;

        if (marker.cleanupStage === 1) {
          try {
            await clearSourceSettingsProfile(
              marker.profileId,
              cleanupController.signal,
              lease,
            );
          } catch (error) {
            if (cleanupController.signal.aborted && sameUserIsActive()) {
              throw cleanupSuperseded;
            }
            sourceSettingsClearError = error;
          }
          if (sameUserIsActive()) throw cleanupSuperseded;
          return;
        }

        const currentGeneration = await accountStore.getSyncGeneration();
        if (currentGeneration !== marker.expectedGeneration) {
          throw cleanupSuperseded;
        }
        const snapshot = await accountStore.exportAccountDataSnapshot();
        let accountDataCleared = false;
        const restoreAccountData = async () => {
          if (!accountDataCleared) return;
          await accountStore.mergeAccountDataSnapshot(
            snapshot,
            { restoreSyncGeneration: true },
            lease,
          );
          accountDataCleared = false;
        };

        if (sameUserIsActive()) throw cleanupSuperseded;
        if (marker.keepData) {
          await new IndexedDBUserDataStore().mergeAccountDataSnapshot(snapshot);
        }
        if (sameUserIsActive()) throw cleanupSuperseded;

        try {
          await accountStore.clearAccountData(cleanupController.signal, lease);
        } catch (error) {
          if (cleanupController.signal.aborted && sameUserIsActive()) {
            throw cleanupSuperseded;
          }
          throw error;
        }
        accountDataCleared = true;
        if (sameUserIsActive()) {
          await restoreAccountData();
          throw cleanupSuperseded;
        }

        try {
          markerToComplete = await advancePendingSignOutCleanupToSourceSettings(
            marker,
            lease,
          );
        } catch (error) {
          await restoreAccountData();
          throw error;
        }

        if (sameUserIsActive()) {
          await restoreAccountData();
          throw cleanupSuperseded;
        }
        try {
          await clearSourceSettingsProfile(
            marker.profileId,
            cleanupController.signal,
            lease,
          );
        } catch (error) {
          if (cleanupController.signal.aborted && sameUserIsActive()) {
            await restoreAccountData();
            throw cleanupSuperseded;
          }
          // Stage 1 and the main clear are already durable. Commit retirement's
          // barrier, then report this error outside the retirement callback.
          sourceSettingsClearError = error;
        }
      });
      if (sourceSettingsClearError) throw sourceSettingsClearError;
      await deletePendingSignOutCleanup(markerToComplete);
      completed.push(marker.profileId);
    } catch (error) {
      if (error === cleanupSuperseded) {
        try {
          await deletePendingSignOutCleanup(markerToComplete);
          superseded.push(marker.profileId);
        } catch (deleteError) {
          failed.push(marker.profileId);
          console.error(
            "[sync] Superseded sign-out cleanup marker removal failed:",
            safeErrorCategory(deleteError),
          );
        }
      } else {
        failed.push(marker.profileId);
        console.error(
          "[sync] Pending sign-out cleanup retry failed:",
          safeErrorCategory(error),
        );
      }
    } finally {
      if (
        activePendingCleanupAbortControllers.get(marker.userId) ===
        cleanupController
      ) {
        activePendingCleanupAbortControllers.delete(marker.userId);
      }
    }
  }

  return { completed, superseded, failed };
}

export function retryPendingSignOutCleanups(
  activeUserId?: string,
): Promise<PendingSignOutCleanupRetryResult> {
  const retryKey = activeUserId ?? "";
  const existing = pendingSignOutCleanupRetries.get(retryKey);
  if (existing) return existing;

  const operation = pendingSignOutCleanupRetryTail.then(() =>
    runPendingSignOutCleanupRetry(activeUserId),
  );
  pendingSignOutCleanupRetryTail = operation.then(
    () => undefined,
    () => undefined,
  );
  pendingSignOutCleanupRetries.set(retryKey, operation);
  void operation.then(
    () => {
      if (pendingSignOutCleanupRetries.get(retryKey) === operation) {
        pendingSignOutCleanupRetries.delete(retryKey);
      }
    },
    () => {
      if (pendingSignOutCleanupRetries.get(retryKey) === operation) {
        pendingSignOutCleanupRetries.delete(retryKey);
      }
    },
  );
  return operation;
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
    throw new Error(
      "Cannot clear cloud data after the active account changed.",
    );
  }
  const convex = convexRef.current;
  let generation = await localStore.getSyncGeneration();
  if (!operationIsCurrent()) {
    throw new Error(
      "Cloud clear cancelled because the active account changed.",
    );
  }
  if (generation === null) {
    const remote = await refreshSyncServerTime(
      () => convex.mutation(api.sync.observeGeneration, {}),
      operationIsCurrent,
    );
    if (!remote) return;
    if (!operationIsCurrent()) {
      throw new Error(
        "Cloud clear cancelled because the active account changed.",
      );
    }
    const decision = await localStore.prepareSyncGeneration(remote.generation);
    if (decision === "stale" || decision === null) return;
    generation = remote.generation;
  }
  // Convex retries one mutation promise until confirmation and guarantees the
  // backend executes it once, so a lost response cannot advance twice.
  if (!operationIsCurrent()) {
    throw new Error(
      "Cloud clear cancelled because the active account changed.",
    );
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
