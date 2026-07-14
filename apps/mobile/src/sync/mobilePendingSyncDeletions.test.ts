import { beforeEach, describe, expect, test } from "bun:test";
import { getFunctionName } from "convex/server";
import type { ConvexReactClient } from "convex/react";
import { WebUserDataStore } from "@/data/webStore";
import type { LocalCollection, LocalSourceLink } from "@/data/schema";
import { makeSourceLinkId } from "@/data/schema";
import {
  reconcilePendingCollectionDeletions,
  reconcilePendingSourceLinkDeletions,
} from "./mobilePendingSyncDeletions";
import { createMobileSyncDataStore } from "./mobileSyncDataStore";
import { runWithMobileSyncWrite } from "./mobileSyncRuntime";

class MemoryLocalStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string): string | null { return this.values.get(key) ?? null; }
  setItem(key: string, value: string): void { this.values.set(key, value); }
  removeItem(key: string): void { this.values.delete(key); }
}

function installLocalStorage(): void {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryLocalStorage(),
  });
}

function mutationRecorder(calls: string[]): Pick<ConvexReactClient, "mutation"> {
  return {
    mutation: async (mutation: unknown) => {
      calls.push(getFunctionName(mutation as never));
      return null;
    },
  } as unknown as Pick<ConvexReactClient, "mutation">;
}

function sourceLink(): LocalSourceLink {
  const registryId = "registry";
  const sourceId = "source";
  const sourceMangaId = "manga";
  return {
    id: makeSourceLinkId(registryId, sourceId, sourceMangaId),
    libraryItemId: "library",
    registryId,
    sourceId,
    sourceMangaId,
    createdAt: 1,
    updatedAt: 1,
  };
}

function collection(): LocalCollection {
  return {
    collectionId: "favorites",
    name: "Favorites",
    createdAt: 1,
    updatedAt: 1,
  };
}

describe("pending mobile sync deletions", () => {
  beforeEach(() => installLocalStorage());

  test("filters a stale source-link snapshot until cloud deletion is observed", async () => {
    const baseStore = new WebUserDataStore();
    await baseStore.applySyncGeneration(0);
    const store = createMobileSyncDataStore(baseStore);
    const link = sourceLink();
    await baseStore.saveSourceLink(link);
    await baseStore.removeSourceLink(link.registryId, link.sourceId, link.sourceMangaId);

    const calls: string[] = [];
    const convex = mutationRecorder(calls);
    await expect(
      reconcilePendingSourceLinkDeletions(
        store,
        convex,
        [link],
        () => true,
        0,
        "account-a",
      ),
    ).resolves.toEqual([]);
    expect(await store.getPendingSyncDeletions?.()).toHaveLength(1);

    await expect(
      reconcilePendingSourceLinkDeletions(
        store,
        convex,
        [],
        () => true,
        0,
        "account-a",
      ),
    ).resolves.toEqual([]);
    expect(await store.getPendingSyncDeletions?.()).toEqual([]);
    expect(calls).toEqual(["library:removeSourceLink", "library:removeSourceLink"]);
  });

  test("filters a stale collection snapshot and cancels deletion on re-add", async () => {
    const baseStore = new WebUserDataStore();
    await baseStore.applySyncGeneration(0);
    const store = createMobileSyncDataStore(baseStore);
    const item = collection();
    await baseStore.saveCollection(item);
    await baseStore.removeCollection(item.collectionId);

    const calls: string[] = [];
    const convex = mutationRecorder(calls);
    await expect(
      reconcilePendingCollectionDeletions(
        store,
        convex,
        [item],
        () => true,
        0,
        "account-a",
      ),
    ).resolves.toEqual([]);
    expect(await store.getPendingSyncDeletions?.()).toHaveLength(1);

    await baseStore.saveCollection({ ...item, updatedAt: 2 });
    expect(await store.getPendingSyncDeletions?.()).toEqual([]);
    expect(calls).toEqual(["collections:remove"]);
  });

  test("treats delivered source-link and collection tombstones as deletion convergence", async () => {
    const baseStore = new WebUserDataStore();
    await baseStore.applySyncGeneration(0);
    const store = createMobileSyncDataStore(baseStore);
    const link = sourceLink();
    const item = collection();
    await baseStore.saveSourceLink(link);
    await baseStore.saveCollection(item);
    await baseStore.removeSourceLink(
      link.registryId,
      link.sourceId,
      link.sourceMangaId,
      20,
    );
    await baseStore.removeCollection(item.collectionId, 20);
    const calls: string[] = [];
    const convex = mutationRecorder(calls);
    const linkTombstone = { ...link, removed: true, updatedAt: 20 };
    const collectionTombstone = { ...item, removed: true, updatedAt: 20 };

    await expect(
      reconcilePendingSourceLinkDeletions(
        store,
        convex,
        [linkTombstone],
        () => true,
        0,
        "account-a",
      ),
    ).resolves.toEqual([linkTombstone]);
    await expect(
      reconcilePendingCollectionDeletions(
        store,
        convex,
        [collectionTombstone],
        () => true,
        0,
        "account-a",
      ),
    ).resolves.toEqual([collectionTombstone]);
    expect(await store.getPendingSyncDeletions?.()).toEqual([]);
  });

  test("accepts a remote-newer source-link revival instead of retrying an older delete", async () => {
    const baseStore = new WebUserDataStore();
    await baseStore.applySyncGeneration(0);
    const store = createMobileSyncDataStore(baseStore);
    const link = sourceLink();
    await baseStore.saveSourceLink(link);
    await baseStore.removeSourceLink(
      link.registryId,
      link.sourceId,
      link.sourceMangaId,
      20,
    );
    const remoteRevival = { ...link, updatedAt: 30, removed: false };
    const calls: string[] = [];

    await expect(
      reconcilePendingSourceLinkDeletions(
        store,
        mutationRecorder(calls),
        [remoteRevival],
        () => true,
        0,
        "account-a",
      ),
    ).resolves.toEqual([remoteRevival]);
    expect(calls).toEqual([]);
    expect(await store.getPendingSyncDeletions?.()).toEqual([]);
  });

  test("accepts a remote-newer collection revival instead of retrying an older delete", async () => {
    const baseStore = new WebUserDataStore();
    await baseStore.applySyncGeneration(0);
    const store = createMobileSyncDataStore(baseStore);
    const item = collection();
    await baseStore.saveCollection(item);
    await baseStore.removeCollection(item.collectionId, 20);
    const remoteRevival = { ...item, updatedAt: 30, removed: false };
    const calls: string[] = [];

    await expect(
      reconcilePendingCollectionDeletions(
        store,
        mutationRecorder(calls),
        [remoteRevival],
        () => true,
        0,
        "account-a",
      ),
    ).resolves.toEqual([remoteRevival]);
    expect(calls).toEqual([]);
    expect(await store.getPendingSyncDeletions?.()).toEqual([]);
  });

  test("does not clear a newer deletion created while an older mutation is in flight", async () => {
    const baseStore = new WebUserDataStore();
    await baseStore.applySyncGeneration(0);
    const store = createMobileSyncDataStore(baseStore);
    const item = collection();
    await baseStore.saveCollection(item);
    await baseStore.removeCollection(item.collectionId);

    let mutationStarted!: () => void;
    let finishMutation!: () => void;
    const started = new Promise<void>((resolve) => {
      mutationStarted = resolve;
    });
    const mutationGate = new Promise<void>((resolve) => {
      finishMutation = resolve;
    });
    const convex = {
      mutation: async () => {
        mutationStarted();
        await mutationGate;
        return null;
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;

    const reconciling = reconcilePendingCollectionDeletions(
      store,
      convex,
      [],
      () => true,
      0,
      "account-a",
    );
    await started;
    await expect(Promise.race([
      runWithMobileSyncWrite(async () => "queue-free"),
      new Promise<string>((resolve) => {
        setTimeout(() => resolve("queue-blocked"), 100);
      }),
    ])).resolves.toBe("queue-free");
    await baseStore.saveCollection({ ...item, updatedAt: 2 });
    await baseStore.removeCollection(item.collectionId);
    const replacement = await store.getPendingSyncDeletions?.();
    expect(replacement).toHaveLength(1);

    finishMutation();
    await reconciling;
    expect(await store.getPendingSyncDeletions?.()).toEqual(replacement);
  });

  test("stops a deletion loop when its sync epoch is cancelled", async () => {
    const baseStore = new WebUserDataStore();
    await baseStore.applySyncGeneration(0);
    const store = createMobileSyncDataStore(baseStore);
    await baseStore.removeCollection("first");
    await baseStore.removeCollection("second");
    const calls: string[] = [];
    let active = true;
    const convex = {
      mutation: async (mutation: unknown) => {
        calls.push(getFunctionName(mutation as never));
        active = false;
        return null;
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;

    await reconcilePendingCollectionDeletions(
      store,
      convex,
      [],
      () => active,
      0,
      "account-a",
    );
    expect(calls).toEqual(["collections:remove"]);
    expect(await store.getPendingSyncDeletions?.()).toHaveLength(2);
  });
});
