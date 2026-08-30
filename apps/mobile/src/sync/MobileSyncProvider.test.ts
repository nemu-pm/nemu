import { describe, expect, test } from "bun:test";
import type { ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
import type {
  InstalledSource,
  LocalChapterProgress,
  LocalCollection,
  LocalCollectionItem,
  LocalLibraryItem,
  LocalMangaProgress,
  LocalSourceLink,
} from "@/data/schema";
import type { MobileDataStore } from "@/data/storeTypes";
import { mobileSyncWinnerPushTestUtils } from "./MobileSyncProvider";
import { runWithMobileSyncWrite } from "./mobileSyncRuntime";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => { resolve = next; });
  return { promise, resolve };
}

function item(id: string, updatedAt = 20): LocalLibraryItem {
  return {
    libraryItemId: id,
    metadata: { title: id },
    inLibrary: true,
    createdAt: 1,
    updatedAt,
  };
}

function link(id: string, updatedAt = 20): LocalSourceLink {
  return {
    id: `registry:source:${id}`,
    libraryItemId: id,
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: id,
    createdAt: 1,
    updatedAt,
  };
}

function collection(id: string, updatedAt = 20): LocalCollection {
  return { collectionId: id, name: id, createdAt: 1, updatedAt };
}

function progress(id: string, value: number): LocalChapterProgress {
  return {
    id: `registry:source:manga:${id}`,
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "manga",
    sourceChapterId: id,
    progress: value,
    total: 10,
    completed: false,
    lastReadAt: 100,
    updatedAt: 100,
  };
}

function mutationClient(
  calls: Array<{ name: string; args: Record<string, unknown> }>,
  firstStarted: ReturnType<typeof deferred>,
  releaseFirst: ReturnType<typeof deferred>,
): Pick<ConvexReactClient, "mutation"> {
  return {
    mutation: async (mutation: unknown, args: Record<string, unknown>) => {
      calls.push({ name: getFunctionName(mutation as never), args });
      if (calls.length === 1) {
        firstStarted.resolve();
        await releaseFirst.promise;
      }
      return null;
    },
  } as unknown as Pick<ConvexReactClient, "mutation">;
}

describe("MobileSyncProvider winner pushes", () => {
  test("re-reads the latest item and source-link tombstone after an earlier mutation", async () => {
    const first = item("first");
    const second = item("second");
    let items = [first, second];
    let links = [link("first"), link("second")];
    const store = {
      getSyncGeneration: async () => 7,
      getLibraryItem: async (id: string) =>
        items.find((entry) => entry.libraryItemId === id) ?? null,
      getSourceLink: async (id: string) =>
        links.find((entry) => entry.id === id) ?? null,
      getSourceLinksForItem: async (libraryItemId: string) =>
        links.filter((entry) => entry.libraryItemId === libraryItemId),
    } as unknown as MobileDataStore;
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const run = mobileSyncWinnerPushTestUtils.pushLocalLibraryWinners(
      store,
      mutationClient(calls, firstStarted, releaseFirst),
      items,
      [],
      () => true,
      7,
      "account-a",
    );
    await firstStarted.promise;
    // Network reconciliation must not hold the local write queue; reader/user
    // writes can proceed while Convex is slow.
    await expect(runWithMobileSyncWrite(async () => "queue-free")).resolves.toBe(
      "queue-free",
    );
    items = [first, { ...second, metadata: { title: "latest" }, updatedAt: 30 }];
    links = [links[0]!, { ...links[1]!, removed: true, updatedAt: 30 }];
    releaseFirst.resolve();
    await run;

    expect(calls[1]?.args).toMatchObject({
      updatedAt: 30,
      metadata: { title: "latest" },
      sources: [{ removed: true, updatedAt: 30 }],
      generation: 7,
    });
  });

  test("re-reads a collection tombstone before the next mutation", async () => {
    const first = collection("first");
    const second = collection("second");
    let collections = [first, second];
    const store = {
      getSyncGeneration: async () => 7,
      getCollection: async (collectionId: string) =>
        collections.find((entry) => entry.collectionId === collectionId) ?? null,
      getCollections: async () => collections,
      getCollectionItems: async () => [],
    } as unknown as MobileDataStore;
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const run = mobileSyncWinnerPushTestUtils.pushLocalCollectionWinners(
      store,
      mutationClient(calls, firstStarted, releaseFirst),
      collections,
      [],
      () => true,
      7,
      "account-a",
    );
    await firstStarted.promise;
    collections = [first, { ...second, removed: true, updatedAt: 30 }];
    releaseFirst.resolve();
    await run;

    expect(calls[1]).toEqual({
      name: "collections:remove",
      args: {
        expectedUserId: "account-a",
        collectionId: "second",
        updatedAt: 30,
        generation: 7,
      },
    });
  });

  test("re-reads an installed-source tombstone before the next mutation", async () => {
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
    const store = {
      getSyncGeneration: async () => 7,
      getSyncSettings: async () => ({ installedSources: sources }),
    } as unknown as MobileDataStore;
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const firstStarted = deferred();
    const releaseFirst = deferred();
    const run = mobileSyncWinnerPushTestUtils.pushLocalInstalledSourceWinners(
      store,
      sources,
      [],
      mutationClient(calls, firstStarted, releaseFirst),
      () => true,
      7,
      "account-a",
    );
    await firstStarted.promise;
    sources = [first, { ...second, removed: true, updatedAt: 30 }];
    releaseFirst.resolve();
    await run;

    expect(calls[1]).toEqual({
      name: "settings:removeInstalledSource",
      args: {
        expectedUserId: "account-a",
        id: second.id,
        registryId: "registry",
        updatedAt: 30,
        generation: 7,
      },
    });
  });

  test("pushes equal-clock chapter high-water progress after snapshot merge", async () => {
    const local = progress("chapter", 10);
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const convex = {
      mutation: async (mutation: unknown, args: Record<string, unknown>) => {
        calls.push({ name: getFunctionName(mutation as never), args });
        return null;
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;

    await mobileSyncWinnerPushTestUtils.pushLocalChapterProgressWinners(
      [local],
      convex,
      () => true,
      7,
      "account-a",
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      name: "history:save",
      args: expect.objectContaining({
        sourceChapterId: "chapter",
        progress: 10,
        updatedAt: 100,
        generation: 7,
      }),
    });
  });

  test("uses keyed reads and does not push links twice after their item wins", async () => {
    const itemCount = 256;
    const items = Array.from({ length: itemCount }, (_, index) =>
      item(`item-${index}`),
    );
    const links = items.map((entry) => link(entry.libraryItemId));
    const itemsById = new Map(
      items.map((entry) => [entry.libraryItemId, entry] as const),
    );
    const linksById = new Map(links.map((entry) => [entry.id, entry] as const));
    const linksByItemId = new Map(
      links.map((entry) => [entry.libraryItemId, [entry]] as const),
    );
    let perItemReads = 0;
    let directLinkReads = 0;
    let mutationCount = 0;
    const store = {
      getSyncGeneration: async () => 7,
      getLibraryItem: async (id: string) => itemsById.get(id) ?? null,
      getSourceLink: async (id: string) => {
        directLinkReads += 1;
        return linksById.get(id) ?? null;
      },
      getSourceLinksForItem: async (libraryItemId: string) => {
        perItemReads += 1;
        return linksByItemId.get(libraryItemId) ?? [];
      },
    } as unknown as MobileDataStore;
    const convex = {
      mutation: async () => {
        mutationCount += 1;
        return null;
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;

    await mobileSyncWinnerPushTestUtils.pushLocalLibraryWinners(
      store,
      convex,
      items,
      links,
      () => true,
      7,
      "account-a",
    );

    expect(mutationCount).toBe(itemCount);
    expect(perItemReads).toBe(itemCount);
    expect(directLinkReads).toBe(0);
  });

  test("progress delivery touches only chapter and manga progress stores", async () => {
    const chapter = progress("chapter", 5);
    const manga: LocalMangaProgress = {
      id: "registry:source:manga",
      registryId: "registry",
      sourceId: "source",
      sourceMangaId: "manga",
      lastReadAt: 100,
      updatedAt: 100,
    };
    const touched: string[] = [];
    const store = {
      getSyncGeneration: async () => 7,
      applyChapterProgressSnapshot: async () => {
        touched.push("chapter");
        return { progress: [chapter], changed: [chapter], localWinners: [] };
      },
      applyMangaProgressSnapshot: async () => {
        touched.push("manga");
        return { progress: [manga], changed: [manga], localWinners: [] };
      },
      getAllChapterProgress: async () => {
        throw new Error("progress winner reconciliation reread the full table");
      },
      getChapterProgress: async () => {
        throw new Error("progress winner reconciliation did a keyed reread");
      },
      applyLibrarySnapshot: async () => {
        touched.push("library");
        throw new Error("progress delivery rewrote library");
      },
      applyCollectionsSnapshot: async () => {
        touched.push("collections");
        throw new Error("progress delivery rewrote collections");
      },
      applyInstalledSourcesSnapshot: async () => {
        touched.push("settings");
        throw new Error("progress delivery rewrote settings");
      },
    } as unknown as MobileDataStore;
    const convex = {
      mutation: async () => null,
    } as unknown as Pick<ConvexReactClient, "mutation">;

    await expect(
      mobileSyncWinnerPushTestUtils.applyMobileProgressSnapshots(
        store,
        convex,
        [chapter],
        [manga],
        () => true,
        7,
        "account-a",
      ),
    ).resolves.toBeTrue();
    expect(touched).toEqual(["chapter", "manga"]);
  });

  test("chunks first-sync collection membership winners to the server limit", async () => {
    const parent = collection("large");
    const membership: LocalCollectionItem[] = Array.from(
      { length: 600 },
      (_, index) => ({
        collectionId: parent.collectionId,
        libraryItemId: `item-${index}`,
        addedAt: 20,
        updatedAt: 20,
        removed: false,
      }),
    );
    const batchSizes: number[] = [];
    const store = {
      getSyncGeneration: async () => 7,
      getCollections: async () => [parent],
      getCollectionItems: async () => membership,
    } as unknown as MobileDataStore;
    const convex = {
      mutation: async (mutation: unknown, args: Record<string, unknown>) => {
        expect(getFunctionName(mutation as never)).toBe("collections:addItems");
        batchSizes.push((args.libraryItemIds as string[]).length);
        return null;
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;

    await mobileSyncWinnerPushTestUtils.pushLocalCollectionWinners(
      store,
      convex,
      [],
      membership,
      () => true,
      7,
      "account-a",
    );

    expect(batchSizes).toEqual([256, 256, 88]);
  });

  test("reconciles 1k collection winners with linear keyed reads", async () => {
    const collections = Array.from({ length: 1_000 }, (_, index) =>
      collection(`collection-${index}`),
    );
    let fullCollectionReads = 0;
    let keyedCollectionReads = 0;
    let mutationCount = 0;
    const store = {
      getSyncGeneration: async () => 7,
      getCollection: async (collectionId: string) => {
        keyedCollectionReads += 1;
        return collections.find((entry) => entry.collectionId === collectionId) ?? null;
      },
      getCollections: async () => {
        fullCollectionReads += 1;
        return collections;
      },
      getCollectionItems: async () => [],
    } as unknown as MobileDataStore;
    const convex = {
      mutation: async () => {
        mutationCount += 1;
        return null;
      },
    } as unknown as Pick<ConvexReactClient, "mutation">;

    await mobileSyncWinnerPushTestUtils.pushLocalCollectionWinners(
      store,
      convex,
      collections,
      [],
      () => true,
      7,
      "account-a",
    );

    expect(fullCollectionReads).toBe(0);
    expect(keyedCollectionReads).toBe(1_000);
    expect(mutationCount).toBe(1_000);
  });
});
