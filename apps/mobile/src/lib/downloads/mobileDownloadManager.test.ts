import { describe, expect, test } from "bun:test";
import type { ChapterSummary } from "@/data/schema";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import { createMemoryMobileDownloadFiles } from "./mobileDownloadFilesMemory";
import { MobileDownloadManager, type MobileDownloadSourceAccess } from "./mobileDownloadManager";
import {
  MOBILE_DOWNLOADS_STATE_FILE,
  mobileDownloadChapterKey,
  mobileDownloadMangaKey,
  mobileDownloadPartialDirectory,
  mobileDownloadScopeDirectory,
} from "./mobileDownloadPaths";
import { runMobileChapterDownload } from "./mobileDownloadRunner";
import type { MobileDownloadJob } from "./mobileDownloadTypes";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9]);
const HTML = new TextEncoder().encode("<!DOCTYPE html><title>Just a moment</title>");

const manga = { registryId: "aidoku", sourceId: "en.demo", mangaId: "m1" };
const chapter = (id: string): ChapterSummary => ({ id, title: `Chapter ${id}` });
const scope = mobileDownloadScopeDirectory("local");

function remotePages(count: number): MobileReaderPage[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `p${index}`,
    index,
    imageUri: `https://img.example/${index}.jpg`,
    imageUriOwnership: "source" as const,
    imageProcessing: "pending" as const,
  }));
}

type FakeOptions = {
  pages?: (chapterId: string) => MobileReaderPage[];
  body?: (uri: string) => Uint8Array;
  /** Holds every image fetch until released. */
  gate?: Promise<void>;
};

function setup(options: FakeOptions = {}) {
  const files = createMemoryMobileDownloadFiles();
  const fetched: Array<{ uri: string; headers?: Record<string, string> }> = [];
  let tempId = 0;
  let disposed = 0;
  const access: MobileDownloadSourceAccess = {
    async loadPages(job) {
      const pages = options.pages?.(job.chapter.id) ?? remotePages(3);
      return {
        pages,
        chapter: { ...job.chapter, title: `${job.chapter.title} (source)` },
        chapters: [chapter("c2"), chapter("c1")],
        // The processor decorates the request, as the reader's does.
        resolvePage: async (index) => ({ ...pages[index]!, headers: { Referer: "https://site.example/" } }),
        dispose: () => {
          disposed += 1;
        },
      };
    },
    async fetchImage(request, signal) {
      fetched.push(request);
      await options.gate;
      if (signal.aborted) throw signal.reason;
      const uri = `file:///tmp/nemu-http-${(tempId += 1)}.part`;
      files.putExternal(uri, options.body?.(request.uri) ?? JPEG);
      return { fileUri: uri };
    },
  };
  return { files, access, fetched, disposedCount: () => disposed };
}

const flush = async (times = 20) => {
  for (let index = 0; index < times; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

const job = (id: string): MobileDownloadJob => ({
  key: mobileDownloadChapterKey({ ...manga, chapterId: id }),
  ...manga,
  chapter: chapter(id),
  mangaTitle: "Demo",
  status: "downloading",
  pagesDone: 0,
  pageCount: 0,
  bytes: 0,
  createdAt: 0,
  updatedAt: 0,
});

describe("chapter download runner", () => {
  test("saves every page with the decorated request, then renames the chapter into place", async () => {
    const { files, access, fetched, disposedCount } = setup({
      body: (uri) => (uri.endsWith("1.jpg") ? PNG : JPEG),
    });
    const progress: number[] = [];
    const result = await runMobileChapterDownload(
      job("c1"),
      {
        files,
        scopeDirectory: scope,
        loadPages: access.loadPages,
        fetchImage: access.fetchImage,
        now: () => 42,
        onProgress: ({ pagesDone }) => progress.push(pagesDone),
      },
      new AbortController().signal,
    );
    expect(result).toEqual({ pageCount: 3, bytes: JPEG.length * 2 + PNG.length, completedAt: 42 });
    expect(fetched.every((request) => request.headers?.Referer === "https://site.example/")).toBe(true);
    expect(progress.at(-1)).toBe(3);
    expect(disposedCount()).toBe(1);
    const names = [...files.files.keys()].map((path) => path.split("/").slice(-2).join("/"));
    expect(names.some((name) => name.endsWith(".partial/0001.jpg"))).toBe(false);
    expect(names.filter((name) => /\/000\d\.(jpg|png)$/.test(name)).sort()).toHaveLength(3);
  });

  test("keeps a text page, decodes a data page and refuses a non-image answer", async () => {
    const base = setup({
      pages: () => [
        { id: "t", index: 0, text: "Afterword" },
        { id: "d", index: 1, imageUri: `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`, imageUriOwnership: "app" },
      ],
    });
    const deps = {
      files: base.files,
      scopeDirectory: scope,
      loadPages: base.access.loadPages,
      fetchImage: base.access.fetchImage,
      now: () => 1,
      onProgress: () => undefined,
    };
    await expect(runMobileChapterDownload(job("c1"), deps, new AbortController().signal)).resolves.toMatchObject({
      pageCount: 2,
      bytes: PNG.length,
    });

    const html = setup({ body: () => HTML });
    await expect(
      runMobileChapterDownload(
        job("c2"),
        { ...deps, files: html.files, loadPages: html.access.loadPages, fetchImage: html.access.fetchImage },
        new AbortController().signal,
      ),
    ).rejects.toThrow("something other than an image");
  });

  test("a stopped run keeps its saved pages and the next run fetches only the rest", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = setup({ pages: () => remotePages(4) });
    const controller = new AbortController();
    let calls = 0;
    const deps = {
      files: first.files,
      scopeDirectory: scope,
      loadPages: first.access.loadPages,
      fetchImage: async (request: { uri: string }, signal: AbortSignal) => {
        calls += 1;
        // Two pages land, then the run is stopped while the next two wait.
        if (calls > 2) await gate;
        return first.access.fetchImage(request, signal);
      },
      now: () => 1,
      onProgress: () => undefined,
      pageConcurrency: 1,
    };
    const run = runMobileChapterDownload(job("c1"), deps, controller.signal);
    await flush();
    controller.abort(new DOMException("stop", "AbortError"));
    release();
    await expect(run).rejects.toThrow();
    const before = calls;
    await runMobileChapterDownload(job("c1"), deps, new AbortController().signal);
    expect(calls - before).toBe(2);
  });
});

describe("download manager", () => {
  async function ready(options: FakeOptions = {}) {
    const fake = setup(options);
    const manager = new MobileDownloadManager(fake.files, () => 7);
    await manager.switchProfileScope("local");
    manager.setSourceAccess(fake.access);
    return { ...fake, manager };
  }

  const request = (id: string) => ({ ...manga, chapter: chapter(id), mangaTitle: "Demo" });

  test("downloads queued chapters and serves them to the reader offline", async () => {
    const { manager } = await ready();
    manager.enqueue([request("c1")]);
    await flush();
    const key = mobileDownloadChapterKey({ ...manga, chapterId: "c1" });
    expect(manager.getState().chapters[key]).toMatchObject({ pageCount: 3, mangaTitle: "Demo" });
    const opened = await manager.loadDownloadedChapter({ ...manga, chapterId: "c1" });
    expect(opened?.pages.map((page) => [page.imageUriOwnership, page.id])).toEqual([
      ["app", "p0"],
      ["app", "p1"],
      ["app", "p2"],
    ]);
    expect(opened?.chapter.title).toBe("Chapter c1 (source)");
    expect(opened?.chapters.map((item) => item.id)).toEqual(["c2", "c1"]);
  });

  test("a missing page file sends the reader back to the source", async () => {
    const { manager, files } = await ready();
    manager.enqueue([request("c1")]);
    await flush();
    const page = [...files.files.keys()].find((path) => path.endsWith("0002.jpg"))!;
    files.files.delete(page);
    expect(await manager.loadDownloadedChapter({ ...manga, chapterId: "c1" })).toBeNull();
  });

  test("persists the queue and restores it for the same profile only", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { manager, files, access } = await ready({ gate });
    manager.enqueue([request("c1"), request("c2")]);
    await flush();
    await manager.flush();
    const saved = JSON.parse((await files.readText(`${scope}/${MOBILE_DOWNLOADS_STATE_FILE}`))!);
    expect(saved.jobs.map((job: MobileDownloadJob) => job.status)).toEqual(["downloading", "queued"]);

    // A relaunch: the running chapter is queued again.
    const relaunched = new MobileDownloadManager(files, () => 8);
    await relaunched.switchProfileScope("local");
    expect(relaunched.getState().jobs.map((job) => job.status)).toEqual(["queued", "queued"]);

    // Another account sees none of it.
    await relaunched.switchProfileScope("account-b");
    expect(relaunched.getState().jobs).toEqual([]);
    release();
    void access;
  });

  test("waits for the network and for Wi-Fi when asked", async () => {
    const { manager, fetched } = await ready();
    manager.setNetwork({ connected: false, unmetered: false });
    manager.enqueue([request("c1")]);
    await flush();
    expect(fetched).toHaveLength(0);
    manager.setWifiOnly(true);
    manager.setNetwork({ connected: true, unmetered: false });
    await flush();
    expect(fetched).toHaveLength(0);
    expect(manager.isWaitingForNetwork()).toBe(true);
    manager.setNetwork({ connected: true, unmetered: true });
    await flush();
    expect(Object.keys(manager.getState().chapters)).toHaveLength(1);
  });

  test("pause holds the chapter, cancel drops it and its partial pages", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { manager, files } = await ready({ gate });
    const key = mobileDownloadChapterKey({ ...manga, chapterId: "c1" });
    manager.enqueue([request("c1")]);
    await flush();
    manager.pause(new Set([key]));
    release();
    await flush();
    expect(manager.getState().jobs[0]?.status).toBe("paused");
    manager.cancel(new Set([key]));
    await flush();
    expect(manager.getState().jobs).toEqual([]);
    const partial = `${scope}/${mobileDownloadPartialDirectory({ ...manga, chapterId: "c1" })}`;
    expect(files.exists(partial)).toBe(false);
  });

  test("a failing chapter is marked failed and can be retried", async () => {
    let body = HTML;
    const { manager } = await ready({ body: () => body });
    const key = mobileDownloadChapterKey({ ...manga, chapterId: "c1" });
    manager.enqueue([request("c1")]);
    await flush();
    expect(manager.getState().jobs[0]).toMatchObject({ status: "failed" });
    body = JPEG;
    manager.resume(new Set([key]));
    await flush();
    expect(manager.getState().chapters[key]).toBeDefined();
  });

  test("deletes a title's chapters and every download", async () => {
    const { manager, files } = await ready();
    manager.enqueue([request("c1"), request("c2"), { ...request("x1"), mangaId: "m2" }]);
    await flush(60);
    expect(Object.keys(manager.getState().chapters)).toHaveLength(3);
    await manager.deleteManga(mobileDownloadMangaKey(manga));
    expect(Object.values(manager.getState().chapters).map((item) => item.chapter.id)).toEqual(["x1"]);
    await manager.deleteAll();
    expect(manager.getState().chapters).toEqual({});
    expect([...files.files.keys()].filter((path) => !path.endsWith(MOBILE_DOWNLOADS_STATE_FILE))).toEqual([]);
  });

  test("Clear All Data removes every profile's downloads", async () => {
    const { manager, files } = await ready();
    manager.enqueue([request("c1")]);
    await flush();
    await manager.switchProfileScope("account-b");
    await manager.switchProfileScope("local");
    expect(Object.keys(manager.getState().chapters)).toHaveLength(1);
    await manager.clearDevice();
    expect(manager.getState().chapters).toEqual({});
    expect([...files.files.keys()].filter((path) => !path.endsWith(MOBILE_DOWNLOADS_STATE_FILE))).toEqual([]);
  });
});
