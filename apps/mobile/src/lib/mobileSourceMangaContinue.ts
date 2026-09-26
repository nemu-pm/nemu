import { resolveContinueChapter } from "@nemu/core/library";
import type { ChapterSummary, LocalMangaProgress } from "@/data/schema";

export type MobileSourceMangaContinueTarget = {
  chapter: ChapterSummary | null;
  isContinuation: boolean;
};

/**
 * Resume the in-progress chapter, or start from the first chapter by
 * chapter/volume number — never the last element of the source's raw order,
 * which is the newest chapter for oldest-first and volume-grouped sources.
 * Shared with the web detail pages through `@nemu/core/library`.
 */
export function getMobileSourceMangaContinueTarget(
  chapters: ChapterSummary[],
  progress: LocalMangaProgress | null | undefined,
): MobileSourceMangaContinueTarget {
  return resolveContinueChapter(chapters, progress);
}
