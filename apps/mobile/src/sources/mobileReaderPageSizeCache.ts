import { FileSystemBinaryCache } from "@/data/nativeCache";
import { getActiveMobileSourceProfileScope } from "./mobileSourceProfileScope";

/**
 * Pages' natural (decoded) sizes, per chapter, on disk. The reader keeps them
 * in memory for the app session (`rememberMobileReaderPageNaturalSize`); a
 * cold start had none, so the opening seek placed the list on estimated
 * heights and jumped once the real ones decoded. Restored before the chapter
 * paints, the first placement is already the real one.
 */
const PAGE_SIZE_CACHE_VERSION = 1;
const PAGE_SIZE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE_SIZE_CACHE_MAX_PAGES = 2_000;
const PAGE_SIZE_SAVE_DELAY_MS = 1_000;

const pageSizeCache = new FileSystemBinaryCache("nemu-reader-page-sizes", {
  maxBytes: 8 * 1024 * 1024,
  maxEntries: 400,
  maxAgeMs: PAGE_SIZE_CACHE_TTL_MS,
  maxEntryBytes: 256 * 1024,
});

export type MobileReaderPersistedPageSize = { width: number; height: number };

export function makeMobileReaderPageSizeChapterKey(input: {
  registryId: string;
  sourceId: string;
  mangaId: string;
  chapterId: string;
}): string {
  return JSON.stringify([input.registryId, input.sourceId, input.mangaId, input.chapterId]);
}

function validSize(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((part) => typeof part === "number" && Number.isFinite(part) && part > 0)
  );
}

export function encodeMobileReaderPageSizes(
  sizes: ReadonlyMap<string, MobileReaderPersistedPageSize>,
  now = Date.now(),
): Uint8Array {
  const entries: Record<string, [number, number]> = {};
  let count = 0;
  for (const [pageId, size] of sizes) {
    if (count >= PAGE_SIZE_CACHE_MAX_PAGES) break;
    entries[pageId] = [size.width, size.height];
    count += 1;
  }
  return new TextEncoder().encode(
    JSON.stringify({ v: PAGE_SIZE_CACHE_VERSION, savedAt: now, sizes: entries }),
  );
}

export function decodeMobileReaderPageSizes(
  bytes: Uint8Array | null,
  now = Date.now(),
): Map<string, MobileReaderPersistedPageSize> {
  const sizes = new Map<string, MobileReaderPersistedPageSize>();
  if (!bytes || bytes.byteLength === 0) return sizes;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as {
      v?: unknown;
      savedAt?: unknown;
      sizes?: unknown;
    };
    if (
      parsed.v !== PAGE_SIZE_CACHE_VERSION ||
      typeof parsed.savedAt !== "number" ||
      parsed.savedAt > now ||
      now - parsed.savedAt > PAGE_SIZE_CACHE_TTL_MS ||
      !parsed.sizes ||
      typeof parsed.sizes !== "object" ||
      Array.isArray(parsed.sizes)
    ) {
      return sizes;
    }
    for (const [pageId, value] of Object.entries(parsed.sizes)) {
      if (sizes.size >= PAGE_SIZE_CACHE_MAX_PAGES) break;
      if (validSize(value)) sizes.set(pageId, { width: value[0], height: value[1] });
    }
  } catch {
    sizes.clear();
  }
  return sizes;
}

function cacheKey(chapterKey: string): string {
  return `${getActiveMobileSourceProfileScope()}:${chapterKey}`;
}

/** Chapters with sizes not yet written: loaded + newly measured ones. */
const pendingByChapter = new Map<
  string,
  { sizes: Map<string, MobileReaderPersistedPageSize>; timer: ReturnType<typeof setTimeout> | null; loaded: Promise<void> }
>();

export async function loadMobileReaderPageSizes(
  chapterKey: string,
): Promise<Map<string, MobileReaderPersistedPageSize>> {
  try {
    const stored = decodeMobileReaderPageSizes(await pageSizeCache.getBytes(cacheKey(chapterKey)));
    const pending = pendingByChapter.get(chapterKey);
    if (pending) for (const [pageId, size] of pending.sizes) stored.set(pageId, size);
    return stored;
  } catch {
    return new Map();
  }
}

/**
 * Records a page's decoded size; written to disk (merged with what the
 * chapter already stored) a moment later, once per burst of loads.
 */
export function saveMobileReaderPageSize(
  chapterKey: string,
  pageId: string,
  size: MobileReaderPersistedPageSize,
): void {
  if (!validSize([size.width, size.height])) return;
  let pending = pendingByChapter.get(chapterKey);
  if (!pending) {
    const sizes = new Map<string, MobileReaderPersistedPageSize>();
    pending = {
      sizes,
      timer: null,
      // Merge under what is already stored so a partial visit never drops
      // pages measured on an earlier one.
      loaded: pageSizeCache
        .getBytes(cacheKey(chapterKey))
        .then((bytes) => {
          for (const [id, stored] of decodeMobileReaderPageSizes(bytes)) {
            if (!sizes.has(id)) sizes.set(id, stored);
          }
        })
        .catch(() => undefined),
    };
    pendingByChapter.set(chapterKey, pending);
  }
  const existing = pending.sizes.get(pageId);
  if (existing && existing.width === size.width && existing.height === size.height) return;
  pending.sizes.set(pageId, { width: size.width, height: size.height });
  if (pending.timer) return;
  const entry = pending;
  entry.timer = setTimeout(() => {
    entry.timer = null;
    void entry.loaded
      .then(() =>
        pageSizeCache.setBytes(
          cacheKey(chapterKey),
          encodeMobileReaderPageSizes(entry.sizes),
          "application/json",
        ),
      )
      .catch(() => undefined)
      .finally(() => {
        if (!entry.timer && pendingByChapter.get(chapterKey) === entry) {
          pendingByChapter.delete(chapterKey);
        }
      });
  }, PAGE_SIZE_SAVE_DELAY_MS);
}
