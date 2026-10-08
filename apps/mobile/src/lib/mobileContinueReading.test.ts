import { describe, expect, test } from "bun:test";
import { makeMangaProgressId, makeSourceLinkId, type LibraryEntry, type LocalMangaProgress } from "@/data/schema";
import { selectMobileContinueReading } from "./mobileContinueReading";
import { buildMobileProgressIndex } from "./mobileLibraryPresentation";

const registryId = "aidoku-community";
const sourceId = "en.example";

function entry(libraryItemId: string, sourceMangaId: string, latestChapterId?: string): LibraryEntry {
  return {
    item: { libraryItemId, metadata: { title: libraryItemId }, inLibrary: true, createdAt: 1, updatedAt: 1 },
    sources: [
      {
        id: makeSourceLinkId(registryId, sourceId, sourceMangaId),
        libraryItemId,
        registryId,
        sourceId,
        sourceMangaId,
        latestChapter: latestChapterId ? { id: latestChapterId, chapterNumber: 10 } : undefined,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
}

function progress(sourceMangaId: string, lastReadAt: number, chapterId: string | undefined): LocalMangaProgress {
  return {
    id: makeMangaProgressId(registryId, sourceId, sourceMangaId),
    registryId,
    sourceId,
    sourceMangaId,
    lastReadAt,
    lastReadSourceChapterId: chapterId,
    lastReadChapterNumber: chapterId ? 3 : undefined,
    updatedAt: lastReadAt,
  };
}

describe("selectMobileContinueReading", () => {
  test("lists unfinished titles newest first, skipping caught-up, unread and chapterless ones; respects the limit", () => {
    const entries = [
      entry("old", "m-old", "c10"),
      entry("caught-up", "m-caught", "c10"),
      entry("unread", "m-unread", "c10"),
      entry("new", "m-new", "c10"),
      entry("no-latest", "m-none"),
      entry("chapterless", "m-chapterless", "c10"),
    ];
    const index = buildMobileProgressIndex([
      progress("m-old", 100, "c3"),
      progress("m-caught", 500, "c10"),
      progress("m-new", 300, "c4"),
      progress("m-none", 200, "c1"),
      progress("m-chapterless", 400, undefined),
    ]);
    const items = selectMobileContinueReading(entries, index);
    expect(items.map((item) => item.entry.item.libraryItemId)).toEqual(["new", "no-latest", "old"]);
    expect(items[0]!.chapter).toEqual({ id: "c4", title: undefined, chapterNumber: 3, volumeNumber: undefined });
    expect(items[0]!.latestChapter?.id).toBe("c10");

    const many = Array.from({ length: 12 }, (_, i) => entry(`e${i}`, `m${i}`, "c10"));
    const manyIndex = buildMobileProgressIndex(many.map((_, i) => progress(`m${i}`, i + 1, "c2")));
    expect(selectMobileContinueReading(many, manyIndex, undefined, 3).map((item) => item.entry.item.libraryItemId)).toEqual([
      "e11",
      "e10",
      "e9",
    ]);
  });
});
