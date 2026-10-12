import { inferChapterListOrder } from "@nemu/core/library";
import type { ChapterSummary } from "@/data/schema";

type OrderableChapter = Pick<
  ChapterSummary,
  "id" | "chapterNumber" | "volumeNumber" | "locked"
>;

/**
 * A source's chapter list, newest first, in the source's own order.
 *
 * The list is what the source (and the web detail page, and Aidoku's default
 * "source order") presents: numbers are optional and unreliable — 漫画人
 * returns none, 拷贝漫画 numbers only volumes and interleaves unnumbered
 * extras, MangaDex groups by volume with the volume-less latest chapters
 * trailing — so they never reorder the list. They only tell an oldest-first
 * source apart from the Aidoku newest-first convention, which is reversed so
 * the first element is always the latest chapter (library updates, reader
 * navigation and the "Descending" list all rely on that).
 */
export function orderMobileChaptersNewestFirst<T extends OrderableChapter>(
  chapters: readonly T[],
): T[] {
  return inferChapterListOrder(chapters) === "ascending"
    ? [...chapters].reverse()
    : [...chapters];
}

/** Sources use -1 (or omit the field) for "no number". */
function orderingNumber(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : Number.NEGATIVE_INFINITY;
}

/**
 * Chapters with no source list to take an order from (progress rows, a
 * link's latest/acknowledged chapter), newest first by chapter then volume
 * number. Ties keep their input order — never an id comparison, which is
 * lexicographic ("99254" > "1837412") rather than chronological.
 */
export function sortMobileChaptersByNumber<T extends OrderableChapter>(
  chapters: readonly T[],
): T[] {
  return chapters
    .map((chapter, index) => ({
      chapter,
      index,
      chapterNumber: orderingNumber(chapter.chapterNumber),
      volumeNumber: orderingNumber(chapter.volumeNumber),
    }))
    .sort((left, right) => {
      if (left.chapterNumber !== right.chapterNumber) {
        return left.chapterNumber < right.chapterNumber ? 1 : -1;
      }
      if (left.volumeNumber !== right.volumeNumber) {
        return left.volumeNumber < right.volumeNumber ? 1 : -1;
      }
      return left.index - right.index;
    })
    .map(({ chapter }) => chapter);
}

/**
 * A library entry's chapters: the source's list in its (newest-first) order,
 * followed by chapters only known locally that the list does not contain —
 * the whole result when no list has loaded yet.
 */
export function orderMobileKnownChapters<T extends OrderableChapter>(
  chapters: readonly T[],
  sourceListIds: ReadonlySet<string>,
): T[] {
  const listed: T[] = [];
  const unlisted: T[] = [];
  for (const chapter of chapters) {
    (sourceListIds.has(chapter.id) ? listed : unlisted).push(chapter);
  }
  return [...listed, ...sortMobileChaptersByNumber(unlisted)];
}

function withoutUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, field]) => field !== undefined),
  ) as Partial<T>;
}

/**
 * Two records for one chapter id: `primary` (the source list's) keeps every
 * field it has; `secondary` (a progress row or a link's latest chapter) only
 * fills the gaps, so a read chapter keeps its language, scanlator and lock.
 */
export function mergeMobileChapterRecord<T extends { id: string }>(primary: T, secondary: T): T {
  return { ...withoutUndefined(secondary), ...withoutUndefined(primary) } as T;
}
