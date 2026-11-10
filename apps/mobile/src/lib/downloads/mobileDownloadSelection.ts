import type { ChapterSummary, LocalChapterProgress } from "@/data/schema";

/**
 * Which chapters a bulk download takes from the detail page:
 * - `next`: the next `count` unread chapters in reading order, from the one
 *   being read (or after the furthest one read);
 * - `unread`: every chapter not read yet;
 * - `all`: every chapter.
 * Locked chapters are never taken.
 */
export type MobileDownloadSelectionScope =
  | { kind: "next"; count: number }
  | { kind: "unread" }
  | { kind: "all" };

export const MOBILE_DOWNLOAD_NEXT_COUNT = 5;

/**
 * `chapters` is the source's list in its own order (newest first), whatever
 * order the page shows it in; the result is in reading order (oldest first),
 * which is also the order the queue downloads them in.
 */
export function selectMobileChaptersToDownload(
  chapters: readonly ChapterSummary[],
  progressById: Record<string, Pick<LocalChapterProgress, "completed" | "progress"> | undefined>,
  scope: MobileDownloadSelectionScope,
): ChapterSummary[] {
  const readingOrder = [...chapters].reverse().filter((chapter) => !chapter.locked);
  if (scope.kind === "all") return readingOrder;
  const unread = (chapter: ChapterSummary) => !progressById[chapter.id]?.completed;
  if (scope.kind === "unread") return readingOrder.filter(unread);
  let start = 0;
  for (let index = readingOrder.length - 1; index >= 0; index -= 1) {
    const progress = progressById[readingOrder[index]!.id];
    if (!progress) continue;
    if (progress.completed) {
      start = index + 1;
      break;
    }
    if (progress.progress > 0) {
      start = index;
      break;
    }
  }
  return readingOrder.slice(start).filter(unread).slice(0, Math.max(0, scope.count));
}
