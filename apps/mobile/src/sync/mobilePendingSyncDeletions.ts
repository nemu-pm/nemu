import type { ConvexReactClient } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { LocalCollection, LocalSourceLink } from "@/data/schema";
import type { MobileDataStore, PendingSyncDeletion } from "@/data/storeTypes";
import { runWithMobileSyncWrite } from "./mobileSyncRuntime";

type MobileSyncMutationClient = Pick<ConvexReactClient, "mutation">;

async function pendingDeletions(
  store: MobileDataStore,
  kind: PendingSyncDeletion["kind"],
): Promise<PendingSyncDeletion[]> {
  if (!store.getPendingSyncDeletions) return [];
  return (await store.getPendingSyncDeletions()).filter(
    (deletion) => deletion.kind === kind,
  );
}

export async function reconcilePendingSourceLinkDeletions(
  store: MobileDataStore,
  convex: MobileSyncMutationClient,
  cloudLinks: LocalSourceLink[],
  shouldContinue: () => boolean,
  generation: number,
  expectedUserId: string,
): Promise<LocalSourceLink[]> {
  const deletions = (await pendingDeletions(store, "source-link")).filter(
    (deletion): deletion is Extract<PendingSyncDeletion, { kind: "source-link" }> =>
      deletion.kind === "source-link",
  );
  if (deletions.length === 0) return cloudLinks;

  const stillPendingLinkIds = new Set<string>();
  for (const deletion of deletions) {
    const plan = await runWithMobileSyncWrite(async () => {
      if (
        !shouldContinue() ||
        (await store.getSyncGeneration()) !== generation
      ) return { kind: "stop" } as const;
      const sourceLinkId = deletion.id.slice("source-link:".length);
      const cloud = cloudLinks.find((link) => link.id === sourceLinkId);
      if (cloud && cloud.updatedAt >= deletion.createdAt) {
        await store.clearPendingSyncDeletion?.(deletion);
        return { kind: "done" } as const;
      }
      return {
        kind: "mutate",
        cloudExists: Boolean(cloud),
        sourceLinkId,
      } as const;
    });
    if (plan.kind === "stop") return cloudLinks;
    if (plan.kind === "done") continue;

    // Never hold the process-wide local write queue across network I/O. The
    // generation argument rejects a reset that races this mutation, and the
    // CAS-style pending deletion clear below cannot erase a newer tombstone.
    await convex.mutation(api.library.removeSourceLink, {
      expectedUserId,
      registryId: deletion.registryId,
      sourceId: deletion.sourceId,
      sourceMangaId: deletion.sourceMangaId,
      updatedAt: deletion.createdAt,
      generation,
    });
    if (!shouldContinue()) return cloudLinks;
    const continued = await runWithMobileSyncWrite(async () => {
      if (
        !shouldContinue() ||
        (await store.getSyncGeneration()) !== generation
      ) return false;
      if (!plan.cloudExists) {
        await store.clearPendingSyncDeletion?.(deletion);
      }
      return true;
    });
    if (!continued) return cloudLinks;
    if (plan.cloudExists) stillPendingLinkIds.add(plan.sourceLinkId);
  }

  return cloudLinks.filter((link) => !stillPendingLinkIds.has(link.id));
}

export async function reconcilePendingCollectionDeletions(
  store: MobileDataStore,
  convex: MobileSyncMutationClient,
  cloudCollections: LocalCollection[],
  shouldContinue: () => boolean,
  generation: number,
  expectedUserId: string,
): Promise<LocalCollection[]> {
  const deletions = (await pendingDeletions(store, "collection")).filter(
    (deletion): deletion is Extract<PendingSyncDeletion, { kind: "collection" }> =>
      deletion.kind === "collection",
  );
  if (deletions.length === 0) return cloudCollections;

  const stillPendingCollectionIds = new Set<string>();
  for (const deletion of deletions) {
    const plan = await runWithMobileSyncWrite(async () => {
      if (
        !shouldContinue() ||
        (await store.getSyncGeneration()) !== generation
      ) return { kind: "stop" } as const;
      const cloud = cloudCollections.find(
        (collection) => collection.collectionId === deletion.collectionId,
      );
      if (cloud && cloud.updatedAt >= deletion.createdAt) {
        await store.clearPendingSyncDeletion?.(deletion);
        return { kind: "done" } as const;
      }
      return {
        kind: "mutate",
        cloudExists: Boolean(cloud),
      } as const;
    });
    if (plan.kind === "stop") return cloudCollections;
    if (plan.kind === "done") continue;

    await convex.mutation(api.collections.remove, {
      expectedUserId,
      collectionId: deletion.collectionId,
      updatedAt: deletion.createdAt,
      generation,
    });
    if (!shouldContinue()) return cloudCollections;
    const continued = await runWithMobileSyncWrite(async () => {
      if (
        !shouldContinue() ||
        (await store.getSyncGeneration()) !== generation
      ) return false;
      if (!plan.cloudExists) {
        await store.clearPendingSyncDeletion?.(deletion);
      }
      return true;
    });
    if (!continued) return cloudCollections;
    if (plan.cloudExists) {
      stillPendingCollectionIds.add(deletion.collectionId);
    }
  }

  return cloudCollections.filter(
    (collection) => !stillPendingCollectionIds.has(collection.collectionId),
  );
}
