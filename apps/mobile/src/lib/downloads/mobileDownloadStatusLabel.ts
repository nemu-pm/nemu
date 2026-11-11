import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import type { MobileChapterDownloadStatus } from "./mobileDownloadTypes";

/** The state for VoiceOver/TalkBack, appended to the row's label; null when there is none. */
export function formatMobileChapterDownloadStatus(
  status: MobileChapterDownloadStatus,
  strings: MobileStrings,
): string | null {
  switch (status.kind) {
    case "none":
      return null;
    case "queued":
      return strings.downloads.statusQueued;
    case "downloading":
      return formatMobileString(strings.downloads.statusDownloading, { percent: Math.round(status.progress * 100) });
    case "paused":
      return strings.downloads.statusPaused;
    case "failed":
      return strings.downloads.statusFailed;
    case "downloaded":
      return strings.downloads.statusDownloaded;
  }
}
