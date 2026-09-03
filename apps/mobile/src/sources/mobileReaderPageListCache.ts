import { FileSystemBinaryCache } from "@/data/nativeCache";
import type { ChapterSummary } from "@/data/schema";
import type { MobileReaderPage } from "./mobileSourcePages";
import { MOBILE_SOURCE_MAX_PAGE_COUNT } from "./mobileSourcePageSafety";
import { getActiveMobileSourceProfileScope } from "./mobileSourceProfileScope";

const PAGE_LIST_CACHE_VERSION = 1;
const PAGE_LIST_CACHE_MAX_BYTES = 2 * 1024 * 1024;
const PAGE_LIST_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const pageListCache = new FileSystemBinaryCache("nemu-reader-page-lists", {
  maxBytes: 24 * 1024 * 1024,
  maxEntries: 48,
  maxAgeMs: PAGE_LIST_CACHE_TTL_MS,
  maxEntryBytes: PAGE_LIST_CACHE_MAX_BYTES,
});

export type PersistedMobileReaderPageList = {
  pages: MobileReaderPage[];
  chapters: ChapterSummary[];
  chapter: ChapterSummary;
  fetchedAt: number;
};

function cacheKey(key: string): string {
  return `${getActiveMobileSourceProfileScope()}:${key}`;
}

function validChapter(value: unknown): value is ChapterSummary {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof (value as ChapterSummary).id === "string",
  );
}

function validPage(value: unknown, index: number): value is MobileReaderPage {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const page = value as MobileReaderPage;
  if (typeof page.id !== "string" || page.index !== index) return false;
  if (page.imageUri === undefined) return true;
  return (
    typeof page.imageUri === "string" &&
    page.imageUri.length <= 8_192 &&
    /^https?:\/\//i.test(page.imageUri) &&
    page.imageUriOwnership === "source"
  );
}

export function decodeMobileReaderPageListCache(
  bytes: Uint8Array | null,
  now = Date.now(),
): PersistedMobileReaderPageList | null {
  if (!bytes || bytes.byteLength === 0 || bytes.byteLength > PAGE_LIST_CACHE_MAX_BYTES) {
    return null;
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
      v?: unknown;
      savedAt?: unknown;
      pages?: unknown;
      chapters?: unknown;
      chapter?: unknown;
      fetchedAt?: unknown;
    };
    if (
      parsed.v !== PAGE_LIST_CACHE_VERSION ||
      typeof parsed.savedAt !== "number" ||
      parsed.savedAt > now ||
      now - parsed.savedAt > PAGE_LIST_CACHE_TTL_MS ||
      !Array.isArray(parsed.pages) ||
      parsed.pages.length === 0 ||
      parsed.pages.length > MOBILE_SOURCE_MAX_PAGE_COUNT ||
      !parsed.pages.every(validPage) ||
      !Array.isArray(parsed.chapters) ||
      parsed.chapters.length > MOBILE_SOURCE_MAX_PAGE_COUNT ||
      !parsed.chapters.every(validChapter) ||
      !validChapter(parsed.chapter) ||
      typeof parsed.fetchedAt !== "number"
    ) {
      return null;
    }
    return {
      pages: parsed.pages,
      chapters: parsed.chapters,
      chapter: parsed.chapter,
      fetchedAt: parsed.fetchedAt,
    };
  } catch {
    return null;
  }
}

export async function loadMobileReaderPageListCache(
  key: string,
): Promise<PersistedMobileReaderPageList | null> {
  return decodeMobileReaderPageListCache(await pageListCache.getBytes(cacheKey(key)));
}

export async function saveMobileReaderPageListCache(
  key: string,
  value: PersistedMobileReaderPageList,
): Promise<void> {
  if (value.pages.some((page, index) => !validPage(page, index))) return;
  const bytes = new TextEncoder().encode(
    JSON.stringify({ v: PAGE_LIST_CACHE_VERSION, savedAt: Date.now(), ...value }),
  );
  if (bytes.byteLength > PAGE_LIST_CACHE_MAX_BYTES) return;
  await pageListCache.setBytes(cacheKey(key), bytes, "application/json");
}

export async function clearMobileReaderPageListCache(): Promise<void> {
  await pageListCache.clearAll();
}

export async function getMobileReaderPageListCacheStats(): Promise<{
  bytes: number;
  entries: number;
}> {
  return pageListCache.getStats();
}
