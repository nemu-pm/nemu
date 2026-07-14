import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ConvexProvider,
  ConvexReactClient,
  useConvexAuth,
  usePaginatedQuery,
  useQuery,
} from "convex/react";
import {
  ConvexBetterAuthProvider,
  type AuthClient as ConvexAuthClient,
} from "@convex-dev/better-auth/react";
import { api } from "../../../../convex/_generated/api";
import {
  emitMobileDataChanged,
  useMobileDataRevision,
} from "@/data/mobileDataEvents";
import { useMobileDataStore } from "@/data/mobileDataContext";
import type {
  InstalledSource,
  LocalChapterProgress,
  LocalCollectionItem,
  LocalLibraryItem,
  LocalMangaProgress,
  LocalSourceLink,
} from "@/data/schema";
import type { MobileDataStore } from "@/data/storeTypes";
import {
  areSyncAccountIdentitiesAligned,
  canonicalizeSyncSnapshotRecords,
  chunkCollectionMutationItems,
  completeSyncSnapshot,
  consistentSyncGeneration,
  measureSyncSnapshotRows,
  mergeChapterProgressSnapshot,
  mergeMangaProgressSnapshot,
  planSyncSnapshotPagination,
  toCloudHistorySaveInput,
  toCloudInstalledSource,
  toCloudLibrarySaveInput,
  toCloudLibrarySaveInputBatches,
} from "@nemu/core";
import { mobileAuthClient } from "./mobileAuthClient";
import { mobileSyncConfig } from "./mobileSyncConfig";
import {
  mapCloudChapterProgress,
  mapCloudCollectionItems,
  mapCloudCollections,
  mapCloudLibraryItems,
  mapCloudMangaProgress,
  mapCloudSourceLinks,
  mergeCollectionSnapshot,
  mergeMobileInstalledSources,
  mergeLibrarySnapshot,
} from "./mobileSyncSnapshots";
import {
  isMobileSyncSuspended,
  getMobileSyncEpoch,
  invalidateMobileSyncEpoch,
  isMobileSyncEpochCurrent,
  makeMobileSyncRunGuard,
  mobileConvexRef,
  mobileIsAuthenticatedRef,
  mobileSessionUserIdRef,
  runWithMobileRemoteSnapshot,
  runWithMobileSyncWrite,
  setActiveMobileSyncStore,
} from "./mobileSyncRuntime";
import { hydrateMobileSyncedSourcePackages } from "./mobileSyncedSourcePackages";
import {
  reconcilePendingCollectionDeletions,
  reconcilePendingSourceLinkDeletions,
} from "./mobilePendingSyncDeletions";
import {
  createMobileSyncBudgetExceededState,
  createMobileSyncHealthyState,
  recordMobileSyncSnapshotState,
} from "./mobileSyncSnapshotState";

type MobileMutationClient = Pick<ConvexReactClient, "mutation">;
const SYNC_SNAPSHOT_PAGE_SIZE = 128;

async function isSnapshotGenerationCurrent(
  store: MobileDataStore,
  generation: number,
  shouldContinue: () => boolean,
): Promise<boolean> {
  return shouldContinue() && (await store.getSyncGeneration()) === generation;
}

async function readCurrentSyncState<T>(
  store: MobileDataStore,
  generation: number,
  shouldContinue: () => boolean,
  read: () => Promise<T>,
): Promise<{ value: T } | null> {
  return runWithMobileSyncWrite(async () => {
    if (
      !(await isSnapshotGenerationCurrent(store, generation, shouldContinue))
    ) {
      return null;
    }
    return { value: await read() };
  });
}

async function prepareMobileSnapshotGeneration(
  store: MobileDataStore,
  generation: number,
  shouldContinue: () => boolean,
): Promise<boolean> {
  const decision = await runWithMobileSyncWrite(async () => {
    if (!shouldContinue()) return "stale" as const;
    return store.applySyncGeneration(generation);
  });
  return decision !== "stale" && shouldContinue();
}

async function pushLocalLibraryWinners(
  store: MobileDataStore,
  convex: MobileMutationClient,
  items: LocalLibraryItem[],
  links: LocalSourceLink[],
  shouldContinue: () => boolean,
  generation: number,
  expectedUserId: string,
) {
  const pushedLinkIds = new Set<string>();
  const removedLibraryItemIds = new Set<string>();

  for (const candidate of items) {
    if (!shouldContinue()) return;
    const current = await readCurrentSyncState(
      store,
      generation,
      shouldContinue,
      async () => {
        const item = await store.getLibraryItem(candidate.libraryItemId);
        if (!item) return null;
        const itemLinks =
          item.inLibrary === false
            ? []
            : await store.getSourceLinksForItem(item.libraryItemId, {
                includeRemoved: true,
              });
        return { item, itemLinks };
      },
    );
    if (!current) return;
    if (!current.value) continue;
    const { item, itemLinks } = current.value;
    if (!shouldContinue()) return;
    if (item.inLibrary === false) {
      await convex.mutation(api.library.remove, {
        expectedUserId,
        libraryItemId: item.libraryItemId,
        updatedAt: item.updatedAt,
        generation,
      });
      removedLibraryItemIds.add(item.libraryItemId);
    } else {
      if (itemLinks.length > 0) {
        for (const input of toCloudLibrarySaveInputBatches(item, itemLinks)) {
          if (!shouldContinue()) return;
          await convex.mutation(api.library.save, {
            expectedUserId,
            ...input,
            generation,
          });
        }
        for (const link of itemLinks) pushedLinkIds.add(link.id);
      }
    }
  }

  for (const candidate of links) {
    if (!shouldContinue()) return;
    if (
      pushedLinkIds.has(candidate.id) ||
      removedLibraryItemIds.has(candidate.libraryItemId)
    ) {
      continue;
    }
    const current = await readCurrentSyncState(
      store,
      generation,
      shouldContinue,
      async () => {
        const link = await store.getSourceLink(candidate.id);
        if (!link) return null;
        const item = await store.getLibraryItem(link.libraryItemId);
        return item ? { item, link } : null;
      },
    );
    if (!current) return;
    if (!current.value) continue;
    const { item, link } = current.value;
    if (!shouldContinue()) return;
    if (item.inLibrary === false) {
      await convex.mutation(api.library.remove, {
        expectedUserId,
        libraryItemId: item.libraryItemId,
        updatedAt: item.updatedAt,
        generation,
      });
      continue;
    }
    await convex.mutation(api.library.save, {
      expectedUserId,
      ...toCloudLibrarySaveInput(item, [link]),
      generation,
    });
  }
}

async function pushLocalCollectionWinners(
  store: MobileDataStore,
  convex: MobileMutationClient,
  collections: {
    collectionId: string;
    name: string;
    createdAt: number;
    updatedAt: number;
  }[],
  collectionItems: LocalCollectionItem[],
  shouldContinue: () => boolean,
  generation: number,
  expectedUserId: string,
) {
  const removedCollectionIds = new Set<string>();
  if (collections.length === 0 && collectionItems.length === 0) return;
  for (const candidate of collections) {
    if (!shouldContinue()) return;
    const latest = await readCurrentSyncState(
      store,
      generation,
      shouldContinue,
      () => store.getCollection(candidate.collectionId),
    );
    if (!latest) return;
    const collection = latest.value;
    if (!collection) continue;
    if (!shouldContinue()) return;
    if (collection.removed) {
      await convex.mutation(api.collections.remove, {
        expectedUserId,
        collectionId: collection.collectionId,
        updatedAt: collection.updatedAt,
        generation,
      });
      removedCollectionIds.add(collection.collectionId);
    } else {
      await convex.mutation(api.collections.save, {
        expectedUserId,
        collectionId: collection.collectionId,
        name: collection.name,
        createdAt: collection.createdAt,
        updatedAt: collection.updatedAt,
        removed: false,
        generation,
      });
    }
  }

  if (collectionItems.length === 0) return;

  const current = await readCurrentSyncState(
    store,
    generation,
    shouldContinue,
    async () => {
      const [currentCollections, currentCollectionItems] = await Promise.all([
        store.getCollections(),
        store.getCollectionItems(),
      ]);
      return { currentCollections, currentCollectionItems };
    },
  );
  if (!current) return;
  const collectionsById = new Map(
    current.value.currentCollections.map((collection) => [
      collection.collectionId,
      collection,
    ]),
  );
  const itemsById = new Map(
    current.value.currentCollectionItems.map((item) => [
      `${item.collectionId}\u0000${item.libraryItemId}`,
      item,
    ]),
  );
  const membershipGroups = new Map<
    string,
    {
      collectionId: string;
      libraryItemIds: string[];
      removed: boolean;
      updatedAt: number;
    }
  >();
  const removedCollections = new Map<
    string,
    (typeof current.value.currentCollections)[number]
  >();

  for (const candidate of collectionItems) {
    if (!shouldContinue()) return;
    const item = itemsById.get(
      `${candidate.collectionId}\u0000${candidate.libraryItemId}`,
    );
    if (!item) continue;
    const collection = collectionsById.get(item.collectionId);
    if (!collection) continue;
    if (collection.removed) {
      if (!removedCollectionIds.has(collection.collectionId)) {
        removedCollections.set(collection.collectionId, collection);
      }
      continue;
    }
    const groupKey = `${item.collectionId}\u0000${item.removed === true ? "remove" : "add"}\u0000${item.updatedAt}`;
    const group = membershipGroups.get(groupKey) ?? {
      collectionId: item.collectionId,
      libraryItemIds: [],
      removed: item.removed === true,
      updatedAt: item.updatedAt,
    };
    group.libraryItemIds.push(item.libraryItemId);
    membershipGroups.set(groupKey, group);
  }

  for (const collection of removedCollections.values()) {
    if (!shouldContinue()) return;
    await convex.mutation(api.collections.remove, {
      expectedUserId,
      collectionId: collection.collectionId,
      updatedAt: collection.updatedAt,
      generation,
    });
  }

  for (const group of membershipGroups.values()) {
    for (const libraryItemIds of chunkCollectionMutationItems(
      group.libraryItemIds,
    )) {
      if (!shouldContinue()) return;
      await convex.mutation(
        group.removed ? api.collections.removeItems : api.collections.addItems,
        {
          expectedUserId,
          collectionId: group.collectionId,
          libraryItemIds,
          updatedAt: group.updatedAt,
          generation,
        },
      );
    }
  }
}

/**
 * Local→cloud reconciliation for reading progress. Write-time pushes are
 * skipped whenever the cloud client is unavailable (auth flaps, suspension
 * windows), so the snapshot apply returns local winners for one reconciliation
 * pass. A local row wins if any field the shared high-water merge keeps would
 * beat the delivered cloud row.
 */
async function pushLocalChapterProgressWinners(
  progress: LocalChapterProgress[],
  convex: MobileMutationClient,
  shouldContinue: () => boolean,
  generation: number,
  expectedUserId: string,
) {
  for (const entry of progress) {
    if (!shouldContinue()) return;
    await convex.mutation(api.history.save, {
      expectedUserId,
      ...toCloudHistorySaveInput(entry),
      generation,
    });
  }
}

async function applyMobileProgressSnapshots(
  store: MobileDataStore,
  convex: MobileMutationClient,
  chapterProgress: LocalChapterProgress[],
  mangaProgress: LocalMangaProgress[],
  shouldContinue: () => boolean,
  generation: number,
  expectedUserId: string,
): Promise<boolean> {
  const chapterResult = store.applyChapterProgressSnapshot
    ? await runWithMobileSyncWrite(async () => {
        if (
          !(await isSnapshotGenerationCurrent(
            store,
            generation,
            shouldContinue,
          ))
        ) {
          return null;
        }
        return store.applyChapterProgressSnapshot!(chapterProgress);
      })
    : await runWithMobileRemoteSnapshot(async () => {
        if (
          !(await isSnapshotGenerationCurrent(
            store,
            generation,
            shouldContinue,
          ))
        ) {
          return null;
        }
        const result = mergeChapterProgressSnapshot(
          await store.getAllChapterProgress(),
          chapterProgress,
        );
        if (result.changed.length > 0) {
          await store.saveChapterProgressBatch(result.changed);
        }
        return result;
      });
  if (!chapterResult || !shouldContinue()) return false;

  await pushLocalChapterProgressWinners(
    chapterResult.localWinners,
    convex,
    shouldContinue,
    generation,
    expectedUserId,
  );
  if (!shouldContinue()) return false;

  const mangaResult = store.applyMangaProgressSnapshot
    ? await runWithMobileSyncWrite(async () => {
        if (
          !(await isSnapshotGenerationCurrent(
            store,
            generation,
            shouldContinue,
          ))
        ) {
          return null;
        }
        return store.applyMangaProgressSnapshot!(mangaProgress);
      })
    : await runWithMobileRemoteSnapshot(async () => {
        if (
          !(await isSnapshotGenerationCurrent(
            store,
            generation,
            shouldContinue,
          ))
        ) {
          return null;
        }
        const result = mergeMangaProgressSnapshot(
          await store.getAllMangaProgress(),
          mangaProgress,
        );
        if (result.changed.length > 0) {
          await store.saveMangaProgressBatch(result.changed);
        }
        return result;
      });
  return mangaResult !== null && shouldContinue();
}

/**
 * Local→cloud reconciliation for installed sources (uses the per-source
 * upsert/remove mutations — never the replace-semantics settings.save, which
 * would wipe other devices' tombstones). Covers sources installed or removed
 * while offline/unauthenticated, whose write-time push was skipped.
 */
async function pushLocalInstalledSourceWinners(
  store: MobileDataStore,
  localSources: InstalledSource[],
  cloudSources: InstalledSource[],
  convex: MobileMutationClient,
  shouldContinue: () => boolean,
  generation: number,
  expectedUserId: string,
) {
  const cloudById = new Map(cloudSources.map((source) => [source.id, source]));
  for (const candidate of localSources) {
    if (!shouldContinue()) return;
    const current = await readCurrentSyncState(
      store,
      generation,
      shouldContinue,
      async () =>
        (await store.getSyncSettings()).installedSources.find(
          (entry) => entry.id === candidate.id,
        ) ?? null,
    );
    if (!current) return;
    const source = current.value;
    if (!source) continue;
    if (!shouldContinue()) return;
    const cloud = cloudById.get(source.id);
    if (cloud && (cloud.updatedAt ?? 0) >= (source.updatedAt ?? 0)) continue;
    if (source.removed) {
      await convex.mutation(api.settings.removeInstalledSource, {
        expectedUserId,
        id: source.id,
        registryId: source.registryId,
        updatedAt: source.updatedAt ?? 0,
        generation,
      });
    } else {
      await convex.mutation(api.settings.saveInstalledSource, {
        expectedUserId,
        source: toCloudInstalledSource(source),
        generation,
      });
    }
  }
}

// The test suite exercises these pure winner-selection helpers through one
// stable namespace; the production module's runtime exports remain components.
// eslint-disable-next-line react-refresh/only-export-components
export const mobileSyncWinnerPushTestUtils = {
  applyMobileProgressSnapshots,
  pushLocalLibraryWinners,
  pushLocalCollectionWinners,
  pushLocalChapterProgressWinners,
  pushLocalInstalledSourceWinners,
};

export function MobileSyncProvider({ children }: { children: ReactNode }) {
  const convex = useMemo(() => {
    if (!mobileSyncConfig.convexUrl) return null;
    return new ConvexReactClient(mobileSyncConfig.convexUrl, {
      expectAuth: true,
      unsavedChangesWarning: false,
    });
  }, []);

  useEffect(() => {
    mobileConvexRef.current = convex;
    return () => {
      if (mobileConvexRef.current === convex) {
        mobileConvexRef.current = null;
      }
    };
  }, [convex]);

  if (!convex || !mobileSyncConfig.configured) {
    return <>{children}</>;
  }

  return (
    <ConvexProvider client={convex}>
      <ConvexBetterAuthProvider
        client={convex}
        authClient={mobileAuthClient as unknown as ConvexAuthClient}
      >
        {children}
      </ConvexBetterAuthProvider>
    </ConvexProvider>
  );
}

function ConfiguredMobileSyncBridge() {
  const store = useMobileDataStore();
  const syncStatusRevision = useMobileDataRevision(["syncStatus"]);
  const [snapshotGate, setSnapshotGate] = useState<{
    store: MobileDataStore;
    accountId: string;
    blockedGeneration: number | null;
  } | null>(null);
  const { isAuthenticated } = useConvexAuth();
  const { data: session } = mobileAuthClient.useSession();
  const sessionUserId = session?.user?.id;
  // Session and websocket authentication are independent transports. During
  // an account switch they can briefly report different users; never merge a
  // websocket user's snapshot into the session user's profile database.
  const convexUser = useQuery(
    api.auth.getCurrentUserId,
    !isAuthenticated || !sessionUserId ? "skip" : {},
  );
  const convexUserId = convexUser ?? undefined;
  const skipSubscriptions =
    !isAuthenticated ||
    !areSyncAccountIdentitiesAligned(sessionUserId, convexUserId);

  useEffect(() => {
    let cancelled = false;
    if (skipSubscriptions || !sessionUserId) {
      return () => {
        cancelled = true;
      };
    }

    void store
      .getSyncSnapshotState()
      .then((state) => {
        if (cancelled) return;
        setSnapshotGate({
          store,
          accountId: sessionUserId,
          blockedGeneration:
            state?.status === "budget-exceeded" ? state.generation : null,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        // Fail closed: an unreadable durable gate must not start another
        // potentially oversized in-memory subscription pass.
        setSnapshotGate(null);
        console.warn(
          "[MobileSync] Failed to read snapshot budget gate:",
          error,
        );
      });

    return () => {
      cancelled = true;
    };
  }, [sessionUserId, skipSubscriptions, store, syncStatusRevision]);

  useEffect(() => {
    // Store identity follows the active account/profile. Invalidate work from
    // the previous store before any subscription effect in this component
    // starts for the new one.
    invalidateMobileSyncEpoch();
    setActiveMobileSyncStore(store);
    return () => {
      setActiveMobileSyncStore(null);
      invalidateMobileSyncEpoch();
    };
  }, [store]);

  useEffect(() => {
    if (mobileIsAuthenticatedRef.current !== isAuthenticated) {
      invalidateMobileSyncEpoch();
    }
    mobileIsAuthenticatedRef.current = isAuthenticated;
    return () => {
      if (mobileIsAuthenticatedRef.current === isAuthenticated) {
        invalidateMobileSyncEpoch();
        mobileIsAuthenticatedRef.current = false;
      }
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (mobileSessionUserIdRef.current !== sessionUserId) {
      invalidateMobileSyncEpoch();
    }
    mobileSessionUserIdRef.current = sessionUserId;
    return () => {
      if (mobileSessionUserIdRef.current === sessionUserId) {
        invalidateMobileSyncEpoch();
        mobileSessionUserIdRef.current = undefined;
      }
    };
  }, [sessionUserId]);

  const cloudGeneration = useQuery(
    api.sync.generation,
    skipSubscriptions ? "skip" : {},
  );
  const snapshotGateReady =
    snapshotGate?.store === store && snapshotGate.accountId === sessionUserId;
  const snapshotBlocked =
    snapshotGateReady &&
    snapshotGate.blockedGeneration !== null &&
    cloudGeneration !== undefined &&
    snapshotGate.blockedGeneration >= cloudGeneration.generation;
  const snapshotArgs =
    skipSubscriptions ||
    !snapshotGateReady ||
    snapshotBlocked ||
    cloudGeneration === undefined
      ? ("skip" as const)
      : { generation: cloudGeneration.generation };
  const libraryPages = usePaginatedQuery(
    api.sync.libraryItemsAllV2,
    snapshotArgs,
    {
      initialNumItems: SYNC_SNAPSHOT_PAGE_SIZE,
    },
  );
  const sourceLinkPages = usePaginatedQuery(
    api.sync.sourceLinksAllV2,
    snapshotArgs,
    {
      initialNumItems: SYNC_SNAPSHOT_PAGE_SIZE,
    },
  );
  const collectionPages = usePaginatedQuery(
    api.sync.collectionsAllV2,
    snapshotArgs,
    {
      initialNumItems: SYNC_SNAPSHOT_PAGE_SIZE,
    },
  );
  const collectionItemPages = usePaginatedQuery(
    api.sync.collectionItemsAllV2,
    snapshotArgs,
    {
      initialNumItems: SYNC_SNAPSHOT_PAGE_SIZE,
    },
  );
  const chapterProgressPages = usePaginatedQuery(
    api.sync.chapterProgressAllV2,
    snapshotArgs,
    {
      initialNumItems: SYNC_SNAPSHOT_PAGE_SIZE,
    },
  );
  const mangaProgressPages = usePaginatedQuery(
    api.sync.mangaProgressAllV2,
    snapshotArgs,
    {
      initialNumItems: SYNC_SNAPSHOT_PAGE_SIZE,
    },
  );
  const settingsPages = usePaginatedQuery(api.settings.getV2, snapshotArgs, {
    initialNumItems: SYNC_SNAPSHOT_PAGE_SIZE,
  });

  const snapshotPaginationPlan = useMemo(
    () =>
      planSyncSnapshotPagination([
        {
          key: "libraryItems",
          ...measureSyncSnapshotRows(libraryPages.results),
          status: libraryPages.status,
        },
        {
          key: "sourceLinks",
          ...measureSyncSnapshotRows(sourceLinkPages.results),
          status: sourceLinkPages.status,
        },
        {
          key: "collections",
          ...measureSyncSnapshotRows(collectionPages.results),
          status: collectionPages.status,
        },
        {
          key: "collectionItems",
          ...measureSyncSnapshotRows(collectionItemPages.results),
          status: collectionItemPages.status,
        },
        {
          key: "chapterProgress",
          ...measureSyncSnapshotRows(chapterProgressPages.results),
          status: chapterProgressPages.status,
        },
        {
          key: "mangaProgress",
          ...measureSyncSnapshotRows(mangaProgressPages.results),
          status: mangaProgressPages.status,
        },
        {
          key: "settings",
          ...measureSyncSnapshotRows(settingsPages.results),
          status: settingsPages.status,
        },
      ]),
    [
      chapterProgressPages.results,
      chapterProgressPages.status,
      collectionItemPages.results,
      collectionItemPages.status,
      collectionPages.results,
      collectionPages.status,
      libraryPages.results,
      libraryPages.status,
      mangaProgressPages.results,
      mangaProgressPages.status,
      settingsPages.results,
      settingsPages.status,
      sourceLinkPages.results,
      sourceLinkPages.status,
    ],
  );

  useEffect(() => {
    if (snapshotPaginationPlan.status === "budget-exceeded") {
      console.warn(
        `[MobileSync] Snapshot budget exceeded (${snapshotPaginationPlan.key}, ${snapshotPaginationPlan.totalRows} rows, ${snapshotPaginationPlan.totalEstimatedBytes} estimated bytes); skipping this sync round.`,
      );
      return;
    }
    if (snapshotPaginationPlan.status !== "load-more") return;
    const loadMore = {
      libraryItems: libraryPages.loadMore,
      sourceLinks: sourceLinkPages.loadMore,
      collections: collectionPages.loadMore,
      collectionItems: collectionItemPages.loadMore,
      chapterProgress: chapterProgressPages.loadMore,
      mangaProgress: mangaProgressPages.loadMore,
      settings: settingsPages.loadMore,
    }[snapshotPaginationPlan.key];
    loadMore(snapshotPaginationPlan.numItems);
  }, [
    chapterProgressPages,
    collectionItemPages,
    collectionPages,
    libraryPages,
    mangaProgressPages,
    settingsPages,
    snapshotPaginationPlan,
    sourceLinkPages,
  ]);

  const syncSnapshotBudgetExceeded =
    snapshotPaginationPlan.status === "budget-exceeded";
  const generation = syncSnapshotBudgetExceeded
    ? undefined
    : cloudGeneration?.generation;
  const cloudLibraryItems = useMemo(() => {
    if (generation === undefined) return undefined;
    const rows = completeSyncSnapshot(
      libraryPages.results,
      generation,
      libraryPages.status,
    );
    return rows === null
      ? undefined
      : {
          generation,
          rows: canonicalizeSyncSnapshotRecords(
            rows,
            (row) => row.libraryItemId,
            (row) => row.inLibrary === false,
          ),
        };
  }, [generation, libraryPages.results, libraryPages.status]);
  const cloudSourceLinks = useMemo(() => {
    if (generation === undefined) return undefined;
    const rows = completeSyncSnapshot(
      sourceLinkPages.results,
      generation,
      sourceLinkPages.status,
    );
    return rows === null
      ? undefined
      : {
          generation,
          rows: canonicalizeSyncSnapshotRecords(
            rows,
            (row) =>
              `${row.registryId}\u0000${row.sourceId}\u0000${row.sourceMangaId}`,
            (row) => row.removed === true,
          ),
        };
  }, [generation, sourceLinkPages.results, sourceLinkPages.status]);
  const cloudCollections = useMemo(() => {
    if (generation === undefined) return undefined;
    const rows = completeSyncSnapshot(
      collectionPages.results,
      generation,
      collectionPages.status,
    );
    return rows === null
      ? undefined
      : {
          generation,
          rows: canonicalizeSyncSnapshotRecords(
            rows,
            (row) => row.collectionId,
            (row) => row.removed === true,
          ),
        };
  }, [collectionPages.results, collectionPages.status, generation]);
  const cloudCollectionItems = useMemo(() => {
    if (generation === undefined) return undefined;
    const rows = completeSyncSnapshot(
      collectionItemPages.results,
      generation,
      collectionItemPages.status,
    );
    return rows === null
      ? undefined
      : {
          generation,
          rows: canonicalizeSyncSnapshotRecords(
            rows,
            (row) => `${row.collectionId}\u0000${row.libraryItemId}`,
            (row) => row.removed === true,
          ),
        };
  }, [collectionItemPages.results, collectionItemPages.status, generation]);
  const cloudChapterProgress = useMemo(() => {
    if (generation === undefined) return undefined;
    const rows = completeSyncSnapshot(
      chapterProgressPages.results,
      generation,
      chapterProgressPages.status,
    );
    return rows === null
      ? undefined
      : {
          generation,
          rows: canonicalizeSyncSnapshotRecords(
            rows,
            (row) =>
              `${row.registryId}\u0000${row.sourceId}\u0000${row.sourceMangaId}\u0000${row.sourceChapterId}`,
          ),
        };
  }, [chapterProgressPages.results, chapterProgressPages.status, generation]);
  const cloudMangaProgress = useMemo(() => {
    if (generation === undefined) return undefined;
    const rows = completeSyncSnapshot(
      mangaProgressPages.results,
      generation,
      mangaProgressPages.status,
    );
    return rows === null
      ? undefined
      : {
          generation,
          rows: canonicalizeSyncSnapshotRecords(
            rows,
            (row) =>
              `${row.registryId}\u0000${row.sourceId}\u0000${row.sourceMangaId}`,
          ),
        };
  }, [generation, mangaProgressPages.results, mangaProgressPages.status]);
  const cloudSettings = useMemo(() => {
    if (generation === undefined) return undefined;
    const rows = completeSyncSnapshot(
      settingsPages.results,
      generation,
      settingsPages.status,
    );
    if (rows === null) return undefined;
    return {
      generation,
      installedSources: canonicalizeSyncSnapshotRecords(
        rows.flatMap((row) => row.installedSources),
        (source) => source.id,
        (source) => source.removed === true,
      ),
      updatedAt: Math.max(0, ...rows.map((row) => row.updatedAt)),
    };
  }, [generation, settingsPages.results, settingsPages.status]);
  const snapshotGeneration = consistentSyncGeneration(
    cloudLibraryItems,
    cloudSourceLinks,
    cloudCollections,
    cloudCollectionItems,
    cloudChapterProgress,
    cloudMangaProgress,
    cloudSettings,
  );

  useEffect(() => {
    if (
      snapshotPaginationPlan.status !== "budget-exceeded" ||
      cloudGeneration === undefined ||
      !isAuthenticated ||
      !sessionUserId ||
      !areSyncAccountIdentitiesAligned(sessionUserId, convexUserId) ||
      isMobileSyncSuspended()
    ) {
      return;
    }
    let cancelled = false;
    const syncEpoch = getMobileSyncEpoch();
    const expectedUserId = sessionUserId;
    const shouldRecord = makeMobileSyncRunGuard({
      isCancelled: () => cancelled,
      expectedUserId,
      convexUserId,
      syncEpoch,
    });

    void recordMobileSyncSnapshotState(
      store,
      createMobileSyncBudgetExceededState({
        generation: cloudGeneration.generation,
        origin: "foreground",
        resourceKey: snapshotPaginationPlan.key,
        totalRows: snapshotPaginationPlan.totalRows,
        totalEstimatedBytes: snapshotPaginationPlan.totalEstimatedBytes,
      }),
      shouldRecord,
    ).catch((error) => {
      if (
        !cancelled &&
        mobileSessionUserIdRef.current === expectedUserId &&
        isMobileSyncEpochCurrent(syncEpoch)
      ) {
        console.warn(
          "[MobileSync] Failed to persist snapshot budget state:",
          error,
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    cloudGeneration,
    convexUserId,
    isAuthenticated,
    sessionUserId,
    snapshotPaginationPlan,
    store,
  ]);

  useEffect(() => {
    if (
      snapshotPaginationPlan.status !== "complete" ||
      snapshotGeneration === null ||
      !isAuthenticated ||
      !sessionUserId ||
      !areSyncAccountIdentitiesAligned(sessionUserId, convexUserId) ||
      isMobileSyncSuspended()
    ) {
      return;
    }
    let cancelled = false;
    const syncEpoch = getMobileSyncEpoch();
    const expectedUserId = sessionUserId;
    const shouldRecord = makeMobileSyncRunGuard({
      isCancelled: () => cancelled,
      expectedUserId,
      convexUserId,
      syncEpoch,
    });

    void recordMobileSyncSnapshotState(
      store,
      createMobileSyncHealthyState({
        generation: snapshotGeneration,
        origin: "foreground",
      }),
      shouldRecord,
    ).catch((error) => {
      if (
        !cancelled &&
        mobileSessionUserIdRef.current === expectedUserId &&
        isMobileSyncEpochCurrent(syncEpoch)
      ) {
        console.warn(
          "[MobileSync] Failed to persist healthy snapshot state:",
          error,
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    convexUserId,
    isAuthenticated,
    sessionUserId,
    snapshotGeneration,
    snapshotPaginationPlan.status,
    store,
  ]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !sessionUserId ||
      !areSyncAccountIdentitiesAligned(sessionUserId, convexUserId) ||
      isMobileSyncSuspended() ||
      cloudLibraryItems === undefined ||
      cloudSourceLinks === undefined ||
      cloudCollections === undefined ||
      cloudCollectionItems === undefined ||
      snapshotGeneration === null
    )
      return;
    let cancelled = false;
    const syncEpoch = getMobileSyncEpoch();
    const expectedUserId = sessionUserId;
    const runGuard = makeMobileSyncRunGuard({
      isCancelled: () => cancelled,
      expectedUserId,
      convexUserId,
      syncEpoch,
    });
    const shouldContinue = () => isAuthenticated && runGuard();

    void (async () => {
      try {
        if (!shouldContinue()) return;
        const convex = mobileConvexRef.current;
        if (!convex) return;

        if (
          !(await prepareMobileSnapshotGeneration(
            store,
            snapshotGeneration,
            shouldContinue,
          ))
        )
          return;

        const cloudItems = mapCloudLibraryItems(cloudLibraryItems.rows);
        const cloudLinks = await reconcilePendingSourceLinkDeletions(
          store,
          convex,
          mapCloudSourceLinks(cloudSourceLinks.rows),
          shouldContinue,
          snapshotGeneration,
          expectedUserId,
        );
        if (!shouldContinue()) return;
        let localItemsToPush: LocalLibraryItem[] = [];
        let localLinksToPush: LocalSourceLink[] = [];
        if (store.applyLibrarySnapshot) {
          const winners = await runWithMobileSyncWrite(async () => {
            if (
              !(await isSnapshotGenerationCurrent(
                store,
                snapshotGeneration,
                shouldContinue,
              ))
            )
              return null;
            return store.applyLibrarySnapshot!(cloudItems, cloudLinks);
          });
          if (!winners) return;
          localItemsToPush = winners.localItemsToPush;
          localLinksToPush = winners.localLinksToPush;
        } else {
          const [localItems, localLinks] = await Promise.all([
            store.getAllLibraryItems({ includeRemoved: true }),
            store.getAllSourceLinks(),
          ]);
          if (!shouldContinue()) return;
          const merged = mergeLibrarySnapshot(
            localItems,
            localLinks,
            cloudItems,
            cloudLinks,
          );
          await runWithMobileRemoteSnapshot(async () => {
            if (
              !(await isSnapshotGenerationCurrent(
                store,
                snapshotGeneration,
                shouldContinue,
              ))
            )
              return;
            await store.saveLibrarySnapshot(merged.items, merged.links);
          });
          localItemsToPush = merged.localItemsToPush;
          localLinksToPush = merged.localLinksToPush;
        }
        if (shouldContinue())
          await pushLocalLibraryWinners(
            store,
            convex,
            localItemsToPush,
            localLinksToPush,
            shouldContinue,
            snapshotGeneration,
            expectedUserId,
          );
        if (!shouldContinue()) return;

        const mappedCloudCollections =
          await reconcilePendingCollectionDeletions(
            store,
            convex,
            mapCloudCollections(cloudCollections.rows),
            shouldContinue,
            snapshotGeneration,
            expectedUserId,
          );
        if (!shouldContinue()) return;
        const mappedCloudCollectionItems = mapCloudCollectionItems(
          cloudCollectionItems.rows,
        );
        let localCollectionsToPush: ReturnType<typeof mapCloudCollections> = [];
        let localCollectionItemsToPush: LocalCollectionItem[] = [];
        if (store.applyCollectionsSnapshot) {
          const winners = await runWithMobileSyncWrite(async () => {
            if (
              !(await isSnapshotGenerationCurrent(
                store,
                snapshotGeneration,
                shouldContinue,
              ))
            )
              return null;
            return store.applyCollectionsSnapshot!(
              mappedCloudCollections,
              mappedCloudCollectionItems,
            );
          });
          if (!winners) return;
          localCollectionsToPush = winners.localCollectionsToPush;
          localCollectionItemsToPush = winners.localCollectionItemsToPush;
        } else {
          const [localCollections, localCollectionItems] = await Promise.all([
            store.getCollections(),
            store.getCollectionItems(),
          ]);
          if (!shouldContinue()) return;
          const merged = mergeCollectionSnapshot(
            localCollections,
            localCollectionItems,
            mappedCloudCollections,
            mappedCloudCollectionItems,
          );
          await runWithMobileRemoteSnapshot(async () => {
            if (
              !(await isSnapshotGenerationCurrent(
                store,
                snapshotGeneration,
                shouldContinue,
              ))
            )
              return;
            await store.saveCollectionsSnapshot(
              merged.collections,
              merged.collectionItems,
            );
          });
          localCollectionsToPush = merged.localCollectionsToPush;
          localCollectionItemsToPush = merged.localCollectionItemsToPush;
        }
        if (shouldContinue())
          await pushLocalCollectionWinners(
            store,
            convex,
            localCollectionsToPush,
            localCollectionItemsToPush,
            shouldContinue,
            snapshotGeneration,
            expectedUserId,
          );
        if (shouldContinue()) {
          emitMobileDataChanged("library");
          emitMobileDataChanged("collections");
        }
      } catch (error) {
        console.error(
          "[MobileSync] Failed to apply library/collections snapshot:",
          error,
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    cloudCollectionItems,
    cloudCollections,
    cloudLibraryItems,
    cloudSourceLinks,
    convexUserId,
    isAuthenticated,
    sessionUserId,
    snapshotGeneration,
    store,
  ]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !sessionUserId ||
      !areSyncAccountIdentitiesAligned(sessionUserId, convexUserId) ||
      isMobileSyncSuspended() ||
      cloudChapterProgress === undefined ||
      cloudMangaProgress === undefined ||
      snapshotGeneration === null
    )
      return;
    let cancelled = false;
    const syncEpoch = getMobileSyncEpoch();
    const expectedUserId = sessionUserId;
    const runGuard = makeMobileSyncRunGuard({
      isCancelled: () => cancelled,
      expectedUserId,
      convexUserId,
      syncEpoch,
    });
    const shouldContinue = () => isAuthenticated && runGuard();

    void (async () => {
      try {
        if (!shouldContinue()) return;
        const convex = mobileConvexRef.current;
        if (!convex) return;
        if (
          !(await prepareMobileSnapshotGeneration(
            store,
            snapshotGeneration,
            shouldContinue,
          ))
        )
          return;

        const applied = await applyMobileProgressSnapshots(
          store,
          convex,
          mapCloudChapterProgress(cloudChapterProgress.rows),
          mapCloudMangaProgress(cloudMangaProgress.rows),
          shouldContinue,
          snapshotGeneration,
          expectedUserId,
        );
        if (applied) emitMobileDataChanged("progress");
      } catch (error) {
        console.error("[MobileSync] Failed to apply progress snapshot:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    cloudChapterProgress,
    cloudMangaProgress,
    convexUserId,
    isAuthenticated,
    sessionUserId,
    snapshotGeneration,
    store,
  ]);

  useEffect(() => {
    if (
      !isAuthenticated ||
      !sessionUserId ||
      !areSyncAccountIdentitiesAligned(sessionUserId, convexUserId) ||
      isMobileSyncSuspended() ||
      cloudSettings === undefined ||
      snapshotGeneration === null
    )
      return;
    let cancelled = false;
    const syncEpoch = getMobileSyncEpoch();
    const expectedUserId = sessionUserId;
    const runGuard = makeMobileSyncRunGuard({
      isCancelled: () => cancelled,
      expectedUserId,
      convexUserId,
      syncEpoch,
    });
    const shouldContinue = () => isAuthenticated && runGuard();

    void (async () => {
      try {
        if (!shouldContinue()) return;
        const convex = mobileConvexRef.current;
        if (!convex) return;
        if (
          !(await prepareMobileSnapshotGeneration(
            store,
            snapshotGeneration,
            shouldContinue,
          ))
        )
          return;

        const localSettings = await store.getSyncSettings();
        if (!shouldContinue()) return;
        const cloudSources = cloudSettings.installedSources ?? [];
        const mergedSources = mergeMobileInstalledSources(
          localSettings.installedSources,
          cloudSources,
        );
        // Hydration downloads packages over the network — it must stay
        // outside the store write; the updatedAt guard in the apply protects
        // against sources that changed locally meanwhile.
        const hydratedSources = await hydrateMobileSyncedSourcePackages(
          mergedSources,
          {
            onHydrationError(source, error) {
              console.warn(
                `[MobileSync] Failed to cache synced source package for ${source.id}:`,
                error,
              );
            },
            shouldContinue,
          },
        );
        if (!shouldContinue()) return;
        if (store.applyInstalledSourcesSnapshot) {
          // Writes only installed-source rows (never the scalar settings
          // blob, which a concurrent theme/preference toggle may own).
          await runWithMobileSyncWrite(async () => {
            if (
              !(await isSnapshotGenerationCurrent(
                store,
                snapshotGeneration,
                shouldContinue,
              ))
            )
              return;
            await store.applyInstalledSourcesSnapshot!(hydratedSources);
          });
        } else {
          await runWithMobileRemoteSnapshot(async () => {
            if (
              !(await isSnapshotGenerationCurrent(
                store,
                snapshotGeneration,
                shouldContinue,
              ))
            )
              return;
            await store.saveSettings({
              ...localSettings,
              installedSources: hydratedSources,
            });
          });
        }
        if (shouldContinue())
          await pushLocalInstalledSourceWinners(
            store,
            localSettings.installedSources,
            cloudSources,
            convex,
            shouldContinue,
            snapshotGeneration,
            expectedUserId,
          );
        if (shouldContinue()) emitMobileDataChanged("settings");
      } catch (error) {
        console.error("[MobileSync] Failed to apply settings snapshot:", error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    cloudSettings,
    convexUserId,
    isAuthenticated,
    sessionUserId,
    snapshotGeneration,
    store,
  ]);

  return null;
}

export function MobileSyncBridge() {
  if (!mobileSyncConfig.configured) return null;
  return <ConfiguredMobileSyncBridge />;
}
