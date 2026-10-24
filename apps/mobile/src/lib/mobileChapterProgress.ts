import type { LocalChapterProgress } from "@/data/schema";
import { formatMobileString, type MobileStrings } from "./mobileI18n";
import {
  resolveMobileChapterOpeningPage,
  type MobileReaderResumePosition,
} from "./mobileReaderResumePosition";

type MobileChapterProgressInput = (Pick<
  LocalChapterProgress,
  "completed" | "progress" | "total"
> &
  Partial<Pick<LocalChapterProgress, "lastReadAt" | "resetAt">>) | null | undefined;

export type MobileChapterProgressAccessory =
  | { status: "locked" }
  | { status: "completed" }
  | {
      status: "progress";
      page: number;
      total: number;
      ratio: number;
    }
  | { status: "unread" };

export type MobileChapterProgressTone = "mutedForeground" | "primary" | "success";

/**
 * A row's progress: "Page X of Y" (and its bar) name the page the reader
 * will open the chapter at. With this device's `local` resume spot that is
 * the reader's own resume choice (`resolveMobileChapterOpeningPage`); without
 * one, the synced high-water page. A completed chapter reads as completed
 * unless the reader would reopen it at a re-read spot past page 1.
 */
export function getMobileChapterProgressAccessory(
  progress: MobileChapterProgressInput,
  options?: { locked?: boolean; local?: MobileReaderResumePosition | null }
): MobileChapterProgressAccessory {
  if (options?.locked && !progress?.completed) return { status: "locked" };
  const local = options?.local ?? null;
  if (!progress && !local) return { status: "unread" };
  const opening = local
    ? resolveMobileChapterOpeningPage({
        local,
        progress: progress
          ? {
              progress: progress.progress,
              total: progress.total,
              completed: progress.completed,
              lastReadAt: progress.lastReadAt ?? 0,
              ...(progress.resetAt !== undefined ? { resetAt: progress.resetAt } : {}),
            }
          : null,
      })
    : null;
  if (progress?.completed) {
    const reread = opening?.origin === "local" ? pageAccessory(opening.shownSourceIndex, opening.total) : null;
    return reread ?? { status: "completed" };
  }
  // The page named (and the bar) is the reader counter's page saved with the
  // spot; the restore itself still seeks to the anchor (`sourceIndex`).
  if (opening) return pageAccessory(opening.shownSourceIndex, opening.total) ?? { status: "unread" };
  if (!progress) return { status: "unread" };
  return pageAccessory(progress.progress, progress.total) ?? { status: "unread" };
}

function pageAccessory(
  sourceIndex: number,
  pageCount: number,
): Extract<MobileChapterProgressAccessory, { status: "progress" }> | null {
  // Reader progress is persisted as a zero-based source page index so it can
  // be restored without conversion. Keep that storage contract internal and
  // expose the one-based page number users expect in chapter rows.
  const pageIndex = Math.trunc(sourceIndex);
  const total = Math.trunc(pageCount);
  if (
    !Number.isFinite(pageIndex) ||
    !Number.isFinite(total) ||
    pageIndex <= 0 ||
    total <= 0
  ) {
    return null;
  }
  const page = Math.min(pageIndex + 1, total);

  return {
    status: "progress",
    page,
    total,
    ratio: page / total,
  };
}

export function getMobileChapterProgressTone(
  accessory: MobileChapterProgressAccessory,
): MobileChapterProgressTone {
  if (accessory.status === "completed") return "success";
  if (accessory.status === "progress") return "primary";
  return "mutedForeground";
}

export function formatMobileChapterProgressStatus(
  accessory: MobileChapterProgressAccessory,
  strings: MobileStrings
): string | null {
  if (accessory.status === "locked") return strings.reader.lockedChapter;
  if (accessory.status === "completed") return strings.reader.markedComplete;
  if (accessory.status === "unread") return null;
  return formatMobileString(strings.reader.pageValue, {
    page: accessory.page,
    total: accessory.total,
  });
}
