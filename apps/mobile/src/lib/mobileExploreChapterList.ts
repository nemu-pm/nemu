import type { ChapterSummary, LocalChapterProgress } from "@/data/schema";
import type { MobileChapterRow } from "./mobileChapterRows";

/**
 * The design-explore chapter list: one chapter per row (states read at a
 * glance down a single column), headed by volume where the source numbers
 * volumes, with the chapter to read next marked and reachable in one tap.
 * Pure helpers; the rows are drawn by `MobileExploreChapterRow`.
 */

/** One chapter per row, in the order given (the list's sort and filter). */
export function buildMobileExploreChapterRows(chapters: readonly ChapterSummary[]): MobileChapterRow[] {
  return chapters.map((chapter) => ({ chapters: [chapter] as const, key: `${chapter.id.length}:${chapter.id}` }));
}

export type MobileChapterVolumeHeader = {
  /** The volume, or null for a run of chapters the source gives no volume. */
  volume: number | null;
  /**
   * A run without a volume that comes after every collected chapter (the
   * newest, not yet in a book): the last volume, so it reads "After Volume 25".
   * Null for a volume's own run, and for a run without a volume elsewhere
   * (an extra between volumes), which reads "Other chapters".
   */
  after?: number | null;
  /** Lowest and highest chapter numbers in the run, when known. */
  from: number | null;
  to: number | null;
  count: number;
};

/** A source counts as numbering volumes when most chapters carry one and there are at least two. */
const VOLUME_SHARE = 0.6;

function volumeOf(chapter: ChapterSummary): number | null {
  const volume = chapter.volumeNumber;
  // A placeholder volume of 0 (some sources number everything as volume 0) is no volume.
  return typeof volume === "number" && Number.isFinite(volume) && volume > 0 ? volume : null;
}

/**
 * Volume headers for a list in display order: the first chapter of every run
 * of the same volume gets one. None at all when the source does not number
 * volumes (fewer than two volumes, or most chapters without one), so a
 * chapter-only list stays a plain list.
 */
export function getMobileChapterVolumeHeaders(
  chapters: readonly ChapterSummary[],
): Map<string, MobileChapterVolumeHeader> {
  const headers = new Map<string, MobileChapterVolumeHeader>();
  if (chapters.length < 2) return headers;
  const volumes = new Set<number>();
  let numbered = 0;
  for (const chapter of chapters) {
    const volume = volumeOf(chapter);
    if (volume === null) continue;
    numbered += 1;
    volumes.add(volume);
  }
  if (volumes.size < 2 || numbered / chapters.length < VOLUME_SHARE) return headers;
  let lastVolume = 0;
  let lastCollected = Number.NEGATIVE_INFINITY;
  for (const chapter of chapters) {
    const volume = volumeOf(chapter);
    if (volume === null) continue;
    lastVolume = Math.max(lastVolume, volume);
    if (typeof chapter.chapterNumber === "number" && Number.isFinite(chapter.chapterNumber)) {
      lastCollected = Math.max(lastCollected, chapter.chapterNumber);
    }
  }
  let runStart = 0;
  for (let index = 1; index <= chapters.length; index += 1) {
    const ended = index === chapters.length || volumeOf(chapters[index]!) !== volumeOf(chapters[runStart]!);
    if (!ended) continue;
    const run = chapters.slice(runStart, index);
    // Rounded to the hundredth, as chapter labels are: sources store 102.6
    // as 102.5999984741211, which a header printed as it came.
    const numbers = run
      .map((chapter) => chapter.chapterNumber)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
      .map((value) => Math.round(value * 100) / 100);
    const volume = volumeOf(chapters[runStart]!);
    const from = numbers.length ? Math.min(...numbers) : null;
    headers.set(chapters[runStart]!.id, {
      volume,
      from,
      to: numbers.length ? Math.max(...numbers) : null,
      count: run.length,
      ...(volume === null ? { after: from !== null && from > lastCollected ? lastVolume : null } : {}),
    });
    runStart = index;
  }
  return headers;
}

/**
 * What Continue opens, as the chapter list sees it: the chapter, and whether
 * it is on the source the list shows (a title read on several sources resumes
 * on the one read last, whichever source the list is showing).
 */
export type MobileUpNextTarget = {
  chapter: Pick<ChapterSummary, "id" | "chapterNumber" | "volumeNumber"> | null;
  sameSource: boolean;
};

function sameNumber(a: number | undefined, b: number | undefined): boolean {
  return typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Math.abs(a - b) < 1e-6;
}

/**
 * The row marked "Up next" and brought into view by the jump capsule. It is
 * always where Continue goes, so the list and the button never disagree:
 * - Continue's chapter, when it is on this source and shown;
 * - on another source, this source's chapter with the same number (and the
 *   same volume when both give one), so "Up next · Ch.1" sits under
 *   "Continue Chapter 1";
 * - nothing when the list does not show that chapter (filtered out, or this
 *   source has no such number): no row is promoted that Continue would not open.
 * Only when there is nothing to continue at all (nothing read yet, or the
 * target is not known yet) does it fall back to this list's own state: the
 * first chapter in progress, else the first unread one in reading order
 * (lowest number first, whatever the list's sort). Null when everything shown
 * is read.
 */
export function findMobileUpNextIndex(
  chapters: readonly ChapterSummary[],
  progressById: Record<string, Pick<LocalChapterProgress, "completed" | "progress"> | undefined>,
  target: MobileUpNextTarget,
): number | null {
  const wanted = target.chapter;
  if (wanted) {
    if (target.sameSource) {
      const index = chapters.findIndex((chapter) => chapter.id === wanted.id);
      return index >= 0 ? index : null;
    }
    if (typeof wanted.chapterNumber !== "number" || !Number.isFinite(wanted.chapterNumber)) return null;
    const index = chapters.findIndex(
      (chapter) =>
        !chapter.locked &&
        sameNumber(chapter.chapterNumber, wanted.chapterNumber) &&
        (typeof chapter.volumeNumber !== "number" ||
          typeof wanted.volumeNumber !== "number" ||
          chapter.volumeNumber === wanted.volumeNumber),
    );
    return index >= 0 ? index : null;
  }
  const inProgress = chapters.findIndex((chapter) => {
    const progress = progressById[chapter.id];
    return Boolean(progress && !progress.completed && progress.progress > 0);
  });
  if (inProgress >= 0) return inProgress;
  let best: number | null = null;
  chapters.forEach((chapter, index) => {
    if (progressById[chapter.id]?.completed || chapter.locked) return;
    if (best === null) {
      best = index;
      return;
    }
    const current = chapters[best]!.chapterNumber ?? Number.POSITIVE_INFINITY;
    if ((chapter.chapterNumber ?? Number.POSITIVE_INFINITY) < current) best = index;
  });
  return best;
}

/**
 * The group (scanlator) most of the list shares, to say once above the list
 * instead of under every row: "单话" or "Flame Scans" under 150 chapters says
 * nothing per row. Needs at least four chapters and 80 % of them, so a list
 * that genuinely alternates groups keeps them on the rows. Null otherwise.
 */
export const MOBILE_CHAPTER_COMMON_GROUP_SHARE = 0.8;

export function getMobileChapterListCommonGroup(chapters: readonly Pick<ChapterSummary, "scanlator">[]): string | null {
  if (chapters.length < 4) return null;
  const counts = new Map<string, number>();
  for (const chapter of chapters) {
    const group = chapter.scanlator?.trim();
    if (group) counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [group, count] of counts) {
    if (count > bestCount) {
      best = group;
      bestCount = count;
    }
  }
  return best && bestCount / chapters.length >= MOBILE_CHAPTER_COMMON_GROUP_SHARE ? best : null;
}

/**
 * A row's second line: the source's chapter title when it says more than the
 * number, and the group when it is not the one the list header already names.
 */
export function getMobileExploreChapterRowSubtitle(
  chapter: Pick<ChapterSummary, "title" | "scanlator">,
  commonGroup: string | null,
): string | null {
  const group = chapter.scanlator?.trim() || null;
  return (
    [getMobileExploreChapterSubtitle(chapter), group && group !== commonGroup ? group : null]
      .filter(Boolean)
      .join(" · ") || null
  );
}

/**
 * The source's own chapter title, only when it says more than the number the
 * row already shows: "第132话 (10p)", "Chapter 12", "Ch. 12" and the like
 * restate the row's title and are dropped; "第01回 決戦" keeps "決戦" by
 * keeping the whole title.
 */
export function getMobileExploreChapterSubtitle(chapter: Pick<ChapterSummary, "title">): string | null {
  const title = chapter.title?.trim();
  if (!title) return null;
  const rest = title
    .replace(/第\s*[\d０-９.]+\s*[话話回章集卷巻]/g, "")
    .replace(/\b(chapter|chap|ch|episode|ep|vol|volume)\.?\s*[\d.]+/gi, "")
    .replace(/[(（]\s*\d+\s*p\s*[)）]/gi, "")
    .replace(/[\s\-–—:：·・,，.。()（）[\]【】#]+/g, "");
  return rest ? title : null;
}
