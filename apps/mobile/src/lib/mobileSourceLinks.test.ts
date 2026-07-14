import { describe, expect, test } from "bun:test";
import type {
  InstalledSource,
  LocalChapterProgress,
  LibraryEntry,
  LocalCollectionItem,
  LocalMangaProgress,
  LocalSourceLink,
} from "@/data/schema";
import { makeMangaProgressId } from "@/data/schema";
import {
  addMobileSourceLinkToEntry,
  canRunMobileSourceAddSearch,
  canRunMobileSourceManagerSearch,
  canSelectMobileSourceManagerAddMode,
  canSelectMobileSourceManagerSourceRow,
  canStartMobileSourceManagerAction,
  collectionIdsToTransferForMobileMerge,
  findMobileSourceLinkForInput,
  formatAddSourceResultAccessibilityLabel,
  formatMergeCandidateAccessibilityLabel,
  formatMobileSourceCountText,
  formatSourceManagerSelectAccessibilityLabel,
  getMobileSourceManagerAddPanelToggleAction,
  getMobileSourceAddResultSourceKey,
  isMobileSourceManagerActionBusy,
  makeMobileSourceAddResultKey,
  mergeMobileRetargetedChapterProgress,
  mergeMobileRetargetedMangaProgress,
  mergeMobileLibraryEntries,
  moveMobileSourceLink,
  removeMobileSourceLinkFromEntry,
  retargetMobileMergeProgress,
  sortMobileSourceLinks,
} from "./mobileSourceLinks";
import { getMobileStrings } from "./mobileI18n";

function source(id: string, createdAt: number): LocalSourceLink {
  return {
    id,
    libraryItemId: "item-1",
    registryId: "aidoku-community",
    sourceId: id,
    sourceMangaId: `${id}-manga`,
    createdAt,
    updatedAt: createdAt,
  };
}

function entry(sourceOrder?: string[]): LibraryEntry {
  return {
    item: {
      libraryItemId: "item-1",
      metadata: { title: "Title" },
      inLibrary: true,
      sourceOrder,
      createdAt: 1,
      updatedAt: 1,
    },
    sources: [source("b", 2), source("a", 1), source("c", 3)],
  };
}

function collectionItem(collectionId: string, libraryItemId: string): LocalCollectionItem {
  return {
    collectionId,
    libraryItemId,
    addedAt: 1,
    updatedAt: 1,
  };
}

function installedSource(
  id: string,
  sourceId: string,
): InstalledSource {
  return {
    id,
    registryId: "aidoku-community",
    sourceId,
    name: sourceId,
    version: 1,
  };
}

function chapterProgress(
  id: string,
  libraryItemId: string | undefined,
  updatedAt = 1,
  lastReadAt = 2,
): LocalChapterProgress {
  return {
    id,
    registryId: "aidoku-community",
    sourceId: "en.example",
    sourceMangaId: "manga-1",
    sourceChapterId: id,
    libraryItemId,
    progress: 1,
    total: 10,
    completed: false,
    lastReadAt,
    chapterNumber: 1,
    volumeNumber: 1,
    chapterTitle: id,
    updatedAt,
  };
}

function mangaProgress(
  id: string,
  libraryItemId: string | undefined,
  updatedAt = 1,
  lastReadAt = 2,
): LocalMangaProgress {
  const registryId = "aidoku-community";
  const sourceId = "en.example";
  return {
    id: makeMangaProgressId(registryId, sourceId, id),
    registryId,
    sourceId,
    sourceMangaId: id,
    libraryItemId,
    lastReadAt,
    updatedAt,
  };
}

describe("mobile source link helpers", () => {
  test("sorts by source order and falls back to created time", () => {
    expect(sortMobileSourceLinks(entry(["c", "a"]).sources, ["c", "a"]).map((item) => item.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
    expect(sortMobileSourceLinks(entry().sources, undefined).map((item) => item.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(
      sortMobileSourceLinks(
        [source("b", 1), source("a", 1), source("c", 1)],
        undefined
      ).map((item) => item.id)
    ).toEqual(["a", "b", "c"]);
  });

  test("moves source links within the effective order", () => {
    expect(moveMobileSourceLink(entry(["a", "b", "c"]), "c", -1)).toEqual([
      "a",
      "c",
      "b",
    ]);
    expect(moveMobileSourceLink(entry(["a", "b", "c"]), "a", -1)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  test("removes a source and prunes persisted source order", () => {
    const removed = removeMobileSourceLinkFromEntry(entry(["c", "a", "b"]), "a", 500);

    expect(removed.item.sourceOrder).toEqual(["c", "b"]);
    expect(removed.item.updatedAt).toBe(500);
    expect(removed.sources.map((item) => item.id)).toEqual(["b", "c"]);
  });

  test("adds a new source link and appends it to source order", () => {
    const added = addMobileSourceLinkToEntry(
      entry(["a", "b", "c"]),
      {
        registryId: "aidoku-community",
        sourceId: "d",
        sourceMangaId: "d-manga",
      },
      700
    );

    expect(added.added).toBe(true);
    expect(added.entry.item.sourceOrder).toEqual([
      "a",
      "b",
      "c",
      "aidoku-community:d:d-manga",
    ]);
    expect(added.sourceLink.libraryItemId).toBe("item-1");
    expect(added.entry.sources.at(-1)?.id).toBe("aidoku-community:d:d-manga");
  });

  test("does not duplicate an existing source link", () => {
    const sourceLinkId = "aidoku-community:b:b-manga";
    const duplicateEntry: LibraryEntry = {
      item: {
        ...entry().item,
        sourceOrder: [sourceLinkId],
      },
      sources: [{ ...source("b", 2), id: sourceLinkId }],
    };
    const duplicate = addMobileSourceLinkToEntry(
      duplicateEntry,
      {
        registryId: "aidoku-community",
        sourceId: "b",
        sourceMangaId: "b-manga",
      },
      800
    );

    expect(duplicate.added).toBe(false);
    expect(duplicate.entry.sources).toHaveLength(1);
    expect(duplicate.entry.item.updatedAt).toBe(1);
  });

  test("does not duplicate an existing source link through source aliases", () => {
    const existingSource = {
      ...source("registry-id", 2),
      id: "aidoku-community:registry-id:blue-lock",
      sourceMangaId: "blue-lock",
    };
    const duplicateEntry: LibraryEntry = {
      item: {
        ...entry().item,
        sourceOrder: [existingSource.id],
      },
      sources: [existingSource],
    };
    const sourceInput = {
      registryId: "aidoku-community",
      sourceId: "manifest.id",
      sourceMangaId: "blue-lock",
      sourceKeys: [
        "aidoku-community:registry-id",
        "aidoku-community:manifest.id",
      ],
    };
    const duplicate = addMobileSourceLinkToEntry(
      duplicateEntry,
      sourceInput,
      800,
    );

    expect(findMobileSourceLinkForInput(duplicateEntry, sourceInput)).toBe(
      existingSource,
    );
    expect(duplicate.added).toBe(false);
    expect(duplicate.sourceLink).toBe(existingSource);
    expect(duplicate.entry.sources).toHaveLength(1);
    expect(duplicate.entry.item.updatedAt).toBe(1);
  });

  test("does not duplicate a legacy bare installed source alias", () => {
    const existingSource = {
      ...source("en.legacy", 2),
      id: "aidoku-community:en.legacy:blue-lock",
      sourceMangaId: "blue-lock",
    };
    const duplicateEntry: LibraryEntry = {
      item: entry().item,
      sources: [existingSource],
    };
    const duplicate = addMobileSourceLinkToEntry(
      duplicateEntry,
      {
        registryId: "aidoku-community",
        sourceId: "manifest.id",
        sourceMangaId: "blue-lock",
        sourceKeys: ["en.legacy", "aidoku-community:manifest.id"],
      },
      800,
    );

    expect(duplicate.added).toBe(false);
    expect(duplicate.sourceLink).toBe(existingSource);
    expect(duplicate.entry.sources).toHaveLength(1);
  });

  test("merges source links from another library entry", () => {
    const sourceEntry: LibraryEntry = {
      item: {
        libraryItemId: "item-2",
        metadata: { title: "Other" },
        inLibrary: true,
        sourceOrder: ["d", "e", "a"],
        createdAt: 2,
        updatedAt: 2,
      },
      sources: [source("e", 5), source("d", 4), source("a", 1)],
    };

    const merged = mergeMobileLibraryEntries(entry(["a", "b", "c"]), sourceEntry, 900);

    expect(merged.shouldRemoveSourceEntry).toBe(true);
    expect(merged.movedSources.map((item) => item.id)).toEqual(["d", "e"]);
    expect(merged.movedSources[0]?.libraryItemId).toBe("item-1");
    expect(merged.entry.item.sourceOrder).toEqual(["a", "b", "c", "d", "e"]);
    expect(merged.entry.sources.map((item) => item.id)).toEqual(["b", "a", "c", "d", "e"]);
  });

  test("does not duplicate merged source links through installed source aliases", () => {
    const targetSource = {
      ...source("registry-id", 1),
      id: "aidoku-community:registry-id:blue-lock",
      sourceMangaId: "blue-lock",
    };
    const sourceAlias = {
      ...source("manifest.id", 2),
      id: "aidoku-community:manifest.id:blue-lock",
      libraryItemId: "item-2",
      sourceMangaId: "blue-lock",
    };
    const targetEntry: LibraryEntry = {
      item: {
        ...entry().item,
        sourceOrder: [targetSource.id],
      },
      sources: [targetSource],
    };
    const sourceEntry: LibraryEntry = {
      item: {
        ...entry().item,
        libraryItemId: "item-2",
        metadata: { title: "Duplicate" },
        sourceOrder: [sourceAlias.id],
      },
      sources: [sourceAlias],
    };

    const merged = mergeMobileLibraryEntries(
      targetEntry,
      sourceEntry,
      900,
      [installedSource("aidoku-community:registry-id", "manifest.id")],
    );

    expect(merged.shouldRemoveSourceEntry).toBe(true);
    expect(merged.movedSources).toEqual([]);
    expect(merged.entry.sources).toEqual([targetSource]);
    expect(merged.entry.item.sourceOrder).toEqual([targetSource.id]);
  });

  test("keeps merged source aliases when they point at different manga", () => {
    const targetSource = {
      ...source("registry-id", 1),
      id: "aidoku-community:registry-id:blue-lock",
      sourceMangaId: "blue-lock",
    };
    const alternateManga = {
      ...source("manifest.id", 2),
      id: "aidoku-community:manifest.id:ao-ashi",
      libraryItemId: "item-2",
      sourceMangaId: "ao-ashi",
    };
    const targetEntry: LibraryEntry = {
      item: {
        ...entry().item,
        sourceOrder: [targetSource.id],
      },
      sources: [targetSource],
    };
    const sourceEntry: LibraryEntry = {
      item: {
        ...entry().item,
        libraryItemId: "item-2",
        metadata: { title: "Other manga" },
        sourceOrder: [alternateManga.id],
      },
      sources: [alternateManga],
    };

    const merged = mergeMobileLibraryEntries(
      targetEntry,
      sourceEntry,
      900,
      [installedSource("aidoku-community:registry-id", "manifest.id")],
    );

    expect(merged.movedSources.map((item) => item.id)).toEqual([
      alternateManga.id,
    ]);
    expect(merged.entry.item.sourceOrder).toEqual([
      targetSource.id,
      alternateManga.id,
    ]);
  });

  test("transfers merge-source collection memberships to the surviving entry", () => {
    expect(
      collectionIdsToTransferForMobileMerge(
        [
          collectionItem("favorites", "item-1"),
          collectionItem("favorites", "item-2"),
          collectionItem("later", "item-2"),
          collectionItem("later", "item-2"),
          collectionItem("ignored", "item-3"),
        ],
        "item-1",
        "item-2"
      )
    ).toEqual(["later"]);
  });

  test("does not transfer collection memberships when merging with self", () => {
    expect(
      collectionIdsToTransferForMobileMerge(
        [collectionItem("favorites", "item-1")],
        "item-1",
        "item-1"
      )
    ).toEqual([]);
  });

  test("retargets merged entry progress to the surviving library item", () => {
    const retargetedChapters = retargetMobileMergeProgress(
      [
        chapterProgress("chapter-1", "item-2", 10),
        chapterProgress("chapter-2", "item-1", 10),
        chapterProgress("chapter-3", undefined, 10),
      ],
      "item-1",
      "item-2",
      900,
    );
    const retargetedManga = retargetMobileMergeProgress(
      [
        mangaProgress("manga-1", "item-2", 10),
        mangaProgress("manga-2", "item-1", 10),
      ],
      "item-1",
      "item-2",
      900,
    );

    expect(retargetedChapters).toHaveLength(1);
    expect(retargetedChapters[0]).toMatchObject({
      id: "chapter-1",
      libraryItemId: "item-1",
      updatedAt: 900,
    });
    expect(retargetedManga).toEqual([
      {
        ...mangaProgress("manga-1", "item-2", 10),
        libraryItemId: "item-1",
        updatedAt: 900,
      },
    ]);
  });

  test("does not retarget progress when merging with self", () => {
    expect(
      retargetMobileMergeProgress(
        [chapterProgress("chapter-1", "item-1")],
        "item-1",
        "item-1",
        900,
      ),
    ).toEqual([]);
  });

  test("merges retargeted chapter progress without overwriting newer target rows", () => {
    const targetProgress = {
      ...chapterProgress("chapter-1", "item-1", 100, 80),
      progress: 8,
      total: 10,
      completed: true,
      chapterNumber: 8,
      chapterTitle: "Target",
    };
    const sourceProgress = {
      ...chapterProgress("chapter-1", "item-1", 900, 20),
      progress: 3,
      total: 12,
      completed: false,
      chapterNumber: 3,
      chapterTitle: "Source",
    };

    expect(
      mergeMobileRetargetedChapterProgress(
        [sourceProgress],
        [targetProgress, chapterProgress("chapter-2", "item-1")],
      ),
    ).toEqual([
      {
        ...sourceProgress,
        progress: 8,
        total: 12,
        completed: true,
        lastReadAt: 80,
        chapterNumber: 8,
        chapterTitle: "Target",
      },
    ]);
  });

  test("uses newer retargeted chapter metadata when source progress is ahead", () => {
    const targetProgress = {
      ...chapterProgress("chapter-1", "item-1", 100, 20),
      progress: 3,
      total: 10,
      chapterNumber: 3,
      chapterTitle: "Target",
    };
    const sourceProgress = {
      ...chapterProgress("chapter-1", "item-1", 900, 80),
      progress: 8,
      total: 12,
      chapterNumber: 8,
      chapterTitle: "Source",
    };

    expect(
      mergeMobileRetargetedChapterProgress([sourceProgress], [targetProgress]),
    ).toEqual([
      {
        ...sourceProgress,
        progress: 8,
        total: 12,
        lastReadAt: 80,
      },
    ]);
  });

  test("derives merged manga progress from retargeted chapter progress", () => {
    const merged = mergeMobileRetargetedMangaProgress(
      [chapterProgress("chapter-7", "item-1", 900, 70)],
      [],
    );

    expect(merged).toEqual([
      {
        id: "aidoku-community:en.example:manga-1",
        registryId: "aidoku-community",
        sourceId: "en.example",
        sourceMangaId: "manga-1",
        libraryItemId: "item-1",
        lastReadAt: 70,
        lastReadSourceChapterId: "chapter-7",
        lastReadChapterNumber: 1,
        lastReadVolumeNumber: 1,
        lastReadChapterTitle: "chapter-7",
        updatedAt: 900,
      },
    ]);
  });

  test("keeps newer explicit manga progress ahead of derived chapter progress", () => {
    const explicitProgress = {
      ...mangaProgress("manga-1", "item-1", 800, 40),
      lastReadSourceChapterId: "chapter-4",
      lastReadChapterNumber: 4,
    };

    const merged = mergeMobileRetargetedMangaProgress(
      [chapterProgress("chapter-1", "item-1", 900, 20)],
      [explicitProgress],
    );

    expect(merged).toEqual([explicitProgress]);
  });

  test("keeps newer existing manga progress ahead of retargeted manga progress", () => {
    const existingProgress = {
      ...mangaProgress("manga-1", "item-1", 100, 90),
      lastReadSourceChapterId: "chapter-9",
    };
    const retargetedProgress = {
      ...mangaProgress("manga-1", "item-1", 900, 30),
      lastReadSourceChapterId: "chapter-3",
    };

    expect(
      mergeMobileRetargetedMangaProgress(
        [],
        [retargetedProgress],
        [existingProgress],
      ),
    ).toEqual([existingProgress]);
  });

  test("lets newer derived chapter progress replace stale manga progress", () => {
    const merged = mergeMobileRetargetedMangaProgress(
      [chapterProgress("chapter-9", "item-1", 900, 90)],
      [mangaProgress("manga-1", "item-1", 800, 40)],
    );

    expect(merged[0]).toMatchObject({
      libraryItemId: "item-1",
      lastReadAt: 90,
      lastReadSourceChapterId: "chapter-9",
      updatedAt: 900,
    });
  });

  test("builds add-result keys and derives their source key", () => {
    const key = makeMobileSourceAddResultKey("aidoku-community", "mangadex", "blue-lock");

    expect(key).toBe("aidoku-community:mangadex:blue-lock");
    expect(getMobileSourceAddResultSourceKey(key)).toBe("aidoku-community:mangadex");
    expect(getMobileSourceAddResultSourceKey(null)).toBeNull();
    expect(getMobileSourceAddResultSourceKey("invalid")).toBeNull();
  });

  test("keeps delimiter-heavy add-result ids scoped to their source", () => {
    const key = makeMobileSourceAddResultKey(
      "aidoku-community",
      "en.manga:source",
      "series:blue/lock"
    );

    expect(key).toBe("aidoku-community:en.manga%3Asource:series%3Ablue%2Flock");
    expect(getMobileSourceAddResultSourceKey(key)).toBe(
      "aidoku-community:en.manga:source"
    );
    expect(
      getMobileSourceAddResultSourceKey("aidoku-community:%E0%A4%A:series")
    ).toBeNull();
  });

  test("enables add-source searches only for nonblank idle queries", () => {
    expect(canRunMobileSourceAddSearch("Blue Lock", false)).toBe(true);
    expect(canRunMobileSourceAddSearch("  Blue Lock  ", false)).toBe(true);
    expect(canRunMobileSourceAddSearch("", false)).toBe(false);
    expect(canRunMobileSourceAddSearch("   ", false)).toBe(false);
    expect(canRunMobileSourceAddSearch("Blue Lock", true)).toBe(false);
  });

  test("gates source manager actions while any native mutation is active", () => {
    const idle = {
      searching: false,
      adding: false,
      merging: false,
      sourceMutating: false,
    };
    const searching = { ...idle, searching: true };
    const adding = { ...idle, adding: true };
    const merging = { ...idle, merging: true };
    const sourceMutating = { ...idle, sourceMutating: true };

    expect(isMobileSourceManagerActionBusy(idle)).toBe(false);
    expect(canStartMobileSourceManagerAction(idle)).toBe(true);
    expect(canStartMobileSourceManagerAction(searching)).toBe(false);
    expect(canStartMobileSourceManagerAction(adding)).toBe(false);
    expect(canStartMobileSourceManagerAction(merging)).toBe(false);
    expect(canStartMobileSourceManagerAction(sourceMutating)).toBe(false);
  });

  test("gates source manager search by query and action state", () => {
    const idle = {
      searching: false,
      adding: false,
      merging: false,
      sourceMutating: false,
    };
    const busy = { ...idle, adding: true };

    expect(canRunMobileSourceManagerSearch(" Blue Lock ", idle)).toBe(true);
    expect(canRunMobileSourceManagerSearch("   ", idle)).toBe(false);
    expect(canRunMobileSourceManagerSearch("Blue Lock", busy)).toBe(false);
  });

  test("gates selected source manager add modes as no-op selections", () => {
    expect(
      canSelectMobileSourceManagerAddMode({
        selected: false,
        disabled: false,
        hasActionError: false,
      }),
    ).toBe(true);
    expect(
      canSelectMobileSourceManagerAddMode({
        selected: true,
        disabled: false,
        hasActionError: false,
      }),
    ).toBe(false);
    expect(
      canSelectMobileSourceManagerAddMode({
        selected: true,
        disabled: false,
        hasActionError: true,
      }),
    ).toBe(true);
    expect(
      canSelectMobileSourceManagerAddMode({
        selected: false,
        disabled: true,
        hasActionError: true,
      }),
    ).toBe(false);
  });

  test("gates selected source manager rows as no-op selections", () => {
    expect(
      canSelectMobileSourceManagerSourceRow({
        selected: false,
        disabled: false,
      }),
    ).toBe(true);
    expect(
      canSelectMobileSourceManagerSourceRow({
        selected: true,
        disabled: false,
      }),
    ).toBe(false);
    expect(
      canSelectMobileSourceManagerSourceRow({
        selected: false,
        disabled: true,
      }),
    ).toBe(false);
  });

  test("resolves source manager add panel toggles from guarded action state", () => {
    const idle = {
      searching: false,
      adding: false,
      merging: false,
      sourceMutating: false,
    };
    const busy = { ...idle, searching: true };

    expect(
      getMobileSourceManagerAddPanelToggleAction({
        addPanelOpen: false,
        state: idle,
      })
    ).toBe("open-add-panel");
    expect(
      getMobileSourceManagerAddPanelToggleAction({
        addPanelOpen: true,
        state: idle,
      })
    ).toBe("close-add-panel");
    expect(
      getMobileSourceManagerAddPanelToggleAction({
        addPanelOpen: false,
        state: busy,
      })
    ).toBe("ignore");
  });

  test("formats selected source accessibility with visible active state", () => {
    const strings = getMobileStrings("en");
    const positionLabel = "Position 1 of 3";

    expect(
      formatSourceManagerSelectAccessibilityLabel(
        "MangaDex",
        positionLabel,
        true,
        strings,
        "Blue Lock"
      )
    ).toBe("Select MangaDex, Position 1 of 3, Blue Lock, Active");
    expect(
      formatSourceManagerSelectAccessibilityLabel(
        "MangaDex",
        positionLabel,
        false,
        strings
      )
    ).toBe("Select MangaDex, Position 1 of 3");
  });

  test("formats add result accessibility with author and added context", () => {
    const strings = getMobileStrings("zh");

    expect(
      formatAddSourceResultAccessibilityLabel({
        title: "Blue Lock",
        sourceName: "MangaDex",
        authors: ["Kaneshiro Muneyuki", "Nomura Yusuke"],
        added: true,
        strings,
      })
    ).toBe(
      "从 MangaDex 添加 Blue Lock, Kaneshiro Muneyuki, Nomura Yusuke, 已添加"
    );
  });

  test("formats merge candidate accessibility with source count and likely match", () => {
    const strings = getMobileStrings("ja");

    expect(formatMobileSourceCountText(3, strings)).toBe("3 件のソース");
    expect(
      formatMergeCandidateAccessibilityLabel({
        title: "Blue Lock",
        sourceCount: 3,
        likelyMatch: true,
        strings,
      })
    ).toBe("Blue Lock と統合, 3 件のソース, 一致候補");
  });
});
