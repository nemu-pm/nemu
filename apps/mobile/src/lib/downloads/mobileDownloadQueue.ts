import type {
  MobileChapterDownloadStatus,
  MobileDownloadJob,
  MobileDownloadRequest,
  MobileDownloadState,
  MobileDownloadedChapter,
  MobileDownloadedManga,
} from "./mobileDownloadTypes";
import {
  mobileDownloadChapterKey,
  mobileDownloadMangaKey,
  mobileDownloadSourceKey,
} from "./mobileDownloadPaths";

/**
 * The download queue as pure state transitions. The manager owns the one
 * live state, persists it and runs the jobs; everything here returns a new
 * state (or the same object when nothing changed) so the UI's external-store
 * subscription only re-renders on a real change.
 */

/** Chapters downloading at once, across every source. */
export const MOBILE_DOWNLOAD_MAX_CONCURRENT_CHAPTERS = 2;
/** Chapters downloading at once from one source: sources rate-limit by host. */
export const MOBILE_DOWNLOAD_MAX_CONCURRENT_PER_SOURCE = 1;

export function createMobileDownloadState(): MobileDownloadState {
  return { version: 1, jobs: [], chapters: {}, wifiOnly: false };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseChapter(value: unknown): MobileDownloadJob["chapter"] | null {
  if (!isRecord(value) || !isString(value.id)) return null;
  return value as MobileDownloadJob["chapter"];
}

const JOB_STATUSES = new Set(["queued", "downloading", "paused", "failed"]);

/**
 * Reads persisted state defensively (a torn or older file yields what is
 * still valid). A job that was downloading when the app stopped is queued
 * again: its saved pages are kept and the rest fetched on the next run.
 */
export function restoreMobileDownloadState(value: unknown): MobileDownloadState {
  const state = createMobileDownloadState();
  if (!isRecord(value) || value.version !== 1) return state;
  state.wifiOnly = value.wifiOnly === true;
  const seen = new Set<string>();
  if (isRecord(value.chapters)) {
    for (const raw of Object.values(value.chapters)) {
      if (!isRecord(raw)) continue;
      const chapter = parseChapter(raw.chapter);
      if (!chapter || !isString(raw.registryId) || !isString(raw.sourceId) || !isString(raw.mangaId)) continue;
      const key = mobileDownloadChapterKey({
        registryId: raw.registryId,
        sourceId: raw.sourceId,
        mangaId: raw.mangaId,
        chapterId: chapter.id,
      });
      state.chapters[key] = {
        key,
        registryId: raw.registryId,
        sourceId: raw.sourceId,
        mangaId: raw.mangaId,
        chapter,
        mangaTitle: typeof raw.mangaTitle === "string" ? raw.mangaTitle : "",
        pageCount: isCount(raw.pageCount) ? raw.pageCount : 0,
        bytes: isCount(raw.bytes) ? raw.bytes : 0,
        completedAt: isCount(raw.completedAt) ? raw.completedAt : 0,
      };
      seen.add(key);
    }
  }
  if (Array.isArray(value.jobs)) {
    for (const raw of value.jobs) {
      if (!isRecord(raw)) continue;
      const chapter = parseChapter(raw.chapter);
      if (!chapter || !isString(raw.registryId) || !isString(raw.sourceId) || !isString(raw.mangaId)) continue;
      const key = mobileDownloadChapterKey({
        registryId: raw.registryId,
        sourceId: raw.sourceId,
        mangaId: raw.mangaId,
        chapterId: chapter.id,
      });
      if (seen.has(key)) continue;
      seen.add(key);
      const status = JOB_STATUSES.has(raw.status as string)
        ? (raw.status as MobileDownloadJob["status"])
        : "queued";
      state.jobs.push({
        key,
        registryId: raw.registryId,
        sourceId: raw.sourceId,
        mangaId: raw.mangaId,
        chapter,
        mangaTitle: typeof raw.mangaTitle === "string" ? raw.mangaTitle : "",
        status: status === "downloading" ? "queued" : status,
        pagesDone: isCount(raw.pagesDone) ? raw.pagesDone : 0,
        pageCount: isCount(raw.pageCount) ? raw.pageCount : 0,
        bytes: isCount(raw.bytes) ? raw.bytes : 0,
        error: typeof raw.error === "string" ? raw.error : undefined,
        createdAt: isCount(raw.createdAt) ? raw.createdAt : 0,
        updatedAt: isCount(raw.updatedAt) ? raw.updatedAt : 0,
      });
    }
  }
  return state;
}

/**
 * Adds chapters to the end of the queue. A chapter already downloaded or
 * already waiting is left alone, except a failed one, which is queued again.
 * Locked chapters are never queued.
 */
export function enqueueMobileDownloads(
  state: MobileDownloadState,
  requests: readonly MobileDownloadRequest[],
  now: number,
): MobileDownloadState {
  const existing = new Map(state.jobs.map((job) => [job.key, job]));
  const added: MobileDownloadJob[] = [];
  const requeued = new Set<string>();
  for (const request of requests) {
    if (request.chapter.locked) continue;
    const key = mobileDownloadChapterKey({ ...request, chapterId: request.chapter.id });
    if (state.chapters[key]) continue;
    const job = existing.get(key);
    if (job) {
      if (job.status === "failed") requeued.add(key);
      continue;
    }
    if (added.some((candidate) => candidate.key === key)) continue;
    added.push({
      key,
      registryId: request.registryId,
      sourceId: request.sourceId,
      mangaId: request.mangaId,
      chapter: request.chapter,
      mangaTitle: request.mangaTitle,
      status: "queued",
      pagesDone: 0,
      pageCount: 0,
      bytes: 0,
      createdAt: now,
      updatedAt: now,
    });
  }
  if (added.length === 0 && requeued.size === 0) return state;
  return {
    ...state,
    jobs: [
      ...state.jobs.map((job) =>
        requeued.has(job.key)
          ? { ...job, status: "queued" as const, error: undefined, updatedAt: now }
          : job,
      ),
      ...added,
    ],
  };
}

function updateJobs(
  state: MobileDownloadState,
  keys: ReadonlySet<string> | null,
  update: (job: MobileDownloadJob) => MobileDownloadJob,
): MobileDownloadState {
  let changed = false;
  const jobs = state.jobs.map((job) => {
    if (keys && !keys.has(job.key)) return job;
    const next = update(job);
    if (next !== job) changed = true;
    return next;
  });
  return changed ? { ...state, jobs } : state;
}

/** `keys` null: every job. Running jobs are paused too (the manager aborts them). */
export function pauseMobileDownloads(
  state: MobileDownloadState,
  keys: ReadonlySet<string> | null,
  now: number,
): MobileDownloadState {
  return updateJobs(state, keys, (job) =>
    job.status === "queued" || job.status === "downloading"
      ? { ...job, status: "paused", updatedAt: now }
      : job,
  );
}

/** Paused and failed jobs go back in line (in their place in the queue). */
export function resumeMobileDownloads(
  state: MobileDownloadState,
  keys: ReadonlySet<string> | null,
  now: number,
): MobileDownloadState {
  return updateJobs(state, keys, (job) =>
    job.status === "paused" || job.status === "failed"
      ? { ...job, status: "queued", error: undefined, updatedAt: now }
      : job,
  );
}

/** Drops jobs from the queue (the manager deletes their partial pages). */
export function cancelMobileDownloads(
  state: MobileDownloadState,
  keys: ReadonlySet<string> | null,
): MobileDownloadState {
  const jobs = keys ? state.jobs.filter((job) => !keys.has(job.key)) : [];
  return jobs.length === state.jobs.length ? state : { ...state, jobs };
}

export function startMobileDownloadJob(
  state: MobileDownloadState,
  key: string,
  now: number,
): MobileDownloadState {
  return updateJobs(state, new Set([key]), (job) =>
    job.status === "queued" ? { ...job, status: "downloading", error: undefined, updatedAt: now } : job,
  );
}

export function progressMobileDownloadJob(
  state: MobileDownloadState,
  key: string,
  progress: { pagesDone: number; pageCount: number; bytes: number },
): MobileDownloadState {
  return updateJobs(state, new Set([key]), (job) =>
    job.pagesDone === progress.pagesDone &&
    job.pageCount === progress.pageCount &&
    job.bytes === progress.bytes
      ? job
      : { ...job, ...progress },
  );
}

/** The job leaves the queue and its chapter joins the downloads. */
export function completeMobileDownloadJob(
  state: MobileDownloadState,
  key: string,
  result: { pageCount: number; bytes: number; completedAt: number },
): MobileDownloadState {
  const job = state.jobs.find((candidate) => candidate.key === key);
  if (!job) return state;
  const chapter: MobileDownloadedChapter = {
    key,
    registryId: job.registryId,
    sourceId: job.sourceId,
    mangaId: job.mangaId,
    chapter: job.chapter,
    mangaTitle: job.mangaTitle,
    pageCount: result.pageCount,
    bytes: result.bytes,
    completedAt: result.completedAt,
  };
  return {
    ...state,
    jobs: state.jobs.filter((candidate) => candidate.key !== key),
    chapters: { ...state.chapters, [key]: chapter },
  };
}

export function failMobileDownloadJob(
  state: MobileDownloadState,
  key: string,
  error: string,
  now: number,
): MobileDownloadState {
  return updateJobs(state, new Set([key]), (job) =>
    job.status === "downloading" ? { ...job, status: "failed", error, updatedAt: now } : job,
  );
}

/**
 * A run that stopped for a reason that is not the chapter's fault (the
 * network went away, the app is switching accounts): back in line as it was.
 */
export function requeueMobileDownloadJob(
  state: MobileDownloadState,
  key: string,
  now: number,
): MobileDownloadState {
  return updateJobs(state, new Set([key]), (job) =>
    job.status === "downloading" ? { ...job, status: "queued", updatedAt: now } : job,
  );
}

export function removeMobileDownloadedChapters(
  state: MobileDownloadState,
  keys: ReadonlySet<string>,
): MobileDownloadState {
  if (![...keys].some((key) => state.chapters[key])) return state;
  const chapters = { ...state.chapters };
  for (const key of keys) delete chapters[key];
  return { ...state, chapters };
}

/**
 * The queued jobs to start now, in queue order, given the ones already
 * running: at most `maxConcurrent` in all and `maxPerSource` per source.
 */
export function pickRunnableMobileDownloads(
  state: MobileDownloadState,
  running: ReadonlySet<string>,
  limits: { maxConcurrent: number; maxPerSource: number } = {
    maxConcurrent: MOBILE_DOWNLOAD_MAX_CONCURRENT_CHAPTERS,
    maxPerSource: MOBILE_DOWNLOAD_MAX_CONCURRENT_PER_SOURCE,
  },
): MobileDownloadJob[] {
  const perSource = new Map<string, number>();
  let active = 0;
  for (const job of state.jobs) {
    if (!running.has(job.key)) continue;
    active += 1;
    const source = mobileDownloadSourceKey(job);
    perSource.set(source, (perSource.get(source) ?? 0) + 1);
  }
  const picked: MobileDownloadJob[] = [];
  for (const job of state.jobs) {
    if (active >= limits.maxConcurrent) break;
    if (job.status !== "queued" || running.has(job.key)) continue;
    const source = mobileDownloadSourceKey(job);
    const count = perSource.get(source) ?? 0;
    if (count >= limits.maxPerSource) continue;
    perSource.set(source, count + 1);
    active += 1;
    picked.push(job);
  }
  return picked;
}

export function getMobileDownloadJobStatus(job: MobileDownloadJob): MobileChapterDownloadStatus {
  const progress = job.pageCount > 0 ? Math.min(1, job.pagesDone / job.pageCount) : 0;
  switch (job.status) {
    case "queued":
      return { kind: "queued" };
    case "downloading":
      return { kind: "downloading", progress };
    case "paused":
      return { kind: "paused", progress };
    case "failed":
      return { kind: "failed" };
  }
}

export function getMobileChapterDownloadStatus(
  state: MobileDownloadState,
  key: string,
): MobileChapterDownloadStatus {
  if (state.chapters[key]) return { kind: "downloaded" };
  const job = state.jobs.find((candidate) => candidate.key === key);
  return job ? getMobileDownloadJobStatus(job) : { kind: "none" };
}

/** Titles with downloaded chapters, most recently downloaded first. */
export function listMobileDownloadedManga(state: MobileDownloadState): MobileDownloadedManga[] {
  const byManga = new Map<string, MobileDownloadedManga>();
  for (const chapter of Object.values(state.chapters)) {
    const key = mobileDownloadMangaKey(chapter);
    const current = byManga.get(key);
    if (current) {
      current.chapterCount += 1;
      current.bytes += chapter.bytes;
      if (chapter.completedAt > current.lastCompletedAt) {
        current.lastCompletedAt = chapter.completedAt;
        if (chapter.mangaTitle) current.title = chapter.mangaTitle;
      }
      continue;
    }
    byManga.set(key, {
      key,
      registryId: chapter.registryId,
      sourceId: chapter.sourceId,
      mangaId: chapter.mangaId,
      title: chapter.mangaTitle,
      chapterCount: 1,
      bytes: chapter.bytes,
      lastCompletedAt: chapter.completedAt,
    });
  }
  return [...byManga.values()].sort(
    (left, right) => right.lastCompletedAt - left.lastCompletedAt || left.title.localeCompare(right.title),
  );
}

export function getMobileDownloadedBytes(state: MobileDownloadState): number {
  return Object.values(state.chapters).reduce((total, chapter) => total + chapter.bytes, 0);
}

export function mobileDownloadedChapterKeysForManga(
  state: MobileDownloadState,
  mangaKey: string,
): string[] {
  return Object.values(state.chapters)
    .filter((chapter) => mobileDownloadMangaKey(chapter) === mangaKey)
    .map((chapter) => chapter.key);
}

export function mobileDownloadJobKeysForManga(
  state: MobileDownloadState,
  mangaKey: string,
): string[] {
  return state.jobs.filter((job) => mobileDownloadMangaKey(job) === mangaKey).map((job) => job.key);
}
