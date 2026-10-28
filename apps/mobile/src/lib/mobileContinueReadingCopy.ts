import { sourceHasUpdate, type ChapterSummary, type LocalSourceLink } from "@/data/schema";
import { formatChapterShortLabel } from "./formatChapter";
import type { MobileStrings } from "./mobileI18n";

/**
 * Chapters published after the one being read, when both carry numbers
 * (a missing or non-numeric chapter on either side gives `null`).
 */
function getMobileNewChapterCount(
  lastReadNumber: number | undefined,
  latestNumber: number | undefined,
): number | null {
  if (lastReadNumber == null || latestNumber == null) return null;
  if (!Number.isFinite(lastReadNumber) || !Number.isFinite(latestNumber)) return null;
  const count = Math.floor(latestNumber) - Math.floor(lastReadNumber);
  return count > 0 ? count : null;
}

/**
 * "What is new" for a title: the chapters released after both the acknowledged chapter and the
 * one being read; null when unknown or nothing is new.
 */
export function getMobileExploreNewChapters(
  sources: readonly Pick<LocalSourceLink, "id" | "latestChapter" | "updateAckChapter" | "removed">[],
  reading: { sourceId: string | null; lastReadNumber?: number } = { sourceId: null },
): { count: number | null } | null {
  const updated = sources.filter((source) => source.removed !== true && sourceHasUpdate(source));
  if (!updated.length) return null;
  const source = updated.find((candidate) => candidate.id === reading.sourceId) ?? updated[0]!;
  const latest = source.latestChapter?.chapterNumber;
  const ack = source.updateAckChapter?.chapterNumber;
  const read = source.id === reading.sourceId ? reading.lastReadNumber : undefined;
  const seen = Math.max(
    typeof ack === "number" && Number.isFinite(ack) ? ack : Number.NEGATIVE_INFINITY,
    typeof read === "number" && Number.isFinite(read) ? read : Number.NEGATIVE_INFINITY,
  );
  // Read up to the newest chapter already: nothing is new, acknowledged or not.
  if (typeof latest === "number" && Number.isFinite(seen) && seen >= latest) return null;
  return { count: Number.isFinite(seen) ? getMobileNewChapterCount(seen, latest) : null };
}

/** The largest new-chapter count spelled out; anything above reads "999+". */
const MOBILE_NEW_CHAPTER_COUNT_CAP = 999;

/** A cover's new-chapters corner tag: "+12", or "999+" past the cap. */
export function formatMobileNewChapterTag(count: number): string {
  return count > MOBILE_NEW_CHAPTER_COUNT_CAP ? `${MOBILE_NEW_CHAPTER_COUNT_CAP}+` : `+${count}`;
}

/**
 * Short chapter label ("Ch.12", "Vol.3 Ch.12") for the design-explore
 * surfaces. Sources report "no volume" as volume 0, which is never shown.
 */
export function formatMobileExploreChapterLabel(
  chapter: ChapterSummary,
  strings: MobileStrings,
): string | null {
  return formatChapterShortLabel(withoutMobileZeroVolume(chapter), strings);
}

/**
 * The chapter's number alone ("Ch.12"), for a line with no room for its
 * volume or title; null for a chapter without a number.
 */
export function formatMobileExploreChapterNumber(
  chapter: ChapterSummary,
  strings: MobileStrings,
): string | null {
  return chapter.chapterNumber == null
    ? null
    : formatChapterShortLabel({ ...chapter, volumeNumber: undefined, title: undefined }, strings);
}

/** The chapter with a placeholder volume of 0 dropped. */
export function withoutMobileZeroVolume<T extends ChapterSummary>(chapter: T): T {
  return chapter.volumeNumber === 0 ? { ...chapter, volumeNumber: undefined } : chapter;
}
