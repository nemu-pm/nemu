import type { LocalChapterProgress } from "@/data/schema";
import { formatMobileString, type MobileStrings } from "./mobileI18n";

type MobileChapterProgressInput = Pick<
  LocalChapterProgress,
  "completed" | "progress" | "total"
> | null | undefined;

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

export function getMobileChapterProgressAccessory(
  progress: MobileChapterProgressInput,
  options?: { locked?: boolean }
): MobileChapterProgressAccessory {
  if (options?.locked && !progress?.completed) return { status: "locked" };
  if (!progress) return { status: "unread" };
  if (progress.completed) return { status: "completed" };

  const page = Math.trunc(progress.progress);
  const total = Math.trunc(progress.total);
  if (!Number.isFinite(page) || !Number.isFinite(total) || page <= 0 || total <= 0) {
    return { status: "unread" };
  }

  return {
    status: "progress",
    page,
    total,
    ratio: Math.min(page / total, 1),
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
