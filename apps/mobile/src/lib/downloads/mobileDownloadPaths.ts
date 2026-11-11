import { sha256Bytes } from "@nemu/core";
import type {
  MobileDownloadChapterRef,
  MobileDownloadMangaRef,
} from "./mobileDownloadTypes";

/** Under the documents directory: never a cache the system or "Clear Cache" may purge. */
export const MOBILE_DOWNLOADS_DIRECTORY_NAME = "nemu-downloads";
export const MOBILE_DOWNLOADS_STATE_FILE = "state.json";
export const MOBILE_DOWNLOAD_MANIFEST_FILE = "manifest.json";
export const MOBILE_DOWNLOAD_CHAPTER_INDEX_FILE = "chapters.json";
const PARTIAL_SUFFIX = ".partial";

function hex(value: string, length: number): string {
  return Array.from(sha256Bytes(new TextEncoder().encode(value)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .slice(0, length);
}

export function mobileDownloadMangaKey(ref: MobileDownloadMangaRef): string {
  return JSON.stringify([ref.registryId, ref.sourceId, ref.mangaId]);
}

export function mobileDownloadChapterKey(ref: MobileDownloadChapterRef): string {
  return JSON.stringify([ref.registryId, ref.sourceId, ref.mangaId, ref.chapterId]);
}

/** Per-source fairness: one chapter per source at a time. */
export function mobileDownloadSourceKey(ref: Pick<MobileDownloadMangaRef, "registryId" | "sourceId">): string {
  return JSON.stringify([ref.registryId, ref.sourceId]);
}

/**
 * One directory per account profile, so a signed-in account never reads
 * another's downloads. Hashed: a scope can hold characters no file name may.
 */
export function mobileDownloadScopeDirectory(profileScope: string): string {
  return `p-${hex(profileScope, 24)}`;
}

/**
 * Source ids are third-party strings: directory names are digests of them,
 * never the strings themselves (no `..`, separators or over-long names).
 */
export function mobileDownloadMangaDirectory(ref: MobileDownloadMangaRef): string {
  return `m-${hex(mobileDownloadMangaKey(ref), 32)}`;
}

export function mobileDownloadChapterDirectory(ref: MobileDownloadChapterRef): string {
  return `${mobileDownloadMangaDirectory(ref)}/c-${hex(mobileDownloadChapterKey(ref), 32)}`;
}

/** Pages land here first; the directory is renamed once the chapter is whole. */
export function mobileDownloadPartialDirectory(ref: MobileDownloadChapterRef): string {
  return `${mobileDownloadChapterDirectory(ref)}${PARTIAL_SUFFIX}`;
}

export function mobileDownloadPageFileName(index: number, extension: string): string {
  return `${String(index + 1).padStart(4, "0")}.${extension}`;
}

export type MobileDownloadImageFormat = "jpg" | "png" | "gif" | "webp" | "avif" | "heic";

/**
 * The image format from its first bytes, or null for anything else. A source
 * that answers a page with an HTML error or challenge page (status 200) must
 * fail the download, not save a page that never renders.
 */
export function sniffMobileDownloadImageFormat(head: Uint8Array): MobileDownloadImageFormat | null {
  const ascii = (offset: number, text: string) =>
    head.length >= offset + text.length &&
    [...text].every((char, index) => head[offset + index] === char.charCodeAt(0));
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpg";
  if (head.length >= 8 && head[0] === 0x89 && ascii(1, "PNG")) return "png";
  if (ascii(0, "GIF87a") || ascii(0, "GIF89a")) return "gif";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "webp";
  if (ascii(4, "ftyp")) {
    if (ascii(8, "avif") || ascii(8, "avis")) return "avif";
    if (ascii(8, "heic") || ascii(8, "heix") || ascii(8, "mif1") || ascii(8, "msf1")) return "heic";
  }
  return null;
}
