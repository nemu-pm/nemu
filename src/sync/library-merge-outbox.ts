import { api } from "../../convex/_generated/api";
import type { IndexedDBUserDataStore, PendingLibraryItemMerge } from "@/data/indexeddb";
import type { ProfileWriteFenceLease } from "@/data/profile-write-fence";
import {
  chunkCollectionMutationItems,
  toCloudLibrarySaveInputBatches,
} from "@nemu/core";

/**
 * Execute one Convex mutation only if the pending operation still belongs to
 * the active account/generation. `false` deliberately means "leave it in the
 * outbox"; thrown transient failures have the same durable outcome.
 */
export type LibraryMergeMutationRunner = (
  pending: PendingLibraryItemMerge,
  mutation: unknown,
  args: Record<string, unknown>,
) => Promise<boolean>;

export type LibraryMergeOutboxFlush = {
  completed: number;
  deferred: boolean;
};

type LibraryMergeOutboxStore = Pick<
  IndexedDBUserDataStore,
  | "getPendingLibraryItemMerges"
  | "completePendingLibraryItemMerge"
  | "getSyncGeneration"
  | "getLibraryItem"
  | "getSourceLinksForLibraryItem"
  | "getCollections"
  | "getCollectionItems"
>;

async function runRequiredMutation(
  pending: PendingLibraryItemMerge,
  mutation: unknown,
  args: Record<string, unknown>,
  runMutation: LibraryMergeMutationRunner,
): Promise<boolean> {
  return runMutation(pending, mutation, {
    ...args,
    generation: pending.generation,
  });
}

/**
 * Replay durable cloud phases in source-merge order.
 *
 * Every phase is idempotent at `pending.updatedAt`. We intentionally stop at
 * the first deferred operation so chained offline merges cannot remove an
 * intermediate target before an earlier source has been redirected through
 * it. The local transaction rewrites such chains to their final target too.
 */
export async function flushPendingLibraryItemMerges(options: {
  localStore: LibraryMergeOutboxStore;
  runMutation: LibraryMergeMutationRunner;
  lease?: ProfileWriteFenceLease;
}): Promise<LibraryMergeOutboxFlush> {
  const pendingMerges = await options.localStore.getPendingLibraryItemMerges();
  let completed = 0;

  for (const pending of pendingMerges) {
    const generation = await options.localStore.getSyncGeneration();
    if (pending.generation === null || generation !== pending.generation) {
      // A reset owns the synchronized tables. The stale record is harmless and
      // is removed by generation preparation; never replay it into the new era.
      return { completed, deferred: true };
    }

    const [target, links, collections, collectionItems] = await Promise.all([
      options.localStore.getLibraryItem(pending.targetLibraryItemId),
      options.localStore.getSourceLinksForLibraryItem(
        pending.targetLibraryItemId,
        { includeRemoved: true },
      ),
      options.localStore.getCollections(),
      options.localStore.getCollectionItems(),
    ]);
    if (!target || target.inLibrary === false) {
      return { completed, deferred: true };
    }

    const activeLinks = links.filter((link) => !link.removed);
    if (activeLinks.length === 0) {
      return { completed, deferred: true };
    }
    const orderedLinks = [
      ...activeLinks,
      ...links.filter((link) => link.removed),
    ];

    // Saving the target first establishes it and moves each globally keyed
    // source link before history derives its canonical libraryItemId. Active
    // links lead the batches so a newly-created target is never transiently
    // represented only by tombstones; removed-link barriers follow as part of
    // the same resumable replay.
    for (const input of toCloudLibrarySaveInputBatches(target, orderedLinks)) {
      if (
        !(await runRequiredMutation(
          pending,
          api.library.save,
          input as unknown as Record<string, unknown>,
          options.runMutation,
        ))
      ) {
        return { completed, deferred: true };
      }
    }

    const collectionsById = new Map(
      collections.map((collection) => [collection.collectionId, collection]),
    );
    const targetMemberships = collectionItems
      .filter(
        (item) =>
          item.libraryItemId === pending.targetLibraryItemId &&
          !item.removed &&
          !collectionsById.get(item.collectionId)?.removed,
      )
      .sort((a, b) => a.collectionId.localeCompare(b.collectionId));

    for (const membership of targetMemberships) {
      const collectionId = membership.collectionId;
      const collection = collectionsById.get(collectionId);
      if (!collection) continue;
      if (
        !(await runRequiredMutation(
          pending,
          api.collections.save,
          {
            collectionId: collection.collectionId,
            name: collection.name,
            createdAt: collection.createdAt,
            updatedAt: collection.updatedAt,
            removed: false,
          },
          options.runMutation,
        ))
      ) {
        return { completed, deferred: true };
      }
      for (const libraryItemIds of chunkCollectionMutationItems([
        pending.targetLibraryItemId,
      ])) {
        if (
          !(await runRequiredMutation(
            pending,
            api.collections.addItems,
            {
              collectionId,
              libraryItemIds,
              // A later remove/re-add can legitimately advance the membership
              // after the merge. Replay its current active clock so the outbox
              // cannot lose that newer user action to an older cloud tombstone.
              updatedAt: membership.updatedAt,
            },
            options.runMutation,
          ))
        ) {
          return { completed, deferred: true };
        }
      }
    }

    // This public mutation only starts the durable, leased server worker. It
    // is safe to replay: an active identical operation is adopted, and a
    // completed operation simply scans zero source-linked rows.
    if (
      !(await runRequiredMutation(
        pending,
        api.history.retargetLibraryItem,
        {
          sourceLibraryItemId: pending.sourceLibraryItemId,
          targetLibraryItemId: pending.targetLibraryItemId,
          updatedAt: pending.updatedAt,
        },
        options.runMutation,
      ))
    ) {
      return { completed, deferred: true };
    }

    // Source removal is deliberately last. Its durable membership cascade can
    // no longer erase the only copy of a source collection relationship.
    if (
      !(await runRequiredMutation(
        pending,
        api.library.remove,
        {
          libraryItemId: pending.sourceLibraryItemId,
          // The durable bounded removal cascade also transfers any active
          // source memberships this client has not hydrated yet.
          mergeTargetLibraryItemId: pending.targetLibraryItemId,
          updatedAt: pending.updatedAt,
        },
        options.runMutation,
      ))
    ) {
      return { completed, deferred: true };
    }

    if (
      !(await options.localStore.completePendingLibraryItemMerge(
        pending,
        options.lease,
      ))
    ) {
      return { completed, deferred: true };
    }
    completed += 1;
  }

  return { completed, deferred: false };
}
