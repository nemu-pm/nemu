import {
  resolveSecondaryChapterSelection,
  type ChapterPairSeed,
} from "@nemu/core/dual-reader";
import type { ChapterSummary } from "@/data/schema";
import { formatChapterTitle } from "@/lib/formatChapter";
import type { MobileStrings } from "@/lib/mobileI18n";

/**
 * The paired chapter the Dual Read sheet should have selected, using web's
 * matcher: keep a still-valid explicit choice, else map through the stored
 * seed pair, else the closest chapter number, else title/position similarity.
 * Returns null until both chapter lists are known.
 */
export function pickMobileDualReadSecondaryChapterId({
  selectedId,
  primaryChapter,
  primaryChapters,
  secondaryChapters,
  seedPair,
}: {
  selectedId: string | null;
  primaryChapter: ChapterSummary | null | undefined;
  primaryChapters: readonly ChapterSummary[];
  secondaryChapters: readonly ChapterSummary[];
  seedPair?: ChapterPairSeed | null;
}): string | null {
  if (secondaryChapters.length === 0) return null;
  if (
    selectedId &&
    secondaryChapters.some((chapter) => chapter.id === selectedId)
  ) {
    return selectedId;
  }
  if (!primaryChapter) return null;
  const primaryAll = primaryChapters.some(
    (chapter) => chapter.id === primaryChapter.id,
  )
    ? [...primaryChapters]
    : [...primaryChapters, primaryChapter];
  return resolveSecondaryChapterSelection({
    selectedId: null,
    primaryChapter,
    primaryAll,
    secondaryAll: [...secondaryChapters],
    seedPair: seedPair ?? undefined,
  });
}

/**
 * Secondary lines for the Dual Read chapter picker. Sources such as MangaDex
 * list one chapter number once per scanlation group; rows that would read the
 * same are told apart by their group (then language, then chapter title).
 * Unambiguous rows get no subtitle.
 */
export function mobileDualReadChapterRowSubtitles(
  chapters: readonly ChapterSummary[],
  strings: MobileStrings,
): Map<string, string> {
  const titleCounts = new Map<string, number>();
  const titles = new Map<string, string>();
  for (const chapter of chapters) {
    const title = formatChapterTitle(chapter, strings);
    titles.set(chapter.id, title);
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1);
  }
  const subtitles = new Map<string, string>();
  for (const chapter of chapters) {
    const title = titles.get(chapter.id);
    if (!title || (titleCounts.get(title) ?? 0) < 2) continue;
    const scanlator = chapter.scanlator?.trim();
    const lang = chapter.lang?.trim();
    const parts = [
      scanlator || null,
      lang ? lang.toUpperCase() : null,
      !scanlator && chapter.title?.trim() && chapter.title.trim() !== title
        ? chapter.title.trim()
        : null,
    ].filter((part): part is string => Boolean(part));
    if (parts.length > 0) subtitles.set(chapter.id, parts.join(" · "));
  }
  return subtitles;
}

/** Index of the selected chapter in the picker list, or -1. */
export function mobileDualReadSelectedChapterIndex(
  chapters: readonly ChapterSummary[],
  selectedId: string | null,
): number {
  if (!selectedId) return -1;
  return chapters.findIndex((chapter) => chapter.id === selectedId);
}
