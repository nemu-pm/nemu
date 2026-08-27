import type { ConvexReactClient } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type {
  InstalledSource,
  LocalChapterProgress,
  LocalCollection,
  LocalCollectionItem,
  LocalLibraryItem,
  LocalMangaProgress,
  MobileSyncSnapshotState,
  LocalSourceLink,
  LocalSourceSettings,
  SourceRegistry,
  UserSettings,
} from "@/data/schema";
import type {
  CollectionsSnapshotApplyResult,
  LibrarySnapshotApplyResult,
  MobileDataStore,
  PendingSyncDeletion,
} from "@/data/storeTypes";
import {
  chunkCollectionMutationItems,
  mangaProgressFromChapterProgress,
  mergeChapterProgressSnapshot,
  mergeCollectionSnapshot,
  mergeLibrarySnapshot,
  mergeMangaProgressSnapshot,
  nextSyncTimestamp,
  toCloudHistorySaveInput,
  toCloudInstalledSource,
  toCloudLibrarySaveInput,
  toCloudLibrarySaveInputBatches,
  type ProgressSnapshotMerge,
} from "@nemu/core";
import {
  isApplyingMobileRemoteSnapshot,
  getMobileSyncEpoch,
  isActiveMobileSyncStore,
  isMobileSyncEpochCurrent,
  isMobileSyncSuspended,
  mobileConvexRef,
  mobileIsAuthenticatedRef,
  mobileSessionUserIdRef,
  runWithMobileSyncWrite,
} from "./mobileSyncRuntime";

function cloudClient(
  expectedEpoch = getMobileSyncEpoch(),
  owningStore?: object,
): { convex: ConvexReactClient; expectedUserId: string } | null {
  if (isApplyingMobileRemoteSnapshot()) return null;
  if (isMobileSyncSuspended()) return null;
  if (!isMobileSyncEpochCurrent(expectedEpoch)) return null;
  if (owningStore && !isActiveMobileSyncStore(owningStore)) return null;
  if (!mobileIsAuthenticatedRef.current) return null;
  const convex = mobileConvexRef.current;
  const expectedUserId = mobileSessionUserIdRef.current;
  return convex && expectedUserId ? { convex, expectedUserId } : null;
}

async function saveCloudChapterProgress(
  context: { convex: ConvexReactClient; expectedUserId: string },
  progress: LocalChapterProgress,
  generation: number,
): Promise<void> {
  await context.convex.mutation(api.history.save, {
    expectedUserId: context.expectedUserId,
    ...toCloudHistorySaveInput(progress),
    generation,
  });
}

async function getMutationGeneration(store: MobileDataStore): Promise<number | null> {
  return store.getSyncGeneration();
}

async function runLocalSyncMutation<T>(
  store: MobileDataStore,
  operation: (generation: number | null) => Promise<T>,
): Promise<{ generation: number | null; value: T }> {
  return runWithMobileSyncWrite(async () => {
    const generation = await getMutationGeneration(store);
    return { generation, value: await operation(generation) };
  });
}

async function getSavedChapterProgress(
  base: MobileDataStore,
  progress: LocalChapterProgress,
): Promise<LocalChapterProgress> {
  return (
    (await base.getChapterProgress(
      progress.registryId,
      progress.sourceId,
      progress.sourceMangaId,
      progress.sourceChapterId,
    )) ?? progress
  );
}

export function createMobileSyncDataStore(
  base: MobileDataStore,
): MobileDataStore {
  return new MobileSyncDataStore(base);
}

export async function retargetMobileCloudHistoryLibraryItem(
  sourceLibraryItemId: string,
  targetLibraryItemId: string,
  syncEpoch = getMobileSyncEpoch(),
  store?: MobileDataStore,
): Promise<void> {
  if (sourceLibraryItemId === targetLibraryItemId) return;
  if (!store) return;
  const generation = (
    await runLocalSyncMutation(store, async () => undefined)
  ).generation;
  if (generation === null) return;
  const context = cloudClient(syncEpoch, store);
  if (!context) return;
  await context.convex.mutation(api.history.retargetLibraryItem, {
    expectedUserId: context.expectedUserId,
    sourceLibraryItemId,
    targetLibraryItemId,
    updatedAt: Date.now(),
    generation,
  });
}

class MobileSyncDataStore implements MobileDataStore {
  constructor(private readonly base: MobileDataStore) {}

  getSyncGeneration(): Promise<number | null> {
    return this.base.getSyncGeneration();
  }

  applySyncGeneration(generation: number) {
    return this.base.applySyncGeneration(generation);
  }

  getSyncSnapshotState(): Promise<MobileSyncSnapshotState | null> {
    return this.base.getSyncSnapshotState();
  }

  recordSyncSnapshotState(
    state: MobileSyncSnapshotState,
    shouldContinue?: () => boolean,
  ): Promise<boolean> {
    return runWithMobileSyncWrite(async () => {
      if (shouldContinue?.() === false) return false;
      return this.base.recordSyncSnapshotState(state, shouldContinue);
    });
  }

  getSettings(): Promise<UserSettings> {
    return this.base.getSettings();
  }

  getSyncSettings(): Promise<UserSettings> {
    return this.base.getSyncSettings();
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    // Local-only, like web. Cloud installed-source state is maintained solely
    // by the per-source saveInstalledSource/removeInstalledSource mutations:
    // getSettings() filters tombstones, so pushing its installedSources to the
    // replace-semantics settings.save mutation wiped uninstall tombstones from
    // the cloud on every unrelated settings toggle (uninstalled sources then
    // resurrected on other devices).
    await runLocalSyncMutation(this.base, async (generation) => {
      await this.base.saveSettings(settings, generation ?? undefined);
    });
  }

  clearPackageCacheReferences(): Promise<void> {
    return runWithMobileSyncWrite(() => this.base.clearPackageCacheReferences());
  }

  clearAllUserData(): Promise<void> {
    return runWithMobileSyncWrite(() => this.base.clearAllUserData());
  }

  getInstalledSources(): Promise<InstalledSource[]> {
    return this.base.getInstalledSources();
  }

  getInstalledSource(id: string): Promise<InstalledSource | null> {
    return this.base.getInstalledSource(id);
  }

  async saveInstalledSource(source: InstalledSource): Promise<void> {
    const syncEpoch = getMobileSyncEpoch();
    const { generation, value: result } = await runLocalSyncMutation(
      this.base,
      async (localGeneration) => {
        const existing = (await this.base.getSyncSettings()).installedSources.find(
          (item) => item.id === source.id,
        );
        if (
          existing?.removed &&
          (source.updatedAt ?? 0) <= (existing.updatedAt ?? 0)
        ) {
          return { saved: false, latest: existing };
        }
        const localSource =
          !existing || (source.updatedAt ?? 0) > (existing.updatedAt ?? 0)
            ? source
            : { ...source, updatedAt: nextSyncTimestamp(existing.updatedAt) };
        await this.base.saveInstalledSource(
          localSource,
          localGeneration ?? undefined,
        );
        return {
          saved: true,
          latest: (await this.base.getSyncSettings()).installedSources.find(
            (item) => item.id === source.id,
          ),
        };
      },
    );
    if (!result.saved) return;
    if (generation === null) return;
    const context = cloudClient(syncEpoch, this);
    if (!context) return;
    if (!result.latest || result.latest.removed) return;
    await context.convex.mutation(api.settings.saveInstalledSource, {
      expectedUserId: context.expectedUserId,
      source: toCloudInstalledSource(result.latest),
      generation,
    });
  }

  async saveInstalledSourceIfCurrent(
    source: InstalledSource,
    expectedUpdatedAt?: number,
  ): Promise<boolean> {
    const syncEpoch = getMobileSyncEpoch();
    const { generation, value: result } = await runLocalSyncMutation(
      this.base,
      async (localGeneration) => {
        const existing = (await this.base.getSyncSettings()).installedSources.find(
          (item) => item.id === source.id,
        );
        if (
          !existing ||
          existing.removed ||
          (existing.updatedAt ?? 0) !== (expectedUpdatedAt ?? 0)
        ) {
          return { saved: false, latest: existing };
        }
        const localSource =
          (source.updatedAt ?? 0) > (existing.updatedAt ?? 0)
            ? source
            : { ...source, updatedAt: nextSyncTimestamp(existing.updatedAt) };
        await this.base.saveInstalledSource(
          localSource,
          localGeneration ?? undefined,
        );
        return {
          saved: true,
          latest: (await this.base.getSyncSettings()).installedSources.find(
            (item) => item.id === source.id,
          ),
        };
      },
    );
    if (!result.saved) return false;
    if (generation === null) return true;
    const context = cloudClient(syncEpoch, this);
    if (!context || !result.latest || result.latest.removed) return true;
    await context.convex.mutation(api.settings.saveInstalledSource, {
      expectedUserId: context.expectedUserId,
      source: toCloudInstalledSource(result.latest),
      generation,
    });
    return true;
  }

  async removeInstalledSource(id: string, registryId?: string): Promise<void> {
    const syncEpoch = getMobileSyncEpoch();
    const { generation, value: updatedAt } = await runLocalSyncMutation(
      this.base,
      async (localGeneration) => {
        const existing = (await this.base.getSyncSettings()).installedSources.find(
          (item) => item.id === id,
        );
        const updatedAt = nextSyncTimestamp(existing?.updatedAt);
        await this.base.removeInstalledSource(
          id,
          registryId,
          updatedAt,
          localGeneration ?? undefined,
        );
        return updatedAt;
      },
    );
    if (generation === null) return;
    const context = cloudClient(syncEpoch, this);
    if (!context || !registryId) return;
    await context.convex.mutation(api.settings.removeInstalledSource, {
      expectedUserId: context.expectedUserId,
      id,
      registryId,
      updatedAt,
      generation,
    });
  }

  getSourceSettings(sourceKey: string): Promise<LocalSourceSettings | null> {
    return this.base.getSourceSettings(sourceKey);
  }

  saveSourceSettings(settings: LocalSourceSettings): Promise<void> {
    return this.base.saveSourceSettings(settings);
  }

  resetSourceSettings(sourceKey: string): Promise<void> {
    return this.base.resetSourceSettings(sourceKey);
  }

  getRegistries(): Promise<SourceRegistry[]> {
    return this.base.getRegistries();
  }

  getRegistry(id: string): Promise<SourceRegistry | null> {
    return this.base.getRegistry(id);
  }

  saveRegistry(registry: SourceRegistry): Promise<void> {
    return this.base.saveRegistry(registry);
  }

  removeRegistry(id: string): Promise<void> {
    return this.base.removeRegistry(id);
  }

  getLibraryEntries() {
    return this.base.getLibraryEntries();
  }

  getLibraryItem(libraryItemId: string): Promise<LocalLibraryItem | null> {
    return this.base.getLibraryItem(libraryItemId);
  }

  getAllLibraryItems(options?: {
    includeRemoved?: boolean;
  }): Promise<LocalLibraryItem[]> {
    return this.base.getAllLibraryItems(options);
  }

  getSourceLinksForItem(
    libraryItemId: string,
    options?: { includeRemoved?: boolean },
  ): Promise<LocalSourceLink[]> {
    return this.base.getSourceLinksForItem(libraryItemId, options);
  }

  getSourceLink(id: string): Promise<LocalSourceLink | null> {
    return this.base.getSourceLink(id);
  }

  getAllSourceLinks(): Promise<LocalSourceLink[]> {
    return this.base.getAllSourceLinks();
  }

  async saveLibraryItem(item: LocalLibraryItem): Promise<void> {
    const syncEpoch = getMobileSyncEpoch();
    const { generation, value } = await runLocalSyncMutation(
      this.base,
      async (localGeneration) => {
        const existing = await this.base.getLibraryItem(item.libraryItemId);
        const localItem =
          !existing || item.updatedAt > existing.updatedAt
            ? item
            : { ...item, updatedAt: nextSyncTimestamp(existing.updatedAt) };
        await this.base.saveLibraryItem(localItem, localGeneration ?? undefined);
        const [latestItem, allLinks] = await Promise.all([
          this.base.getLibraryItem(localItem.libraryItemId),
          this.base.getAllSourceLinks(),
        ]);
        return {
          latestItem,
          links: allLinks.filter(
            (link) => link.libraryItemId === localItem.libraryItemId,
          ),
        };
      },
    );
    if (generation === null) return;
    if (
      !value.latestItem ||
      value.latestItem.inLibrary === false ||
      value.links.length === 0
    ) return;
    for (const input of toCloudLibrarySaveInputBatches(
      value.latestItem,
      value.links,
    )) {
      const context = cloudClient(syncEpoch, this);
      if (!context) return;
      await context.convex.mutation(api.library.save, {
        expectedUserId: context.expectedUserId,
        ...input,
        generation,
      });
    }
  }

  saveLibrarySnapshot(
    items: LocalLibraryItem[],
    links: LocalSourceLink[],
  ): Promise<void> {
    return this.base.saveLibrarySnapshot(items, links);
  }

  async removeLibraryItem(libraryItemId: string): Promise<void> {
    const syncEpoch = getMobileSyncEpoch();
    const { generation, value: updatedAt } = await runLocalSyncMutation(
      this.base,
      async (localGeneration) => {
        const [existing, memberships] = await Promise.all([
          this.base.getLibraryItem(libraryItemId),
          this.base.getCollectionItems(),
        ]);
        const updatedAt = nextSyncTimestamp(
          existing?.updatedAt,
          ...memberships
            .filter((item) => item.libraryItemId === libraryItemId)
            .map((item) => item.updatedAt),
        );
        await this.base.removeLibraryItem(
          libraryItemId,
          updatedAt,
          localGeneration ?? undefined,
        );
        const removed = await this.base.getLibraryItem(libraryItemId);
        return removed?.updatedAt ?? updatedAt;
      },
    );
    if (generation === null) return;
    const context = cloudClient(syncEpoch, this);
    if (!context) return;
    await context.convex.mutation(api.library.remove, {
      expectedUserId: context.expectedUserId,
      libraryItemId,
      updatedAt,
      generation,
    });
  }

  async saveSourceLink(link: LocalSourceLink): Promise<void> {
    const syncEpoch = getMobileSyncEpoch();
    const { generation, value } = await runLocalSyncMutation(
      this.base,
      async (localGeneration) => {
        const existing = (await this.base.getAllSourceLinks()).find(
          (candidate) => candidate.id === link.id,
        );
        const localLink =
          !existing || link.updatedAt > existing.updatedAt
            ? link
            : { ...link, updatedAt: nextSyncTimestamp(existing.updatedAt) };
        await this.base.saveSourceLink(localLink, localGeneration ?? undefined);
        const [item, latestLink] = await Promise.all([
          this.base.getLibraryItem(link.libraryItemId),
          this.base.getAllSourceLinks().then((links) =>
            links.find((candidate) => candidate.id === localLink.id),
          ),
        ]);
        return { item, latestLink };
      },
    );
    if (generation === null) return;
    const { item, latestLink } = value;
    const context = cloudClient(syncEpoch, this);
    if (!context || !item || !latestLink) return;
    // library.save unconditionally patches inLibrary: true — pushing a link
    // for a tombstoned item would resurrect it in every device's library.
    if (item.inLibrary === false) return;
    await context.convex.mutation(api.library.save, {
      expectedUserId: context.expectedUserId,
      ...toCloudLibrarySaveInput(item, [latestLink]),
      generation,
    });
  }

  async removeSourceLink(
    registryId: string,
    sourceId: string,
    sourceMangaId: string,
  ): Promise<void> {
    const syncEpoch = getMobileSyncEpoch();
    const { generation, value } = await runLocalSyncMutation(
      this.base,
      async (localGeneration) => {
        const existing = (await this.base.getAllSourceLinks()).find(
          (link) =>
            link.registryId === registryId &&
            link.sourceId === sourceId &&
            link.sourceMangaId === sourceMangaId,
        );
        const updatedAt = nextSyncTimestamp(existing?.updatedAt);
        await this.base.removeSourceLink(
          registryId,
          sourceId,
          sourceMangaId,
          updatedAt,
          localGeneration ?? undefined,
        );
        return { existing, updatedAt };
      },
    );
    if (generation === null) return;
    const { existing, updatedAt } = value;
    const context = cloudClient(syncEpoch, this);
    if (!context) return;
    await context.convex.mutation(api.library.removeSourceLink, {
      expectedUserId: context.expectedUserId,
      registryId,
      sourceId,
      sourceMangaId,
      libraryItemId: existing?.libraryItemId,
      createdAt: existing?.createdAt,
      updatedAt,
      generation,
    });
  }

  getChapterProgress(
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string,
  ): Promise<LocalChapterProgress | null> {
    return this.base.getChapterProgress(
      registryId,
      sourceId,
      mangaId,
      chapterId,
    );
  }

  getMangaChapterProgress(
    registryId: string,
    sourceId: string,
    mangaId: string,
  ): Promise<Record<string, LocalChapterProgress>> {
    return this.base.getMangaChapterProgress(registryId, sourceId, mangaId);
  }

  getAllChapterProgress(): Promise<LocalChapterProgress[]> {
    return this.base.getAllChapterProgress();
  }

  async saveChapterProgress(progress: LocalChapterProgress): Promise<void> {
    const syncEpoch = getMobileSyncEpoch();
    const { generation, value: savedProgress } = await runLocalSyncMutation(
      this.base,
      async (localGeneration) => {
        const localProgress = await this.prepareLocalChapterProgress(progress);
        await this.base.saveChapterProgress(
          localProgress,
          localGeneration ?? undefined,
        );
        const savedProgress = await getSavedChapterProgress(this.base, localProgress);
        await this.saveDerivedMangaProgress(savedProgress, localGeneration);
        return savedProgress;
      },
    );
    if (generation === null) return;
    const context = cloudClient(syncEpoch, this);
    if (!context) return;
    await saveCloudChapterProgress(context, savedProgress, generation);
  }

  async saveChapterProgressBatch(
    progress: LocalChapterProgress[],
  ): Promise<void> {
    const syncEpoch = getMobileSyncEpoch();
    const { generation, value: savedProgress } = await runLocalSyncMutation(
      this.base,
      async (localGeneration) => {
        const localProgress = await Promise.all(
          progress.map((item) => this.prepareLocalChapterProgress(item)),
        );
        await this.base.saveChapterProgressBatch(
          localProgress,
          localGeneration ?? undefined,
        );
        const savedProgress = await Promise.all(
          localProgress.map((item) => getSavedChapterProgress(this.base, item)),
        );
        for (const item of savedProgress) {
          await this.saveDerivedMangaProgress(item, localGeneration);
        }
        return savedProgress;
      },
    );
    if (generation === null) return;
    const context = cloudClient(syncEpoch, this);
    if (!context) return;
    for (const item of savedProgress) {
      await saveCloudChapterProgress(context, item, generation);
    }
  }

  getMangaProgress(): Promise<LocalMangaProgress[]> {
    return this.base.getMangaProgress();
  }

  getAllMangaProgress(): Promise<LocalMangaProgress[]> {
    return this.base.getAllMangaProgress();
  }

  async saveMangaProgress(progress: LocalMangaProgress): Promise<void> {
    await runLocalSyncMutation(this.base, async (generation) => {
      const existing = (await this.base.getMangaProgress()).find(
        (entry) => entry.id === progress.id,
      );
      const localProgress =
        !existing || progress.updatedAt > existing.updatedAt
          ? progress
          : {
              ...progress,
              updatedAt: nextSyncTimestamp(existing.updatedAt),
            };
      await this.base.saveMangaProgress(localProgress, generation ?? undefined);
    });
  }

  async saveMangaProgressBatch(progress: LocalMangaProgress[]): Promise<void> {
    await runLocalSyncMutation(this.base, async (generation) => {
      const existing = new Map(
        (await this.base.getMangaProgress()).map((entry) => [entry.id, entry]),
      );
      await this.base.saveMangaProgressBatch(
        progress.map((item) => {
          const prior = existing.get(item.id);
          if (!prior || item.updatedAt > prior.updatedAt) return item;
          return {
            ...item,
            updatedAt: nextSyncTimestamp(prior.updatedAt),
          };
        }),
        generation ?? undefined,
      );
    });
  }

  private async saveDerivedMangaProgress(
    progress: LocalChapterProgress,
    generation: number | null,
  ): Promise<void> {
    const derived = mangaProgressFromChapterProgress(progress);
    const existing = (await this.base.getMangaProgress()).find(
      (entry) => entry.id === derived.id,
    );
    if (!existing || progress.updatedAt > existing.updatedAt) {
      await this.base.saveMangaProgress({
        ...derived,
        updatedAt:
          !existing || progress.updatedAt > existing.updatedAt
            ? progress.updatedAt
            : nextSyncTimestamp(existing.updatedAt),
      }, generation ?? undefined);
    }
  }

  getCollections(): Promise<LocalCollection[]> {
    return this.base.getCollections();
  }

  getCollection(collectionId: string): Promise<LocalCollection | null> {
    return this.base.getCollection(collectionId);
  }

  getCollectionItems(): Promise<LocalCollectionItem[]> {
    return this.base.getCollectionItems();
  }

  saveCollectionsSnapshot(
    collections: LocalCollection[],
    collectionItems: LocalCollectionItem[],
  ): Promise<void> {
    return this.base.saveCollectionsSnapshot(collections, collectionItems);
  }

  async saveCollection(collection: LocalCollection): Promise<void> {
    const syncEpoch = getMobileSyncEpoch();
    const { generation, value: latest } = await runLocalSyncMutation(
      this.base,
      async (localGeneration) => {
        const existing = (await this.base.getCollections()).find(
          (item) => item.collectionId === collection.collectionId,
        );
        const localCollection =
          !existing || collection.updatedAt > existing.updatedAt
            ? collection
            : { ...collection, updatedAt: nextSyncTimestamp(existing.updatedAt) };
        await this.base.saveCollection(
          localCollection,
          localGeneration ?? undefined,
        );
        return (await this.base.getCollections()).find(
          (item) => item.collectionId === collection.collectionId,
        );
      },
    );
    if (generation === null) return;
    const context = cloudClient(syncEpoch, this);
    if (!context) return;
    if (!latest) return;
    await context.convex.mutation(api.collections.save, {
      expectedUserId: context.expectedUserId,
      collectionId: latest.collectionId,
      name: latest.name,
      createdAt: latest.createdAt,
      updatedAt: latest.updatedAt,
      removed: latest.removed,
      generation,
    });
  }

  async removeCollection(collectionId: string): Promise<void> {
    const syncEpoch = getMobileSyncEpoch();
    const { generation, value: updatedAt } = await runLocalSyncMutation(
      this.base,
      async (localGeneration) => {
        const [collection, items] = await Promise.all([
          this.base.getCollections().then((collections) =>
            collections.find((item) => item.collectionId === collectionId),
          ),
          this.base.getCollectionItems(),
        ]);
        const updatedAt = nextSyncTimestamp(
          collection?.updatedAt,
          ...items
            .filter((item) => item.collectionId === collectionId)
            .map((item) => item.updatedAt),
        );
        await this.base.removeCollection(
          collectionId,
          updatedAt,
          localGeneration ?? undefined,
        );
        return updatedAt;
      },
    );
    if (generation === null) return;
    const context = cloudClient(syncEpoch, this);
    if (!context) return;
    await context.convex.mutation(api.collections.remove, {
      expectedUserId: context.expectedUserId,
      collectionId,
      updatedAt,
      generation,
    });
  }

  async addCollectionItems(
    collectionId: string,
    libraryItemIds: string[],
  ): Promise<void> {
    const syncEpoch = getMobileSyncEpoch();
    const local = await runLocalSyncMutation(
      this.base,
      async (localGeneration) => {
        const collectionExists = (await this.base.getCollections()).some(
          (collection) => collection.collectionId === collectionId,
        );
        if (!collectionExists) return null;
        const items = await this.base.getCollectionItems();
        const updatedAt = nextSyncTimestamp(
          ...items
            .filter(
              (item) =>
                item.collectionId === collectionId &&
                libraryItemIds.includes(item.libraryItemId),
            )
            .map((item) => item.updatedAt),
        );
        await this.base.addCollectionItems(
          collectionId,
          libraryItemIds,
          updatedAt,
          localGeneration ?? undefined,
        );
        return updatedAt;
      },
    );
    if (local.value === null) return;
    const { generation, value: updatedAt } = local;
    if (generation === null) return;
    const context = cloudClient(syncEpoch, this);
    if (!context) return;
    for (const batch of chunkCollectionMutationItems(libraryItemIds)) {
      await context.convex.mutation(api.collections.addItems, {
        expectedUserId: context.expectedUserId,
        collectionId,
        libraryItemIds: batch,
        updatedAt,
        generation,
      });
    }
  }

  async removeCollectionItems(
    collectionId: string,
    libraryItemIds: string[],
  ): Promise<void> {
    const syncEpoch = getMobileSyncEpoch();
    const { generation, value: updatedAt } = await runLocalSyncMutation(
      this.base,
      async (localGeneration) => {
        const items = await this.base.getCollectionItems();
        const updatedAt = nextSyncTimestamp(
          ...items
            .filter(
              (item) =>
                item.collectionId === collectionId &&
                libraryItemIds.includes(item.libraryItemId),
            )
            .map((item) => item.updatedAt),
        );
        await this.base.removeCollectionItems(
          collectionId,
          libraryItemIds,
          updatedAt,
          localGeneration ?? undefined,
        );
        return updatedAt;
      },
    );
    if (generation === null) return;
    const context = cloudClient(syncEpoch, this);
    if (!context) return;
    for (const batch of chunkCollectionMutationItems(libraryItemIds)) {
      await context.convex.mutation(api.collections.removeItems, {
        expectedUserId: context.expectedUserId,
        collectionId,
        libraryItemIds: batch,
        updatedAt,
        generation,
      });
    }
  }

  clearAccountData(): Promise<void> {
    return runWithMobileSyncWrite(() => this.base.clearAccountData());
  }

  hasSyncedData(): Promise<boolean> {
    return this.base.hasSyncedData();
  }

  getPendingSyncDeletions(): Promise<PendingSyncDeletion[]> {
    return this.base.getPendingSyncDeletions?.() ?? Promise.resolve([]);
  }

  async clearPendingSyncDeletion(deletion: PendingSyncDeletion): Promise<void> {
    await this.base.clearPendingSyncDeletion?.(deletion);
  }

  // Snapshot applies are local-by-contract: forward straight to the base
  // store (which never pushes) instead of routing through the push-capable
  // wrappers under a process-global suppression flag. The old global flag
  // also nulled cloudClient() for unrelated *user* writes that happened to
  // overlap an apply, silently dropping their pushes. Bases without the
  // atomic primitives (in-memory stubs) get a legacy read-merge-write
  // emulation.
  async applyLibrarySnapshot(
    cloudItems: LocalLibraryItem[],
    cloudLinks: LocalSourceLink[],
  ): Promise<LibrarySnapshotApplyResult> {
    if (this.base.applyLibrarySnapshot) {
      return this.base.applyLibrarySnapshot(cloudItems, cloudLinks);
    }
    const [localItems, localLinks] = await Promise.all([
      this.base.getAllLibraryItems({ includeRemoved: true }),
      this.base.getAllSourceLinks(),
    ]);
    const merged = mergeLibrarySnapshot(localItems, localLinks, cloudItems, cloudLinks);
    await this.base.saveLibrarySnapshot(merged.items, merged.links);
    return {
      changedItems: merged.changedItems,
      changedLinks: merged.changedLinks,
      localItemsToPush: merged.localItemsToPush,
      localLinksToPush: merged.localLinksToPush,
    };
  }

  async applyCollectionsSnapshot(
    cloudCollections: LocalCollection[],
    cloudCollectionItems: LocalCollectionItem[],
  ): Promise<CollectionsSnapshotApplyResult> {
    if (this.base.applyCollectionsSnapshot) {
      return this.base.applyCollectionsSnapshot(cloudCollections, cloudCollectionItems);
    }
    const [localCollections, localCollectionItems] = await Promise.all([
      this.base.getCollections(),
      this.base.getCollectionItems(),
    ]);
    const merged = mergeCollectionSnapshot(
      localCollections,
      localCollectionItems,
      cloudCollections,
      cloudCollectionItems,
    );
    await this.base.saveCollectionsSnapshot(merged.collections, merged.collectionItems);
    return {
      changedCollections: merged.changedCollections,
      changedCollectionItems: merged.changedCollectionItems,
      localCollectionsToPush: merged.localCollectionsToPush,
      localCollectionItemsToPush: merged.localCollectionItemsToPush,
    };
  }

  async applyChapterProgressSnapshot(
    progress: LocalChapterProgress[],
  ): Promise<ProgressSnapshotMerge<LocalChapterProgress>> {
    if (this.base.applyChapterProgressSnapshot) {
      return this.base.applyChapterProgressSnapshot(progress);
    }
    const result = mergeChapterProgressSnapshot(
      await this.base.getAllChapterProgress(),
      progress,
    );
    if (result.changed.length > 0) {
      await this.base.saveChapterProgressBatch(result.changed);
    }
    return result;
  }

  async applyMangaProgressSnapshot(
    progress: LocalMangaProgress[],
  ): Promise<ProgressSnapshotMerge<LocalMangaProgress>> {
    if (this.base.applyMangaProgressSnapshot) {
      return this.base.applyMangaProgressSnapshot(progress);
    }
    const result = mergeMangaProgressSnapshot(
      await this.base.getAllMangaProgress(),
      progress,
    );
    if (result.changed.length > 0) {
      await this.base.saveMangaProgressBatch(result.changed);
    }
    return result;
  }

  async applyInstalledSourcesSnapshot(sources: InstalledSource[]): Promise<void> {
    if (this.base.applyInstalledSourcesSnapshot) {
      return this.base.applyInstalledSourcesSnapshot(sources);
    }
    const settings = await this.base.getSyncSettings();
    await this.base.saveSettings({ ...settings, installedSources: sources });
  }

  private async prepareLocalChapterProgress(
    progress: LocalChapterProgress,
  ): Promise<LocalChapterProgress> {
    const existing = await this.base.getChapterProgress(
      progress.registryId,
      progress.sourceId,
      progress.sourceMangaId,
      progress.sourceChapterId,
    );
    if (!existing || progress.updatedAt > existing.updatedAt) return progress;
    const updatedAt = nextSyncTimestamp(existing.updatedAt);
    return {
      ...progress,
      updatedAt,
    };
  }
}
