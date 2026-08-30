import type { ReadingMode, ChapterSummary } from "@/data/schema";

export type MobileReaderChapterNavigation = {
  previousChapter: ChapterSummary | null;
  nextChapter: ChapterSummary | null;
  leftChapter: ChapterSummary | null;
  rightChapter: ChapterSummary | null;
};

export function getMobileReaderChapterNavigation(
  newestFirstChapters: ChapterSummary[],
  currentChapterId: string,
  mode: ReadingMode
): MobileReaderChapterNavigation {
  const readOrder = [...newestFirstChapters].reverse();
  const currentIndex = readOrder.findIndex((chapter) => chapter.id === currentChapterId);
  const previousChapter = currentIndex > 0 ? readOrder[currentIndex - 1] ?? null : null;
  const nextChapter =
    currentIndex >= 0 && currentIndex < readOrder.length - 1
      ? readOrder[currentIndex + 1] ?? null
      : null;

  return {
    previousChapter,
    nextChapter,
    leftChapter: mode === "rtl" ? nextChapter : previousChapter,
    rightChapter: mode === "rtl" ? previousChapter : nextChapter,
  };
}
