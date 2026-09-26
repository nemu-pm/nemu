/**
 * "Start reading" / "Continue" target selection, shared by web and mobile.
 *
 * Source chapter lists have no guaranteed order. Aidoku's convention is newest
 * first, which is why both apps used to take the *last* array element as the
 * first chapter — but plenty of sources return oldest first, and some group by
 * volume with the volume-less latest chapters trailing the list (MangaDex
 * Frieren ended in Ch. 138, so "Start reading" opened the newest chapter).
 * The first chapter is therefore picked by chapter/volume number, and the raw
 * list order is only a fallback and a tie-breaker.
 */

export type ContinueChapterCandidate = {
  id: string;
  chapterNumber?: number;
  volumeNumber?: number;
  locked?: boolean;
};

export type ContinueReadingProgress = {
  lastReadSourceChapterId?: string;
  lastReadChapterNumber?: number;
  lastReadVolumeNumber?: number;
};

export type ChapterListOrder = "ascending" | "descending";

export type ContinueChapterTarget<T> = {
  chapter: T | null;
  /** True when `chapter` resumes existing progress. */
  isContinuation: boolean;
};

/** Sources use -1 (or omit the field) for "no number". */
function validNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function orderingNumber(chapter: ContinueChapterCandidate): number | undefined {
  return validNumber(chapter.chapterNumber) ?? validNumber(chapter.volumeNumber);
}

/**
 * Direction the source lists its chapters in, inferred from how the numbers
 * move between neighbours. Ties (and lists without numbers) fall back to the
 * Aidoku convention of newest first.
 */
export function inferChapterListOrder(
  chapters: readonly ContinueChapterCandidate[],
): ChapterListOrder {
  let ascending = 0;
  let descending = 0;
  let previous: number | undefined;
  for (const chapter of chapters) {
    const current = orderingNumber(chapter);
    if (current === undefined) continue;
    if (previous !== undefined) {
      if (current > previous) ascending += 1;
      else if (current < previous) descending += 1;
    }
    previous = current;
  }
  return ascending > descending ? "ascending" : "descending";
}

/**
 * The chapter a reader with no progress should start from: the lowest chapter
 * number (volume number when a source only numbers volumes), preferring the
 * lower volume when numbering restarts per volume, an unlocked upload over a
 * locked one, and otherwise the copy at the list's oldest end. Lists without
 * any numbers use the oldest end of the inferred order.
 */
export function findFirstChapterToRead<T extends ContinueChapterCandidate>(
  chapters: readonly T[],
): T | null {
  if (chapters.length === 0) return null;
  const order = inferChapterListOrder(chapters);
  // Distance from the oldest end of the list, so lower is "older".
  const age = (index: number) =>
    order === "descending" ? chapters.length - 1 - index : index;

  const hasChapterNumbers = chapters.some(
    (chapter) => validNumber(chapter.chapterNumber) !== undefined,
  );
  const primary = (chapter: T) =>
    hasChapterNumbers
      ? validNumber(chapter.chapterNumber)
      : validNumber(chapter.volumeNumber);

  let best: { chapter: T; index: number } | null = null;
  chapters.forEach((chapter, index) => {
    const number = primary(chapter);
    if (number === undefined) return;
    if (!best) {
      best = { chapter, index };
      return;
    }
    const current: { chapter: T; index: number } = best;
    const bestNumber = primary(current.chapter)!;
    if (number !== bestNumber) {
      if (number < bestNumber) best = { chapter, index };
      return;
    }
    if (hasChapterNumbers) {
      const volume = validNumber(chapter.volumeNumber) ?? Number.POSITIVE_INFINITY;
      const bestVolume =
        validNumber(current.chapter.volumeNumber) ?? Number.POSITIVE_INFINITY;
      if (volume !== bestVolume) {
        if (volume < bestVolume) best = { chapter, index };
        return;
      }
    }
    const locked = chapter.locked === true;
    const bestLocked = current.chapter.locked === true;
    if (locked !== bestLocked) {
      if (!locked) best = { chapter, index };
      return;
    }
    if (age(index) < age(current.index)) best = { chapter, index };
  });

  if (best) return (best as { chapter: T }).chapter;
  return order === "descending" ? chapters[chapters.length - 1] : chapters[0];
}

function findProgressChapter<T extends ContinueChapterCandidate>(
  chapters: readonly T[],
  progress: ContinueReadingProgress,
): T | null {
  const id = progress.lastReadSourceChapterId;
  if (id) {
    const byId = chapters.find((chapter) => chapter.id === id);
    if (byId) return byId;
  }
  // The source re-keyed its chapters (new scanlator upload, id scheme change):
  // resume at the same chapter number rather than restarting from chapter 1.
  const chapterNumber = validNumber(progress.lastReadChapterNumber);
  if (chapterNumber === undefined) return null;
  const volumeNumber = validNumber(progress.lastReadVolumeNumber);
  const sameNumber = chapters.filter(
    (chapter) => validNumber(chapter.chapterNumber) === chapterNumber,
  );
  if (sameNumber.length === 0) return null;
  const sameVolume =
    volumeNumber === undefined
      ? []
      : sameNumber.filter(
          (chapter) => validNumber(chapter.volumeNumber) === volumeNumber,
        );
  return findFirstChapterToRead(sameVolume.length > 0 ? sameVolume : sameNumber);
}

/**
 * Target of a manga's primary reading action: resume the in-progress chapter
 * when the progress still resolves to one, otherwise start from the first
 * chapter (see {@link findFirstChapterToRead}).
 */
export function resolveContinueChapter<T extends ContinueChapterCandidate>(
  chapters: readonly T[],
  progress: ContinueReadingProgress | null | undefined,
): ContinueChapterTarget<T> {
  if (progress) {
    const resumed = findProgressChapter(chapters, progress);
    if (resumed) return { chapter: resumed, isContinuation: true };
  }
  return { chapter: findFirstChapterToRead(chapters), isContinuation: false };
}
