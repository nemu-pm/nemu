import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { IndexedDBUserDataStore } from "@/data/indexeddb";
import type {
  InstalledSource,
  LocalChapterProgress,
  LocalCollection,
  LocalCollectionItem,
  LocalLibraryItem,
  LocalSourceLink,
} from "@/data/schema";
import {
  chunkChapterProgressSaveInputs,
  chunkCollectionMutationItems,
  normalizeSyncClock,
  resolveLibraryItemMergeAlias,
  supportsChapterProgressIntraPageSync,
  toCloudInstalledSource,
  toCloudHistorySaveInput,
  toCloudLibrarySaveInput,
  toCloudLibrarySaveInputBatches,
  type CollectionSnapshotMerge,
  type LibrarySnapshotMerge,
} from "@nemu/core";

type MutationClient = Pick<ConvexReactClient, "mutation">;

export type WebSyncRunIdentity = {
  generation: number;
  profileId: string | undefined;
  userId: string | undefined;
  authenticated: boolean;
  localStore: object;
};

export function isWebSyncRunCurrent(
  expected: WebSyncRunIdentity,
  current: WebSyncRunIdentity,
  cancelled: boolean,
  subscriptionStopped: boolean,
): boolean {
  return (
    !cancelled &&
    !subscriptionStopped &&
    expected.generation === current.generation &&
    expected.profileId === current.profileId &&
    expected.userId === current.userId &&
    expected.userId !== undefined &&
    expected.profileId === `user:${expected.userId}` &&
    expected.authenticated &&
    current.authenticated &&
    expected.localStore === current.localStore
  );
}

async function pushLocalLibraryWinners(
  localStore: Pick<
    IndexedDBUserDataStore,
    "getLibraryItem" | "getSourceLink" | "getSourceLinksForLibraryItem"
  >,
  convex: MutationClient,
  merged: LibrarySnapshotMerge<LocalLibraryItem, LocalSourceLink>,
  generation: number,
  expectedUserId: string,
  shouldContinue: () => boolean,
): Promise<void> {
  const pushedLinkIds = new Set<string>();
  const removedLibraryItemIds = new Set<string>();

  // Active survivors must exist before a local merge alias is replayed as a
  // semantic remove. Snapshot order is not a dependency contract (and IDB
  // key order can put the retired id first), so make the relation explicit.
  const orderedItemCandidates = [...merged.localItemsToPush].sort(
    (left, right) =>
      Number(left.inLibrary === false) - Number(right.inLibrary === false),
  );
  for (const candidate of orderedItemCandidates) {
    if (!shouldContinue()) return;
    const item = await localStore.getLibraryItem(candidate.libraryItemId);
    if (!shouldContinue()) return;
    if (!item) continue;
    if (item.inLibrary === false) {
      await convex.mutation(api.library.remove, {
        expectedUserId,
        libraryItemId: item.libraryItemId,
        mergeTargetLibraryItemId: item.mergedIntoLibraryItemId,
        updatedAt: normalizeSyncClock(item.updatedAt),
        generation,
      });
      removedLibraryItemIds.add(item.libraryItemId);
      continue;
    }
    const itemLinks = await localStore.getSourceLinksForLibraryItem(
      item.libraryItemId,
      { includeRemoved: true },
    );
    if (!shouldContinue()) return;
    if (itemLinks.length === 0) continue;
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

  for (const candidate of merged.localLinksToPush) {
    if (!shouldContinue()) return;
    if (
      pushedLinkIds.has(candidate.id) ||
      removedLibraryItemIds.has(candidate.libraryItemId)
    ) {
      continue;
    }
    const link = await localStore.getSourceLink(candidate.id);
    if (!shouldContinue()) return;
    if (!link) continue;
    const item = await localStore.getLibraryItem(link.libraryItemId);
    if (!shouldContinue()) return;
    if (!item) continue;
    if (item.inLibrary === false) {
      await convex.mutation(api.library.remove, {
        expectedUserId,
        libraryItemId: item.libraryItemId,
        mergeTargetLibraryItemId: item.mergedIntoLibraryItemId,
        updatedAt: normalizeSyncClock(item.updatedAt),
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
  localStore: Pick<
    IndexedDBUserDataStore,
    "getCollection" | "getCollections" | "getCollectionItems"
  >,
  convex: MutationClient,
  merged: CollectionSnapshotMerge<LocalCollection, LocalCollectionItem>,
  generation: number,
  expectedUserId: string,
  shouldContinue: () => boolean,
): Promise<void> {
  const removedCollectionIds = new Set<string>();
  if (
    merged.localCollectionsToPush.length === 0 &&
    merged.localCollectionItemsToPush.length === 0
  )
    return;
  for (const candidate of merged.localCollectionsToPush) {
    if (!shouldContinue()) return;
    const collection = await localStore.getCollection(candidate.collectionId);
    if (!shouldContinue()) return;
    if (!collection) continue;
    if (collection.removed) {
      await convex.mutation(api.collections.remove, {
        expectedUserId,
        collectionId: collection.collectionId,
        updatedAt: normalizeSyncClock(collection.updatedAt),
        generation,
      });
      removedCollectionIds.add(collection.collectionId);
    } else {
      await convex.mutation(api.collections.save, {
        expectedUserId,
        collectionId: collection.collectionId,
        name: collection.name,
        createdAt: normalizeSyncClock(collection.createdAt),
        updatedAt: normalizeSyncClock(collection.updatedAt),
        removed: false,
        generation,
      });
    }
  }

  if (merged.localCollectionItemsToPush.length === 0) return;

  const [currentCollections, currentCollectionItems] = await Promise.all([
    localStore.getCollections(),
    localStore.getCollectionItems(),
  ]);
  if (!shouldContinue()) return;
  const collectionsById = new Map(
    currentCollections.map((collection) => [
      collection.collectionId,
      collection,
    ]),
  );
  const itemsById = new Map(
    currentCollectionItems.map((item) => [
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
  const removedCollections = new Map<string, LocalCollection>();

  for (const candidate of merged.localCollectionItemsToPush) {
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
    const updatedAt = normalizeSyncClock(item.updatedAt);
    const groupKey = `${item.collectionId}\u0000${item.removed === true ? "remove" : "add"}\u0000${updatedAt}`;
    const group = membershipGroups.get(groupKey) ?? {
      collectionId: item.collectionId,
      libraryItemIds: [],
      removed: item.removed === true,
      updatedAt,
    };
    group.libraryItemIds.push(item.libraryItemId);
    membershipGroups.set(groupKey, group);
  }

  for (const collection of removedCollections.values()) {
    if (!shouldContinue()) return;
    await convex.mutation(api.collections.remove, {
      expectedUserId,
      collectionId: collection.collectionId,
      updatedAt: normalizeSyncClock(collection.updatedAt),
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

async function pushLocalInstalledSourceWinners(
  localStore: Pick<IndexedDBUserDataStore, "getInstalledSource">,
  convex: MutationClient,
  candidates: InstalledSource[],
  generation: number,
  expectedUserId: string,
  shouldContinue: () => boolean,
): Promise<void> {
  for (const candidate of candidates) {
    if (!shouldContinue()) return;
    const source = await localStore.getInstalledSource(candidate.id);
    if (!shouldContinue()) return;
    if (!source) continue;
    if (source.removed) {
      await convex.mutation(api.settings.removeInstalledSource, {
        expectedUserId,
        id: source.id,
        registryId: source.registryId,
        updatedAt: normalizeSyncClock(source.updatedAt),
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

export async function applyWebLibrarySyncSnapshot(options: {
  localStore: Pick<
    IndexedDBUserDataStore,
    | "applyLibrarySnapshot"
    | "getLibraryItem"
    | "getSourceLink"
    | "getSourceLinksForLibraryItem"
  >;
  convex: MutationClient;
  cloudItems: LocalLibraryItem[];
  cloudLinks: LocalSourceLink[];
  generation: number;
  expectedUserId: string;
  shouldContinue: () => boolean;
}): Promise<LibrarySnapshotMerge<LocalLibraryItem, LocalSourceLink> | null> {
  if (!options.shouldContinue()) return null;
  const merged = await options.localStore.applyLibrarySnapshot(
    options.cloudItems,
    options.cloudLinks,
    options.shouldContinue,
    options.generation,
  );
  if (!merged || !options.shouldContinue()) return null;
  await pushLocalLibraryWinners(
    options.localStore,
    options.convex,
    merged,
    options.generation,
    options.expectedUserId,
    options.shouldContinue,
  );
  return options.shouldContinue() ? merged : null;
}

export async function applyWebCollectionsSyncSnapshot(options: {
  localStore: Pick<
    IndexedDBUserDataStore,
    | "applyCollectionsSnapshot"
    | "getCollection"
    | "getCollections"
    | "getCollectionItems"
  >;
  convex: MutationClient;
  cloudCollections: LocalCollection[];
  cloudCollectionItems: LocalCollectionItem[];
  /** Complete library snapshot for alias-safe collection canonicalization. */
  cloudLibraryItems?: LocalLibraryItem[];
  generation: number;
  expectedUserId: string;
  shouldContinue: () => boolean;
}): Promise<CollectionSnapshotMerge<
  LocalCollection,
  LocalCollectionItem
> | null> {
  if (!options.shouldContinue()) return null;
  const cloudLibraryItemsById = new Map(
    (options.cloudLibraryItems ?? []).map((item) => [item.libraryItemId, item]),
  );
  const canonicalizeMembership = (
    membership: LocalCollectionItem,
  ): LocalCollectionItem => {
    if (membership.removed || cloudLibraryItemsById.size === 0) {
      return membership;
    }
    const libraryItemId = resolveLibraryItemMergeAlias(
      membership.libraryItemId,
      (current) => cloudLibraryItemsById.get(current)?.mergedIntoLibraryItemId,
    );
    return libraryItemId === membership.libraryItemId
      ? membership
      : { ...membership, libraryItemId };
  };
  const merged = await options.localStore.applyCollectionsSnapshot(
    options.cloudCollections,
    options.cloudCollectionItems.map(canonicalizeMembership),
    options.shouldContinue,
    options.generation,
  );
  if (!merged || !options.shouldContinue()) return null;
  await pushLocalCollectionWinners(
    options.localStore,
    options.convex,
    merged,
    options.generation,
    options.expectedUserId,
    options.shouldContinue,
  );
  return options.shouldContinue() ? merged : null;
}

export async function applyWebInstalledSourcesSyncSnapshot(options: {
  localStore: Pick<
    IndexedDBUserDataStore,
    "applyInstalledSourcesSnapshot" | "getInstalledSource"
  >;
  convex: MutationClient;
  cloudSources: InstalledSource[];
  generation: number;
  expectedUserId: string;
  shouldContinue: () => boolean;
}): Promise<InstalledSource[] | null> {
  if (!options.shouldContinue()) return null;
  const applied = await options.localStore.applyInstalledSourcesSnapshot(
    options.cloudSources,
    options.shouldContinue,
    options.generation,
  );
  if (!applied || !options.shouldContinue()) return null;
  await pushLocalInstalledSourceWinners(
    options.localStore,
    options.convex,
    applied.localSourcesToPush,
    options.generation,
    options.expectedUserId,
    options.shouldContinue,
  );
  return options.shouldContinue() ? applied.sources : null;
}

export async function applyWebChapterProgressSyncSnapshot(options: {
  localStore: Pick<IndexedDBUserDataStore, "applyChapterProgressSnapshot">;
  convex: MutationClient;
  cloudProgress: LocalChapterProgress[];
  generation: number;
  expectedUserId: string;
  chapterProgressIntraPageVersion?: unknown;
  shouldContinue: () => boolean;
}): Promise<LocalChapterProgress[] | null> {
  if (!options.shouldContinue()) return null;
  const applied = await options.localStore.applyChapterProgressSnapshot(
    options.cloudProgress,
    options.generation,
    options.shouldContinue,
  );
  if (!applied || !options.shouldContinue()) return null;

  // A first sync can produce hundreds of local winners. One mutation per row
  // made that hundreds of sequential round trips; `saveBatch` applies each
  // chunk in a single server transaction using the same per-item logic.
  const includeIntraPageState = supportsChapterProgressIntraPageSync(
    options.chapterProgressIntraPageVersion,
  );
  const saveInputs = applied.localWinners.map((progress) =>
    toCloudHistorySaveInput(progress, { includeIntraPageState }),
  );
  for (const items of chunkChapterProgressSaveInputs(saveInputs)) {
    if (!options.shouldContinue()) return null;
    await options.convex.mutation(api.history.saveBatch, {
      expectedUserId: options.expectedUserId,
      generation: options.generation,
      items,
    });
  }

  return options.shouldContinue() ? applied.progress : null;
}
