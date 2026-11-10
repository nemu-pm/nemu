import type { ChapterSummary } from "@/data/schema";

/**
 * Chapter downloads (离线下载): a source chapter's pages copied into the app's
 * own files so the reader can open it with no network. Device-local only:
 * nothing here is synced, and the files never leave this device.
 */

/** Where a chapter comes from: the reader route's own identity. */
export type MobileDownloadMangaRef = {
  registryId: string;
  sourceId: string;
  mangaId: string;
};

export type MobileDownloadChapterRef = MobileDownloadMangaRef & {
  chapterId: string;
};

/**
 * A chapter waiting in, or running through, the queue. `paused` holds its
 * place until resumed; `failed` stays until retried or cancelled.
 */
export type MobileDownloadJobStatus = "queued" | "downloading" | "paused" | "failed";

export type MobileDownloadJob = MobileDownloadMangaRef & {
  key: string;
  chapter: ChapterSummary;
  mangaTitle: string;
  status: MobileDownloadJobStatus;
  /** Pages saved so far (survives a relaunch: saved pages are not fetched again). */
  pagesDone: number;
  /** 0 until the source has listed the chapter's pages. */
  pageCount: number;
  bytes: number;
  /** Why the last attempt failed (English, for diagnostics). */
  error?: string;
  createdAt: number;
  updatedAt: number;
};

/** A chapter whose every page is on this device. */
export type MobileDownloadedChapter = MobileDownloadMangaRef & {
  key: string;
  chapter: ChapterSummary;
  mangaTitle: string;
  pageCount: number;
  bytes: number;
  completedAt: number;
};

export type MobileDownloadState = {
  version: 1;
  /** Queue order: the first runnable job starts first. */
  jobs: MobileDownloadJob[];
  chapters: Record<string, MobileDownloadedChapter>;
  /** Only download over Wi-Fi (or Ethernet); cellular waits. */
  wifiOnly: boolean;
};

export type MobileDownloadRequest = MobileDownloadMangaRef & {
  chapter: ChapterSummary;
  mangaTitle: string;
};

/** What a chapter row shows. */
export type MobileChapterDownloadStatus =
  | { kind: "none" }
  | { kind: "queued" }
  | { kind: "downloading"; progress: number }
  | { kind: "paused"; progress: number }
  | { kind: "failed" }
  | { kind: "downloaded" };

/** One title on the Downloads page. */
export type MobileDownloadedManga = MobileDownloadMangaRef & {
  key: string;
  title: string;
  chapterCount: number;
  bytes: number;
  /** Most recent chapter completion: the page lists newest first. */
  lastCompletedAt: number;
};

/** A downloaded page as the manifest records it. */
export type MobileDownloadedPage = {
  /** The source's page id, so saved page sizes and progress line up. */
  id: string;
  index: number;
  /** Relative to the chapter directory; absent for a text-only page. */
  file?: string;
  text?: string;
  width?: number;
  height?: number;
};

export type MobileDownloadManifest = MobileDownloadMangaRef & {
  version: 1;
  chapter: ChapterSummary;
  pages: MobileDownloadedPage[];
  bytes: number;
  completedAt: number;
};
