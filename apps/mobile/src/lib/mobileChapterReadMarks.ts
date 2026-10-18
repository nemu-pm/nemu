import {
  chapterProgressHasReading,
  chapterProgressMarkedUnread,
  mangaProgressAfterChapterReset,
  mangaProgressFromChapterProgress,
} from "@nemu/core";
import {
  makeChapterProgressId,
  type ChapterSummary,
  type LocalChapterProgress,
  type LocalMangaProgress,
} from "@/data/schema";

/**
 * The detail page's "mark read" actions: one chapter (标记为已读), every
 * chapter before it (将之前的章节标记为已读), or the whole work (标记为已读完).
 * Mark as Unread (标记为未读) is below: chapter progress merges by high-water
 * mark, so it saves a reset clock instead (`mergeChapterProgressHighWater`).
 */
export type MobileChapterReadMarkScope =
  | { kind: "chapter"; chapterId: string }
  | { kind: "previous"; chapterId: string }
  | { kind: "all" };

/**
 * The chapters a mark covers that are not read yet, newest first. `chapters`
 * is the source's list in its own order (newest first), whatever order the
 * page shows it in, so "before" means earlier in reading order.
 */
export function selectMobileChaptersToMarkRead(
  chapters: readonly ChapterSummary[],
  progressById: Record<string, Pick<LocalChapterProgress, "completed"> | undefined>,
  scope: MobileChapterReadMarkScope,
): ChapterSummary[] {
  let covered: readonly ChapterSummary[];
  if (scope.kind === "all") {
    covered = chapters;
  } else {
    const index = chapters.findIndex((chapter) => chapter.id === scope.chapterId);
    if (index < 0) return [];
    covered = scope.kind === "chapter" ? [chapters[index]!] : chapters.slice(index + 1);
  }
  return covered.filter((chapter) => !progressById[chapter.id]?.completed);
}

export type MobileChapterReadMarks = {
  /** Rows to save as one batch; they sync like the reader's own. */
  chapterProgress: LocalChapterProgress[];
  /**
   * The work's progress once the batch is saved (the Continue target). The
   * sync store derives one from each saved row, so it is written after.
   */
  mangaProgress: LocalMangaProgress | null;
};

/**
 * The progress rows for marking `marked` (newest first) read. A mark moves
 * Continue only when it reaches at least as far as where the reader is now:
 * then, as the reader does when it turns into the next chapter, the chapter
 * after the newest marked one (unread, no pages) carries the read event, so
 * Continue and Up next land on it; with nothing after it, the newest marked
 * chapter does. Marking chapters behind the current position leaves Continue
 * alone. The server keeps the read event with the latest `lastReadAt` as the
 * work's summary, so exactly one row carries `now`, and none does when the
 * mark is behind.
 */
export function buildMobileChapterReadMarks({
  marked,
  chapters,
  progressById,
  source,
  libraryItemId,
  mangaProgress,
  now,
}: {
  marked: readonly ChapterSummary[];
  /** The source's whole list, newest first. */
  chapters: readonly ChapterSummary[];
  progressById: Record<string, LocalChapterProgress | undefined>;
  source: { registryId: string; sourceId: string; sourceMangaId: string };
  libraryItemId?: string;
  mangaProgress: LocalMangaProgress | null | undefined;
  now: number;
}): MobileChapterReadMarks {
  if (marked.length === 0) return { chapterProgress: [], mangaProgress: null };
  const indexOf = (chapterId: string | undefined) =>
    chapterId ? chapters.findIndex((chapter) => chapter.id === chapterId) : -1;
  const frontier = indexOf(marked[0]!.id);
  const current = indexOf(mangaProgress?.lastReadSourceChapterId);
  const advances = !mangaProgress || current < 0 || (frontier >= 0 && frontier <= current);
  // Behind the current position: older than its read event, so it stays the summary.
  const behind = mangaProgress ? Math.max(0, Math.min(now, mangaProgress.lastReadAt) - 1) : now;

  const next = advances && frontier > 0 ? chapters[frontier - 1] : undefined;
  const bookmark = next && !next.locked && !progressById[next.id]?.completed ? next : undefined;
  const rowFor = (chapter: ChapterSummary, completed: boolean, lastReadAt: number): LocalChapterProgress => {
    const existing = progressById[chapter.id];
    return {
      id: makeChapterProgressId(source.registryId, source.sourceId, source.sourceMangaId, chapter.id),
      registryId: source.registryId,
      sourceId: source.sourceId,
      sourceMangaId: source.sourceMangaId,
      sourceChapterId: chapter.id,
      libraryItemId: libraryItemId ?? existing?.libraryItemId,
      progress: existing?.progress ?? 0,
      total: existing?.total ?? 0,
      completed: completed || Boolean(existing?.completed),
      lastReadAt,
      chapterNumber: chapter.chapterNumber,
      volumeNumber: chapter.volumeNumber,
      chapterTitle: chapter.title,
      updatedAt: now,
    };
  };
  const chapterProgress = marked.map((chapter, index) => {
    const existing = progressById[chapter.id]?.lastReadAt;
    const lastReadAt = advances
      ? index === 0 && !bookmark
        ? now
        : Math.min(existing ?? now - 1 - index, now - 1)
      : Math.min(existing ?? behind, behind);
    return rowFor(chapter, true, lastReadAt);
  });
  const event = bookmark ? rowFor(bookmark, false, now) : chapterProgress[0]!;
  return {
    chapterProgress: bookmark ? [event, ...chapterProgress] : chapterProgress,
    mangaProgress: advances
      ? mangaProgressFromChapterProgress(event, now)
      : mangaProgress
        ? { ...mangaProgress, updatedAt: now }
        : null,
  };
}

/** Mark as Unread: one chapter's long press, or the whole work's menu. */
export type MobileChapterUnreadMarkScope =
  | { kind: "chapter"; chapterId: string }
  | { kind: "all" };

/** The stored rows a Mark as Unread covers that hold any reading. */
export function selectMobileChapterProgressToMarkUnread(
  chapters: readonly ChapterSummary[],
  progressById: Record<string, LocalChapterProgress | undefined>,
  scope: MobileChapterUnreadMarkScope,
): LocalChapterProgress[] {
  const covered =
    scope.kind === "all"
      ? chapters
      : chapters.filter((chapter) => chapter.id === scope.chapterId);
  return covered.flatMap((chapter) => {
    const progress = progressById[chapter.id];
    return progress && chapterProgressHasReading(progress) ? [progress] : [];
  });
}

/**
 * The rows for marking `marked` unread: each keeps its identity and metadata
 * and loses its reading behind a reset clock that every device and the
 * server honour. When the work's Continue target is one of them it moves back
 * to the newest chapter still read, or is cleared with nothing left.
 */
export function buildMobileChapterUnreadMarks({
  marked,
  progressById,
  mangaProgress,
}: {
  marked: readonly LocalChapterProgress[];
  progressById: Record<string, LocalChapterProgress | undefined>;
  mangaProgress: LocalMangaProgress | null | undefined;
}): MobileChapterReadMarks {
  if (marked.length === 0) return { chapterProgress: [], mangaProgress: null };
  const chapterProgress = marked.map((progress) => chapterProgressMarkedUnread(progress));
  const resetIds = new Set(chapterProgress.map((progress) => progress.sourceChapterId));
  const remaining = Object.values(progressById).filter(
    (progress): progress is LocalChapterProgress =>
      progress !== undefined && !resetIds.has(progress.sourceChapterId),
  );
  return {
    chapterProgress,
    mangaProgress: mangaProgressAfterChapterReset(
      mangaProgress,
      [...remaining, ...chapterProgress],
      resetIds,
      Math.max(...chapterProgress.map((progress) => progress.updatedAt)),
    ),
  };
}

/** A link the share sheet and the clipboard may carry: http(s) only. */
export function resolveMobileShareUrl(url: string | null | undefined): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  return /^https?:\/\/[^\s/]+/i.test(trimmed) ? trimmed : null;
}
