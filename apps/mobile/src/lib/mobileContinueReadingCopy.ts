import { sourceHasUpdate, type ChapterSummary, type LocalSourceLink } from "@/data/schema";
import { formatChapterShortLabel } from "./formatChapter";
import { formatMobileString, type MobileStrings } from "./mobileI18n";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "3 h ago" for a continue-reading card; `null` for future/invalid times. */
export function formatMobileLastRead(
  lastReadAt: number,
  now: number,
  strings: MobileStrings,
): string | null {
  if (!Number.isFinite(lastReadAt) || lastReadAt <= 0) return null;
  const elapsed = now - lastReadAt;
  if (elapsed < -MINUTE) return null;
  const copy = strings.designExplore;
  if (elapsed < MINUTE) return copy.lastReadJustNow;
  if (elapsed < HOUR) {
    return formatMobileString(copy.lastReadMinutes, { count: Math.floor(elapsed / MINUTE) });
  }
  if (elapsed < DAY) {
    return formatMobileString(copy.lastReadHours, { count: Math.floor(elapsed / HOUR) });
  }
  return formatMobileString(copy.lastReadDays, { count: Math.floor(elapsed / DAY) });
}

/**
 * Chapters published after the one being read, when both carry numbers
 * (a missing or non-numeric chapter on either side gives `null`).
 */
export function getMobileNewChapterCount(
  lastReadNumber: number | undefined,
  latestNumber: number | undefined,
): number | null {
  if (lastReadNumber == null || latestNumber == null) return null;
  if (!Number.isFinite(lastReadNumber) || !Number.isFinite(latestNumber)) return null;
  const count = Math.floor(latestNumber) - Math.floor(lastReadNumber);
  return count > 0 ? count : null;
}

/**
 * "What is new" for a title, the same on the card, the shelf and anywhere
 * else: nothing unless one of its sources has chapters the user has not
 * acknowledged (the library's own update state), and then how many came out
 * after both the acknowledged chapter and the one being read — not how far
 * the reader is behind ("130 new" on a title read to Ch.1 of 131 with
 * nothing released since was wrong). The source being read is preferred.
 * `count` is null when the numbers are not known: a bare "new".
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

/** "12" up to the cap, then "999+", so a badge never grows without bound. */
export function formatMobileNewChapterCount(count: number): string {
  return count > MOBILE_NEW_CHAPTER_COUNT_CAP ? `${MOBILE_NEW_CHAPTER_COUNT_CAP}+` : String(count);
}

/** A shelf cover's corner tag: "+12", or "999+" past the cap. */
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

/** The chapter with a placeholder volume of 0 dropped. */
export function withoutMobileZeroVolume<T extends ChapterSummary>(chapter: T): T {
  return chapter.volumeNumber === 0 ? { ...chapter, volumeNumber: undefined } : chapter;
}
