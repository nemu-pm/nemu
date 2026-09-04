import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { ConvexReactClient } from "convex/react";
import { WebUserDataStore } from "@/data/webStore";
import type {
  LocalChapterProgress,
  LocalCollection,
  LocalLibraryItem,
  LocalSourceLink,
} from "@/data/schema";
import { makeChapterProgressId, makeSourceLinkId } from "@/data/schema";
import {
  createMobileSyncDataStore,
  retargetMobileCloudHistoryLibraryItem,
} from "./mobileSyncDataStore";
import {
  invalidateMobileSyncEpoch,
  mobileChapterProgressIntraPageSyncSupportedRef,
  mobileConvexRef,
  mobileIsAuthenticatedRef,
  mobileSessionUserIdRef,
  runWithMobileSyncWrite,
  runWithMobileSyncSuspended,
  setActiveMobileSyncStore,
  setMobileChapterProgressIntraPageSyncVersion,
} from "./mobileSyncRuntime";

type MutationCall = {
  mutation: unknown;
  args: unknown;
};

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

function installLocalStorage() {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: new MemoryLocalStorage(),
  });
}

function installConvexRecorder(calls: MutationCall[]) {
  mobileConvexRef.current = {
    mutation: async (mutation: unknown, args: unknown) => {
      calls.push({ mutation, args });
      return null;
    },
  } as unknown as ConvexReactClient;
  mobileIsAuthenticatedRef.current = true;
  mobileSessionUserIdRef.current = "account-a";
}

function installConvexTransport(
  calls: MutationCall[],
  mutationResult: () => Promise<unknown>,
) {
  mobileConvexRef.current = {
    mutation: (mutation: unknown, args: unknown) => {
      calls.push({ mutation, args });
      return mutationResult();
    },
  } as unknown as ConvexReactClient;
  mobileIsAuthenticatedRef.current = true;
  mobileSessionUserIdRef.current = "account-a";
}

function createInitializedSyncStore(): ReturnType<typeof createMobileSyncDataStore> {
  const base = new WebUserDataStore();
  // WebUserDataStore applies this synchronously before its resolved promise is
  // observed, which keeps test setup compact while preserving unknown-gen
  // behavior in production.
  void base.applySyncGeneration(0);
  return createMobileSyncDataStore(base);
}

function libraryItem(): LocalLibraryItem {
  return {
    libraryItemId: "library-1",
    metadata: { title: "Title" },
    inLibrary: true,
    createdAt: 1,
    updatedAt: 2,
  };
}

function sourceLink(): LocalSourceLink {
  const registryId = "aidoku-community";
  const sourceId = "en.example";
  const sourceMangaId = "manga-1";
  return {
    id: makeSourceLinkId(registryId, sourceId, sourceMangaId),
    libraryItemId: "library-1",
    registryId,
    sourceId,
    sourceMangaId,
    createdAt: 1,
    updatedAt: 2,
  };
}

function chapterProgress(
  overrides: Partial<LocalChapterProgress> = {},
): LocalChapterProgress {
  const registryId = "aidoku-community";
  const sourceId = "en.example";
  const sourceMangaId = "manga-1";
  const sourceChapterId = "chapter-2";
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
    libraryItemId: "library-1",
    progress: 4,
    total: 12,
    completed: false,
    lastReadAt: 10,
    chapterNumber: 2,
    volumeNumber: 1,
    chapterTitle: "Second",
    updatedAt: 11,
    ...overrides,
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

describe("mobile sync data store", () => {
  beforeEach(() => {
    installLocalStorage();
    setMobileChapterProgressIntraPageSyncVersion(undefined);
  });

  afterEach(() => {
    setActiveMobileSyncStore(null);
    mobileConvexRef.current = null;
    mobileIsAuthenticatedRef.current = false;
    mobileSessionUserIdRef.current = undefined;
    setMobileChapterProgressIntraPageSyncVersion(undefined);
  });

  test("pushes library saves only after an item has a source link", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();

    await store.saveLibraryItem(libraryItem());
    expect(calls).toHaveLength(0);

    await store.saveSourceLink({
      ...sourceLink(),
      latestChapter: {
        id: "c2",
        title: "Latest",
        chapterNumber: 2,
        lang: "ja",
        dateUploaded: 1_700_000_000_000,
        locked: true,
      },
      latestChapterSortKey: "V00001C00000002:c2",
      latestFetchedAt: 20,
      updateAckChapter: {
        id: "c1",
        title: "Acknowledged",
        chapterNumber: 1,
        lang: "ja",
        dateUploaded: 1_600_000_000_000,
        locked: false,
      },
      updateAckChapterSortKey: "V00001C00000001:c1",
      updateAckAt: 15,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual({
      expectedUserId: "account-a",
      libraryItemId: "library-1",
      createdAt: 1,
      updatedAt: 2,
      generation: 0,
      metadata: { title: "Title" },
      overrides: undefined,
      externalIds: undefined,
      sourceOrder: undefined,
      sources: [
        {
          registryId: "aidoku-community",
          sourceId: "en.example",
          sourceMangaId: "manga-1",
          latestChapter: {
            id: "c2",
            title: "Latest",
            chapterNumber: 2,
            volumeNumber: undefined,
            lang: "ja",
          },
          latestChapterSortKey: "V00001C00000002:c2",
          latestFetchedAt: 20,
          updateAckChapter: {
            id: "c1",
            title: "Acknowledged",
            chapterNumber: 1,
            volumeNumber: undefined,
            lang: "ja",
          },
          updateAckChapterSortKey: "V00001C00000001:c1",
          updateAckAt: 15,
          createdAt: 1,
          updatedAt: 2,
          removed: undefined,
        },
      ],
      sourcesMode: "merge",
    });
  });

  test("advances repeated local writes and pending deletions beyond future clocks", async () => {
    const originalNow = Date.now;
    Date.now = () => 100;
    try {
      const base = new WebUserDataStore();
      const futureItem = { ...libraryItem(), updatedAt: 500 };
      const futureLink = { ...sourceLink(), updatedAt: 500 };
      await base.saveLibraryItem(futureItem);
      await base.saveSourceLink(futureLink);
      const store = createMobileSyncDataStore(base);

      await store.saveLibraryItem({
        ...futureItem,
        metadata: { title: "First edit" },
        updatedAt: 100,
      });
      expect((await base.getLibraryItem(futureItem.libraryItemId))?.updatedAt).toBe(501);

      await store.saveLibraryItem({
        ...futureItem,
        metadata: { title: "Second edit" },
        updatedAt: 100,
      });
      expect((await base.getLibraryItem(futureItem.libraryItemId))?.updatedAt).toBe(502);

      await store.removeSourceLink(
        futureLink.registryId,
        futureLink.sourceId,
        futureLink.sourceMangaId,
      );
      const removed = (
        await base.getAllSourceLinks({ includeRemoved: true })
      ).find((link) => link.id === futureLink.id);
      const pending = await base.getPendingSyncDeletions();
      expect(removed).toMatchObject({ removed: true, updatedAt: 501 });
      expect(pending[0]).toMatchObject({
        id: `source-link:${futureLink.id}`,
        createdAt: 501,
      });
    } finally {
      Date.now = originalNow;
    }
  });

  test("does not push a write that crossed into a newer sync epoch", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    let markSaved!: () => void;
    let releaseSave!: () => void;
    const saved = new Promise<void>((resolve) => {
      markSaved = resolve;
    });
    const saveGate = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    class DelayedStore extends WebUserDataStore {
      override async saveLibraryItem(item: LocalLibraryItem): Promise<void> {
        await super.saveLibraryItem(item);
        markSaved();
        await saveGate;
      }
    }
    const store = createMobileSyncDataStore(new DelayedStore());
    await store.saveSourceLink(sourceLink());
    calls.length = 0;

    const writing = store.saveLibraryItem(libraryItem());
    await saved;
    invalidateMobileSyncEpoch();
    releaseSave();
    await writing;

    expect(calls).toEqual([]);
  });

  test("keeps unknown-generation writes local until a remote generation is adopted", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const base = new WebUserDataStore();
    const store = createMobileSyncDataStore(base);

    await store.saveLibraryItem(libraryItem());
    await store.saveSourceLink(sourceLink());

    expect(await base.getSyncGeneration()).toBeNull();
    expect(calls).toEqual([]);
    expect(await base.getAllLibraryItems()).toHaveLength(1);

    await runWithMobileSyncWrite(() => base.applySyncGeneration(2));
    expect(await base.getSyncGeneration()).toBe(2);
    expect(await base.getAllLibraryItems({ includeRemoved: true })).toEqual([]);
    expect(await base.getAllSourceLinks()).toEqual([]);
  });

  test("orders an in-flight local write before reset and preserves writes started after reset", async () => {
    let markWriteEntered!: () => void;
    let releaseWrite!: () => void;
    const writeEntered = new Promise<void>((resolve) => {
      markWriteEntered = resolve;
    });
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve;
    });
    class DelayedStore extends WebUserDataStore {
      override async saveLibraryItem(
        item: LocalLibraryItem,
        expectedGeneration?: number,
      ): Promise<void> {
        void expectedGeneration;
        markWriteEntered();
        await writeGate;
        await super.saveLibraryItem(item);
      }
    }
    const base = new DelayedStore();
    await base.applySyncGeneration(1);
    const store = createMobileSyncDataStore(base);
    mobileIsAuthenticatedRef.current = false;

    const oldWrite = store.saveLibraryItem(libraryItem());
    await writeEntered;
    const reset = runWithMobileSyncWrite(() => base.applySyncGeneration(2));
    releaseWrite();
    await Promise.all([oldWrite, reset]);

    expect(await base.getSyncGeneration()).toBe(2);
    expect(await base.getAllLibraryItems({ includeRemoved: true })).toEqual([]);

    await store.saveLibraryItem({
      ...libraryItem(),
      libraryItemId: "library-after-reset",
    });
    expect((await base.getAllLibraryItems()).map((item) => item.libraryItemId)).toEqual([
      "library-after-reset",
    ]);
  });

  test("does not push through a store belonging to the previous account", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const oldStore = createMobileSyncDataStore(new WebUserDataStore("old-account"));
    const activeStore = createMobileSyncDataStore(
      new WebUserDataStore("active-account"),
    );
    setActiveMobileSyncStore(activeStore);

    await oldStore.saveLibraryItem(libraryItem());
    await oldStore.saveSourceLink(sourceLink());

    expect(calls).toEqual([]);
  });

  test("pushes synced installed source metadata without mobile package cache fields", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();

    await store.saveInstalledSource({
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceKind: "aidoku",
      sourceId: "en.example",
      name: "Example",
      icon: "https://example.test/icon.png",
      languages: ["en"],
      contentRating: 1,
      hasAuthentication: true,
      hasCloudflare: true,
      downloadUrl: "https://example.test/source.aix",
      packageUri: "file:///cache/example.aix",
      packageCacheKey: "aix:aidoku-community:en.example",
      packageMetadata: {
        sourceId: "en.example",
        name: "Example",
        version: 1,
        listings: [],
        filters: [],
        settings: [],
        hasWasm: true,
      },
      version: 1,
      updatedAt: 2,
      removed: false,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual({
      expectedUserId: "account-a",
      source: {
        id: "aidoku-community:en.example",
        registryId: "aidoku-community",
        sourceKind: "aidoku",
        sourceId: "en.example",
        name: "Example",
        icon: "https://example.test/icon.png",
        languages: ["en"],
        contentRating: 1,
        hasAuthentication: true,
        hasCloudflare: true,
        downloadUrl: "https://example.test/source.aix",
        version: 1,
        updatedAt: 2,
        removed: false,
      },
      generation: 0,
    });
  });

  test("keeps every foreground write local-first while cloud transport is stalled", async () => {
    const calls: MutationCall[] = [];
    installConvexTransport(calls, () => new Promise(() => undefined));
    const base = new WebUserDataStore();
    await base.applySyncGeneration(0);
    const store = createMobileSyncDataStore(base);
    const source = {
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceKind: "aidoku" as const,
      sourceId: "en.example",
      name: "Example",
      version: 1,
      updatedAt: 100,
      removed: false,
    };

    const writes = (async () => {
      await store.saveInstalledSource(source);
      await store.saveInstalledSourceIfCurrent?.(
        { ...source, name: "Example hydrated", updatedAt: 101 },
        source.updatedAt,
      );
      await store.saveLibraryItem(libraryItem());
      await store.saveSourceLink(sourceLink());
      await store.saveChapterProgress(chapterProgress());
      await store.saveChapterProgressBatch([
        chapterProgress({
          id: makeChapterProgressId(
            "aidoku-community",
            "en.example",
            "manga-1",
            "chapter-3",
          ),
          sourceChapterId: "chapter-3",
          chapterNumber: 3,
          updatedAt: 12,
        }),
      ]);
      await store.saveCollection(collection());
      await store.addCollectionItems("favorites", ["library-1"]);
      await store.removeCollectionItems("favorites", ["library-1"]);
      await store.removeSourceLink(
        sourceLink().registryId,
        sourceLink().sourceId,
        sourceLink().sourceMangaId,
      );
      await store.removeLibraryItem("library-1");
      await store.removeCollection("favorites");
      await store.removeInstalledSource(source.id, source.registryId);
      await retargetMobileCloudHistoryLibraryItem(
        "library-2",
        "library-1",
        undefined,
        store,
      );
      return "resolved" as const;
    })();
    const outcome = await Promise.race([
      writes,
      new Promise<"timeout">((resolve) =>
        setTimeout(() => resolve("timeout"), 100),
      ),
    ]);

    expect(outcome).toBe("resolved");
    expect(calls.length).toBeGreaterThan(0);
    expect(
      (await store.getSyncSettings()).installedSources.find(
        (item) => item.id === source.id,
      ),
    ).toMatchObject({ removed: true });
    expect(
      (await store.getAllLibraryItems({ includeRemoved: true })).find(
        (item) => item.libraryItemId === "library-1",
      ),
    ).toMatchObject({ inLibrary: false });
    expect(
      (await store.getAllSourceLinks({ includeRemoved: true })).find(
        (item) => item.id === sourceLink().id,
      ),
    ).toMatchObject({ removed: true });
    expect(await store.getChapterProgress(
      "aidoku-community",
      "en.example",
      "manga-1",
      "chapter-3",
    )).not.toBeNull();
    expect(store.getPendingSyncDeletions).toBeDefined();
    expect(
      (await store.getPendingSyncDeletions!())
        .map((item) => item.kind)
        .sort(),
    ).toEqual(["collection", "source-link"]);
  });

  test("absorbs an immediate cloud rejection after the durable local write", async () => {
    const calls: MutationCall[] = [];
    installConvexTransport(calls, () =>
      Promise.reject(new Error("backend detail must stay out of foreground UI")),
    );
    const store = createInitializedSyncStore();

    await expect(store.saveChapterProgress(chapterProgress())).resolves.toBeUndefined();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toHaveLength(1);
    expect(await store.getChapterProgress(
      "aidoku-community",
      "en.example",
      "manga-1",
      "chapter-2",
    )).not.toBeNull();
  });

  test("does not let stale package hydration revive an uninstall tombstone", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();
    const source = {
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceKind: "aidoku" as const,
      sourceId: "en.example",
      name: "Example",
      version: 1,
      updatedAt: 100,
      removed: false,
    };

    await store.saveInstalledSource(source);
    await store.removeInstalledSource(source.id, source.registryId);
    const tombstone = (await store.getSyncSettings()).installedSources.find(
      (item) => item.id === source.id,
    );
    expect(tombstone?.removed).toBe(true);

    await store.saveInstalledSource({
      ...source,
      packageUri: "file:///cache/stale.aix",
      packageCacheKey: "aix:stale",
      updatedAt: tombstone?.updatedAt,
    });
    await expect(
      store.saveInstalledSourceIfCurrent?.(
        {
          ...source,
          packageUri: "file:///cache/stale.aix",
          packageCacheKey: "aix:stale",
          updatedAt: (tombstone?.updatedAt ?? 0) + 1,
        },
        source.updatedAt,
      ),
    ).resolves.toBe(false);

    expect(await store.getInstalledSource(source.id)).toBeNull();
    expect(
      (await store.getSyncSettings()).installedSources.find(
        (item) => item.id === source.id,
      ),
    ).toEqual(tombstone);
    expect(calls).toHaveLength(2);
  });

  test("allows an explicit reinstall whose clock wins over the tombstone", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();
    const source = {
      id: "custom-aidoku:en.example",
      registryId: "custom-aidoku",
      sourceKind: "aidoku" as const,
      sourceId: "en.example",
      name: "Example",
      version: 1,
      updatedAt: 100,
      removed: false,
    };

    await store.saveInstalledSource(source);
    await store.removeInstalledSource(source.id, source.registryId);
    const tombstone = (await store.getSyncSettings()).installedSources.find(
      (item) => item.id === source.id,
    );
    expect(tombstone?.removed).toBe(true);

    await store.saveInstalledSource({
      ...source,
      packageUri: "file:///cache/reinstalled.aix",
      packageCacheKey: "aix:reinstalled",
      updatedAt: (tombstone?.updatedAt ?? 0) + 1,
    });

    expect(await store.getInstalledSource(source.id)).toMatchObject({
      removed: false,
      packageCacheKey: "aix:reinstalled",
    });
    expect(calls).toHaveLength(3);
    expect(calls.at(-1)?.args).toMatchObject({
      source: {
        id: source.id,
        removed: false,
      },
    });
  });

  test("CAS hydration does not overwrite a newer active source revision", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();
    const source = {
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceKind: "aidoku" as const,
      sourceId: "en.example",
      name: "Example v1",
      version: 1,
      updatedAt: 100,
      removed: false,
    };

    await store.saveInstalledSource(source);
    await store.saveInstalledSource({
      ...source,
      name: "Example v2",
      version: 2,
      updatedAt: 200,
    });

    await expect(
      store.saveInstalledSourceIfCurrent?.(
        {
          ...source,
          packageUri: "file:///cache/stale.aix",
          packageCacheKey: "aix:stale",
          updatedAt: 201,
        },
        source.updatedAt,
      ),
    ).resolves.toBe(false);

    expect(await store.getInstalledSource(source.id)).toMatchObject({
      name: "Example v2",
      version: 2,
      updatedAt: 200,
    });
    expect(calls).toHaveLength(2);
  });

  test("CAS hydration persists and syncs while its active revision is current", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();
    const source = {
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceKind: "aidoku" as const,
      sourceId: "en.example",
      name: "Example",
      version: 1,
      updatedAt: 100,
      removed: false,
    };

    await store.saveInstalledSource(source);
    await expect(
      store.saveInstalledSourceIfCurrent?.(
        {
          ...source,
          packageUri: "file:///cache/current.aix",
          packageCacheKey: "aix:current",
          updatedAt: 101,
        },
        source.updatedAt,
      ),
    ).resolves.toBe(true);

    expect(await store.getInstalledSource(source.id)).toMatchObject({
      packageUri: "file:///cache/current.aix",
      packageCacheKey: "aix:current",
      updatedAt: 101,
    });
    expect(calls).toHaveLength(2);
  });

  test("derives manga progress from chapter progress like web history saves", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();

    await store.saveChapterProgress(chapterProgress());

    expect(await store.getMangaProgress()).toEqual([
      {
        id: "aidoku-community:en.example:manga-1",
        registryId: "aidoku-community",
        sourceId: "en.example",
        sourceMangaId: "manga-1",
        libraryItemId: "library-1",
        lastReadAt: 10,
        lastReadSourceChapterId: "chapter-2",
        lastReadChapterNumber: 2,
        lastReadVolumeNumber: 1,
        lastReadChapterTitle: "Second",
        updatedAt: 11,
      },
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toMatchObject({
      registryId: "aidoku-community",
      sourceId: "en.example",
      sourceMangaId: "manga-1",
      sourceChapterId: "chapter-2",
      progress: 4,
      total: 12,
      completed: false,
      lastReadAt: 10,
      chapterNumber: 2,
      volumeNumber: 1,
      chapterTitle: "Second",
    });
  });

  test("negotiates intra-page fields across an older backend rollout", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();
    const intraPageContentIdentity =
      `mobile-image:reader-page-state-v1:${"a".repeat(64)}`;
    const readerProgress = chapterProgress({
      intraPageProgress: 0.625,
      intraPageContentIdentity,
    });

    expect(mobileChapterProgressIntraPageSyncSupportedRef.current).toBe(false);
    await store.saveChapterProgress(readerProgress);
    expect(calls[0]?.args).not.toHaveProperty("intraPageProgress");
    expect(calls[0]?.args).not.toHaveProperty("intraPageContentIdentity");

    setMobileChapterProgressIntraPageSyncVersion(1);
    await store.saveChapterProgress({ ...readerProgress, updatedAt: 12 });
    expect(calls[1]?.args).toMatchObject({
      intraPageProgress: 0.625,
      intraPageContentIdentity,
    });
  });

  test("keeps newer manga progress when saving an older chapter progress row", async () => {
    const store = createInitializedSyncStore();

    await store.saveMangaProgress({
      id: "aidoku-community:en.example:manga-1",
      registryId: "aidoku-community",
      sourceId: "en.example",
      sourceMangaId: "manga-1",
      libraryItemId: "library-1",
      lastReadAt: 50,
      lastReadSourceChapterId: "chapter-9",
      lastReadChapterNumber: 9,
      updatedAt: 50,
    });
    await store.saveChapterProgress(
      chapterProgress({ lastReadAt: 10, updatedAt: 11 }),
    );

    expect((await store.getMangaProgress())[0]).toMatchObject({
      lastReadAt: 50,
      lastReadSourceChapterId: "chapter-9",
      lastReadChapterNumber: 9,
    });
  });

  test("syncs the saved high-water chapter progress row to cloud", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();

    await store.saveChapterProgress(
      chapterProgress({
        progress: 8,
        total: 10,
        completed: true,
        lastReadAt: 80,
        updatedAt: 80,
      }),
    );
    await store.saveChapterProgress(
      chapterProgress({
        progress: 3,
        total: 12,
        completed: false,
        lastReadAt: 30,
        updatedAt: 30,
      }),
    );

    expect(calls).toHaveLength(2);
    expect(calls[1]?.args).toMatchObject({
      progress: 8,
      total: 12,
      completed: true,
      lastReadAt: 80,
    });
  });

  test("derives manga progress and syncs cloud history for chapter progress batches", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();

    await store.saveChapterProgressBatch([
      chapterProgress({
        sourceChapterId: "chapter-1",
        id: makeChapterProgressId(
          "aidoku-community",
          "en.example",
          "manga-1",
          "chapter-1",
        ),
        progress: 2,
        total: 12,
        lastReadAt: 20,
        chapterNumber: 1,
        chapterTitle: "First",
        updatedAt: 21,
      }),
      chapterProgress({
        sourceChapterId: "chapter-4",
        id: makeChapterProgressId(
          "aidoku-community",
          "en.example",
          "manga-1",
          "chapter-4",
        ),
        progress: 9,
        total: 12,
        completed: true,
        lastReadAt: 40,
        chapterNumber: 4,
        chapterTitle: "Fourth",
        updatedAt: 41,
      }),
    ]);

    expect(await store.getMangaProgress()).toEqual([
      {
        id: "aidoku-community:en.example:manga-1",
        registryId: "aidoku-community",
        sourceId: "en.example",
        sourceMangaId: "manga-1",
        libraryItemId: "library-1",
        lastReadAt: 40,
        lastReadSourceChapterId: "chapter-4",
        lastReadChapterNumber: 4,
        lastReadVolumeNumber: 1,
        lastReadChapterTitle: "Fourth",
        updatedAt: 41,
      },
    ]);
    expect(calls).toHaveLength(2);
    expect(calls[0]?.args).toMatchObject({
      sourceChapterId: "chapter-1",
      progress: 2,
      lastReadAt: 20,
      chapterTitle: "First",
    });
    expect(calls[1]?.args).toMatchObject({
      sourceChapterId: "chapter-4",
      progress: 9,
      completed: true,
      lastReadAt: 40,
      chapterTitle: "Fourth",
    });
  });

  test("keeps newer manga progress when batching older chapter progress rows", async () => {
    const store = createInitializedSyncStore();

    await store.saveMangaProgress({
      id: "aidoku-community:en.example:manga-1",
      registryId: "aidoku-community",
      sourceId: "en.example",
      sourceMangaId: "manga-1",
      libraryItemId: "library-1",
      lastReadAt: 80,
      lastReadSourceChapterId: "chapter-8",
      lastReadChapterNumber: 8,
      updatedAt: 80,
    });
    await store.saveChapterProgressBatch([
      chapterProgress({ lastReadAt: 10, updatedAt: 11 }),
    ]);

    expect((await store.getMangaProgress())[0]).toMatchObject({
      lastReadAt: 80,
      lastReadSourceChapterId: "chapter-8",
      lastReadChapterNumber: 8,
    });
  });

  test("does not sync orphan collection memberships", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();

    await store.addCollectionItems("missing", ["library-1"]);

    expect(await store.getCollectionItems()).toEqual([]);
    expect(calls).toHaveLength(0);
  });

  test("retargets cloud history when a mobile merge removes a library item", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();

    await retargetMobileCloudHistoryLibraryItem(
      "library-2",
      "library-1",
      undefined,
      store,
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual({
      expectedUserId: "account-a",
      sourceLibraryItemId: "library-2",
      targetLibraryItemId: "library-1",
      updatedAt: expect.any(Number),
      generation: 0,
    });
  });

  test("skips cloud history retargets without an actionable merge target", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();

    await retargetMobileCloudHistoryLibraryItem(
      "library-1",
      "library-1",
      undefined,
      store,
    );
    mobileIsAuthenticatedRef.current = false;
    await retargetMobileCloudHistoryLibraryItem(
      "library-2",
      "library-1",
      undefined,
      store,
    );

    expect(calls).toHaveLength(0);
  });

  test("syncs collection memberships only after the collection exists", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();

    await store.saveCollection(collection());
    await store.addCollectionItems("favorites", ["library-1"]);

    expect(
      (await store.getCollectionItems()).map((item) => item.libraryItemId),
    ).toEqual(["library-1"]);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.args).toEqual({
      expectedUserId: "account-a",
      collectionId: "favorites",
      libraryItemIds: ["library-1"],
      updatedAt: expect.any(Number),
      generation: 0,
    });
  });

  test("chunks large collection membership writes with one stable logical clock", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();
    await store.saveCollection(collection());
    const ids = Array.from({ length: 600 }, (_, index) => `library-${index}`);

    await store.addCollectionItems("favorites", ids);

    const membershipCalls = calls.slice(1);
    expect(membershipCalls.map((call) =>
      (call.args as { libraryItemIds: string[] }).libraryItemIds.length,
    )).toEqual([256, 256, 88]);
    expect(new Set(membershipCalls.map((call) =>
      (call.args as { updatedAt: number }).updatedAt,
    )).size).toBe(1);
  });

  test("does not push installed-source snapshot writes back to Convex", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();

    await store.applyInstalledSourcesSnapshot!([
      {
        id: "aidoku-community:en.example",
        registryId: "aidoku-community",
        version: 1,
      },
    ]);

    expect(calls).toHaveLength(0);
    expect(
      (await store.getInstalledSources()).map((source) => source.id),
    ).toEqual(["aidoku-community:en.example"]);
  });

  test("does not push chapter progress snapshots back to Convex", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();

    await store.applyChapterProgressSnapshot!([chapterProgress()]);

    expect(calls).toHaveLength(0);
    expect(
      (await store.getAllChapterProgress()).map((entry) => entry.id),
    ).toEqual(["aidoku-community:en.example:manga-1:chapter-2"]);
  });

  test("does not push local writes while mobile sync is suspended", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();

    await runWithMobileSyncSuspended(async () => {
      await store.saveInstalledSource({
        id: "aidoku-community:en.example",
        registryId: "aidoku-community",
        sourceId: "en.example",
        version: 1,
      });
      await store.saveLibraryItem(libraryItem());
      await store.saveSourceLink(sourceLink());
      await store.saveChapterProgress(chapterProgress());
    });

    expect(calls).toHaveLength(0);
    expect(
      (await store.getInstalledSources()).map((source) => source.id),
    ).toEqual(["aidoku-community:en.example"]);
    expect((await store.getAllSourceLinks()).map((link) => link.id)).toEqual([
      "aidoku-community:en.example:manga-1",
    ]);
  });

  test("saveSettings never pushes installed sources to the replace-semantics cloud mutation", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();

    await store.saveSettings({
      ...(await store.getSettings()),
      installedSources: [
        {
          id: "aidoku-community:en.example",
          registryId: "aidoku-community",
          sourceId: "en.example",
          version: 1,
        },
      ],
    });

    // getSettings() filters tombstones, so a bulk settings.save push would
    // wipe uninstall tombstones from the cloud on every settings toggle.
    expect(calls).toHaveLength(0);
  });

  test("does not push a source link for a tombstoned library item", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();

    await store.saveLibraryItem({ ...libraryItem(), inLibrary: false });
    await store.saveSourceLink(sourceLink());

    // library.save unconditionally flips inLibrary back to true in the cloud,
    // which would resurrect the manga in every device's library.
    expect(calls).toHaveLength(0);
  });

  test("snapshot applies write locally without pushing back to Convex", async () => {
    const calls: MutationCall[] = [];
    installConvexRecorder(calls);
    const store = createInitializedSyncStore();

    const winners = await store.applyLibrarySnapshot!(
      [libraryItem()],
      [sourceLink()],
    );
    await store.applyChapterProgressSnapshot!([chapterProgress()]);

    expect(calls).toHaveLength(0);
    expect(winners.localItemsToPush).toHaveLength(0);
    expect((await store.getAllLibraryItems()).map((item) => item.libraryItemId)).toEqual([
      "library-1",
    ]);
    expect((await store.getAllChapterProgress()).map((row) => row.id)).toEqual([
      chapterProgress().id,
    ]);
  });
});
