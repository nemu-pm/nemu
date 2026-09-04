import { describe, expect, test } from "bun:test";
import {
  entryHasAnyUpdate,
  getEntryTitle,
  makeMangaProgressId,
  makeSourceLinkId,
  type LibraryEntry,
  type LocalMangaProgress,
  type LocalSourceLink,
} from "@/data/schema";
import {
  buildMobileEntryProgressMap,
  buildMobileLibraryEntryProgressMaps,
  buildMobileProgressIndex,
  getMobileCollectionBookSubtitle,
  getMobileEntryMostRecentSource,
  getMobileLibraryEmptyState,
  getMobileEntryAddedAt,
  getMobileLibraryProgressInfo,
  paginateMobileLibraryMergeCandidates,
  shouldRenderMobileLibrarySkeleton,
  shouldShowMobileLibraryEmptyOnboarding,
  shouldShowMobileLibraryLoadError,
  sortMobileLibraryEntries,
  sortMobileLibraryMergeCandidates,
} from "./mobileLibraryPresentation";
import { getMobileStrings } from "./mobileI18n";

const en = getMobileStrings("en");
const zh = getMobileStrings("zh");
const ja = getMobileStrings("ja");

function sourceLink(
  sourceMangaId: string,
  overrides: Partial<LocalSourceLink> = {}
): LocalSourceLink {
  const registryId = "aidoku-community";
  const sourceId = "en.example";
  return {
    id: makeSourceLinkId(registryId, sourceId, sourceMangaId),
    libraryItemId: "item",
    registryId,
    sourceId,
    sourceMangaId,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function entry(
  libraryItemId: string,
  createdAt: number,
  sources: LocalSourceLink[],
  title = libraryItemId,
  authors?: string[]
): LibraryEntry {
  return {
    item: {
      libraryItemId,
      metadata: { title, authors },
      inLibrary: true,
      createdAt,
      updatedAt: createdAt,
    },
    sources: sources.map((source) => ({ ...source, libraryItemId })),
  };
}

function progress(
  sourceMangaId: string,
  lastReadAt: number,
  chapterId = "c2"
): LocalMangaProgress {
  const registryId = "aidoku-community";
  const sourceId = "en.example";
  return {
    id: makeMangaProgressId(registryId, sourceId, sourceMangaId),
    registryId,
    sourceId,
    sourceMangaId,
    libraryItemId: sourceMangaId,
    lastReadAt,
    lastReadSourceChapterId: chapterId,
    lastReadChapterNumber: Number(chapterId.slice(1)),
    updatedAt: lastReadAt,
  };
}

describe("mobile library presentation", () => {
  test("sorts updated entries before recent reading and added time", () => {
    const updated = entry("updated", 10, [
      sourceLink("updated", {
        latestChapter: { id: "c5", chapterNumber: 5 },
        updateAckChapter: { id: "c3", chapterNumber: 3 },
      }),
    ]);
    const recentlyRead = entry("recent", 20, [sourceLink("recent")]);
    const newestAdded = entry("newest", 90, [sourceLink("newest")]);
    const progressIndex = buildMobileProgressIndex([progress("recent", 100)]);

    expect(
      sortMobileLibraryEntries([newestAdded, recentlyRead, updated], progressIndex).map(
        (item) => item.item.libraryItemId
      )
    ).toEqual(["updated", "recent", "newest"]);
  });

  test("sorts merge candidates like the web add-source drawer", () => {
    const current = entry("current", 1, [sourceLink("current")], "Blue Lock");
    const likelyRecent = entry("likely-recent", 20, [sourceLink("likely-recent")], "Blue Lock Spinoff");
    const likelyUpdated = entry(
      "likely-updated",
      10,
      [
        sourceLink("likely-updated", {
          latestChapter: { id: "c5", chapterNumber: 5 },
          updateAckChapter: { id: "c3", chapterNumber: 3 },
        }),
      ],
      "Blue Lock"
    );
    const unrelatedUpdated = entry(
      "unrelated-updated",
      200,
      [
        sourceLink("unrelated-updated", {
          latestChapter: { id: "c8", chapterNumber: 8 },
          updateAckChapter: { id: "c1", chapterNumber: 1 },
        }),
      ],
      "Kingdom"
    );
    const unrelatedRecent = entry(
      "unrelated-recent",
      30,
      [sourceLink("unrelated-recent")],
      "Vagabond"
    );
    const progressIndex = buildMobileProgressIndex([
      progress("likely-recent", 500),
      progress("unrelated-recent", 900),
    ]);

    expect(
      sortMobileLibraryMergeCandidates(
        current,
        [
          unrelatedRecent,
          unrelatedUpdated,
          likelyRecent,
          likelyUpdated,
          current,
        ],
        progressIndex
      ).map(({ entry }) => entry.item.libraryItemId)
    ).toEqual([
      "likely-updated",
      "likely-recent",
      "unrelated-updated",
      "unrelated-recent",
    ]);
  });

  test("pages through every merge candidate without dropping later matches", () => {
    const candidates = Array.from({ length: 19 }, (_, index) => ({
      id: `candidate-${index + 1}`,
    }));

    const firstPage = paginateMobileLibraryMergeCandidates(candidates, 0, 8);
    const lastPage = paginateMobileLibraryMergeCandidates(candidates, 2, 8);

    expect(firstPage).toMatchObject({
      page: 0,
      totalPages: 3,
    });
    expect(firstPage.items.map((item) => item.id)).toEqual([
      "candidate-1",
      "candidate-2",
      "candidate-3",
      "candidate-4",
      "candidate-5",
      "candidate-6",
      "candidate-7",
      "candidate-8",
    ]);
    expect(lastPage).toMatchObject({
      page: 2,
      totalPages: 3,
    });
    expect(lastPage.items.map((item) => item.id)).toEqual([
      "candidate-17",
      "candidate-18",
      "candidate-19",
    ]);
  });

  test("clamps merge candidate pages to available results", () => {
    const candidates = [{ id: "one" }, { id: "two" }];

    expect(
      paginateMobileLibraryMergeCandidates(candidates, -4, 8).page,
    ).toBe(0);
    expect(
      paginateMobileLibraryMergeCandidates(candidates, 7, 1).page,
    ).toBe(1);
    expect(
      paginateMobileLibraryMergeCandidates(candidates, Number.NaN, 8).page,
    ).toBe(0);
  });

  test("formats progress subtitle against latest chapter", () => {
    const item = entry("read", 10, [
      sourceLink("read", {
        latestChapter: { id: "c5", chapterNumber: 5 },
      }),
    ]);
    const progressIndex = buildMobileProgressIndex([progress("read", 100, "c2")]);

    expect(getMobileLibraryProgressInfo(item, progressIndex, en)).toMatchObject({
      subtitle: "Ch.2 / Ch.5",
    });
  });

  test("selects the most recently read source for continue actions", () => {
    const older = sourceLink("older");
    const newer = sourceLink("newer");
    const item = entry("multi-source", 10, [older, newer]);
    const progressIndex = buildMobileProgressIndex([
      progress("older", 100, "c2"),
      progress("newer", 200, "c4"),
    ]);
    const entryProgress = buildMobileEntryProgressMap(item, progressIndex);

    expect(getMobileEntryMostRecentSource(item, entryProgress)?.id).toBe(newer.id);
  });

  test("matches progress saved under an installed source alias", () => {
    const aliasSource = sourceLink("read", {
      id: makeSourceLinkId("aidoku-community", "registry-id", "read"),
      sourceId: "registry-id",
      latestChapter: { id: "c5", chapterNumber: 5 },
    });
    const item = entry("book", 10, [aliasSource]);
    const aliasProgress = progress("read", 100, "c2");
    aliasProgress.libraryItemId = "book";
    aliasProgress.sourceId = "manifest.id";
    aliasProgress.id = makeMangaProgressId(
      aliasProgress.registryId,
      aliasProgress.sourceId,
      aliasProgress.sourceMangaId,
    );
    const progressIndex = buildMobileProgressIndex([aliasProgress]);

    expect(getMobileLibraryProgressInfo(item, progressIndex, en)).toMatchObject({
      subtitle: "Ch.2 / Ch.5",
      lastReadAt: 100,
    });
    expect(
      buildMobileEntryProgressMap(item, progressIndex).get(aliasSource.id),
    ).toBe(aliasProgress);
  });

  test("does not guess alias progress when multiple candidates match", () => {
    const aliasSource = sourceLink("read", {
      id: makeSourceLinkId("aidoku-community", "registry-id", "read"),
      sourceId: "registry-id",
    });
    const item = entry("book", 10, [aliasSource]);
    const first = progress("read", 100, "c2");
    first.libraryItemId = "book";
    first.sourceId = "manifest.one";
    first.id = makeMangaProgressId(first.registryId, first.sourceId, first.sourceMangaId);
    const second = progress("read", 200, "c4");
    second.libraryItemId = "book";
    second.sourceId = "manifest.two";
    second.id = makeMangaProgressId(second.registryId, second.sourceId, second.sourceMangaId);

    expect(
      buildMobileEntryProgressMap(
        item,
        buildMobileProgressIndex([first, second]),
      ).has(aliasSource.id),
    ).toBe(false);
  });

  test("localizes caught up and updated labels", () => {
    const item = entry("caught-up", 10, [
      sourceLink("caught-up", {
        latestChapter: { id: "c5", chapterNumber: 5 },
        updateAckChapter: { id: "c4", chapterNumber: 4 },
      }),
    ]);
    const progressIndex = buildMobileProgressIndex([progress("caught-up", 100, "c5")]);

    expect(getMobileLibraryProgressInfo(item, progressIndex, zh)).toMatchObject({
      badge: "已更新",
      subtitle: "已读到最新",
    });
  });

  test("localizes unread entries without progress", () => {
    const item = entry("unread", 10, [sourceLink("unread")]);

    expect(getMobileLibraryProgressInfo(item, buildMobileProgressIndex([]), ja)).toMatchObject({
      subtitle: "未読",
    });
  });

  test("formats collection selection rows with author and source count", () => {
    const item = entry("book", 10, [sourceLink("one"), sourceLink("two")], "Book", [
      "Author A",
      "Author B",
    ]);

    expect(getMobileCollectionBookSubtitle(item, en)).toBe("Author A / 2 sources");
  });

  test("uses metadata override authors for collection selection rows", () => {
    const item = entry("book", 10, [sourceLink("one")], "Book", ["Stored Author"]);
    item.item.overrides = {
      metadata: {
        authors: ["Override Author"],
      },
    };

    expect(getMobileCollectionBookSubtitle(item, en)).toBe("Override Author / 1 source");
  });

  test("falls back to source count for collection selection rows without authors", () => {
    const item = entry("book", 10, [sourceLink("one")], "Book");

    expect(getMobileCollectionBookSubtitle(item, zh)).toBe("1 个源");
  });

  test("routes empty library states like the web library", () => {
    expect(
      getMobileLibraryEmptyState({
        error: null,
        hasInstalledSources: false,
        strings: en,
      })
    ).toMatchObject({
      title: "No sources installed",
      description: "Add a source to start discovering and reading manga",
      actionLabel: "Add Source",
      actionRoute: "/browse",
    });

    expect(
      getMobileLibraryEmptyState({
        error: null,
        hasInstalledSources: true,
        strings: en,
      })
    ).toMatchObject({
      title: "Your library is empty",
      description: "Search for manga and add them to your library",
      actionLabel: "Start Searching",
      actionRoute: "/search",
    });

    expect(
      getMobileLibraryEmptyState({
        error: "Database unavailable",
        hasInstalledSources: true,
        strings: en,
      })
    ).toMatchObject({
      title: "Library unavailable",
      description: "Database unavailable",
      actionRoute: "/browse",
    });
  });

  test("matches web by showing a full library skeleton only during unresolved initial load", () => {
    expect(
      shouldRenderMobileLibrarySkeleton({
        loading: true,
        hasLibraryData: false,
        hasError: false,
      }),
    ).toBe(true);
    expect(
      shouldRenderMobileLibrarySkeleton({
        loading: true,
        hasLibraryData: true,
        hasError: false,
      }),
    ).toBe(false);
    expect(
      shouldRenderMobileLibrarySkeleton({
        loading: false,
        hasLibraryData: false,
        hasError: false,
      }),
    ).toBe(false);
    expect(
      shouldRenderMobileLibrarySkeleton({
        loading: true,
        hasLibraryData: false,
        hasError: true,
      }),
    ).toBe(false);
  });

  test("keeps library load errors retryable before route and onboarding empty states", () => {
    expect(
      shouldShowMobileLibraryLoadError({
        loading: false,
        hasLibraryData: false,
        hasError: true,
      }),
    ).toBe(true);
    expect(
      shouldShowMobileLibraryLoadError({
        loading: true,
        hasLibraryData: false,
        hasError: true,
      }),
    ).toBe(false);
    expect(
      shouldShowMobileLibraryLoadError({
        loading: false,
        hasLibraryData: false,
        hasError: false,
      }),
    ).toBe(false);
    expect(
      shouldShowMobileLibraryLoadError({
        loading: false,
        hasLibraryData: true,
        hasError: true,
      }),
    ).toBe(false);
  });

  test("shows library onboarding only after a successful empty load", () => {
    expect(
      shouldShowMobileLibraryEmptyOnboarding({
        loading: false,
        hasLibraryData: false,
        hasSelectedCollection: false,
        hasError: false,
      }),
    ).toBe(true);
    expect(
      shouldShowMobileLibraryEmptyOnboarding({
        loading: true,
        hasLibraryData: false,
        hasSelectedCollection: false,
        hasError: false,
      }),
    ).toBe(false);
    expect(
      shouldShowMobileLibraryEmptyOnboarding({
        loading: false,
        hasLibraryData: false,
        hasSelectedCollection: false,
        hasError: true,
      }),
    ).toBe(false);
    expect(
      shouldShowMobileLibraryEmptyOnboarding({
        loading: false,
        hasLibraryData: true,
        hasSelectedCollection: false,
        hasError: false,
      }),
    ).toBe(false);
    expect(
      shouldShowMobileLibraryEmptyOnboarding({
        loading: false,
        hasLibraryData: false,
        hasSelectedCollection: true,
        hasError: false,
      }),
    ).toBe(false);
  });
});

// The pre-Schwartzian comparator, kept verbatim as the ordering oracle.
function legacySortMobileLibraryEntries(
  entries: LibraryEntry[],
  progressIndex: ReturnType<typeof buildMobileProgressIndex>
): LibraryEntry[] {
  return [...entries].sort((a, b) => {
    const aUpdated = entryHasAnyUpdate(a);
    const bUpdated = entryHasAnyUpdate(b);
    if (aUpdated !== bUpdated) return aUpdated ? -1 : 1;

    const aProgress = buildMobileEntryProgressMap(a, progressIndex);
    const bProgress = buildMobileEntryProgressMap(b, progressIndex);
    const aSource = getMobileEntryMostRecentSource(a, aProgress);
    const bSource = getMobileEntryMostRecentSource(b, bProgress);
    const aReadTime = aSource ? (aProgress.get(aSource.id)?.lastReadAt ?? 0) : 0;
    const bReadTime = bSource ? (bProgress.get(bSource.id)?.lastReadAt ?? 0) : 0;
    const aTime = Math.max(aReadTime, getMobileEntryAddedAt(a));
    const bTime = Math.max(bReadTime, getMobileEntryAddedAt(b));
    if (aTime !== bTime) return bTime - aTime;

    return getEntryTitle(a).localeCompare(getEntryTitle(b));
  });
}

function aliasProgress(
  libraryItemId: string,
  sourceMangaId: string,
  lastReadAt: number,
  sourceId: string
): LocalMangaProgress {
  const registryId = "aidoku-community";
  return {
    id: makeMangaProgressId(registryId, sourceId, sourceMangaId),
    registryId,
    sourceId,
    sourceMangaId,
    libraryItemId,
    lastReadAt,
    lastReadSourceChapterId: "c4",
    lastReadChapterNumber: 4,
    updatedAt: lastReadAt,
  };
}

describe("mobile library entry progress indexing", () => {
  test("resolves a renamed-source alias without scanning every progress row", () => {
    const link = sourceLink("alias-manga");
    const aliased = entry("alias-item", 5, [link]);
    const progressIndex = buildMobileProgressIndex([
      // Same registry + sourceMangaId, different sourceId: the direct id
      // lookup misses and only the library alias can resolve it.
      aliasProgress("alias-item", "alias-manga", 700, "en.example-renamed"),
      aliasProgress("other-item", "other-manga", 900, "en.example"),
    ]);

    const resolved = buildMobileEntryProgressMap(aliased, progressIndex);
    expect(resolved.get(link.id)?.lastReadAt).toBe(700);
  });

  test("leaves an ambiguous alias unresolved, as the linear scan did", () => {
    const link = sourceLink("alias-manga");
    const aliased = entry("alias-item", 5, [link]);
    const progressIndex = buildMobileProgressIndex([
      aliasProgress("alias-item", "alias-manga", 700, "en.example-a"),
      aliasProgress("alias-item", "alias-manga", 800, "en.example-b"),
    ]);

    expect(buildMobileEntryProgressMap(aliased, progressIndex).size).toBe(0);
  });

  test("precomputed entry progress maps match per-entry construction", () => {
    const first = entry("first", 5, [sourceLink("first")]);
    const second = entry("second", 6, [sourceLink("second")]);
    const progressIndex = buildMobileProgressIndex([
      progress("first", 100),
      aliasProgress("second", "second", 200, "en.example-renamed"),
    ]);
    const maps = buildMobileLibraryEntryProgressMaps(
      [first, second],
      progressIndex
    );

    expect([...maps.keys()]).toEqual(["first", "second"]);
    for (const item of [first, second]) {
      expect([...maps.get(item.item.libraryItemId)!.entries()]).toEqual([
        ...buildMobileEntryProgressMap(item, progressIndex).entries(),
      ]);
    }
  });
});

describe("mobile library sort parity", () => {
  const updatedTie = entry(
    "updated-tie",
    50,
    [
      sourceLink("updated-tie", {
        latestChapter: { id: "c5", chapterNumber: 5 },
        updateAckChapter: { id: "c3", chapterNumber: 3 },
      }),
    ],
    "Alpha"
  );
  const updatedTieTwin = entry(
    "updated-tie-twin",
    50,
    [
      sourceLink("updated-tie-twin", {
        latestChapter: { id: "c9", chapterNumber: 9 },
        updateAckChapter: { id: "c2", chapterNumber: 2 },
      }),
    ],
    "Beta"
  );
  const aliasRead = entry("alias-read", 10, [sourceLink("alias-read")], "Gamma");
  const ambiguousAlias = entry(
    "ambiguous",
    40,
    [sourceLink("ambiguous")],
    "Delta"
  );
  const plainTie = entry("plain-tie", 40, [sourceLink("plain-tie")], "Epsilon");
  const directRead = entry("direct-read", 1, [sourceLink("direct-read")], "Zeta");
  const noProgress = entry("no-progress", 5, [sourceLink("no-progress")], "Eta");
  const entries = [
    noProgress,
    directRead,
    plainTie,
    ambiguousAlias,
    aliasRead,
    updatedTieTwin,
    updatedTie,
  ];
  const progressIndex = buildMobileProgressIndex([
    progress("direct-read", 900),
    aliasProgress("alias-read", "alias-read", 40, "en.example-renamed"),
    aliasProgress("ambiguous", "ambiguous", 5_000, "en.example-a"),
    aliasProgress("ambiguous", "ambiguous", 6_000, "en.example-b"),
  ]);

  test("orders exactly like the per-comparison implementation", () => {
    const ids = (list: LibraryEntry[]) =>
      list.map((item) => item.item.libraryItemId);

    expect(ids(sortMobileLibraryEntries(entries, progressIndex))).toEqual(
      ids(legacySortMobileLibraryEntries(entries, progressIndex))
    );
  });

  test("orders identically when the progress maps are precomputed", () => {
    const maps = buildMobileLibraryEntryProgressMaps(entries, progressIndex);

    expect(
      sortMobileLibraryEntries(entries, progressIndex, maps).map(
        (item) => item.item.libraryItemId
      )
    ).toEqual(
      sortMobileLibraryEntries(entries, progressIndex).map(
        (item) => item.item.libraryItemId
      )
    );
  });

  test("does not mutate the entries it is given", () => {
    const input = [...entries];

    sortMobileLibraryEntries(input, progressIndex);

    expect(input).toEqual(entries);
  });
});
