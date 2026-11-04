import {
  makeChapterProgressId,
  makeMangaProgressId,
  type ChapterSummary,
  type LocalChapterProgress,
  type LocalMangaProgress,
} from "@/data/schema";
import { readerSourceIndexForDisplayIndex } from "./mobileReaderProgress";
import { normalizeMobileReaderIntraPageState } from "./mobileReaderProgressPersistence";
import type { ReadingMode } from "@/data/schema";

/**
 * The chapter a progress write is for. The reader used to read all of this
 * from its closure (the open chapter); seamless scroll can write for a
 * chapter that is no longer the open one (the chapter just left at a
 * crossing), so every write names its chapter explicitly.
 */
export type MobileReaderProgressTarget = Readonly<{
  chapterId: string;
  chapter: Pick<ChapterSummary, "chapterNumber" | "volumeNumber" | "title">;
  pageCount: number;
  /** That chapter's saved progress row, if any (completion and intra-page state carry over). */
  savedProgress: Pick<
    LocalChapterProgress,
    "completed" | "intraPageProgress" | "intraPageContentIdentity" | "updatedAt"
  > | null;
}>;

export type MobileReaderProgressSourceRef = Readonly<{
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
}>;

/**
 * The chapter and manga rows one progress write saves. Pure: every input is
 * explicit, so a write can never land on whichever chapter happens to be on
 * screen when it runs.
 */
export function buildMobileReaderProgressRecords(input: {
  target: MobileReaderProgressTarget;
  sourceRef: MobileReaderProgressSourceRef;
  libraryItemId?: string;
  complete: boolean;
  displayIndex: number;
  mode: ReadingMode;
  updatedAt: number;
  intraPageProgress?: number;
  intraPageContentIdentity?: string;
}): { chapterProgress: LocalChapterProgress; mangaProgress: LocalMangaProgress } {
  const { target, sourceRef, complete, mode, updatedAt } = input;
  const pageCount = target.pageCount;
  // Keep the user-facing read clock monotonic with the sync clock even if
  // the device wall clock moves backwards while the reader is open.
  const lastReadAt = updatedAt;
  const progress = complete
    ? Math.max(0, pageCount - 1)
    : readerSourceIndexForDisplayIndex(input.displayIndex, pageCount, mode);
  const total = Math.max(1, pageCount);
  // Never infer completion from the page position: opening a chapter at
  // its last page (backward navigation, or resuming saved progress) would
  // otherwise mark it read and sync that corruption. Completion is either
  // explicit or already recorded.
  const completed = complete || (target.savedProgress?.completed ?? false);
  const intraPageState =
    normalizeMobileReaderIntraPageState({
      intraPageProgress: input.intraPageProgress,
      intraPageContentIdentity: input.intraPageContentIdentity,
    }) ??
    normalizeMobileReaderIntraPageState({
      intraPageProgress: target.savedProgress?.intraPageProgress,
      intraPageContentIdentity: target.savedProgress?.intraPageContentIdentity,
    });
  const chapterProgress: LocalChapterProgress = {
    id: makeChapterProgressId(
      sourceRef.registryId,
      sourceRef.sourceId,
      sourceRef.sourceMangaId,
      target.chapterId,
    ),
    registryId: sourceRef.registryId,
    sourceId: sourceRef.sourceId,
    sourceMangaId: sourceRef.sourceMangaId,
    sourceChapterId: target.chapterId,
    libraryItemId: input.libraryItemId,
    progress,
    total,
    completed,
    lastReadAt,
    chapterNumber: target.chapter.chapterNumber,
    volumeNumber: target.chapter.volumeNumber,
    chapterTitle: target.chapter.title,
    ...(intraPageState ?? {}),
    updatedAt,
  };
  const mangaProgress: LocalMangaProgress = {
    id: makeMangaProgressId(sourceRef.registryId, sourceRef.sourceId, sourceRef.sourceMangaId),
    registryId: sourceRef.registryId,
    sourceId: sourceRef.sourceId,
    sourceMangaId: sourceRef.sourceMangaId,
    libraryItemId: input.libraryItemId,
    lastReadAt,
    lastReadSourceChapterId: target.chapterId,
    lastReadChapterNumber: target.chapter.chapterNumber,
    lastReadVolumeNumber: target.chapter.volumeNumber,
    lastReadChapterTitle: target.chapter.title,
    updatedAt,
  };
  return { chapterProgress, mangaProgress };
}

/**
 * Whether a finished write may refresh the screen's progress state: only
 * when it was for the chapter on screen now. A write for the chapter just
 * left must never overwrite the new chapter's state.
 */
export function shouldApplyMobileReaderProgressToScreen(
  targetChapterId: string,
  currentChapterId: string,
  updateState: boolean | undefined,
): boolean {
  return updateState !== false && targetChapterId === currentChapterId;
}
