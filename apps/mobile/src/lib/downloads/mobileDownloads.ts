import { useMemo, useSyncExternalStore } from "react";
import { mobileDownloadFiles } from "./mobileDownloadFiles";
import { MobileDownloadManager } from "./mobileDownloadManager";
import { mobileDownloadChapterKey } from "./mobileDownloadPaths";
import { getMobileDownloadJobStatus } from "./mobileDownloadQueue";
import type {
  MobileChapterDownloadStatus,
  MobileDownloadMangaRef,
  MobileDownloadState,
} from "./mobileDownloadTypes";

/** The app's one download queue (wired up by `MobileDownloadsBridge`). */
export const mobileDownloads = new MobileDownloadManager(mobileDownloadFiles);

export function useMobileDownloadState(): MobileDownloadState {
  return useSyncExternalStore(mobileDownloads.subscribe, mobileDownloads.getState, mobileDownloads.getState);
}

/** Progress steps a row repaints for (every 5%), so a long queue stays cheap. */
const PROGRESS_STEPS = 20;

function encodeStatus(status: MobileChapterDownloadStatus): string {
  return status.kind === "downloading" || status.kind === "paused"
    ? `${status.kind}:${Math.floor(status.progress * PROGRESS_STEPS)}`
    : status.kind;
}

/** Every row reads its state per change: one index per state, not a scan per row. */
const statusIndexes = new WeakMap<MobileDownloadState, Map<string, string>>();

function encodedStatusFor(state: MobileDownloadState, key: string): string {
  let index = statusIndexes.get(state);
  if (!index) {
    index = new Map();
    for (const job of state.jobs) index.set(job.key, encodeStatus(getMobileDownloadJobStatus(job)));
    for (const chapterKey of Object.keys(state.chapters)) index.set(chapterKey, "downloaded");
    statusIndexes.set(state, index);
  }
  return index.get(key) ?? "none";
}

function decodeStatus(encoded: string): MobileChapterDownloadStatus {
  const [kind, step] = encoded.split(":");
  if (kind === "downloading" || kind === "paused") {
    return { kind, progress: Number(step) / PROGRESS_STEPS };
  }
  return { kind: kind as "none" | "queued" | "failed" | "downloaded" };
}

/**
 * One chapter row's download state. Rows subscribe on their own: the list
 * re-renders only the rows whose state changed, not every row per page saved.
 */
export function useMobileChapterDownloadStatus(
  manga: MobileDownloadMangaRef | null,
  chapterId: string,
): MobileChapterDownloadStatus {
  const key = manga ? mobileDownloadChapterKey({ ...manga, chapterId }) : null;
  const encoded = useSyncExternalStore(
    mobileDownloads.subscribe,
    () => (key ? encodedStatusFor(mobileDownloads.getState(), key) : "none"),
    () => "none",
  );
  return useMemo(() => decodeStatus(encoded), [encoded]);
}
