import "fake-indexeddb/auto";
import { describe, expect, test } from "bun:test";
import {
  IndexedDBUserDataStore,
  matchUserDataDatabaseProfile,
} from "./indexeddb";
import { StaleProfileWriteError } from "./profile-write-fence";
import type {
  InstalledSource,
  LocalCollection,
  LocalCollectionItem,
  LocalChapterProgress,
  LocalLibraryItem,
  LocalMangaProgress,
  LocalSourceLink,
} from "./schema";

let profileSequence = 0;

function createStore(label: string): IndexedDBUserDataStore {
  profileSequence += 1;
  return new IndexedDBUserDataStore(`test:${label}:${profileSequence}`);
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

function sourceLink(
  libraryItemId: string,
  sourceMangaId: string,
  updatedAt: number,
): LocalSourceLink {
  return {
    id: `registry:source:${sourceMangaId}`,
    libraryItemId,
    registryId: "registry",
    sourceId: "source",
    sourceMangaId,
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

function collectionItem(
  collectionId: string,
  libraryItemId: string,
  updatedAt: number,
): LocalCollectionItem {
  return {
    collectionId,
    libraryItemId,
    addedAt: updatedAt,
    updatedAt,
    removed: false,
  };
}

function chapterProgress(progress: number, updatedAt: number): LocalChapterProgress {
  return {
    id: "registry:source:manga:chapter",
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "manga",
    sourceChapterId: "chapter",
    progress,
    total: 100,
    completed: false,
    lastReadAt: updatedAt,
    updatedAt,
  };
}

function mangaProgress(lastReadAt: number): LocalMangaProgress {
  return {
    id: "registry:source:manga",
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "manga",
    lastReadAt,
    updatedAt: lastReadAt,
  };
}

describe("IndexedDB atomic snapshot application", () => {
  test("recognizes exactly the profile databases that participate in retirement", () => {
    expect(matchUserDataDatabaseProfile("nemu-user")).toEqual({
      profileId: undefined,
    });
    expect(matchUserDataDatabaseProfile("nemu-user::user:a")).toEqual({
      profileId: "user:a",
    });
    expect(matchUserDataDatabaseProfile("nemu-user::")).toBeNull();
    expect(matchUserDataDatabaseProfile("nemu-user-cache")).toBeNull();
  });

  test("does zero IndexedDB puts for an unchanged 10k chapter snapshot", async () => {
    const store = createStore("chapter-progress-10k");
    await store.prepareSyncGeneration(7);
    const rows: LocalChapterProgress[] = Array.from(
      { length: 10_000 },
      (_, index) => ({
        id: `registry:source:manga:chapter-${index}`,
        registryId: "registry",
        sourceId: "source",
        sourceMangaId: "manga",
        sourceChapterId: `chapter-${index}`,
        progress: index % 20,
        total: 20,
        completed: index % 20 === 19,
        lastReadAt: index,
        updatedAt: index,
      }),
    );
    await store.saveChapterProgressBatch(rows);
    const originalPut = IDBObjectStore.prototype.put;
    let putCount = 0;
    IDBObjectStore.prototype.put = function (...args) {
      putCount += 1;
      return Reflect.apply(originalPut, this, args) as IDBRequest<IDBValidKey>;
    };

    try {
      const result = await store.applyChapterProgressSnapshot(
        rows.map((entry) => ({ ...entry })),
        7,
      );
      expect(result?.progress).toHaveLength(10_000);
      expect(result?.changed).toHaveLength(0);
      expect(result?.localWinners).toHaveLength(0);
      expect(putCount).toBe(0);
    } finally {
      IDBObjectStore.prototype.put = originalPut;
    }
  });

  test("does not erase a library item written concurrently with snapshot replacement", async () => {
    const store = createStore("library-race");
    const cloudItem = libraryItem("cloud", 10);
    const cloudLink = sourceLink("cloud", "cloud-manga", 10);
    await store.saveLibrarySnapshot([cloudItem], [cloudLink]);

    const concurrentItem = libraryItem("concurrent", 20);
    const concurrentLink = sourceLink("concurrent", "concurrent-manga", 20);
    await Promise.all([
      store.applyLibrarySnapshot([cloudItem], [cloudLink]),
      store.saveLibraryItem(concurrentItem),
      store.saveSourceLink(concurrentLink),
    ]);

    expect(
      (await store.getAllLibraryItems({ includeRemoved: true }))
        .map((item) => item.libraryItemId)
        .sort(),
    ).toEqual(["cloud", "concurrent"]);
    expect((await store.getAllSourceLinks()).map((link) => link.id).sort()).toEqual([
      cloudLink.id,
      concurrentLink.id,
    ].sort());
  });

  test("does not erase a collection written concurrently with snapshot replacement", async () => {
    const store = createStore("collection-race");
    const cloudCollection = collection("cloud", 10);
    const cloudItem = collectionItem("cloud", "cloud-manga", 10);
    await store.saveCollectionsSnapshot([cloudCollection], [cloudItem]);

    const concurrentCollection = collection("concurrent", 20);
    await Promise.all([
      store.applyCollectionsSnapshot([cloudCollection], [cloudItem]),
      store.saveCollection(concurrentCollection),
      store.addCollectionItems("concurrent", ["concurrent-manga"]),
    ]);

    expect((await store.getCollections()).map((entry) => entry.collectionId).sort()).toEqual([
      "cloud",
      "concurrent",
    ]);
    expect(
      (await store.getCollectionItems())
        .map((entry) => `${entry.collectionId}:${entry.libraryItemId}`)
        .sort(),
    ).toEqual(["cloud:cloud-manga", "concurrent:concurrent-manga"]);
  });

  test("leaves the existing library snapshot untouched when its run is cancelled", async () => {
    const store = createStore("library-cancel");
    const localItem = libraryItem("local", 20);
    const localLink = sourceLink("local", "local-manga", 20);
    await store.saveLibrarySnapshot([localItem], [localLink]);
    let guardCalls = 0;

    const result = await store.applyLibrarySnapshot(
      [libraryItem("cloud", 30)],
      [sourceLink("cloud", "cloud-manga", 30)],
      () => {
        guardCalls += 1;
        return guardCalls < 3;
      },
    );

    expect(result).toBeNull();
    expect(
      (await store.getAllLibraryItems({ includeRemoved: true })).map(
        (entry) => entry.libraryItemId,
      ),
    ).toEqual(["local"]);
    expect((await store.getAllSourceLinks()).map((entry) => entry.id)).toEqual([
      localLink.id,
    ]);
  });

  test("preserves a concurrent chapter-progress high-water write", async () => {
    const store = createStore("chapter-progress-race");
    await store.saveChapterProgressEntry(chapterProgress(10, 10));

    await Promise.all([
      store.saveChapterProgressBatch([chapterProgress(20, 20)]),
      store.saveChapterProgressEntry(chapterProgress(80, 80)),
    ]);

    expect(await store.getChapterProgressEntry("registry:source:manga:chapter"))
      .toMatchObject({ progress: 80, lastReadAt: 80, updatedAt: 80 });
  });

  test("returns the canonical chapter-progress row committed by the transaction", async () => {
    const store = createStore("chapter-progress-canonical-return");
    await store.saveChapterProgressEntry(chapterProgress(80, 80));

    const saved = await store.saveChapterProgressEntry(chapterProgress(20, 20));
    const stored = await store.getChapterProgressEntry(
      "registry:source:manga:chapter",
    );

    expect(stored).not.toBeNull();
    expect(saved).toEqual(stored!);
    expect(saved).toMatchObject({
      progress: 80,
      lastReadAt: 80,
      updatedAt: 80,
    });
  });

  test("preserves a concurrent newer manga-progress write", async () => {
    const store = createStore("manga-progress-race");
    await store.saveMangaProgressEntry(mangaProgress(10));

    await Promise.all([
      store.saveMangaProgressBatch([mangaProgress(20)]),
      store.saveMangaProgressEntry(mangaProgress(80)),
    ]);

    expect(await store.getMangaProgressEntry("registry:source:manga"))
      .toMatchObject({ lastReadAt: 80, updatedAt: 80 });
  });

  test("preserves a concurrent installed-source tombstone during snapshot merge", async () => {
    const store = createStore("installed-source-race");
    const source: InstalledSource = {
      id: "registry:source",
      registryId: "registry",
      version: 1,
      updatedAt: 10,
    };
    await store.saveInstalledSource(source);

    await Promise.all([
      store.applyInstalledSourcesSnapshot([source]),
      store.removeInstalledSource(source.id, source.registryId, 80),
    ]);

    expect(await store.getInstalledSource(source.id)).toMatchObject({
      removed: true,
      updatedAt: 80,
    });
  });

  test("atomically merges a kept-account snapshot without replacing anonymous data", async () => {
    const account = createStore("account-export");
    const anonymous = createStore("anonymous-import");
    const importedItem = libraryItem("account-item", 20);
    const anonymousItem = libraryItem("anonymous-item", 30);
    const importedCollection = collection("account-collection", 20);
    const anonymousCollection = collection("anonymous-collection", 30);
    expect(await account.prepareSyncGeneration(5)).toBe("reset");
    expect(await anonymous.prepareSyncGeneration(7)).toBe("reset");
    await account.saveLibrarySnapshot(
      [importedItem],
      [sourceLink(importedItem.libraryItemId, "account-manga", 20)],
    );
    await account.saveCollectionsSnapshot(
      [importedCollection],
      [collectionItem(importedCollection.collectionId, importedItem.libraryItemId, 20)],
    );
    await account.saveChapterProgressEntry(chapterProgress(40, 20));
    await anonymous.saveLibrarySnapshot(
      [anonymousItem],
      [sourceLink(anonymousItem.libraryItemId, "anonymous-manga", 30)],
    );
    await anonymous.saveCollectionsSnapshot(
      [anonymousCollection],
      [collectionItem(anonymousCollection.collectionId, anonymousItem.libraryItemId, 30)],
    );
    await anonymous.saveChapterProgressEntry(chapterProgress(80, 30));

    const snapshot = await account.exportAccountDataSnapshot();
    expect(snapshot.syncGeneration).toBe(5);
    await anonymous.mergeAccountDataSnapshot(snapshot);

    expect(
      (await anonymous.getAllLibraryItems({ includeRemoved: true }))
        .map((item) => item.libraryItemId)
        .sort(),
    ).toEqual(["account-item", "anonymous-item"]);
    expect(
      (await anonymous.getCollections()).map((entry) => entry.collectionId).sort(),
    ).toEqual(["account-collection", "anonymous-collection"]);
    expect(await anonymous.getChapterProgressEntry("registry:source:manga:chapter"))
      .toMatchObject({ progress: 80, updatedAt: 30 });
    expect(await anonymous.getSyncGeneration()).toBe(7);
  });

  test("adopts generation zero without deleting offline legacy rows", async () => {
    const store = createStore("generation-zero");
    const item = libraryItem("offline", 20);
    await store.saveLibraryItem(item);

    expect(await store.prepareSyncGeneration(0)).toBe("initialize");
    expect(await store.getSyncGeneration()).toBe(0);
    expect(await store.getLibraryItem(item.libraryItemId)).toEqual(item);
  });

  test("atomically clears old synced rows when a newer generation arrives", async () => {
    const store = createStore("generation-reset");
    const item = libraryItem("stale", 20);
    const source: InstalledSource = {
      id: "registry:source",
      registryId: "registry",
      version: 1,
      updatedAt: 20,
    };
    await store.prepareSyncGeneration(0);
    await store.saveLibraryItem(item);
    await store.saveChapterProgressEntry(chapterProgress(50, 20));
    await store.saveInstalledSource(source);
    await store.saveRegistry({ id: "local-registry", name: "Local", type: "builtin" });

    expect(await store.prepareSyncGeneration(1)).toBe("reset");
    expect(await store.getSyncGeneration()).toBe(1);
    expect(await store.getAllLibraryItems({ includeRemoved: true })).toEqual([]);
    expect(await store.getAllChapterProgress()).toEqual([]);
    expect(await store.getInstalledSources()).toEqual([]);
    expect(await store.getRegistry("local-registry")).toMatchObject({
      id: "local-registry",
      name: "Local",
    });
  });

  test("makes reset-response loss retry idempotent and rejects delayed old rows", async () => {
    const store = createStore("generation-retry");
    await store.prepareSyncGeneration(0);
    await store.prepareSyncGeneration(2);
    const afterReset = libraryItem("after-reset", 30);
    await store.saveLibraryItem(afterReset);

    expect(await store.prepareSyncGeneration(2)).toBe("current");
    expect(await store.prepareSyncGeneration(1)).toBe("stale");
    expect(await store.getLibraryItem(afterReset.libraryItemId)).toEqual(afterReset);
    expect(await store.getSyncGeneration()).toBe(2);
  });

  test("rolls back a generation reset cancelled after transaction writes begin", async () => {
    const store = createStore("generation-mid-transaction-cancel");
    await store.prepareSyncGeneration(1);
    const item = libraryItem("must-survive-cancel", 20);
    await store.saveLibraryItem(item);
    let guardCalls = 0;

    const result = await store.prepareSyncGeneration(2, () => {
      guardCalls += 1;
      // The default-settings request has already scheduled the reset writes by
      // this point in fake-indexeddb. The next cursor callback must abort the
      // whole transaction instead of committing a partial clear.
      return guardCalls <= 5;
    });

    expect(guardCalls).toBeGreaterThan(5);
    expect(result).toBeNull();
    expect(await store.getSyncGeneration()).toBe(1);
    expect(await store.getLibraryItem(item.libraryItemId)).toEqual(item);
  });

  test("clears stale offline rows independently on two device profiles", async () => {
    const deviceA = createStore("reset-device-a");
    const deviceB = createStore("reset-device-b");
    await Promise.all([
      deviceA.saveLibraryItem(libraryItem("a-stale", 10)),
      deviceB.saveLibraryItem(libraryItem("b-stale", 10)),
    ]);

    await Promise.all([
      deviceA.prepareSyncGeneration(3),
      deviceB.prepareSyncGeneration(3),
    ]);

    expect(await deviceA.getAllLibraryItems({ includeRemoved: true })).toEqual([]);
    expect(await deviceB.getAllLibraryItems({ includeRemoved: true })).toEqual([]);
  });

  test("rejects every stale snapshot apply in the same transaction that checks generation", async () => {
    const store = createStore("stale-snapshot-generation");
    await store.prepareSyncGeneration(1);
    await store.prepareSyncGeneration(2);

    const staleItem = libraryItem("stale", 10);
    const staleLink = sourceLink("stale", "stale-manga", 10);
    const staleCollection = collection("stale", 10);
    const staleCollectionItem = collectionItem("stale", "stale", 10);
    const staleSource: InstalledSource = {
      id: "registry:stale",
      registryId: "registry",
      version: 1,
      updatedAt: 10,
    };

    expect(await store.applyLibrarySnapshot(
      [staleItem],
      [staleLink],
      () => true,
      1,
    )).toBeNull();
    expect(await store.applyCollectionsSnapshot(
      [staleCollection],
      [staleCollectionItem],
      () => true,
      1,
    )).toBeNull();
    expect(await store.applyInstalledSourcesSnapshot(
      [staleSource],
      () => true,
      1,
    )).toBeNull();
    expect(await store.applyChapterProgressSnapshot(
      [chapterProgress(50, 10)],
      1,
    )).toBeNull();
    expect(await store.applyMangaProgressSnapshot([mangaProgress(10)], 1)).toBeNull();

    expect(await store.getAllLibraryItems({ includeRemoved: true })).toEqual([]);
    expect(await store.getAllSourceLinks()).toEqual([]);
    expect(await store.getCollections()).toEqual([]);
    expect(await store.getCollectionItems()).toEqual([]);
    expect(await store.getInstalledSources()).toEqual([]);
    expect(await store.getAllChapterProgress()).toEqual([]);
    expect(await store.getAllMangaProgress()).toEqual([]);
  });

  test("orders a paused old-generation user write before reset so reset clears it", async () => {
    const store = createStore("user-write-before-reset");
    await store.prepareSyncGeneration(1);
    let releaseWrite!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const paused = new Promise<void>((resolve) => { releaseWrite = resolve; });

    const oldWrite = store.runWithSyncWrite(async (lease) => {
      markStarted();
      await paused;
      await store.saveChapterProgressEntry(chapterProgress(60, 60), lease);
      return store.getSyncGeneration();
    });
    await started;
    const reset = store.prepareSyncGeneration(2);
    releaseWrite();

    expect(await oldWrite).toBe(1);
    expect(await reset).toBe("reset");
    expect(await store.getAllChapterProgress()).toEqual([]);
    expect(await store.getSyncGeneration()).toBe(2);
  });

  test("preserves a user write that begins after reset completes", async () => {
    const store = createStore("user-write-after-reset");
    await store.prepareSyncGeneration(1);
    await store.prepareSyncGeneration(2);

    const generation = await store.runWithSyncWrite(async (lease) => {
      await store.saveChapterProgressEntry(chapterProgress(70, 70), lease);
      return store.getSyncGeneration();
    });

    expect(generation).toBe(2);
    expect(await store.getAllChapterProgress()).toEqual([chapterProgress(70, 70)]);
  });

  test("serializes reset and user writes across two store instances for one profile", async () => {
    profileSequence += 1;
    const profileId = `test:two-tab-reset:${profileSequence}`;
    const tabA = new IndexedDBUserDataStore(profileId);
    const tabB = new IndexedDBUserDataStore(profileId);
    await tabA.prepareSyncGeneration(1);

    let markOldWriteStarted!: () => void;
    const oldWriteStarted = new Promise<void>((resolve) => {
      markOldWriteStarted = resolve;
    });
    let releaseOldWrite!: () => void;
    const oldWriteCanFinish = new Promise<void>((resolve) => {
      releaseOldWrite = resolve;
    });
    const oldWrite = tabA.runWithSyncWrite(async (lease) => {
      markOldWriteStarted();
      await oldWriteCanFinish;
      await tabA.saveLibraryItem(libraryItem("old-generation", 10), lease);
      return tabA.getSyncGeneration();
    });
    await oldWriteStarted;

    // These calls model two tabs enqueueing against the same profile. The
    // post-reset action starts while the old write is paused, but queues after
    // the reset and must therefore observe/preserve generation 2.
    const reset = tabB.prepareSyncGeneration(2);
    const postResetWrite = tabB.runWithSyncWrite(async (lease) => {
      const generation = await tabB.getSyncGeneration();
      await tabB.saveLibraryItem(libraryItem("new-generation", 20), lease);
      return generation;
    });
    releaseOldWrite();

    expect(await oldWrite).toBe(1);
    expect(await reset).toBe("reset");
    expect(await postResetWrite).toBe(2);
    expect(
      (await tabA.getAllLibraryItems({ includeRemoved: true })).map(
        (item) => item.libraryItemId,
      ),
    ).toEqual(["new-generation"]);
  });

  test("retirement rejects stale tab writes and permits a fresh profile lifetime", async () => {
    profileSequence += 1;
    const profileId = `test:two-tab-retire:${profileSequence}`;
    const staleTab = new IndexedDBUserDataStore(profileId);
    const clearingTab = new IndexedDBUserDataStore(profileId);
    await staleTab.saveLibraryItem(libraryItem("secret", 10));
    await staleTab.saveRegistry({
      id: "secret-registry",
      name: "Secret registry",
      type: "builtin",
    });

    await clearingTab.retireProfileWrites(async (lease) => {
      await clearingTab.clearAccountData(undefined, lease);
      await clearingTab.removeRegistry("secret-registry", lease);
    });

    await expect(
      staleTab.saveLibraryItem(libraryItem("must-not-resurrect", 20)),
    ).rejects.toBeInstanceOf(StaleProfileWriteError);
    await expect(
      staleTab.saveRegistry({
        id: "must-not-resurrect-registry",
        name: "Must not resurrect",
        type: "builtin",
      }),
    ).rejects.toBeInstanceOf(StaleProfileWriteError);
    expect(
      await clearingTab.getAllLibraryItems({ includeRemoved: true }),
    ).toEqual([]);
    expect(await clearingTab.getRegistry("secret-registry")).toBeNull();

    const freshTab = new IndexedDBUserDataStore(profileId);
    await freshTab.saveLibraryItem(libraryItem("fresh-session", 30));
    await freshTab.saveRegistry({
      id: "fresh-registry",
      name: "Fresh registry",
      type: "builtin",
    });
    expect(
      (await freshTab.getAllLibraryItems({ includeRemoved: true })).map(
        (item) => item.libraryItemId,
      ),
    ).toEqual(["fresh-session"]);
    expect(await freshTab.getRegistry("fresh-registry")).toMatchObject({
      id: "fresh-registry",
    });
  });
});
