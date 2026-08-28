import { describe, expect, test } from "bun:test";
import {
  convertLegacyHistoryEntry,
  convertLegacyLibraryEntry,
  deriveLegacyMangaProgress,
  legacyImportTimestamp,
} from "./legacy-import";

describe("legacy account import", () => {
  test("derives stable normal clocks and clamps corrupt future clocks", () => {
    expect(legacyImportTimestamp(10.9)).toBe(11);
    expect(legacyImportTimestamp(Number.NaN)).toBe(1);
    expect(legacyImportTimestamp(Number.MAX_SAFE_INTEGER, 1_000)).toBe(1);
    expect(legacyImportTimestamp(1_001, 1_000)).toBe(1);
  });

  test("bounds legacy creation and read-event clocks as well as LWW clocks", () => {
    const updatedAt = legacyImportTimestamp(Number.MAX_SAFE_INTEGER, 1_000);
    const library = convertLegacyLibraryEntry(
      {
        id: "corrupt-library",
        addedAt: Number.MAX_SAFE_INTEGER,
        metadata: { title: "Title" },
        sources: [{ registryId: "r", sourceId: "s", mangaId: "m" }],
      },
      "corrupt-library",
      updatedAt,
    );
    const chapter = convertLegacyHistoryEntry(
      {
        registryId: "r",
        sourceId: "s",
        mangaId: "m",
        chapterId: "c",
        progress: 1,
        total: 10,
        completed: false,
        dateRead: Number.MAX_SAFE_INTEGER,
      },
      "corrupt-library",
      updatedAt,
    );

    expect(library.item.createdAt).toBe(updatedAt - 1);
    expect(library.links[0]?.createdAt).toBe(updatedAt - 1);
    expect(chapter.lastReadAt).toBe(updatedAt - 1);
  });

  test("preserves every structured source and source acknowledgement", () => {
    const converted = convertLegacyLibraryEntry(
      {
        id: "legacy-library-1",
        addedAt: 10,
        metadata: { title: "Title" },
        overrides: { title: "Override" },
        coverCustom: "https://example.test/custom.jpg",
        sources: [
          {
            registryId: "r1",
            sourceId: "s1",
            mangaId: "m:1",
            latestChapter: { id: "c2", chapterNumber: 2 },
            updateAcknowledged: { id: "c1", chapterNumber: 1 },
          },
          { registryId: "r2", sourceId: "s2", mangaId: "m2" },
        ],
      },
      "library-1",
      20,
    );

    expect(converted.item).toMatchObject({
      libraryItemId: "library-1",
      overrides: {
        metadata: { title: "Override" },
        coverUrl: "https://example.test/custom.jpg",
      },
      sourceOrder: ["r1:s1:m%3A1", "r2:s2:m2"],
    });
    expect(converted.links).toHaveLength(2);
    expect(converted.links[0]).toMatchObject({
      id: "r1:s1:m%3A1",
      sourceMangaId: "m:1",
      latestChapter: { id: "c2" },
      updateAckChapter: { id: "c1" },
      updatedAt: 20,
    });
  });

  test("reuses the legacy row id so a partial import retry is idempotent", () => {
    const legacy = {
      id: "stable-legacy-id",
      addedAt: 10,
      metadata: { title: "Title" },
      sources: [{ registryId: "r", sourceId: "s", mangaId: "m" }],
    };

    const first = convertLegacyLibraryEntry(legacy);
    const retry = convertLegacyLibraryEntry(legacy);

    expect(first.item.libraryItemId).toBe("stable-legacy-id");
    expect(first.item.updatedAt).toBe(11);
    expect(retry.item.libraryItemId).toBe(first.item.libraryItemId);
    expect(retry.item).toEqual(first.item);
    expect(retry.links).toEqual(first.links);
  });

  test("preserves completed state and original read time", () => {
    expect(
      convertLegacyHistoryEntry(
        {
          registryId: "r",
          sourceId: "s",
          mangaId: "m",
          chapterId: "c",
          progress: 9,
          total: 10,
          completed: true,
          dateRead: 123,
          chapterNumber: 4,
        },
        "library-1",
        200,
      ),
    ).toMatchObject({
      id: "r:s:m:c",
      libraryItemId: "library-1",
      completed: true,
      lastReadAt: 123,
      updatedAt: 200,
    });
  });

  test("derives one manga summary from the most recent read event", () => {
    const older = convertLegacyHistoryEntry(
      {
        registryId: "r",
        sourceId: "s",
        mangaId: "m",
        chapterId: "older",
        progress: 1,
        total: 10,
        completed: false,
        dateRead: 100,
      },
      "library-1",
      500,
    );
    const newer = convertLegacyHistoryEntry(
      {
        registryId: "r",
        sourceId: "s",
        mangaId: "m",
        chapterId: "newer",
        progress: 2,
        total: 10,
        completed: false,
        dateRead: 200,
      },
      "library-1",
      400,
    );

    expect(deriveLegacyMangaProgress([older, newer])).toEqual([
      expect.objectContaining({
        lastReadSourceChapterId: "newer",
        lastReadAt: 200,
        updatedAt: 500,
      }),
    ]);
  });
});
