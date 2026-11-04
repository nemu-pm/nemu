import { resolveContinueChapter } from "@nemu/core/library";
import type {
  ChapterSummary,
  LocalChapterProgress,
  LocalMangaProgress,
} from "@/data/schema";

export type MobileSourceMangaContinueTarget = {
  chapter: ChapterSummary | null;
  isContinuation: boolean;
  /**
   * The last-read chapter is finished and nothing unread follows it: the
   * action says "Caught up" and reopens that chapter (from page 1).
   */
  caughtUp?: boolean;
};

/** Per-chapter progress of one source title, keyed by source chapter id. */
export type MobileSourceChapterCompletion = Readonly<
  Record<string, Pick<LocalChapterProgress, "completed"> | undefined>
>;

/**
 * Resume the in-progress chapter, or start from the first chapter by
 * chapter/volume number — never the last element of the source's raw order,
 * which is the newest chapter for oldest-first and volume-grouped sources.
 * A finished last-read chapter (its chapter progress is `completed`) moves on
 * to the next unread chapter, or is caught up when none follows.
 * Shared with the web detail pages through `@nemu/core/library`.
 */
export function getMobileSourceMangaContinueTarget(
  chapters: ChapterSummary[],
  progress: LocalMangaProgress | null | undefined,
  chapterProgress?: MobileSourceChapterCompletion | null,
): MobileSourceMangaContinueTarget {
  return resolveContinueChapter(
    chapters,
    progress,
    chapterProgress
      ? { isCompleted: (chapter) => chapterProgress[chapter.id]?.completed === true }
      : {},
  );
}

/** The chapter the work's progress names, as a summary. */
export function getMobileProgressChapter(
  progress: LocalMangaProgress | null | undefined,
): ChapterSummary | null {
  if (!progress?.lastReadSourceChapterId) return null;
  return {
    id: progress.lastReadSourceChapterId,
    title: progress.lastReadChapterTitle,
    chapterNumber: progress.lastReadChapterNumber,
    volumeNumber: progress.lastReadVolumeNumber,
  };
}

/**
 * Continue's target for a surface that may not have the chapter list yet
 * (the Library card, the detail page of another source's progress). With the
 * list, the shared resolver decides. Without it, the progress' own chapter is
 * the target, and a finished one that is the source's latest chapter is
 * caught up; a finished one with chapters after it stays named until the
 * list is known (nothing says which chapter comes next).
 */
export function resolveMobileContinueTarget({
  chapters,
  progress,
  chapterProgress,
  latestChapter,
}: {
  chapters: ChapterSummary[] | null | undefined;
  progress: LocalMangaProgress | null | undefined;
  chapterProgress?: MobileSourceChapterCompletion | null;
  latestChapter?: ChapterSummary | null;
}): MobileSourceMangaContinueTarget {
  if (chapters && chapters.length > 0) {
    const target = getMobileSourceMangaContinueTarget(chapters, progress, chapterProgress);
    if (target.isContinuation || !getMobileProgressChapter(progress)) return target;
    // The list no longer holds the progress' chapter: keep resuming it.
  }
  const chapter = getMobileProgressChapter(progress);
  if (!chapter) return { chapter: latestChapter ?? null, isContinuation: false };
  const caughtUp =
    chapterProgress?.[chapter.id]?.completed === true &&
    Boolean(latestChapter && latestChapter.id === chapter.id);
  return caughtUp
    ? { chapter, isContinuation: true, caughtUp: true }
    : { chapter, isContinuation: true };
}
