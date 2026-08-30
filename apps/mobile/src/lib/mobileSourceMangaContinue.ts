import type { ChapterSummary, LocalMangaProgress } from "@/data/schema";

export type MobileSourceMangaContinueTarget = {
  chapter: ChapterSummary | null;
  isContinuation: boolean;
};

export function getMobileSourceMangaContinueTarget(
  chapters: ChapterSummary[],
  progress: LocalMangaProgress | null | undefined,
): MobileSourceMangaContinueTarget {
  const fallbackChapter = chapters[chapters.length - 1] ?? null;
  const lastReadChapterId = progress?.lastReadSourceChapterId;
  if (!lastReadChapterId) {
    return { chapter: fallbackChapter, isContinuation: false };
  }

  const lastReadChapter =
    chapters.find((chapter) => chapter.id === lastReadChapterId) ?? null;
  if (!lastReadChapter) {
    return { chapter: fallbackChapter, isContinuation: false };
  }

  return { chapter: lastReadChapter, isContinuation: true };
}
