import { describe, expect, test } from "bun:test";
import type { LibraryEntry, LocalSourceLink } from "@/data/schema";
import { selectMobileSearchIdleUpdates } from "./mobileSearchIdle";

function entry(id: string, links: Partial<LocalSourceLink>[], inLibrary = true): LibraryEntry {
  return {
    item: { libraryItemId: id, metadata: { title: id }, inLibrary, createdAt: 0, updatedAt: 0 },
    sources: links.map((link, index) => ({
      id: `${id}:${index}`,
      libraryItemId: id,
      registryId: "r",
      sourceId: "s",
      sourceMangaId: `${id}-${index}`,
      createdAt: 0,
      updatedAt: 0,
      ...link,
    })),
  } as LibraryEntry;
}

const chapter = (n: number) => ({ id: `c${n}`, chapterNumber: n });

describe("search idle: library titles with new chapters", () => {
  test("only unacknowledged, library titles, newest update first, capped; chapters read past the ack are not new", () => {
    const list = selectMobileSearchIdleUpdates([
      entry("caught-up", [{ latestChapter: chapter(10), updateAckChapter: chapter(10), latestFetchedAt: 9 }]),
      entry("older", [{ latestChapter: chapter(12), updateAckChapter: chapter(10), latestFetchedAt: 5 }]),
      entry("newer", [{ latestChapter: chapter(4), updateAckChapter: chapter(3), latestFetchedAt: 8 }]),
      entry("removed", [{ latestChapter: chapter(4), updateAckChapter: chapter(3), latestFetchedAt: 9 }], false),
    ]);
    expect(list.map((item) => [item.entry.item.libraryItemId, item.count])).toEqual([
      ["newer", 1],
      ["older", 2],
    ]);
    const read = selectMobileSearchIdleUpdates(
      [entry("t", [{ latestChapter: chapter(219), updateAckChapter: chapter(97), latestFetchedAt: 1 }])],
      undefined,
      (item) => ({ sourceId: item.sources[0]!.id, lastReadNumber: 105 }),
    );
    expect(read[0]!.count).toBe(114);
    const many = Array.from({ length: 20 }, (_, i) =>
      entry(`t${i}`, [{ latestChapter: chapter(2), updateAckChapter: chapter(1), latestFetchedAt: i }]),
    );
    expect(selectMobileSearchIdleUpdates(many, 5)).toHaveLength(5);
  });
});
