import { describe, expect, test } from "bun:test";
import type { ChapterSummary } from "@/data/schema";
import {
  MOBILE_CHAPTER_LIST_PERFORMANCE,
  buildMobileChapterRows,
} from "./mobileChapterRows";

function chapters(count: number): ChapterSummary[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `chapter-${index}`,
    chapterNumber: index + 1,
  }));
}

describe("mobile chapter row render model", () => {
  test("models 1,000 chapters as 500 virtualized two-cell rows", () => {
    const input = chapters(1_000);
    const rows = buildMobileChapterRows(input);

    expect(rows).toHaveLength(500);
    expect(rows.every((row) => row.chapters.length === 2)).toBe(true);
    expect(rows.flatMap((row) => row.chapters)).toEqual(input);
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });

  test("keeps an odd final chapter as a stable single-cell row", () => {
    const input = chapters(3);

    expect(buildMobileChapterRows(input)).toEqual([
      {
        chapters: [input[0], input[1]],
        key: "9:chapter-0:chapter-1",
      },
      {
        chapters: [input[2]],
        key: "9:chapter-2:",
      },
    ]);
  });

  test("uses conservative render batches for chapter cells", () => {
    expect(MOBILE_CHAPTER_LIST_PERFORMANCE).toEqual({
      initialNumToRender: 8,
      maxToRenderPerBatch: 6,
      windowSize: 7,
    });
  });
});
