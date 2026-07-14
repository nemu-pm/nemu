import { beforeEach, describe, expect, test } from "bun:test";
import {
  makeChapterProgressId,
  makeMangaProgressId,
  makeSourceLinkId,
  type LocalChapterProgress,
  type LocalCollection,
  type LocalCollectionItem,
  type LocalLibraryItem,
  type LocalMangaProgress,
  type LocalSourceLink,
} from "./schema";
import {
  getMobileWebStateKey,
  MOBILE_WEB_STATE_KEY,
  resetMobileWebSyncSnapshotStateForTesting,
  WebUserDataStore,
} from "./webStore";

class MemoryLocalStorage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

class FailingLocalStorage extends MemoryLocalStorage {
  failWrites = true;

  override setItem(key: string, value: string): void {
    if (this.failWrites) throw new Error("quota exceeded");
    super.setItem(key, value);
  }
}

class UnreadableLocalStorage extends MemoryLocalStorage {
  override getItem(): string | null {
    throw new Error("storage blocked");
  }
}

function installLocalStorage() {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryLocalStorage(),
  });
}

function libraryItem(
  libraryItemId: string,
  title: string,
  inLibrary = true,
): LocalLibraryItem {
  return {
    libraryItemId,
    metadata: { title },
    inLibrary,
    createdAt: 1,
    updatedAt: 1,
  };
}

function sourceLink(
  libraryItemId: string,
  sourceMangaId: string,
): LocalSourceLink {
  const registryId = "aidoku-community";
  const sourceId = "en.example";
  return {
    id: makeSourceLinkId(registryId, sourceId, sourceMangaId),
    libraryItemId,
    registryId,
    sourceId,
    sourceMangaId,
    createdAt: 1,
    updatedAt: 1,
  };
}

function chapterProgress(
  sourceChapterId: string,
  progress: number,
): LocalChapterProgress {
  const registryId = "aidoku-community";
  const sourceId = "en.example";
  const sourceMangaId = "manga-1";
  return {
    id: makeChapterProgressId(
      registryId,
      sourceId,
      sourceMangaId,
      sourceChapterId,
    ),
    registryId,
    sourceId,
    sourceMangaId,
    sourceChapterId,
    progress,
    total: 10,
    completed: progress >= 10,
    lastReadAt: progress,
    updatedAt: progress,
  };
}

function mangaProgress(
  sourceMangaId: string,
  lastReadAt: number,
): LocalMangaProgress {
  const registryId = "aidoku-community";
  const sourceId = "en.example";
  return {
    id: makeMangaProgressId(registryId, sourceId, sourceMangaId),
    registryId,
    sourceId,
    sourceMangaId,
    lastReadAt,
    updatedAt: lastReadAt,
  };
}

describe("mobile sync snapshot store contract", () => {
  beforeEach(() => {
    installLocalStorage();
    resetMobileWebSyncSnapshotStateForTesting();
  });

  test("replaces library snapshots and filters removed items by default", async () => {
    const store = new WebUserDataStore();
    await store.saveLibraryItem(libraryItem("old", "Old"));
    await store.saveSourceLink(sourceLink("old", "old-manga"));

    await store.saveLibrarySnapshot(
      [libraryItem("new", "New"), libraryItem("removed", "Removed", false)],
      [
        sourceLink("new", "new-manga"),
        { ...sourceLink("new", "removed-source"), removed: true, updatedAt: 2 },
      ],
    );

    expect(await store.hasSyncedData()).toBe(true);
    expect(
      (await store.getAllLibraryItems()).map((item) => item.libraryItemId),
    ).toEqual(["new"]);
    expect(
      (await store.getAllLibraryItems({ includeRemoved: true })).map(
        (item) => item.libraryItemId,
      ),
    ).toEqual(["new", "removed"]);
    expect(await store.getSourceLinksForItem("new")).toHaveLength(1);
    expect(
      (await store.getAllSourceLinks()).map((link) => link.libraryItemId),
    ).toEqual(["new", "new"]);
  });

  test("keeps installed source tombstones available for sync settings", async () => {
    const store = new WebUserDataStore();

    await store.saveInstalledSource({
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceKind: "aidoku",
      sourceId: "en.example",
      version: 1,
      updatedAt: 1,
    });
    await store.removeInstalledSource(
      "aidoku-community:en.example",
      "aidoku-community",
    );

    expect((await store.getSettings()).installedSources).toEqual([]);
    expect((await store.getSyncSettings()).installedSources).toMatchObject([
      {
        id: "aidoku-community:en.example",
        registryId: "aidoku-community",
        removed: true,
      },
    ]);
  });

  test("preserves installed-source tombstones across unrelated settings saves", async () => {
    const store = new WebUserDataStore();
    await store.saveInstalledSource({
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      version: 1,
      updatedAt: 1,
    });
    await store.removeInstalledSource(
      "aidoku-community:en.example",
      "aidoku-community",
    );

    await store.saveSettings({
      ...(await store.getSettings()),
      themePreference: "dark",
    });

    expect((await store.getSyncSettings()).installedSources).toMatchObject([
      {
        id: "aidoku-community:en.example",
        removed: true,
      },
    ]);
  });

  test("isolates Expo web state by hashed account profile", async () => {
    const accountAKey = getMobileWebStateKey("user:account-a");
    const accountBKey = getMobileWebStateKey("user:account-b");
    expect(accountAKey).not.toBe(accountBKey);
    expect(accountAKey).not.toContain("account-a");

    const accountA = new WebUserDataStore(accountAKey);
    const accountB = new WebUserDataStore(accountBKey);
    await accountA.saveLibraryItem(libraryItem("account-a-item", "Private"));

    expect(await accountA.hasSyncedData()).toBe(true);
    expect(await accountB.hasSyncedData()).toBe(false);
  });

  test("persists snapshot health per account, survives clock rollback, and fences stale generations", async () => {
    const accountAKey = getMobileWebStateKey("user:account-a");
    const accountBKey = getMobileWebStateKey("user:account-b");
    const accountA = new WebUserDataStore(accountAKey);
    const accountB = new WebUserDataStore(accountBKey);
    expect(await accountA.applySyncGeneration(7)).toBe("reset");
    expect(
      await accountA.recordSyncSnapshotState({
        status: "budget-exceeded",
        generation: 7,
        origin: "background",
        resourceKey: "chapterProgress",
        observedAt: Date.now() + 1_000_000,
      }),
    ).toBe(true);

    const blockedState = await new WebUserDataStore(
      accountAKey,
    ).getSyncSnapshotState();
    expect(blockedState).toMatchObject({
      status: "budget-exceeded",
      generation: 7,
      origin: "background",
      resourceKey: "chapterProgress",
    });
    if (!blockedState) throw new Error("Expected persisted sync health.");
    expect(await accountB.getSyncSnapshotState()).toBeNull();
    const futureClock = Date.now() + 1_000_000;
    const persistedAccountA = JSON.parse(
      localStorage.getItem(accountAKey) ?? "{}",
    ) as Record<string, unknown>;
    localStorage.setItem(
      accountAKey,
      JSON.stringify({
        ...persistedAccountA,
        syncSnapshotState: { ...blockedState, observedAt: futureClock },
      }),
    );

    expect(
      await accountA.recordSyncSnapshotState({
        status: "healthy",
        generation: 7,
        origin: "foreground",
        observedAt: 1,
      }),
    ).toBe(true);
    const healthyState = await accountA.getSyncSnapshotState();
    expect(healthyState).toMatchObject({
      status: "healthy",
      generation: 7,
    });
    expect(healthyState?.observedAt).toBeGreaterThan(futureClock);

    expect(await accountA.applySyncGeneration(8)).toBe("reset");
    expect(await accountA.getSyncSnapshotState()).toBeNull();
    expect(
      await accountA.recordSyncSnapshotState({
        status: "budget-exceeded",
        generation: 7,
        origin: "background",
        observedAt: 300,
      }),
    ).toBe(false);
  });

  test("surfaces Web storage failures before claiming snapshot health was durable", async () => {
    const storage = new FailingLocalStorage();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
    });
    const store = new WebUserDataStore();

    await expect(
      store.recordSyncSnapshotState({
        status: "budget-exceeded",
        generation: 1,
        origin: "foreground",
        resourceKey: "total",
        observedAt: 100,
      }),
    ).rejects.toThrow("quota exceeded");
    expect(await store.getSyncSnapshotState()).toMatchObject({
      status: "budget-exceeded",
      generation: 1,
      resourceKey: "total",
    });
    expect(localStorage.getItem(MOBILE_WEB_STATE_KEY)).toBeNull();
    expect(await new WebUserDataStore().getSyncSnapshotState()).toMatchObject({
      status: "budget-exceeded",
      generation: 1,
    });

    await expect(
      store.recordSyncSnapshotState({
        status: "healthy",
        generation: 1,
        origin: "foreground",
        observedAt: 200,
      }),
    ).rejects.toThrow("quota exceeded");
    expect(await store.getSyncSnapshotState()).toMatchObject({
      status: "budget-exceeded",
      generation: 1,
    });
  });

  test("never lets a late lower-generation result downgrade a volatile Web gate", async () => {
    const storage = new FailingLocalStorage();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
    });
    const store = new WebUserDataStore();
    await expect(
      store.recordSyncSnapshotState({
        status: "budget-exceeded",
        generation: 8,
        origin: "foreground",
        observedAt: 800,
      }),
    ).rejects.toThrow("quota exceeded");
    await expect(
      store.recordSyncSnapshotState({
        status: "budget-exceeded",
        generation: 7,
        origin: "background",
        observedAt: 700,
      }),
    ).resolves.toBe(false);
    expect(await store.getSyncSnapshotState()).toMatchObject({
      status: "budget-exceeded",
      generation: 8,
    });

    storage.failWrites = false;
    await expect(
      store.recordSyncSnapshotState({
        status: "healthy",
        generation: 7,
        origin: "foreground",
        observedAt: 900,
      }),
    ).resolves.toBe(false);
    expect(await store.getSyncSnapshotState()).toMatchObject({
      status: "budget-exceeded",
      generation: 8,
    });
    expect(await new WebUserDataStore().getSyncSnapshotState()).toMatchObject({
      status: "budget-exceeded",
      generation: 8,
    });

    await expect(
      store.recordSyncSnapshotState({
        status: "healthy",
        generation: 8,
        origin: "foreground",
        observedAt: 1,
      }),
    ).resolves.toBe(true);
    expect(await store.getSyncSnapshotState()).toMatchObject({
      status: "healthy",
      generation: 8,
    });
  });

  test("fails closed on structurally invalid Web snapshot health", async () => {
    const storageKey = getMobileWebStateKey(null);
    localStorage.setItem(storageKey, JSON.stringify({ syncSnapshotState: {} }));
    await expect(
      new WebUserDataStore(storageKey).getSyncSnapshotState(),
    ).rejects.toThrow("Invalid mobile sync snapshot state");

    localStorage.setItem(storageKey, JSON.stringify("invalid"));
    await expect(
      new WebUserDataStore(storageKey).getSyncSnapshotState(),
    ).rejects.toThrow("Invalid mobile Web account state");
  });

  test("surfaces unreadable Web sync state instead of silently restarting subscriptions", async () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new UnreadableLocalStorage(),
    });

    const store = new WebUserDataStore();
    await expect(store.getSyncSnapshotState()).rejects.toThrow(
      "storage blocked",
    );
    await expect(
      store.recordSyncSnapshotState({
        status: "budget-exceeded",
        generation: 3,
        origin: "foreground",
        resourceKey: "total",
        observedAt: 300,
      }),
    ).rejects.toThrow("storage blocked");
    expect(await store.getSyncSnapshotState()).toMatchObject({
      status: "budget-exceeded",
      generation: 3,
    });
  });

  test("cache clearing retains snapshot health while account clearing removes it", async () => {
    const store = new WebUserDataStore();
    await store.applySyncGeneration(1);
    await store.recordSyncSnapshotState({
      status: "budget-exceeded",
      generation: 1,
      origin: "foreground",
      resourceKey: "total",
      observedAt: 100,
    });

    await store.clearPackageCacheReferences();
    expect(await store.getSyncSnapshotState()).toMatchObject({
      status: "budget-exceeded",
    });
    await store.clearAccountData();
    expect(await store.getSyncSnapshotState()).toBeNull();
  });

  test("upserts chapter and manga progress batches", async () => {
    const store = new WebUserDataStore();
    await store.saveChapterProgress(chapterProgress("chapter-1", 2));
    await store.saveMangaProgress(mangaProgress("manga-1", 2));

    await store.saveChapterProgressBatch([
      chapterProgress("chapter-1", 5),
      chapterProgress("chapter-2", 1),
    ]);
    await store.saveMangaProgressBatch([
      mangaProgress("manga-1", 5),
      mangaProgress("manga-2", 1),
    ]);

    expect(
      (await store.getAllChapterProgress()).map((entry) => entry.progress),
    ).toEqual([5, 1]);
    expect(
      (await store.getAllMangaProgress()).map((entry) => entry.lastReadAt),
    ).toEqual([5, 1]);
  });

  test("keeps high-water chapter and manga progress on batch saves", async () => {
    const store = new WebUserDataStore();
    await store.saveChapterProgress({
      ...chapterProgress("chapter-1", 8),
      total: 10,
      completed: true,
      lastReadAt: 80,
      updatedAt: 80,
    });
    await store.saveMangaProgress({
      ...mangaProgress("manga-1", 80),
      lastReadSourceChapterId: "chapter-8",
    });

    await store.saveChapterProgressBatch([
      {
        ...chapterProgress("chapter-1", 3),
        total: 12,
        completed: false,
        lastReadAt: 30,
        updatedAt: 30,
      },
    ]);
    await store.saveMangaProgressBatch([
      {
        ...mangaProgress("manga-1", 30),
        lastReadSourceChapterId: "chapter-3",
      },
    ]);

    expect(await store.getAllChapterProgress()).toEqual([
      {
        ...chapterProgress("chapter-1", 3),
        progress: 8,
        total: 12,
        completed: true,
        lastReadAt: 80,
        updatedAt: 80,
      },
    ]);
    expect(await store.getAllMangaProgress()).toEqual([
      {
        ...mangaProgress("manga-1", 80),
        lastReadSourceChapterId: "chapter-8",
      },
    ]);
  });

  test("keeps high-water chapter and manga progress inside duplicate batch rows", async () => {
    const store = new WebUserDataStore();

    await store.saveChapterProgressBatch([
      {
        ...chapterProgress("chapter-1", 8),
        total: 10,
        completed: true,
        lastReadAt: 80,
        updatedAt: 80,
      },
      {
        ...chapterProgress("chapter-1", 3),
        total: 12,
        completed: false,
        lastReadAt: 30,
        updatedAt: 30,
      },
    ]);
    await store.saveMangaProgressBatch([
      {
        ...mangaProgress("manga-1", 80),
        lastReadSourceChapterId: "chapter-8",
      },
      {
        ...mangaProgress("manga-1", 30),
        lastReadSourceChapterId: "chapter-3",
      },
    ]);

    expect(await store.getAllChapterProgress()).toEqual([
      {
        ...chapterProgress("chapter-1", 3),
        progress: 8,
        total: 12,
        completed: true,
        lastReadAt: 80,
        updatedAt: 80,
      },
    ]);
    expect(await store.getAllMangaProgress()).toEqual([
      {
        ...mangaProgress("manga-1", 80),
        lastReadSourceChapterId: "chapter-8",
      },
    ]);
  });

  test("keeps high-water chapter progress on single saves like web IndexedDB", async () => {
    const store = new WebUserDataStore();

    await store.saveChapterProgress({
      ...chapterProgress("chapter-1", 8),
      total: 10,
      completed: true,
      lastReadAt: 80,
      updatedAt: 80,
    });
    await store.saveChapterProgress({
      ...chapterProgress("chapter-1", 3),
      total: 12,
      completed: false,
      lastReadAt: 30,
      updatedAt: 30,
    });

    expect(await store.getAllChapterProgress()).toEqual([
      {
        ...chapterProgress("chapter-1", 3),
        progress: 8,
        total: 12,
        completed: true,
        lastReadAt: 80,
        updatedAt: 80,
      },
    ]);
  });

  test("keeps high-water manga progress on single saves like web IndexedDB", async () => {
    const store = new WebUserDataStore();

    await store.saveMangaProgress({
      ...mangaProgress("manga-1", 80),
      lastReadSourceChapterId: "chapter-8",
      lastReadChapterNumber: 8,
    });
    await store.saveMangaProgress({
      ...mangaProgress("manga-1", 30),
      lastReadSourceChapterId: "chapter-3",
      lastReadChapterNumber: 3,
    });

    expect(await store.getAllMangaProgress()).toEqual([
      {
        ...mangaProgress("manga-1", 80),
        lastReadSourceChapterId: "chapter-8",
        lastReadChapterNumber: 8,
      },
    ]);
  });

  test("replaces collection snapshots and clears account data without deleting registries", async () => {
    const store = new WebUserDataStore();
    const collection: LocalCollection = {
      collectionId: "favorites",
      name: "Favorites",
      createdAt: 1,
      updatedAt: 1,
    };
    const membership: LocalCollectionItem = {
      collectionId: "favorites",
      libraryItemId: "new",
      addedAt: 1,
      updatedAt: 1,
    };

    await store.saveRegistry({
      id: "aidoku-community",
      name: "Aidoku",
      type: "url",
      url: "https://example.com",
    });
    await store.saveInstalledSource({
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      version: 1,
    });
    await store.saveCollectionsSnapshot([collection], [membership]);
    await store.clearAccountData();

    expect(await store.getCollections()).toEqual([]);
    expect(await store.getCollectionItems()).toEqual([]);
    expect(await store.getInstalledSources()).toEqual([]);
    expect(await store.hasSyncedData()).toBe(false);
    expect(
      (await store.getRegistries()).map((registry) => registry.id),
    ).toEqual(["aidoku-community"]);
  });

  test("ignores collection memberships for missing collections like web IndexedDB", async () => {
    const store = new WebUserDataStore();

    await store.addCollectionItems("missing", ["new"]);

    expect(await store.getCollectionItems()).toEqual([]);
  });

  test("atomically adopts a newer generation without clearing local-only preferences", async () => {
    const store = new WebUserDataStore();
    expect(await store.applySyncGeneration(0)).toBe("initialize");
    await store.saveSettings({
      installedSources: [],
      themePreference: "dark",
      readingMode: "rtl",
    });
    await store.saveSourceSettings({
      sourceKey: "aidoku-community:en.example",
      values: { quality: "high" },
      updatedAt: 10,
    });
    await store.saveRegistry({
      id: "aidoku-community",
      name: "Aidoku",
      type: "url",
      url: "https://example.test",
    });
    await store.saveInstalledSource({
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      version: 1,
      updatedAt: 10,
    });
    await store.saveLibraryItem(libraryItem("old", "Old"));
    await store.saveSourceLink(sourceLink("old", "old-manga"));
    await store.saveChapterProgress(chapterProgress("chapter-1", 4));
    await store.saveMangaProgress(mangaProgress("old-manga", 4));
    await store.saveCollection({
      collectionId: "old-collection",
      name: "Old",
      createdAt: 1,
      updatedAt: 1,
    });
    await store.removeCollection("old-collection");
    expect(await store.getPendingSyncDeletions?.()).not.toEqual([]);

    expect(await store.applySyncGeneration(1)).toBe("reset");
    expect(await store.getSyncGeneration()).toBe(1);
    expect(await store.getAllLibraryItems({ includeRemoved: true })).toEqual(
      [],
    );
    expect(await store.getAllSourceLinks()).toEqual([]);
    expect(await store.getAllChapterProgress()).toEqual([]);
    expect(await store.getAllMangaProgress()).toEqual([]);
    expect(await store.getCollections()).toEqual([]);
    expect(await store.getCollectionItems()).toEqual([]);
    expect(await store.getInstalledSources()).toEqual([]);
    expect(await store.getPendingSyncDeletions?.()).toEqual([]);
    expect(await store.getSettings()).toMatchObject({
      installedSources: [],
      themePreference: "dark",
      readingMode: "rtl",
    });
    expect(
      await store.getSourceSettings("aidoku-community:en.example"),
    ).toEqual({
      sourceKey: "aidoku-community:en.example",
      values: { quality: "high" },
      updatedAt: 10,
    });
    expect(
      (await store.getRegistries()).map((registry) => registry.id),
    ).toEqual(["aidoku-community"]);

    await store.saveLibraryItem(libraryItem("new", "New"));
    expect(await store.applySyncGeneration(0)).toBe("stale");
    expect(await store.getSyncGeneration()).toBe(1);
    expect(
      (await store.getAllLibraryItems()).map((item) => item.libraryItemId),
    ).toEqual(["new"]);
  });
});
