import { describe, expect, test } from "bun:test";
import type { ChapterSummary } from "@/data/schema";
import {
  cancelMobileDownloads,
  completeMobileDownloadJob,
  createMobileDownloadState,
  enqueueMobileDownloads,
  failMobileDownloadJob,
  getMobileChapterDownloadStatus,
  getMobileDownloadedBytes,
  listMobileDownloadedManga,
  pauseMobileDownloads,
  pickRunnableMobileDownloads,
  progressMobileDownloadJob,
  removeMobileDownloadedChapters,
  restoreMobileDownloadState,
  resumeMobileDownloads,
  startMobileDownloadJob,
} from "./mobileDownloadQueue";
import { mobileDownloadChapterKey, sniffMobileDownloadImageFormat } from "./mobileDownloadPaths";
import { selectMobileChaptersToDownload } from "./mobileDownloadSelection";
import type { MobileDownloadRequest } from "./mobileDownloadTypes";

const manga = { registryId: "aidoku", sourceId: "en.demo", mangaId: "m1" };
const chapter = (id: string, extra: Partial<ChapterSummary> = {}): ChapterSummary => ({ id, title: id, ...extra });
const request = (id: string, overrides: Partial<MobileDownloadRequest> = {}): MobileDownloadRequest => ({
  ...manga,
  chapter: chapter(id),
  mangaTitle: "Demo",
  ...overrides,
});
const key = (id: string, ref = manga) => mobileDownloadChapterKey({ ...ref, chapterId: id });

describe("download queue", () => {
  test("enqueues in order, skipping duplicates, downloaded and locked chapters", () => {
    let state = enqueueMobileDownloads(createMobileDownloadState(), [request("c1"), request("c2")], 1);
    state = completeMobileDownloadJob(startMobileDownloadJob(state, key("c1"), 2), key("c1"), {
      pageCount: 3,
      bytes: 30,
      completedAt: 3,
    });
    const next = enqueueMobileDownloads(
      state,
      [request("c1"), request("c2"), request("c3"), request("c3"), request("c4", { chapter: chapter("c4", { locked: true }) })],
      4,
    );
    expect(next.jobs.map((job) => job.chapter.id)).toEqual(["c2", "c3"]);
    expect(Object.keys(next.chapters)).toEqual([key("c1")]);
  });

  test("returns the same state when nothing changes", () => {
    const state = enqueueMobileDownloads(createMobileDownloadState(), [request("c1")], 1);
    expect(enqueueMobileDownloads(state, [request("c1")], 2)).toBe(state);
    expect(resumeMobileDownloads(state, null, 2)).toBe(state);
    expect(cancelMobileDownloads(state, new Set(["other"]))).toBe(state);
  });

  test("a failed chapter enqueued again goes back in line", () => {
    let state = enqueueMobileDownloads(createMobileDownloadState(), [request("c1")], 1);
    state = failMobileDownloadJob(startMobileDownloadJob(state, key("c1"), 2), key("c1"), "boom", 3);
    expect(getMobileChapterDownloadStatus(state, key("c1"))).toEqual({ kind: "failed" });
    state = enqueueMobileDownloads(state, [request("c1")], 4);
    expect(state.jobs[0]).toMatchObject({ status: "queued", error: undefined });
  });

  test("pause, resume and cancel", () => {
    let state = enqueueMobileDownloads(createMobileDownloadState(), [request("c1"), request("c2")], 1);
    state = startMobileDownloadJob(state, key("c1"), 2);
    state = pauseMobileDownloads(state, null, 3);
    expect(state.jobs.map((job) => job.status)).toEqual(["paused", "paused"]);
    state = resumeMobileDownloads(state, new Set([key("c2")]), 4);
    expect(state.jobs.map((job) => job.status)).toEqual(["paused", "queued"]);
    state = cancelMobileDownloads(state, new Set([key("c1")]));
    expect(state.jobs.map((job) => job.chapter.id)).toEqual(["c2"]);
    expect(cancelMobileDownloads(state, null).jobs).toEqual([]);
  });

  test("progress and completion", () => {
    let state = enqueueMobileDownloads(createMobileDownloadState(), [request("c1")], 1);
    state = startMobileDownloadJob(state, key("c1"), 2);
    state = progressMobileDownloadJob(state, key("c1"), { pagesDone: 1, pageCount: 4, bytes: 10 });
    expect(getMobileChapterDownloadStatus(state, key("c1"))).toEqual({ kind: "downloading", progress: 0.25 });
    expect(progressMobileDownloadJob(state, key("c1"), { pagesDone: 1, pageCount: 4, bytes: 10 })).toBe(state);
    state = completeMobileDownloadJob(state, key("c1"), { pageCount: 4, bytes: 40, completedAt: 5 });
    expect(state.jobs).toEqual([]);
    expect(getMobileChapterDownloadStatus(state, key("c1"))).toEqual({ kind: "downloaded" });
    expect(getMobileDownloadedBytes(state)).toBe(40);
    state = removeMobileDownloadedChapters(state, new Set([key("c1")]));
    expect(getMobileChapterDownloadStatus(state, key("c1"))).toEqual({ kind: "none" });
  });

  test("runs at most two chapters, one per source, in queue order", () => {
    const other = { ...manga, sourceId: "en.other" };
    let state = enqueueMobileDownloads(
      createMobileDownloadState(),
      [request("a1"), request("a2"), { ...request("b1"), ...other }, { ...request("b2"), ...other }],
      1,
    );
    const first = pickRunnableMobileDownloads(state, new Set());
    expect(first.map((job) => job.chapter.id)).toEqual(["a1", "b1"]);
    state = startMobileDownloadJob(state, key("a1"), 2);
    expect(pickRunnableMobileDownloads(state, new Set([key("a1")])).map((job) => job.chapter.id)).toEqual(["b1"]);
    state = pauseMobileDownloads(state, new Set([key("b1", other)]), 3);
    expect(pickRunnableMobileDownloads(state, new Set([key("a1")])).map((job) => job.chapter.id)).toEqual(["b2"]);
  });

  test("restores persisted state; a chapter that was downloading is queued again", () => {
    let state = enqueueMobileDownloads(createMobileDownloadState(), [request("c1"), request("c2")], 1);
    state = startMobileDownloadJob(state, key("c1"), 2);
    state = progressMobileDownloadJob(state, key("c1"), { pagesDone: 2, pageCount: 5, bytes: 9 });
    state = completeMobileDownloadJob(startMobileDownloadJob(state, key("c2"), 3), key("c2"), {
      pageCount: 1,
      bytes: 1,
      completedAt: 4,
    });
    const restored = restoreMobileDownloadState(JSON.parse(JSON.stringify({ ...state, wifiOnly: true })));
    expect(restored.wifiOnly).toBe(true);
    expect(restored.jobs).toHaveLength(1);
    expect(restored.jobs[0]).toMatchObject({ key: key("c1"), status: "queued", pagesDone: 2, pageCount: 5 });
    expect(Object.keys(restored.chapters)).toEqual([key("c2")]);
  });

  test("restoring ignores malformed entries", () => {
    expect(restoreMobileDownloadState(null)).toEqual(createMobileDownloadState());
    expect(restoreMobileDownloadState({ version: 2, jobs: [] })).toEqual(createMobileDownloadState());
    const restored = restoreMobileDownloadState({
      version: 1,
      jobs: [{ registryId: "a" }, { ...request("c1"), status: "bogus" }],
      chapters: { x: { nope: true } },
    });
    expect(restored.jobs.map((job) => job.status)).toEqual(["queued"]);
    expect(restored.chapters).toEqual({});
  });

  test("lists downloaded titles with their size, newest first", () => {
    const other = { ...manga, mangaId: "m2" };
    let state = enqueueMobileDownloads(
      createMobileDownloadState(),
      [request("c1"), request("c2"), { ...request("d1"), ...other, mangaTitle: "Other" }],
      1,
    );
    for (const [id, ref, at] of [["c1", manga, 5], ["c2", manga, 6], ["d1", other, 7]] as const) {
      state = completeMobileDownloadJob(startMobileDownloadJob(state, key(id, ref), 2), key(id, ref), {
        pageCount: 2,
        bytes: 100,
        completedAt: at,
      });
    }
    expect(listMobileDownloadedManga(state).map(({ title, chapterCount, bytes }) => ({ title, chapterCount, bytes }))).toEqual([
      { title: "Other", chapterCount: 1, bytes: 100 },
      { title: "Demo", chapterCount: 2, bytes: 200 },
    ]);
  });
});

describe("download selection", () => {
  // The source's order: newest first.
  const chapters = ["c5", "c4", "c3", "c2", "c1"].map((id) => chapter(id));

  test("next N starts at the chapter being read", () => {
    const progress = { c1: { completed: true, progress: 1 }, c2: { completed: false, progress: 0.4 } };
    expect(selectMobileChaptersToDownload(chapters, progress, { kind: "next", count: 2 }).map((c) => c.id)).toEqual([
      "c2",
      "c3",
    ]);
  });

  test("next N starts after the furthest chapter read", () => {
    const progress = { c3: { completed: true, progress: 1 } };
    expect(selectMobileChaptersToDownload(chapters, progress, { kind: "next", count: 5 }).map((c) => c.id)).toEqual([
      "c4",
      "c5",
    ]);
  });

  test("unread and all, in reading order, without locked chapters", () => {
    const withLocked = [chapter("c6", { locked: true }), ...chapters];
    const progress = { c2: { completed: true, progress: 1 } };
    expect(selectMobileChaptersToDownload(withLocked, progress, { kind: "unread" }).map((c) => c.id)).toEqual([
      "c1",
      "c3",
      "c4",
      "c5",
    ]);
    expect(selectMobileChaptersToDownload(withLocked, {}, { kind: "all" }).map((c) => c.id)).toEqual([
      "c1",
      "c2",
      "c3",
      "c4",
      "c5",
    ]);
  });
});

describe("download paths", () => {
  test("sniffs page image formats and refuses everything else", () => {
    const bytes = (...values: number[]) => new Uint8Array(values);
    const ascii = (text: string) => new TextEncoder().encode(text);
    expect(sniffMobileDownloadImageFormat(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpg");
    expect(sniffMobileDownloadImageFormat(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(sniffMobileDownloadImageFormat(ascii("GIF89a"))).toBe("gif");
    expect(sniffMobileDownloadImageFormat(ascii("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
    expect(sniffMobileDownloadImageFormat(ascii("\0\0\0\x1cftypavif"))).toBe("avif");
    expect(sniffMobileDownloadImageFormat(ascii("<!DOCTYPE html>"))).toBeNull();
    expect(sniffMobileDownloadImageFormat(new Uint8Array())).toBeNull();
  });
});
