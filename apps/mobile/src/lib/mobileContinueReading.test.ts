import { describe, expect, test } from "bun:test";
import {
  makeMangaProgressId,
  makeSourceLinkId,
  type LibraryEntry,
  type LocalMangaProgress,
  type LocalSourceLink,
} from "@/data/schema";
import { selectMobileContinueReading } from "./mobileContinueReading";
import { buildMobileProgressIndex } from "./mobileLibraryPresentation";

const registryId = "aidoku-community";
const sourceId = "en.example";

function entry(
  libraryItemId: string,
  sourceMangaId: string,
  latestChapterId?: string,
): LibraryEntry {
  const source: LocalSourceLink = {
    id: makeSourceLinkId(registryId, sourceId, sourceMangaId),
    libraryItemId,
    registryId,
    sourceId,
    sourceMangaId,
    latestChapter: latestChapterId
      ? { id: latestChapterId, chapterNumber: 10 }
      : undefined,
    createdAt: 1,
    updatedAt: 1,
  };
  return {
    item: {
      libraryItemId,
      metadata: { title: libraryItemId },
      inLibrary: true,
      createdAt: 1,
      updatedAt: 1,
    },
    sources: [source],
  };
}

function progress(
  sourceMangaId: string,
  lastReadAt: number,
  chapterId: string | undefined,
): LocalMangaProgress {
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
  test("lists unfinished titles newest first and skips caught-up or unread ones", () => {
    const entries = [
      entry("old", "m-old", "c10"),
      entry("caught-up", "m-caught", "c10"),
      entry("unread", "m-unread", "c10"),
      entry("new", "m-new", "c10"),
      entry("no-latest", "m-none"),
    ];
    const index = buildMobileProgressIndex([
      progress("m-old", 100, "c3"),
      progress("m-caught", 500, "c10"),
      progress("m-new", 300, "c4"),
      progress("m-none", 200, "c1"),
    ]);
    const items = selectMobileContinueReading(entries, index);
    expect(items.map((item) => item.entry.item.libraryItemId)).toEqual([
      "new",
      "no-latest",
      "old",
    ]);
    expect(items[0]!.chapter).toEqual({
      id: "c4",
      title: undefined,
      chapterNumber: 3,
      volumeNumber: undefined,
    });
    expect(items[0]!.latestChapter?.id).toBe("c10");
  });

  test("ignores a progress row that never recorded a chapter", () => {
    const items = selectMobileContinueReading(
      [entry("a", "m-a", "c10")],
      buildMobileProgressIndex([progress("m-a", 100, undefined)]),
    );
    expect(items).toEqual([]);
  });

  test("respects the limit", () => {
    const entries = Array.from({ length: 12 }, (_, index) =>
      entry(`e${index}`, `m${index}`, "c10"),
    );
    const index = buildMobileProgressIndex(
      entries.map((_, i) => progress(`m${i}`, i + 1, "c2")),
    );
    const items = selectMobileContinueReading(entries, index, undefined, 3);
    expect(items.map((item) => item.entry.item.libraryItemId)).toEqual([
      "e11",
      "e10",
      "e9",
    ]);
  });
});
