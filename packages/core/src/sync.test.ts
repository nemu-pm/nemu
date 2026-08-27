import { describe, expect, test } from "bun:test";
import {
  areSyncAccountIdentitiesAligned,
  chapterProgressNeedsPush,
  chunkChapterProgressSaveInputs,
  chunkCollectionMutationItems,
  MAX_CHAPTER_PROGRESS_SAVE_BATCH_ITEMS,
  MAX_LIBRARY_SOURCE_LINKS_PER_MUTATION,
  MAX_COLLECTION_MUTATION_ITEMS,
  makeChapterProgressId,
  makeCollectionItemId,
  makeSourceLinkId,
  mapCloudChapterProgress,
  mapCloudLibraryItems,
  mapCloudMangaProgress,
  mapCloudSourceLinks,
  mangaProgressFromChapterProgress,
  mergeChapterProgressForSave,
  mergeChapterProgressSnapshot,
  mergeCollectionSnapshot,
  mergeInstalledSources,
  mergeLibrarySnapshot,
  mergeMangaProgressForSave,
  mergeMangaProgressSnapshot,
  nextSyncTimestamp,
  toCloudHistorySaveInput,
  toCloudInstalledSource,
  toCloudLibrarySaveInput,
  toCloudLibrarySaveInputBatches,
  type InstalledSource,
  type LocalChapterProgress,
  type LocalCollection,
  type LocalCollectionItem,
  type LocalLibraryItem,
  type LocalSourceLink,
} from "./sync";

describe("collection mutation batching", () => {
  test("deduplicates and splits large selections below the server transaction bound", () => {
    const ids = Array.from({ length: 2_048 }, (_, index) => `item-${index}`);
    ids.push("item-0", "item-1");
    const chunks = chunkCollectionMutationItems(ids);

    expect(chunks).toHaveLength(8);
    expect(chunks.every((chunk) => chunk.length <= MAX_COLLECTION_MUTATION_ITEMS)).toBe(true);
    expect(chunks.flat()).toHaveLength(2_048);
    expect(new Set(chunks.flat()).size).toBe(2_048);
  });

  test("keeps 10k-item planning linear and bounded", () => {
    const chunks = chunkCollectionMutationItems(
      Array.from({ length: 10_000 }, (_, index) => `item-${index}`),
    );
    expect(chunks).toHaveLength(Math.ceil(10_000 / MAX_COLLECTION_MUTATION_ITEMS));
    expect(chunks.at(-1)).toHaveLength(16);
  });
});

describe("chapter progress push batching", () => {
  test("splits a history push into server-sized transactions", () => {
    const inputs = Array.from({ length: 1_000 }, (_, index) => index);
    const chunks = chunkChapterProgressSaveInputs(inputs);

    expect(chunks).toHaveLength(
      Math.ceil(1_000 / MAX_CHAPTER_PROGRESS_SAVE_BATCH_ITEMS),
    );
    expect(
      chunks.every(
        (chunk) => chunk.length <= MAX_CHAPTER_PROGRESS_SAVE_BATCH_ITEMS,
      ),
    ).toBe(true);
    // Every row must survive exactly once and in order: a history push that
    // silently dropped rows would look like a successful sync.
    expect(chunks.flat()).toEqual(inputs);
  });

  test("produces no transactions for an empty push", () => {
    expect(chunkChapterProgressSaveInputs([])).toEqual([]);
  });

  test("keeps a push below the bound in a single transaction", () => {
    const inputs = Array.from(
      { length: MAX_CHAPTER_PROGRESS_SAVE_BATCH_ITEMS },
      (_, index) => index,
    );
    expect(chunkChapterProgressSaveInputs(inputs)).toEqual([inputs]);
  });
});

describe("library source mutation batching", () => {
  const item: LocalLibraryItem = {
    libraryItemId: "library",
    metadata: { title: "Library" },
    inLibrary: true,
    createdAt: 1,
    updatedAt: 2,
  };
  const link = (index: number): LocalSourceLink => ({
    id: `registry:source:${index}`,
    libraryItemId: item.libraryItemId,
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: String(index),
    createdAt: 1,
    updatedAt: 2,
  });

  test("splits merge fanout while preserving one logical item clock", () => {
    const links = Array.from({ length: 600 }, (_, index) => link(index));
    const batches = toCloudLibrarySaveInputBatches(item, links);
    expect(batches.map((batch) => batch.sources.length)).toEqual([256, 256, 88]);
    expect(
      batches.every(
        (batch) =>
          batch.updatedAt === item.updatedAt && batch.sourcesMode === "merge",
      ),
    ).toBe(true);
  });

  test("rejects a replace that cannot preserve complete-set semantics", () => {
    const links = Array.from(
      { length: MAX_LIBRARY_SOURCE_LINKS_PER_MUTATION + 1 },
      (_, index) => link(index),
    );
    expect(() =>
      toCloudLibrarySaveInputBatches(item, links, "replace"),
    ).toThrow("Library source replacement exceeds");
  });
});

describe("sync account identity", () => {
  test("allows only an exact non-empty session/server match", () => {
    expect(areSyncAccountIdentitiesAligned("account-a", "account-a")).toBe(true);
    expect(areSyncAccountIdentitiesAligned("account-a", "account-b")).toBe(false);
    expect(areSyncAccountIdentitiesAligned("account-a", undefined)).toBe(false);
    expect(areSyncAccountIdentitiesAligned(undefined, "account-a")).toBe(false);
  });
});

describe("nextSyncTimestamp", () => {
  test("advances beyond observed clocks when the wall clock moves backwards", () => {
    const originalNow = Date.now;
    Date.now = () => 100;
    try {
      expect(nextSyncTimestamp(500)).toBe(501);
    } finally {
      Date.now = originalNow;
    }
  });

  test("uses a newer wall clock and ignores invalid observations", () => {
    const originalNow = Date.now;
    Date.now = () => 700;
    try {
      expect(nextSyncTimestamp(undefined, null, Number.NaN, 500)).toBe(700);
    } finally {
      Date.now = originalNow;
    }
  });

  test("makes successive same-millisecond edits strictly monotonic", () => {
    const originalNow = Date.now;
    Date.now = () => 100;
    try {
      const first = nextSyncTimestamp(100);
      const second = nextSyncTimestamp(first);
      expect([first, second]).toEqual([101, 102]);
    } finally {
      Date.now = originalNow;
    }
  });
});

describe("progress logical clocks", () => {
  test("accepts a logically newer manga edit after the wall clock moves backwards", () => {
    const existing = {
      id: "manga",
      registryId: "registry",
      sourceId: "source",
      sourceMangaId: "manga",
      lastReadAt: 500,
      updatedAt: 500,
    };
    const incoming = {
      ...existing,
      lastReadAt: 100,
      lastReadSourceChapterId: "new-chapter",
      updatedAt: 501,
    };
    expect(mergeMangaProgressForSave(existing, incoming)).toBe(incoming);
  });

  test("keeps incoming cloud data authoritative on an equal logical clock", () => {
    const existing = {
      id: "manga",
      registryId: "registry",
      sourceId: "source",
      sourceMangaId: "manga",
      lastReadAt: 500,
      updatedAt: 500,
    };
    const incoming = { ...existing, lastReadSourceChapterId: "cloud" };
    expect(mergeMangaProgressForSave(existing, incoming)).toBe(incoming);
  });
});

type MobileInstalledSource = InstalledSource & {
  packageUri?: string | null;
  packageCacheKey?: string | null;
  packageMetadata?: {
    sourceId: string;
    name: string;
    version: number;
    listings: unknown[];
    filters: unknown[];
    settings: unknown[];
    hasWasm: boolean;
  } | null;
};

const MOBILE_INSTALLED_SOURCE_LOCAL_FIELDS = [
  "sourceKind",
  "sourceId",
  "name",
  "icon",
  "languages",
  "contentRating",
  "hasAuthentication",
  "hasCloudflare",
  "downloadUrl",
  "packageUri",
  "packageCacheKey",
  "packageMetadata",
] as const;

function libraryItem(libraryItemId: string, updatedAt: number): LocalLibraryItem {
  return {
    libraryItemId,
    metadata: { title: libraryItemId },
    inLibrary: true,
    createdAt: 1,
    updatedAt,
  };
}

function sourceLink(
  libraryItemId: string,
  sourceMangaId: string,
  updatedAt: number,
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
    updatedAt,
  };
}

function collection(collectionId: string, updatedAt: number): LocalCollection {
  return {
    collectionId,
    name: collectionId,
    createdAt: 1,
    updatedAt,
  };
}

function collectionItem(
  collectionId: string,
  libraryItemId: string,
  updatedAt: number,
  removed = false,
): LocalCollectionItem {
  return {
    collectionId,
    libraryItemId,
    addedAt: 1,
    updatedAt,
    removed,
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

describe("sync cloud mapping", () => {
  test("maps cloud library and source snapshots into local ids", () => {
    expect(
      mapCloudLibraryItems([
        {
          id: "library-1",
          metadata: { title: "Title" },
          createdAt: 1,
          updatedAt: 2,
        },
      ]),
    ).toEqual([
      {
        libraryItemId: "library-1",
        metadata: { title: "Title" },
        externalIds: undefined,
        inLibrary: true,
        overrides: undefined,
        sourceOrder: undefined,
        createdAt: 1,
        updatedAt: 2,
      },
    ]);

    expect(
      mapCloudSourceLinks([
        {
          libraryItemId: "library-1",
          registryId: "aidoku-community",
          sourceId: "en.example",
          sourceMangaId: "manga-1",
          latestChapterSortKey: "2",
          latestFetchedAt: 20,
          updateAckChapterSortKey: "1",
          updateAckAt: 15,
          createdAt: 1,
          updatedAt: 2,
        },
      ])[0],
    ).toMatchObject({
      id: "aidoku-community:en.example:manga-1",
      latestChapterSortKey: "2",
      latestFetchedAt: 20,
      updateAckChapterSortKey: "1",
      updateAckAt: 15,
    });
  });

  test("maps cloud progress snapshots into generated local ids", () => {
    expect(
      mapCloudChapterProgress([
        {
          registryId: "aidoku-community",
          sourceId: "en.example",
          sourceMangaId: "manga-1",
          sourceChapterId: "chapter-1",
          progress: 7,
          total: 10,
          completed: false,
          lastReadAt: 4,
          updatedAt: 5,
        },
      ])[0]?.id,
    ).toBe("aidoku-community:en.example:manga-1:chapter-1");

    expect(
      mapCloudMangaProgress([
        {
          registryId: "aidoku-community",
          sourceId: "en.example",
          sourceMangaId: "manga-1",
          lastReadAt: 4,
          updatedAt: 5,
        },
      ])[0]?.id,
    ).toBe("aidoku-community:en.example:manga-1");
  });
});

describe("sync cloud serialization", () => {
  test("serializes source links to Convex-safe chapter summaries", () => {
    expect(
      toCloudLibrarySaveInput(libraryItem("library-1", 2), [
        {
          ...sourceLink("library-1", "manga-1", 2),
          latestChapter: {
            id: "c2",
            title: "Latest",
            chapterNumber: 2,
            lang: "ja",
            dateUploaded: 1_700_000_000_000,
            locked: true,
          },
        },
      ]),
    ).toEqual({
      libraryItemId: "library-1",
      createdAt: 1,
      updatedAt: 2,
      metadata: { title: "library-1" },
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
          latestChapterSortKey: undefined,
          latestFetchedAt: undefined,
          updateAckChapter: undefined,
          updateAckChapterSortKey: undefined,
          updateAckAt: undefined,
          createdAt: 1,
          updatedAt: 2,
          removed: undefined,
        },
      ],
      sourcesMode: "merge",
    });
  });

  test("serializes installed sources without mobile package cache fields", () => {
    const source: MobileInstalledSource = {
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceKind: "aidoku",
      sourceId: "en.example",
      name: "Example",
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
    };

    expect(toCloudInstalledSource(source)).toEqual({
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceKind: "aidoku",
      sourceId: "en.example",
      name: "Example",
      icon: undefined,
      languages: undefined,
      contentRating: undefined,
      hasAuthentication: undefined,
      hasCloudflare: undefined,
      downloadUrl: undefined,
      version: 1,
      updatedAt: 2,
      removed: false,
    });
  });

  test("serializes history saves without local-only ids", () => {
    expect(toCloudHistorySaveInput(chapterProgress())).toEqual({
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
      updatedAt: 11,
    });
  });
});

describe("sync snapshot merge", () => {
  test("merges remote library snapshots without dropping newer local rows", () => {
    const localItem = libraryItem("local", 10);
    const cloudItem = libraryItem("cloud", 12);
    const sharedLocal = libraryItem("shared", 20);
    const sharedCloud = libraryItem("shared", 5);
    const localLink = sourceLink("local", "local-manga", 10);
    const cloudLink = sourceLink("cloud", "cloud-manga", 12);
    const sharedLocalLink = sourceLink("shared", "shared-manga", 20);
    const sharedCloudLink = sourceLink("shared", "shared-manga", 5);

    const merged = mergeLibrarySnapshot(
      [localItem, sharedLocal],
      [localLink, sharedLocalLink],
      [cloudItem, sharedCloud],
      [cloudLink, sharedCloudLink],
    );

    expect(merged.items.map((item) => item.libraryItemId).sort()).toEqual([
      "cloud",
      "local",
      "shared",
    ]);
    expect(merged.items.find((item) => item.libraryItemId === "shared")?.updatedAt).toBe(20);
    expect(merged.links.map((link) => link.id).sort()).toEqual([
      cloudLink.id,
      localLink.id,
      sharedLocalLink.id,
    ].sort());
    expect(merged.localItemsToPush.map((item) => item.libraryItemId).sort()).toEqual([
      "local",
      "shared",
    ]);
    expect(merged.localLinksToPush.map((link) => link.id).sort()).toEqual([
      localLink.id,
      sharedLocalLink.id,
    ].sort());
  });

  test("merges remote collection snapshots without orphan memberships", () => {
    const localCollection = collection("local", 10);
    const cloudCollection = collection("cloud", 12);
    const sharedLocal = collection("shared", 20);
    const sharedCloud = collection("shared", 5);
    const localMembership = collectionItem("local", "manga-1", 10);
    const orphanMembership = collectionItem("missing", "manga-2", 30);
    const cloudMembership = collectionItem("cloud", "manga-3", 12);

    const merged = mergeCollectionSnapshot(
      [localCollection, sharedLocal],
      [localMembership, orphanMembership],
      [cloudCollection, sharedCloud],
      [cloudMembership],
    );

    expect(merged.collections.map((entry) => entry.collectionId).sort()).toEqual([
      "cloud",
      "local",
      "shared",
    ]);
    expect(
      merged.collectionItems.map((item) =>
        makeCollectionItemId(item.collectionId, item.libraryItemId),
      ).sort(),
    ).toEqual([
      makeCollectionItemId("cloud", "manga-3"),
      makeCollectionItemId("local", "manga-1"),
    ]);
    expect(merged.localCollectionsToPush.map((entry) => entry.collectionId).sort()).toEqual([
      "local",
      "shared",
    ]);
    expect(merged.localCollectionItemsToPush).toEqual([localMembership]);
  });

  test("keeps collection membership tombstones for LWW convergence", () => {
    const collectionRecord = collection("shared", 1);
    const staleLocalMembership = collectionItem("shared", "manga-1", 10);
    const newerCloudTombstone = collectionItem("shared", "manga-1", 20, true);

    const cloudWins = mergeCollectionSnapshot(
      [collectionRecord],
      [staleLocalMembership],
      [collectionRecord],
      [newerCloudTombstone],
    );

    expect(cloudWins.collectionItems).toEqual([newerCloudTombstone]);
    expect(cloudWins.localCollectionItemsToPush).toEqual([]);

    const newerLocalTombstone = collectionItem("shared", "manga-1", 30, true);
    const staleCloudMembership = collectionItem("shared", "manga-1", 20);

    const localWins = mergeCollectionSnapshot(
      [collectionRecord],
      [newerLocalTombstone],
      [collectionRecord],
      [staleCloudMembership],
    );

    expect(localWins.collectionItems).toEqual([newerLocalTombstone]);
    expect(localWins.localCollectionItemsToPush).toEqual([newerLocalTombstone]);
  });

  test("converges newer source-link tombstones across devices", () => {
    const sharedItem = libraryItem("shared", 20);
    const activeLink = sourceLink("shared", "shared-manga", 10);
    const tombstone = { ...activeLink, removed: true, updatedAt: 30 };

    const merged = mergeLibrarySnapshot(
      [sharedItem],
      [activeLink],
      [sharedItem],
      [tombstone],
    );

    expect(merged.links).toEqual([tombstone]);
    expect(merged.localLinksToPush).toEqual([]);
  });

  test("converges newer collection tombstones across devices", () => {
    const activeCollection = collection("shared", 10);
    const tombstone = { ...activeCollection, removed: true, updatedAt: 30 };

    const merged = mergeCollectionSnapshot(
      [activeCollection],
      [],
      [tombstone],
      [],
    );

    expect(merged.collections).toEqual([tombstone]);
    expect(merged.localCollectionsToPush).toEqual([]);
  });
});

describe("installed source merge", () => {
  test("merges installed sources by last-write-wins with cloud authority on ties", () => {
    expect(
      mergeInstalledSources(
        [
          { id: "local-newer", registryId: "r", version: 1, updatedAt: 3 },
          { id: "cloud-newer", registryId: "r", version: 1, updatedAt: 1 },
          { id: "same-time", registryId: "r", version: 3, updatedAt: 2 },
          { id: "equal-cloud-wins", registryId: "r", version: 9, updatedAt: 2 },
          { id: "local-only", registryId: "r", version: 1, updatedAt: 1 },
        ],
        [
          { id: "local-newer", registryId: "r", version: 1, updatedAt: 1 },
          { id: "cloud-newer", registryId: "r", version: 1, updatedAt: 3 },
          { id: "same-time", registryId: "r", version: 4, updatedAt: 2 },
          { id: "equal-cloud-wins", registryId: "r", version: 1, updatedAt: 2 },
          { id: "cloud-only", registryId: "r", version: 1, updatedAt: 1 },
        ],
      ).map((source) => [source.id, source.version]),
    ).toEqual([
      ["local-newer", 1],
      ["cloud-newer", 1],
      ["same-time", 4],
      ["equal-cloud-wins", 1],
      ["local-only", 1],
      ["cloud-only", 1],
    ]);
  });

  test("preserves the default source kind when newer cloud records predate it", () => {
    const [merged] = mergeInstalledSources<InstalledSource, InstalledSource>(
      [
        {
          id: "tachiyomi-community:en.example",
          registryId: "tachiyomi-community",
          sourceId: "en.example",
          sourceKind: "tachiyomi",
          version: 1,
          updatedAt: 100,
        },
      ],
      [
        {
          id: "tachiyomi-community:en.example",
          registryId: "tachiyomi-community",
          sourceId: "en.example",
          version: 2,
          updatedAt: 200,
        },
      ],
    );

    expect(merged).toMatchObject({
      sourceKind: "tachiyomi",
      version: 2,
      updatedAt: 200,
    });
  });

  test("preserves configured local-only source fields when cloud metadata wins", () => {
    const [merged] = mergeInstalledSources<MobileInstalledSource, InstalledSource>(
      [
        {
          id: "aidoku-community:en.example",
          registryId: "aidoku-community",
          sourceKind: "aidoku",
          sourceId: "en.example",
          name: "Example",
          hasAuthentication: true,
          hasCloudflare: true,
          downloadUrl: "https://example.com/source.aix",
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
          updatedAt: 1,
        },
      ],
      [
        {
          id: "aidoku-community:en.example",
          registryId: "aidoku-community",
          sourceKind: "aidoku",
          sourceId: "en.example",
          name: "Example from Cloud",
          languages: ["en"],
          hasAuthentication: false,
          hasCloudflare: false,
          downloadUrl: "https://example.com/source-v2.aix",
          version: 2,
          updatedAt: 3,
        },
      ],
      { preserveLocalFields: MOBILE_INSTALLED_SOURCE_LOCAL_FIELDS },
    );

    expect(merged).toMatchObject({
      id: "aidoku-community:en.example",
      version: 2,
      sourceKind: "aidoku",
      sourceId: "en.example",
      name: "Example from Cloud",
      languages: ["en"],
      hasAuthentication: false,
      hasCloudflare: false,
      downloadUrl: "https://example.com/source-v2.aix",
      packageUri: "file:///cache/example.aix",
      packageCacheKey: "aix:aidoku-community:en.example",
      packageMetadata: { sourceId: "en.example", version: 1 },
    });
  });

  test("keeps tombstones minimal when cloud uninstall wins", () => {
    const [merged] = mergeInstalledSources<InstalledSource, InstalledSource>(
      [
        {
          id: "tachiyomi-community:en.example",
          registryId: "tachiyomi-community",
          sourceId: "en.example",
          sourceKind: "tachiyomi",
          version: 1,
          updatedAt: 100,
        },
      ],
      [
        {
          id: "tachiyomi-community:en.example",
          registryId: "tachiyomi-community",
          version: 0,
          updatedAt: 200,
          removed: true,
        },
      ],
    );

    expect(merged?.removed).toBe(true);
    expect(merged?.sourceKind).toBeUndefined();
  });
});

describe("progress helpers", () => {
  test("derives manga progress from chapter progress", () => {
    expect(mangaProgressFromChapterProgress(chapterProgress())).toEqual({
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
    });
  });

  test("merges chapter progress with high-water semantics", () => {
    expect(
      mergeChapterProgressForSave(
        chapterProgress({ progress: 8, total: 10, completed: true, lastReadAt: 80, updatedAt: 80 }),
        chapterProgress({ progress: 3, total: 12, completed: false, lastReadAt: 30, updatedAt: 30 }),
      ),
    ).toMatchObject({
      progress: 8,
      total: 12,
      completed: true,
      lastReadAt: 80,
      updatedAt: 80,
    });
  });

  test("backfills metadata the cloud row is missing instead of erasing it", () => {
    // The cloud row wins ownership at an equal clock, but "wins" must not mean
    // "overwrites with nothing": the server backfills the same way on receipt,
    // so dropping the local title here diverged the two sides permanently.
    const merged = mergeChapterProgressForSave(
      chapterProgress({
        chapterNumber: 2,
        volumeNumber: 1,
        chapterTitle: "Second",
        updatedAt: 100,
      }),
      chapterProgress({
        chapterNumber: undefined,
        volumeNumber: undefined,
        chapterTitle: undefined,
        updatedAt: 100,
      }),
    );
    expect(merged.chapterTitle).toBe("Second");
    expect(merged.chapterNumber).toBe(2);
    expect(merged.volumeNumber).toBe(1);
  });

  test("keeps the cloud row's metadata authoritative at an equal clock", () => {
    const merged = mergeChapterProgressForSave(
      chapterProgress({ chapterTitle: "local", updatedAt: 100 }),
      chapterProgress({ chapterTitle: "cloud", updatedAt: 100 }),
    );
    expect(merged.chapterTitle).toBe("cloud");
  });

  test("keeps a local library link a cloud row has not resolved yet", () => {
    const merged = mergeChapterProgressForSave(
      chapterProgress({ libraryItemId: "library-1", updatedAt: 100 }),
      chapterProgress({ libraryItemId: undefined, updatedAt: 200 }),
    );
    expect(merged.libraryItemId).toBe("library-1");
  });

  test("re-pushes metadata the cloud row is missing", () => {
    // Without this the backfill only ever lives locally and every convergence
    // check reports success while the two sides stay different forever.
    const cloud = chapterProgress({ chapterTitle: undefined, updatedAt: 100 });
    const local = chapterProgress({ chapterTitle: "Second", updatedAt: 100 });
    expect(chapterProgressNeedsPush(local, cloud)).toBe(true);
    expect(chapterProgressNeedsPush(local, local)).toBe(false);
  });

  test("does not push when only the cloud row has extra metadata", () => {
    const local = chapterProgress({ chapterTitle: undefined, updatedAt: 100 });
    const cloud = chapterProgress({ chapterTitle: "Second", updatedAt: 100 });
    expect(chapterProgressNeedsPush(local, cloud)).toBe(false);
  });

  test("plans a 10k unchanged snapshot with zero writes or winner pushes", () => {
    const existing = Array.from({ length: 10_000 }, (_, index) =>
      chapterProgress({
        id: `progress-${index}`,
        sourceChapterId: `chapter-${index}`,
      }),
    );
    const chapterResult = mergeChapterProgressSnapshot(
      existing,
      existing.map((entry) => ({ ...entry })),
    );
    const mangaExisting = existing.map((entry) => ({
      id: `manga-${entry.sourceChapterId}`,
      registryId: entry.registryId,
      sourceId: entry.sourceId,
      sourceMangaId: entry.sourceChapterId,
      lastReadAt: entry.lastReadAt,
      updatedAt: entry.updatedAt,
    }));
    const mangaResult = mergeMangaProgressSnapshot(
      mangaExisting,
      mangaExisting.map((entry) => ({ ...entry })),
    );

    expect(chapterResult.progress).toHaveLength(10_000);
    expect(chapterResult.changed).toHaveLength(0);
    expect(chapterResult.localWinners).toHaveLength(0);
    expect(mangaResult.progress).toHaveLength(10_000);
    expect(mangaResult.changed).toHaveLength(0);
    expect(mangaResult.localWinners).toHaveLength(0);
  });
});
