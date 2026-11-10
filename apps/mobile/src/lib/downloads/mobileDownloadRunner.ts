import type { ChapterSummary } from "@/data/schema";
import { decodeBase64 } from "@/lib/mobileBase64";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import type { MobileDownloadFiles } from "./mobileDownloadFiles";
import {
  MOBILE_DOWNLOAD_MANIFEST_FILE,
  mobileDownloadChapterDirectory,
  mobileDownloadPageFileName,
  mobileDownloadPartialDirectory,
  sniffMobileDownloadImageFormat,
} from "./mobileDownloadPaths";
import { writeMobileDownloadChapterIndex } from "./mobileDownloadStore";
import type {
  MobileDownloadJob,
  MobileDownloadManifest,
  MobileDownloadedPage,
} from "./mobileDownloadTypes";

/**
 * Downloads one chapter: the source lists its pages, each page resolves
 * exactly as the reader would resolve it (the source's decorated request,
 * its cookies and referer, or its processed/descrambled bytes), and the
 * bytes land in `<chapter>.partial/`. Only a whole chapter is renamed into
 * place, so the reader never opens a half-downloaded one; a stopped run keeps
 * its saved pages and the next run fetches only the rest.
 */

/** The chapter's pages as the source gives them, for one run. */
export type MobileDownloadPageSource = {
  pages: MobileReaderPage[];
  /** The page as the reader would paint it (decorated request or processed file). */
  resolvePage(index: number, signal: AbortSignal): Promise<MobileReaderPage | null>;
  chapter: ChapterSummary;
  /** The work's chapter index, when the source returned it. */
  chapters: ChapterSummary[] | null;
  dispose(): void;
};

export type MobileDownloadRunnerDeps = {
  files: MobileDownloadFiles;
  scopeDirectory: string;
  loadPages(job: MobileDownloadJob, signal: AbortSignal): Promise<MobileDownloadPageSource>;
  /** A remote page image into an app-owned temporary file. */
  fetchImage(
    request: { uri: string; headers?: Record<string, string> },
    signal: AbortSignal,
  ): Promise<{ fileUri: string }>;
  now(): number;
  onProgress(progress: { pagesDone: number; pageCount: number; bytes: number }): void;
  /** Pages fetched at once within the chapter. */
  pageConcurrency?: number;
};

export type MobileDownloadRunResult = {
  pageCount: number;
  bytes: number;
  completedAt: number;
};

export class MobileDownloadPageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MobileDownloadPageError";
  }
}

const PAGE_FILE_PATTERN = /^(\d{4,6})\.(jpg|png|gif|webp|avif|heic)$/;
const SNIFF_BYTES = 16;

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");
}

function isRemoteUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

/** Pages a previous run already saved, by index. */
function savedPages(files: MobileDownloadFiles, directory: string): Map<number, string> {
  const saved = new Map<number, string>();
  for (const name of files.list(directory)) {
    const match = PAGE_FILE_PATTERN.exec(name);
    if (!match) continue;
    if (!files.fileSize(`${directory}/${name}`)) continue;
    saved.set(Number(match[1]) - 1, name);
  }
  return saved;
}

async function savePageImage(
  deps: MobileDownloadRunnerDeps,
  directory: string,
  index: number,
  page: MobileReaderPage,
  signal: AbortSignal,
): Promise<string> {
  const uri = page.imageUri!;
  const staged = `${directory}/incoming-${index}`;
  if (uri.startsWith("data:")) {
    const comma = uri.indexOf(",");
    if (comma < 0 || !/;base64$/i.test(uri.slice(0, comma))) {
      throw new MobileDownloadPageError("The page is an unsupported data URI.");
    }
    await deps.files.writeBytes(staged, decodeBase64(uri.slice(comma + 1)));
  } else if (page.imageUriOwnership === "source" && isRemoteUri(uri)) {
    const { fileUri } = await deps.fetchImage({ uri, headers: page.headers }, signal);
    await deps.files.adoptFile(fileUri, staged);
  } else if (page.imageUriOwnership === "app" && uri.startsWith("file:")) {
    await deps.files.copyFile(uri, staged);
  } else {
    throw new MobileDownloadPageError("The page image cannot be saved.");
  }
  throwIfAborted(signal);
  const format = sniffMobileDownloadImageFormat(await deps.files.readHead(staged, SNIFF_BYTES));
  if (!format) {
    await deps.files.remove(staged);
    throw new MobileDownloadPageError("The source returned something other than an image.");
  }
  const name = mobileDownloadPageFileName(index, format);
  await deps.files.move(staged, `${directory}/${name}`);
  return name;
}

export async function runMobileChapterDownload(
  job: MobileDownloadJob,
  deps: MobileDownloadRunnerDeps,
  signal: AbortSignal,
): Promise<MobileDownloadRunResult> {
  const ref = { ...job, chapterId: job.chapter.id };
  const partial = `${deps.scopeDirectory}/${mobileDownloadPartialDirectory(ref)}`;
  const final = `${deps.scopeDirectory}/${mobileDownloadChapterDirectory(ref)}`;
  throwIfAborted(signal);
  const source = await deps.loadPages(job, signal);
  try {
    throwIfAborted(signal);
    const pageCount = source.pages.length;
    if (pageCount === 0) throw new MobileDownloadPageError("The source listed no pages for this chapter.");
    const saved = savedPages(deps.files, partial);
    const records: Array<MobileDownloadedPage | undefined> = new Array(pageCount);
    let pagesDone = 0;
    let bytes = 0;
    const report = () => deps.onProgress({ pagesDone, pageCount, bytes });
    const record = (index: number, page: MobileReaderPage, file: string | undefined) => {
      const size = page.sourceSize ? { width: page.sourceSize.width, height: page.sourceSize.height } : {};
      records[index] = {
        id: page.id,
        index: page.index,
        ...(file ? { file } : {}),
        ...(page.text ? { text: page.text } : {}),
        ...size,
      };
      if (file) bytes += deps.files.fileSize(`${partial}/${file}`) ?? 0;
      pagesDone += 1;
    };
    for (const [index, name] of saved) {
      if (index >= pageCount) continue;
      record(index, source.pages[index]!, name);
    }
    report();

    const pending = source.pages.map((_, index) => index).filter((index) => records[index] === undefined);
    // The first page that fails stops its siblings, and the run returns only
    // once none of them can still write into the chapter's directory.
    const run = new AbortController();
    const forward = () => run.abort(signal.reason);
    signal.addEventListener("abort", forward);
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const index = pending[cursor++]!;
        throwIfAborted(run.signal);
        const page = (await source.resolvePage(index, run.signal)) ?? source.pages[index]!;
        throwIfAborted(run.signal);
        if (page.imageProcessing === "failed") {
          throw new MobileDownloadPageError("The source could not process a page image.");
        }
        if (page.imageUri) {
          record(index, page, await savePageImage(deps, partial, index, page, run.signal));
        } else if (page.text) {
          record(index, page, undefined);
        } else {
          throw new MobileDownloadPageError("A page has neither an image nor text.");
        }
        report();
      }
    };
    const concurrency = Math.max(1, Math.min(deps.pageConcurrency ?? 2, pending.length || 1));
    try {
      const outcomes = await Promise.allSettled(
        Array.from({ length: concurrency }, () =>
          worker().catch((error: unknown) => {
            run.abort(error);
            throw error;
          }),
        ),
      );
      throwIfAborted(signal);
      const failure = outcomes.find((outcome) => outcome.status === "rejected");
      if (failure) throw (failure as PromiseRejectedResult).reason;
    } finally {
      signal.removeEventListener("abort", forward);
    }
    throwIfAborted(signal);

    const completedAt = deps.now();
    const manifest: MobileDownloadManifest = {
      version: 1,
      registryId: job.registryId,
      sourceId: job.sourceId,
      mangaId: job.mangaId,
      chapter: { ...job.chapter, ...source.chapter, id: job.chapter.id },
      pages: records as MobileDownloadedPage[],
      bytes,
      completedAt,
    };
    await deps.files.writeText(`${partial}/${MOBILE_DOWNLOAD_MANIFEST_FILE}`, JSON.stringify(manifest));
    await deps.files.move(partial, final);
    if (source.chapters?.length) {
      await writeMobileDownloadChapterIndex(deps.files, deps.scopeDirectory, job, source.chapters).catch(
        () => undefined,
      );
    }
    return { pageCount, bytes, completedAt };
  } finally {
    source.dispose();
  }
}
