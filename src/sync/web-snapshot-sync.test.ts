import { describe, expect, test } from "bun:test";
import type { ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
import type {
  InstalledSource,
  LocalCollection,
  LocalCollectionItem,
  LocalChapterProgress,
  LocalLibraryItem,
  LocalSourceLink,
} from "@/data/schema";
import {
  MAX_CHAPTER_PROGRESS_SAVE_BATCH_ITEMS,
  type CollectionSnapshotMerge,
  type LibrarySnapshotMerge,
} from "@nemu/core";
import {
  applyWebCollectionsSyncSnapshot,
  applyWebChapterProgressSyncSnapshot,
  applyWebInstalledSourcesSyncSnapshot,
  applyWebLibrarySyncSnapshot,
  isWebSyncRunCurrent,
  type WebSyncRunIdentity,
} from "./web-snapshot-sync";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function libraryItem(libraryItemId: string, updatedAt: number): LocalLibraryItem {
  return {
    libraryItemId,
    metadata: { title: libraryItemId },
    inLibrary: true,
    createdAt: updatedAt,
    updatedAt,
  };
}

function sourceLink(libraryItemId: string, updatedAt: number): LocalSourceLink {
  return {
    id: `registry:source:${libraryItemId}`,
    libraryItemId,
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: libraryItemId,
    createdAt: updatedAt,
    updatedAt,
  };
}

function collection(collectionId: string, updatedAt: number): LocalCollection {
  return {
    collectionId,
    name: collectionId,
    createdAt: updatedAt,
    updatedAt,
  };
}

function collectionItem(collectionId: string, updatedAt: number): LocalCollectionItem {
  return {
    collectionId,
    libraryItemId: `${collectionId}-manga`,
    addedAt: updatedAt,
    updatedAt,
    removed: false,
  };
}

function chapterProgress(
  id: string,
  overrides: Partial<LocalChapterProgress> = {},
): LocalChapterProgress {
  return {
    id,
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "manga",
    sourceChapterId: id,
    progress: 5,
    total: 10,
    completed: false,
    lastReadAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

function identity(
  generation: number,
  profileId: string,
  userId: string,
  localStore: object,
): WebSyncRunIdentity {
  return { generation, profileId, userId, authenticated: true, localStore };
}

describe("web snapshot sync run identity", () => {
  test("pushes local-only and equal-clock high-water chapter progress", async () => {
    const localOnly = chapterProgress("local-only", { progress: 3 });
    const cloud = chapterProgress("merged", { progress: 5 });
    const merged = chapterProgress("merged", { progress: 10 });
    const rows = [localOnly, merged];
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const store = {
      applyChapterProgressSnapshot: async () => ({
        progress: rows,
        changed: rows,
        localWinners: rows,
      }),
    };
    const convex = {
      mutation: async (mutation: unknown, args: Record<string, unknown>) => {
        calls.push({ name: getFunctionName(mutation as never), args });
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;

    await expect(applyWebChapterProgressSyncSnapshot({
      localStore: store,
      convex,
      cloudProgress: [cloud],
      generation: 7,
      expectedUserId: "a",
      shouldContinue: () => true,
    })).resolves.toEqual(rows);
    // One batched transaction rather than one round trip per row.
    expect(calls.map((call) => call.name)).toEqual(["history:saveBatch"]);
    expect(calls[0]?.args).toMatchObject({
      expectedUserId: "a",
      generation: 7,
    });
    const items = calls[0]?.args.items as Record<string, unknown>[];
    expect(items).toHaveLength(2);
    // The per-item shape must stay identical to `history.save`'s arguments so
    // both endpoints accept exactly the same payload.
    expect(items[1]).toMatchObject({
      sourceChapterId: "merged",
      progress: 10,
      updatedAt: 100,
    });
    expect(items[1]).not.toHaveProperty("generation");
    expect(items[1]).not.toHaveProperty("expectedUserId");
  });

  test("stops chapter winner pushes after a profile switch", async () => {
    // More winners than fit in one batch, so there is a second transaction the
    // profile switch has to prevent.
    const rows = Array.from(
      { length: MAX_CHAPTER_PROGRESS_SAVE_BATCH_ITEMS + 1 },
      (_, index) => chapterProgress(`chapter-${index}`),
    );
    const firstStarted = deferred<void>();
    const releaseFirst = deferred<void>();
    let active = true;
    let mutationCount = 0;
    const store = {
      applyChapterProgressSnapshot: async () => ({
        progress: rows,
        changed: rows,
        localWinners: rows,
      }),
    };
    const convex = {
      mutation: async () => {
        mutationCount += 1;
        firstStarted.resolve();
        await releaseFirst.promise;
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;

    const run = applyWebChapterProgressSyncSnapshot({
      localStore: store,
      convex,
      cloudProgress: [],
      generation: 7,
      expectedUserId: "a",
      shouldContinue: () => active,
    });
    await firstStarted.promise;
    active = false;
    releaseFirst.resolve();

    expect(await run).toBeNull();
    expect(mutationCount).toBe(1);
  });

  test("requires the authenticated session user to own the active profile", () => {
    const localStore = {};
    const missingUser: WebSyncRunIdentity = {
      generation: 1,
      profileId: "user:a",
      userId: undefined,
      authenticated: true,
      localStore,
    };
    const mismatchedProfile = identity(1, "user:b", "a", localStore);

    expect(isWebSyncRunCurrent(missingUser, missingUser, false, false)).toBeFalse();
    expect(
      isWebSyncRunCurrent(mismatchedProfile, mismatchedProfile, false, false),
    ).toBeFalse();
  });

  test("an account switch while library apply is deferred prevents old winners from mutating Convex", async () => {
    const localStoreA = {};
    const localStoreB = {};
    const expected = identity(1, "user:a", "a", localStoreA);
    let current = expected;
    const applyDeferred = deferred<LibrarySnapshotMerge<LocalLibraryItem, LocalSourceLink>>();
    const mutations: unknown[][] = [];
    const store = {
      applyLibrarySnapshot: () => applyDeferred.promise,
      getLibraryItem: async () => null,
      getSourceLink: async () => null,
      getSourceLinksForLibraryItem: async () => [],
    };
    const convex = {
      mutation: async (...args: unknown[]) => {
        mutations.push(args);
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;
    const shouldContinue = () =>
      isWebSyncRunCurrent(expected, current, false, false);

    const run = applyWebLibrarySyncSnapshot({
      localStore: store,
      convex,
      generation: 7,
      expectedUserId: "a",
      cloudItems: [],
      cloudLinks: [],
      shouldContinue,
    });
    current = identity(2, "user:b", "b", localStoreB);
    const item = libraryItem("local-winner", 20);
    const link = sourceLink(item.libraryItemId, 20);
    applyDeferred.resolve({
      items: [item],
      links: [link],
      localItemsToPush: [item],
      localLinksToPush: [link],
    });

    expect(await run).toBeNull();
    expect(mutations).toHaveLength(0);
  });

  test("a profile switch during a library mutation loop prevents later mutations", async () => {
    const localStoreA = {};
    const localStoreB = {};
    const expected = identity(1, "user:a", "a", localStoreA);
    let current = expected;
    const firstMutationStarted = deferred<void>();
    const releaseFirstMutation = deferred<void>();
    let mutationCount = 0;
    const first = { ...libraryItem("first", 20), inLibrary: false };
    const second = { ...libraryItem("second", 20), inLibrary: false };
    const merged: LibrarySnapshotMerge<LocalLibraryItem, LocalSourceLink> = {
      items: [first, second],
      links: [],
      localItemsToPush: [first, second],
      localLinksToPush: [],
    };
    const store = {
      applyLibrarySnapshot: async () => merged,
      getLibraryItem: async (id: string) =>
        merged.items.find((item) => item.libraryItemId === id) ?? null,
      getSourceLink: async (id: string) =>
        merged.links.find((link) => link.id === id) ?? null,
      getSourceLinksForLibraryItem: async (libraryItemId: string) =>
        merged.links.filter((link) => link.libraryItemId === libraryItemId),
    };
    const convex = {
      mutation: async () => {
        mutationCount += 1;
        if (mutationCount === 1) {
          firstMutationStarted.resolve();
          await releaseFirstMutation.promise;
        }
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;
    const shouldContinue = () =>
      isWebSyncRunCurrent(expected, current, false, false);

    const run = applyWebLibrarySyncSnapshot({
      localStore: store,
      convex,
      generation: 7,
      expectedUserId: "a",
      cloudItems: [],
      cloudLinks: [],
      shouldContinue,
    });
    await firstMutationStarted.promise;
    current = identity(2, "user:b", "b", localStoreB);
    releaseFirstMutation.resolve();

    expect(await run).toBeNull();
    expect(mutationCount).toBe(1);
  });

  test("an account switch while collections apply is deferred prevents old winners from mutating Convex", async () => {
    const localStoreA = {};
    const localStoreB = {};
    const expected = identity(1, "user:a", "a", localStoreA);
    let current = expected;
    const applyDeferred = deferred<CollectionSnapshotMerge<LocalCollection, LocalCollectionItem>>();
    let mutationCount = 0;
    const store = {
      applyCollectionsSnapshot: () => applyDeferred.promise,
      getCollection: async () => null,
      getCollections: async () => [],
      getCollectionItems: async () => [],
    };
    const convex = {
      mutation: async () => {
        mutationCount += 1;
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;
    const shouldContinue = () =>
      isWebSyncRunCurrent(expected, current, false, false);

    const run = applyWebCollectionsSyncSnapshot({
      localStore: store,
      convex,
      generation: 7,
      expectedUserId: "a",
      cloudCollections: [],
      cloudCollectionItems: [],
      shouldContinue,
    });
    current = identity(2, "user:b", "b", localStoreB);
    const localCollection = collection("local-winner", 20);
    const localCollectionItem = collectionItem(localCollection.collectionId, 20);
    applyDeferred.resolve({
      collections: [localCollection],
      collectionItems: [localCollectionItem],
      localCollectionsToPush: [localCollection],
      localCollectionItemsToPush: [localCollectionItem],
    });

    expect(await run).toBeNull();
    expect(mutationCount).toBe(0);
  });

  test("a profile switch during a collection mutation loop prevents later mutations", async () => {
    const localStoreA = {};
    const localStoreB = {};
    const expected = identity(1, "user:a", "a", localStoreA);
    let current = expected;
    const firstMutationStarted = deferred<void>();
    const releaseFirstMutation = deferred<void>();
    let mutationCount = 0;
    const first = collection("first", 20);
    const second = collection("second", 20);
    const merged: CollectionSnapshotMerge<LocalCollection, LocalCollectionItem> = {
      collections: [first, second],
      collectionItems: [],
      localCollectionsToPush: [first, second],
      localCollectionItemsToPush: [],
    };
    const store = {
      applyCollectionsSnapshot: async () => merged,
      getCollection: async (collectionId: string) =>
        merged.collections.find((entry) => entry.collectionId === collectionId) ?? null,
      getCollections: async () => merged.collections,
      getCollectionItems: async () => merged.collectionItems,
    };
    const convex = {
      mutation: async () => {
        mutationCount += 1;
        if (mutationCount === 1) {
          firstMutationStarted.resolve();
          await releaseFirstMutation.promise;
        }
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;
    const shouldContinue = () =>
      isWebSyncRunCurrent(expected, current, false, false);

    const run = applyWebCollectionsSyncSnapshot({
      localStore: store,
      convex,
      generation: 7,
      expectedUserId: "a",
      cloudCollections: [],
      cloudCollectionItems: [],
      shouldContinue,
    });
    await firstMutationStarted.promise;
    current = identity(2, "user:b", "b", localStoreB);
    releaseFirstMutation.resolve();

    expect(await run).toBeNull();
    expect(mutationCount).toBe(1);
  });

  test("re-reads a concurrently edited item and deleted link before the next library mutation", async () => {
    const firstMutationStarted = deferred<void>();
    const releaseFirstMutation = deferred<void>();
    const first = libraryItem("first", 20);
    const second = libraryItem("second", 20);
    let items = [first, second];
    let links = [sourceLink("first", 20), sourceLink("second", 20)];
    const merged: LibrarySnapshotMerge<LocalLibraryItem, LocalSourceLink> = {
      items,
      links,
      localItemsToPush: [first, second],
      localLinksToPush: [],
    };
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const store = {
      applyLibrarySnapshot: async () => merged,
      getLibraryItem: async (id: string) =>
        items.find((item) => item.libraryItemId === id) ?? null,
      getSourceLink: async (id: string) =>
        links.find((link) => link.id === id) ?? null,
      getSourceLinksForLibraryItem: async (libraryItemId: string) =>
        links.filter((link) => link.libraryItemId === libraryItemId),
    };
    const convex = {
      mutation: async (mutation: unknown, args: Record<string, unknown>) => {
        calls.push({ name: getFunctionName(mutation as never), args });
        if (calls.length === 1) {
          firstMutationStarted.resolve();
          await releaseFirstMutation.promise;
        }
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;

    const run = applyWebLibrarySyncSnapshot({
      localStore: store,
      convex,
      generation: 7,
      expectedUserId: "a",
      cloudItems: [],
      cloudLinks: [],
      shouldContinue: () => true,
    });
    await firstMutationStarted.promise;
    items = [{ ...first }, {
      ...second,
      metadata: { title: "edited-while-first-push-waited" },
      updatedAt: 30,
    }];
    links = [links[0]!, { ...links[1]!, removed: true, updatedAt: 30 }];
    releaseFirstMutation.resolve();

    expect(await run).not.toBeNull();
    expect(calls[1]?.name).toBe("library:save");
    expect(calls[1]?.args).toMatchObject({
      generation: 7,
      updatedAt: 30,
      metadata: { title: "edited-while-first-push-waited" },
      sources: [{ removed: true, updatedAt: 30 }],
    });
  });

  test("re-reads a concurrently deleted collection before the next mutation", async () => {
    const firstMutationStarted = deferred<void>();
    const releaseFirstMutation = deferred<void>();
    const first = collection("first", 20);
    const second = collection("second", 20);
    let collections = [first, second];
    const merged: CollectionSnapshotMerge<LocalCollection, LocalCollectionItem> = {
      collections,
      collectionItems: [],
      localCollectionsToPush: [first, second],
      localCollectionItemsToPush: [],
    };
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const store = {
      applyCollectionsSnapshot: async () => merged,
      getCollection: async (collectionId: string) =>
        collections.find((entry) => entry.collectionId === collectionId) ?? null,
      getCollections: async () => collections,
      getCollectionItems: async () => [],
    };
    const convex = {
      mutation: async (mutation: unknown, args: Record<string, unknown>) => {
        calls.push({ name: getFunctionName(mutation as never), args });
        if (calls.length === 1) {
          firstMutationStarted.resolve();
          await releaseFirstMutation.promise;
        }
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;

    const run = applyWebCollectionsSyncSnapshot({
      localStore: store,
      convex,
      generation: 7,
      expectedUserId: "a",
      cloudCollections: [],
      cloudCollectionItems: [],
      shouldContinue: () => true,
    });
    await firstMutationStarted.promise;
    collections = [first, { ...second, removed: true, updatedAt: 30 }];
    releaseFirstMutation.resolve();

    expect(await run).not.toBeNull();
    expect(calls[1]).toEqual({
      name: "collections:remove",
      args: {
        expectedUserId: "a",
        collectionId: "second",
        updatedAt: 30,
        generation: 7,
      },
    });
  });

  test("re-reads a concurrently removed installed source before the next mutation", async () => {
    const firstMutationStarted = deferred<void>();
    const releaseFirstMutation = deferred<void>();
    const first: InstalledSource = {
      id: "registry:first",
      registryId: "registry",
      version: 1,
      updatedAt: 20,
    };
    const second: InstalledSource = {
      id: "registry:second",
      registryId: "registry",
      version: 1,
      updatedAt: 20,
    };
    let sources = [first, second];
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const store = {
      applyInstalledSourcesSnapshot: async () => ({
        sources,
        localSourcesToPush: [first, second],
      }),
      getInstalledSource: async (id: string) =>
        sources.find((source) => source.id === id) ?? null,
    };
    const convex = {
      mutation: async (mutation: unknown, args: Record<string, unknown>) => {
        calls.push({ name: getFunctionName(mutation as never), args });
        if (calls.length === 1) {
          firstMutationStarted.resolve();
          await releaseFirstMutation.promise;
        }
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;

    const run = applyWebInstalledSourcesSyncSnapshot({
      localStore: store,
      convex,
      generation: 7,
      expectedUserId: "a",
      cloudSources: [],
      shouldContinue: () => true,
    });
    await firstMutationStarted.promise;
    sources = [first, { ...second, removed: true, updatedAt: 30 }];
    releaseFirstMutation.resolve();

    expect(await run).not.toBeNull();
    expect(calls[1]).toEqual({
      name: "settings:removeInstalledSource",
      args: {
        expectedUserId: "a",
        id: second.id,
        registryId: "registry",
        updatedAt: 30,
        generation: 7,
      },
    });
  });

  test("uses keyed reads and does not push links twice after their item wins", async () => {
    const itemCount = 256;
    const items = Array.from({ length: itemCount }, (_, index) =>
      libraryItem(`item-${index}`, 20),
    );
    const links = items.map((entry) => sourceLink(entry.libraryItemId, 20));
    const itemsById = new Map(items.map((entry) => [entry.libraryItemId, entry]));
    const linksById = new Map(links.map((entry) => [entry.id, entry]));
    const linksByItemId = new Map(
      links.map((entry) => [entry.libraryItemId, [entry]]),
    );
    const merged: LibrarySnapshotMerge<LocalLibraryItem, LocalSourceLink> = {
      items,
      links,
      localItemsToPush: items,
      localLinksToPush: links,
    };
    let perItemReads = 0;
    let directLinkReads = 0;
    let mutationCount = 0;
    const store = {
      applyLibrarySnapshot: async () => merged,
      getLibraryItem: async (id: string) => itemsById.get(id) ?? null,
      getSourceLink: async (id: string) => {
        directLinkReads += 1;
        return linksById.get(id) ?? null;
      },
      getSourceLinksForLibraryItem: async (libraryItemId: string) => {
        perItemReads += 1;
        return linksByItemId.get(libraryItemId) ?? [];
      },
    };
    const convex = {
      mutation: async () => {
        mutationCount += 1;
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;

    await expect(
      applyWebLibrarySyncSnapshot({
        localStore: store,
        convex,
        generation: 7,
        expectedUserId: "a",
        cloudItems: [],
        cloudLinks: [],
        shouldContinue: () => true,
      }),
    ).resolves.not.toBeNull();

    expect(mutationCount).toBe(itemCount);
    expect(perItemReads).toBe(itemCount);
    expect(directLinkReads).toBe(0);
  });

  test("chunks first-sync collection membership winners to the server limit", async () => {
    const parent = collection("large", 20);
    const membership = Array.from({ length: 600 }, (_, index) => ({
      ...collectionItem(parent.collectionId, 20),
      libraryItemId: `item-${index}`,
    }));
    const merged: CollectionSnapshotMerge<LocalCollection, LocalCollectionItem> = {
      collections: [parent],
      collectionItems: membership,
      localCollectionsToPush: [],
      localCollectionItemsToPush: membership,
    };
    const batchSizes: number[] = [];
    const store = {
      applyCollectionsSnapshot: async () => merged,
      getCollection: async () => parent,
      getCollections: async () => [parent],
      getCollectionItems: async () => membership,
    };
    const convex = {
      mutation: async (mutation: unknown, args: Record<string, unknown>) => {
        expect(getFunctionName(mutation as never)).toBe("collections:addItems");
        batchSizes.push((args.libraryItemIds as string[]).length);
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;

    await expect(
      applyWebCollectionsSyncSnapshot({
        localStore: store,
        convex,
        cloudCollections: [],
        cloudCollectionItems: [],
        generation: 7,
        expectedUserId: "a",
        shouldContinue: () => true,
      }),
    ).resolves.not.toBeNull();

    expect(batchSizes).toEqual([256, 256, 88]);
  });

  test("reconciles 1k collection winners with linear keyed reads", async () => {
    const collections = Array.from({ length: 1_000 }, (_, index) =>
      collection(`collection-${index}`, 20),
    );
    const merged: CollectionSnapshotMerge<LocalCollection, LocalCollectionItem> = {
      collections,
      collectionItems: [],
      localCollectionsToPush: collections,
      localCollectionItemsToPush: [],
    };
    let fullCollectionReads = 0;
    let keyedCollectionReads = 0;
    let mutationCount = 0;
    const store = {
      applyCollectionsSnapshot: async () => merged,
      getCollection: async (collectionId: string) => {
        keyedCollectionReads += 1;
        return collections.find((entry) => entry.collectionId === collectionId) ?? null;
      },
      getCollections: async () => {
        fullCollectionReads += 1;
        return collections;
      },
      getCollectionItems: async () => [],
    };
    const convex = {
      mutation: async () => { mutationCount += 1; },
    } as unknown as Pick<ConvexReactClient, "mutation">;

    await applyWebCollectionsSyncSnapshot({
      localStore: store,
      convex,
      cloudCollections: [],
      cloudCollectionItems: [],
      generation: 7,
      expectedUserId: "a",
      shouldContinue: () => true,
    });

    expect(fullCollectionReads).toBe(0);
    expect(keyedCollectionReads).toBe(1_000);
    expect(mutationCount).toBe(1_000);
  });
});
