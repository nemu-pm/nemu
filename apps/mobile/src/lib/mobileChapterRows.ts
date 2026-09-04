import type { ChapterSummary } from "@/data/schema";

export const MOBILE_CHAPTER_LIST_PERFORMANCE = {
  initialNumToRender: 8,
  maxToRenderPerBatch: 6,
  windowSize: 7,
} as const;

export type MobileChapterRow = {
  chapters:
    | readonly [ChapterSummary]
    | readonly [ChapterSummary, ChapterSummary];
  key: string;
};

/** Hoisted so a chapter list never allocates a `keyExtractor` per render. */
export function mobileChapterRowKeyExtractor(row: MobileChapterRow): string {
  return row.key;
}

function rowKey(
  first: ChapterSummary,
  second: ChapterSummary | undefined,
): string {
  return `${first.id.length}:${first.id}:${second?.id ?? ""}`;
}

export function buildMobileChapterRows(
  chapters: readonly ChapterSummary[],
): MobileChapterRow[] {
  const rows: MobileChapterRow[] = [];

  for (let index = 0; index < chapters.length; index += 2) {
    const first = chapters[index];
    if (!first) continue;
    const second = chapters[index + 1];
    rows.push({
      chapters: second ? [first, second] : [first],
      key: rowKey(first, second),
    });
  }

  return rows;
}
