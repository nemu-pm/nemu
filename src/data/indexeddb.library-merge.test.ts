import "fake-indexeddb/auto";
import { describe, expect, test } from "bun:test";
import { IndexedDBUserDataStore } from "./indexeddb";
import type {
  LocalChapterProgress,
  LocalCollection,
  LocalLibraryItem,
  LocalMangaProgress,
  LocalSourceLink,
} from "./schema";

let sequence = 0;

function createStore(label: string): IndexedDBUserDataStore {
  sequence += 1;
  return new IndexedDBUserDataStore(`user:merge-${label}-${sequence}`);
}

function libraryItem(id: string, updatedAt: number): LocalLibraryItem {
  return {
    libraryItemId: id,
    metadata: { title: id },
    inLibrary: true,
    createdAt: updatedAt,
    updatedAt,
  };
}

function sourceLink(
  libraryItemId: string,
  mangaId: string,
  updatedAt: number,
): LocalSourceLink {
  return {
    id: `registry:source:${mangaId}`,
    libraryItemId,
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: mangaId,
    createdAt: updatedAt,
    updatedAt,
  };
}

function collection(id: string): LocalCollection {
  return { collectionId: id, name: id, createdAt: 1, updatedAt: 1 };
}

function chapterProgress(libraryItemId: string): LocalChapterProgress {
  return {
    id: "registry:source:source-manga:chapter",
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "source-manga",
    sourceChapterId: "chapter",
    libraryItemId,
    progress: 20,
    total: 100,
    completed: false,
    lastReadAt: 12,
    updatedAt: 12,
  };
}

function mangaProgress(libraryItemId: string): LocalMangaProgress {
  return {
    id: "registry:source:source-manga",
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "source-manga",
    libraryItemId,
    lastReadAt: 12,
    lastReadSourceChapterId: "chapter",
    updatedAt: 12,
  };
}

async function seedMerge(store: IndexedDBUserDataStore): Promise<void> {
  await store.prepareSyncGeneration(7);
  await store.saveLibraryItemsBatch([
    { ...libraryItem("target", 5), sourceOrder: ["registry:source:target-manga"] },
    { ...libraryItem("source", 6), sourceOrder: ["registry:source:source-manga"] },
  ]);
  await store.saveSourceLinksBatch([
    sourceLink("target", "target-manga", 7),
    sourceLink("source", "source-manga", 8),
    { ...sourceLink("source", "removed-manga", 11), removed: true },
  ]);
  await store.saveCollection(collection("favorites"));
  await store.addCollectionItems("favorites", ["source"], 9);
  // A prior target removal must be superseded by the transferred membership.
  await store.removeCollectionItems("favorites", ["target"], 10);
  await store.saveChapterProgressEntry(chapterProgress("source"));
  await store.saveMangaProgressEntry(mangaProgress("source"));
}

describe("IndexedDB atomic library merge", () => {
  test("commits links, memberships, both progress projections, tombstone, and outbox together", async () => {
    const store = createStore("complete");
    await seedMerge(store);

    const committed = await store.mergeLibraryItems("target", "source");

    expect(committed).toMatchObject({
      sourceLibraryItemId: "source",
      targetLibraryItemId: "target",
      generation: 7,
      transferredCollectionIds: ["favorites"],
      retargetedChapterProgress: 1,
      retargetedMangaProgress: 1,
    });
    expect(committed?.movedSourceLinkIds.sort()).toEqual([
      "registry:source:removed-manga",
      "registry:source:source-manga",
    ]);
    const target = await store.getLibraryItem("target");
    const source = await store.getLibraryItem("source");
    expect(target?.sourceOrder).toEqual([
      "registry:source:target-manga",
      "registry:source:source-manga",
    ]);
    expect(source?.inLibrary).toBe(false);
    expect(source?.mergedIntoLibraryItemId).toBe("target");
    expect(await store.resolveLibraryItemId("source")).toBe("target");
    expect(await store.getSourceLink("registry:source:source-manga"))
      .toMatchObject({ libraryItemId: "target" });
    expect(await store.getSourceLink("registry:source:removed-manga"))
      .toMatchObject({ libraryItemId: "target", removed: true });

    const memberships = await store.getCollectionItems();
    expect(
      memberships.find(
        (item) => item.collectionId === "favorites" && item.libraryItemId === "target",
      ),
    ).toMatchObject({ removed: false, updatedAt: committed?.updatedAt });
    expect(
      memberships.find(
        (item) => item.collectionId === "favorites" && item.libraryItemId === "source",
      ),
    ).toMatchObject({ removed: true, updatedAt: committed?.updatedAt });
    expect(await store.getChapterProgressEntry(chapterProgress("source").id))
      .toMatchObject({ libraryItemId: "target", updatedAt: committed?.updatedAt });
    expect(await store.getMangaProgressEntry(mangaProgress("source").id))
      .toMatchObject({ libraryItemId: "target", updatedAt: committed?.updatedAt });
    expect(await store.getPendingLibraryItemMerges()).toHaveLength(1);
  });

  test("aborts every relationship write when any part of the transaction fails", async () => {
    const store = createStore("abort");
    await seedMerge(store);
    const originalPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const value = args[0] as { id?: string; libraryItemId?: string };
      if (
        this.name === "manga_progress" &&
        value.id === "registry:source:source-manga" &&
        value.libraryItemId === "target"
      ) {
        throw new Error("injected merge failure");
      }
      return Reflect.apply(originalPut, this, args) as IDBRequest<IDBValidKey>;
    };

    try {
      await expect(store.mergeLibraryItems("target", "source"))
        .rejects.toThrow("injected merge failure");
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }

    expect((await store.getLibraryItem("source"))?.inLibrary).toBe(true);
    expect(await store.getSourceLink("registry:source:source-manga"))
      .toMatchObject({ libraryItemId: "source" });
    expect(await store.getSourceLink("registry:source:removed-manga"))
      .toMatchObject({ libraryItemId: "source", removed: true });
    expect(await store.getChapterProgressEntry(chapterProgress("source").id))
      .toMatchObject({ libraryItemId: "source" });
    expect(await store.getPendingLibraryItemMerges()).toEqual([]);
  });

  test("orders a generation reset after the merge and leaves no stale outbox", async () => {
    const store = createStore("reset-race");
    await seedMerge(store);

    const merge = store.mergeLibraryItems("target", "source");
    const reset = store.prepareSyncGeneration(8);
    await Promise.all([merge, reset]);

    expect(await store.getSyncGeneration()).toBe(8);
    expect(await store.getAllLibraryItems({ includeRemoved: true })).toEqual([]);
    expect(await store.getAllChapterProgress()).toEqual([]);
    expect(await store.getCollectionItems()).toEqual([]);
    expect(await store.getPendingLibraryItemMerges()).toEqual([]);
  });

  test("promotes a pre-initialization authenticated outbox into generation zero", async () => {
    const store = createStore("initialize");
    await store.saveLibraryItemsBatch([
      libraryItem("target", 1),
      libraryItem("source", 2),
    ]);
    await store.saveSourceLinksBatch([
      sourceLink("target", "target", 1),
      sourceLink("source", "source", 2),
    ]);

    await store.mergeLibraryItems("target", "source");
    expect(await store.getPendingLibraryItemMerges()).toMatchObject([
      { generation: null },
    ]);

    expect(await store.prepareSyncGeneration(0)).toBe("initialize");
    expect(await store.getPendingLibraryItemMerges()).toMatchObject([
      {
        generation: 0,
        sourceLibraryItemId: "source",
        targetLibraryItemId: "target",
      },
    ]);
  });

  test("collapses chained offline merges onto the final surviving item", async () => {
    const store = createStore("chain");
    await store.prepareSyncGeneration(7);
    await store.saveLibraryItemsBatch([
      libraryItem("a", 1),
      libraryItem("b", 2),
      libraryItem("c", 3),
    ]);
    await store.saveSourceLinksBatch([
      sourceLink("a", "a", 1),
      sourceLink("b", "b", 2),
      sourceLink("c", "c", 3),
    ]);

    await store.mergeLibraryItems("b", "a");
    await store.mergeLibraryItems("c", "b");

    const pendingMerges = await store.getPendingLibraryItemMerges();
    expect(pendingMerges.map((pending) => pending.sourceLibraryItemId).sort())
      .toEqual(["a", "b"]);
    expect(new Set(pendingMerges.map((pending) => pending.targetLibraryItemId)))
      .toEqual(new Set(["c"]));
    expect(await store.getLibraryItem("a")).toMatchObject({
      inLibrary: false,
      mergedIntoLibraryItemId: "c",
    });
    expect(await store.getLibraryItem("b")).toMatchObject({
      inLibrary: false,
      mergedIntoLibraryItemId: "c",
    });
    expect(await store.resolveLibraryItemId("a")).toBe("c");
    expect(
      (await store.getAllSourceLinks()).map((link) => link.libraryItemId),
    ).toEqual(["c", "c", "c"]);
  });

  test("fails closed on corrupt local alias cycles", async () => {
    const store = createStore("alias-cycle");
    await store.saveLibraryItemsBatch([
      {
        ...libraryItem("a", 1),
        inLibrary: false,
        mergedIntoLibraryItemId: "b",
      },
      {
        ...libraryItem("b", 2),
        inLibrary: false,
        mergedIntoLibraryItemId: "a",
      },
    ]);

    await expect(store.resolveLibraryItemId("a")).rejects.toThrow("cycle");
  });

  test("canonicalizes stale active collection snapshots through a merge alias", async () => {
    const store = createStore("collection-snapshot-alias");
    await seedMerge(store);
    const commit = await store.mergeLibraryItems("target", "source");
    const staleClock = (commit?.updatedAt ?? 20) + 1;

    await store.applyCollectionsSnapshot(
      [collection("favorites")],
      [
        {
          collectionId: "favorites",
          libraryItemId: "source",
          addedAt: staleClock,
          updatedAt: staleClock,
          removed: false,
        },
      ],
      () => true,
      7,
    );

    const memberships = await store.getCollectionItems();
    expect(
      memberships.find(
        (item) =>
          item.collectionId === "favorites" &&
          item.libraryItemId === "target",
      ),
    ).toMatchObject({ removed: false, updatedAt: staleClock });
    expect(
      memberships.find(
        (item) =>
          item.collectionId === "favorites" &&
          item.libraryItemId === "source",
      ),
    ).toMatchObject({ removed: true });
  });
});
