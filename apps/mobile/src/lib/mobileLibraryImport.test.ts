import { describe, expect, test } from "bun:test";
import type { LibraryEntry } from "@/data/schema";
import { toSearchSourceDisplay, type SearchSourceDisplay } from "./mobileSearch";
import {
  findLibraryEntryForLiveSearchResult,
  makeLiveSearchLibraryImport,
  makeLiveSearchLibraryItemId,
  makeLiveSearchSourceLinkId,
  makeSourceDetailsLibraryImport,
} from "./mobileLibraryImport";
import type { MobileLiveSearchManga } from "@/sources/mobileSourceSearch";

const source: SearchSourceDisplay = {
  id: "aidoku-community:en.example",
  registryId: "aidoku-community",
  rawSourceId: "en.example",
  name: "Example",
};

const manga: MobileLiveSearchManga = {
  id: "blue-lock",
  title: "Blue Lock",
  cover: "https://example.test/cover.jpg",
  authors: ["Author"],
  tags: ["Sports"],
};

describe("mobile live search library import", () => {
  test("builds stable source link and library item ids", () => {
    expect(makeLiveSearchSourceLinkId(source, manga)).toBe(
      "aidoku-community:en.example:blue-lock"
    );
    expect(makeLiveSearchLibraryItemId(source, manga)).toBe(
      "source:aidoku-community:en.example:blue-lock"
    );
  });

  test("creates a library item and source link from a live search result", () => {
    expect(makeLiveSearchLibraryImport(source, manga, 1234)).toEqual({
      item: {
        libraryItemId: "source:aidoku-community:en.example:blue-lock",
        metadata: {
          title: "Blue Lock",
          cover: "https://example.test/cover.jpg",
          authors: ["Author"],
          tags: ["Sports"],
        },
        inLibrary: true,
        sourceOrder: ["aidoku-community:en.example:blue-lock"],
        createdAt: 1234,
        updatedAt: 1234,
      },
      sourceLink: {
        id: "aidoku-community:en.example:blue-lock",
        libraryItemId: "source:aidoku-community:en.example:blue-lock",
        registryId: "aidoku-community",
        sourceId: "en.example",
        sourceMangaId: "blue-lock",
        createdAt: 1234,
        updatedAt: 1234,
      },
    });
  });

  test("uses the installed registry source id for package alias imports", () => {
    const aliasedSource = toSearchSourceDisplay({
      id: "aidoku-community:registry-id",
      registryId: "aidoku-community",
      sourceId: "manifest.id",
      name: "Example",
      version: 1,
    });

    expect(makeLiveSearchLibraryImport(aliasedSource, manga, 1234)).toMatchObject({
      item: {
        libraryItemId: "source:aidoku-community:registry-id:blue-lock",
        sourceOrder: ["aidoku-community:registry-id:blue-lock"],
      },
      sourceLink: {
        id: "aidoku-community:registry-id:blue-lock",
        registryId: "aidoku-community",
        sourceId: "registry-id",
        sourceMangaId: "blue-lock",
      },
    });
  });

  test("uses refreshed source details when they are available", () => {
    expect(
      makeLiveSearchLibraryImport(source, manga, 1234, {
        status: "ready",
        runtime: "native-aidoku",
        metadata: {
          title: "Blue Lock Deluxe",
          description: "Full details",
        },
        chapters: [{ id: "c12", chapterNumber: 12 }],
        latestChapter: { id: "c12", chapterNumber: 12 },
        fetchedAt: 5678,
      })
    ).toMatchObject({
      item: {
        metadata: {
          title: "Blue Lock Deluxe",
          description: "Full details",
        },
        createdAt: 1234,
        updatedAt: 5678,
      },
      sourceLink: {
        latestChapter: { id: "c12", chapterNumber: 12 },
        latestChapterSortKey: "12",
        latestFetchedAt: 5678,
        updateAckChapter: { id: "c12", chapterNumber: 12 },
        updateAckChapterSortKey: "12",
        updateAckAt: 5678,
        createdAt: 1234,
        updatedAt: 5678,
      },
    });
  });

  test("creates a library import from source details", () => {
    expect(
      makeSourceDetailsLibraryImport(
        source,
        "blue-lock",
        {
          status: "ready",
          runtime: "native-aidoku",
          metadata: {
            title: "Blue Lock Deluxe",
            cover: "https://example.test/full-cover.jpg",
            description: "Full details",
          },
          chapters: [{ id: "c12", chapterNumber: 12 }],
          latestChapter: { id: "c12", chapterNumber: 12 },
          fetchedAt: 5678,
        },
        1234
      )
    ).toMatchObject({
      item: {
        libraryItemId: "source:aidoku-community:en.example:blue-lock",
        metadata: {
          title: "Blue Lock Deluxe",
          cover: "https://example.test/full-cover.jpg",
          description: "Full details",
        },
        sourceOrder: ["aidoku-community:en.example:blue-lock"],
        createdAt: 1234,
        updatedAt: 5678,
      },
      sourceLink: {
        id: "aidoku-community:en.example:blue-lock",
        sourceMangaId: "blue-lock",
        latestChapter: { id: "c12", chapterNumber: 12 },
        updateAckChapter: { id: "c12", chapterNumber: 12 },
        createdAt: 1234,
        updatedAt: 5678,
      },
    });
  });

  test("finds existing library entries by live source identity", () => {
    const entry: LibraryEntry = {
      item: {
        libraryItemId: "existing",
        metadata: { title: "Blue Lock" },
        inLibrary: true,
        createdAt: 1,
        updatedAt: 1,
      },
      sources: [
        {
          id: "aidoku-community:en.example:blue-lock",
          libraryItemId: "existing",
          registryId: "aidoku-community",
          sourceId: "en.example",
          sourceMangaId: "blue-lock",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    expect(findLibraryEntryForLiveSearchResult([entry], source, manga)).toBe(entry);
    expect(
      findLibraryEntryForLiveSearchResult(
        [entry],
        source,
        { ...manga, id: "another-title" }
      )
    ).toBeNull();
  });

  test("finds existing library entries by alternate source keys", () => {
    const sourceWithAliases: SearchSourceDisplay = {
      id: "aidoku-community:registry-id",
      registryId: "aidoku-community",
      rawSourceId: "manifest.id",
      sourceKeys: ["aidoku-community:registry-id", "aidoku-community:manifest.id"],
      name: "Example",
    };
    const entry: LibraryEntry = {
      item: {
        libraryItemId: "existing",
        metadata: { title: "Blue Lock" },
        inLibrary: true,
        createdAt: 1,
        updatedAt: 1,
      },
      sources: [
        {
          id: "aidoku-community:registry-id:blue-lock",
          libraryItemId: "existing",
          registryId: "aidoku-community",
          sourceId: "registry-id",
          sourceMangaId: "blue-lock",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    expect(findLibraryEntryForLiveSearchResult([entry], sourceWithAliases, manga)).toBe(
      entry,
    );
    expect(
      findLibraryEntryForLiveSearchResult([entry], sourceWithAliases, {
        ...manga,
        id: "another-title",
      }),
    ).toBeNull();
  });

  test("finds existing library entries by contextualized bare source ids", () => {
    const legacySource = toSearchSourceDisplay({
      id: "en.legacy",
      registryId: "aidoku-community",
      sourceId: "manifest.id",
      name: "Legacy",
      version: 1,
    });
    const entry: LibraryEntry = {
      item: {
        libraryItemId: "existing",
        metadata: { title: "Blue Lock" },
        inLibrary: true,
        createdAt: 1,
        updatedAt: 1,
      },
      sources: [
        {
          id: "aidoku-community:en.legacy:blue-lock",
          libraryItemId: "existing",
          registryId: "aidoku-community",
          sourceId: "en.legacy",
          sourceMangaId: "blue-lock",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    };

    expect(findLibraryEntryForLiveSearchResult([entry], legacySource, manga)).toBe(
      entry,
    );
  });
});
