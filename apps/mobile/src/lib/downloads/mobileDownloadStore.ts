import type { ChapterSummary } from "@/data/schema";
import type { MobileReaderPage } from "@/sources/mobileSourcePages";
import type { MobileDownloadFiles } from "./mobileDownloadFiles";
import {
  MOBILE_DOWNLOAD_CHAPTER_INDEX_FILE,
  MOBILE_DOWNLOAD_MANIFEST_FILE,
  mobileDownloadChapterDirectory,
  mobileDownloadMangaDirectory,
} from "./mobileDownloadPaths";
import type {
  MobileDownloadChapterRef,
  MobileDownloadManifest,
  MobileDownloadMangaRef,
  MobileDownloadedPage,
} from "./mobileDownloadTypes";

/**
 * The read side of a downloaded chapter: its manifest, the work's saved
 * chapter index (for chapter-to-chapter navigation offline), and the reader
 * pages they make.
 */

function parseJson(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A page file name the runner wrote: never a path. */
const PAGE_FILE_PATTERN = /^\d{4,6}\.(?:jpg|png|gif|webp|avif|heic)$/;

function parsePage(value: unknown): MobileDownloadedPage | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.index !== "number") return null;
  const file = typeof value.file === "string" && PAGE_FILE_PATTERN.test(value.file) ? value.file : undefined;
  const text = typeof value.text === "string" ? value.text : undefined;
  if (!file && !text) return null;
  const size =
    typeof value.width === "number" && typeof value.height === "number" && value.width > 0 && value.height > 0
      ? { width: value.width, height: value.height }
      : {};
  return { id: value.id, index: value.index, ...(file ? { file } : {}), ...(text ? { text } : {}), ...size };
}

export async function readMobileDownloadManifest(
  files: MobileDownloadFiles,
  scopeDirectory: string,
  ref: MobileDownloadChapterRef,
): Promise<MobileDownloadManifest | null> {
  const directory = `${scopeDirectory}/${mobileDownloadChapterDirectory(ref)}`;
  const value = parseJson(await files.readText(`${directory}/${MOBILE_DOWNLOAD_MANIFEST_FILE}`).catch(() => null));
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.chapter) || !Array.isArray(value.pages)) return null;
  if (value.registryId !== ref.registryId || value.sourceId !== ref.sourceId || value.mangaId !== ref.mangaId) return null;
  const chapter = value.chapter as ChapterSummary;
  if (chapter.id !== ref.chapterId) return null;
  const pages: MobileDownloadedPage[] = [];
  for (const raw of value.pages) {
    const page = parsePage(raw);
    if (!page) return null;
    pages.push(page);
  }
  if (pages.length === 0) return null;
  return {
    version: 1,
    registryId: ref.registryId,
    sourceId: ref.sourceId,
    mangaId: ref.mangaId,
    chapter,
    pages,
    bytes: typeof value.bytes === "number" ? value.bytes : 0,
    completedAt: typeof value.completedAt === "number" ? value.completedAt : 0,
  };
}

/**
 * The reader's pages for a downloaded chapter: app-owned `file://` images,
 * like an imported archive's. Null when any page file has gone missing, so
 * the reader falls back to the source instead of showing holes.
 */
export function mobileDownloadedReaderPages(
  files: MobileDownloadFiles,
  scopeDirectory: string,
  ref: MobileDownloadChapterRef,
  manifest: MobileDownloadManifest,
): MobileReaderPage[] | null {
  const directory = `${scopeDirectory}/${mobileDownloadChapterDirectory(ref)}`;
  const pages: MobileReaderPage[] = [];
  for (const page of manifest.pages) {
    const sourceSize = page.width && page.height ? { sourceSize: { width: page.width, height: page.height } } : {};
    if (!page.file) {
      pages.push({ id: page.id, index: page.index, text: page.text, ...sourceSize });
      continue;
    }
    const path = `${directory}/${page.file}`;
    if (!files.fileSize(path)) return null;
    pages.push({
      id: page.id,
      index: page.index,
      imageUri: files.uri(path),
      imageUriOwnership: "app",
      ...(page.text ? { text: page.text } : {}),
      ...sourceSize,
    });
  }
  return pages;
}

export async function readMobileDownloadChapterIndex(
  files: MobileDownloadFiles,
  scopeDirectory: string,
  ref: MobileDownloadMangaRef,
): Promise<ChapterSummary[] | null> {
  const value = parseJson(
    await files
      .readText(`${scopeDirectory}/${mobileDownloadMangaDirectory(ref)}/${MOBILE_DOWNLOAD_CHAPTER_INDEX_FILE}`)
      .catch(() => null),
  );
  if (!isRecord(value) || !Array.isArray(value.chapters)) return null;
  const chapters = value.chapters.filter(
    (chapter): chapter is ChapterSummary => isRecord(chapter) && typeof chapter.id === "string",
  );
  return chapters.length > 0 ? chapters : null;
}

export async function writeMobileDownloadChapterIndex(
  files: MobileDownloadFiles,
  scopeDirectory: string,
  ref: MobileDownloadMangaRef,
  chapters: readonly ChapterSummary[],
): Promise<void> {
  if (chapters.length === 0) return;
  await files.writeText(
    `${scopeDirectory}/${mobileDownloadMangaDirectory(ref)}/${MOBILE_DOWNLOAD_CHAPTER_INDEX_FILE}`,
    JSON.stringify({ version: 1, chapters }),
  );
}
