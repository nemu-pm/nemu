import { Directory, File, Paths } from "expo-file-system";
import {
  createMobileSourceDetailCache,
  decodeMobileSourceDetailCache,
  encodeMobileSourceDetailCache,
  makeMobileSourceDetailCacheKey,
  MOBILE_SOURCE_DETAIL_CACHE_MAX_BYTES,
  MOBILE_SOURCE_DETAIL_CACHE_MAX_CHAPTERS,
  MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES,
  MOBILE_SOURCE_DETAIL_CACHE_TTL_MS,
  type MobileSourceDetailCacheHit,
  type MobileSourceDetailCachePayload,
  type MobileSourceDetailCacheStore,
} from "./mobileSourceDetailCacheCore";

// Native source-detail cache: one JSON file per manga inside a dedicated
// directory of the OS cache directory. Public catalog data only; best-effort
// persistence that never throws — a corrupt or missing file is a cache miss.

export {
  decodeMobileSourceDetailCache,
  encodeMobileSourceDetailCache,
  makeMobileSourceDetailCacheKey,
  MOBILE_SOURCE_DETAIL_CACHE_MAX_BYTES,
  MOBILE_SOURCE_DETAIL_CACHE_MAX_CHAPTERS,
  MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES,
  MOBILE_SOURCE_DETAIL_CACHE_TTL_MS,
  type MobileSourceDetailCacheHit,
  type MobileSourceDetailCachePayload,
  type MobileSourceDetailCacheStore,
};

const cacheDirectory = new Directory(Paths.cache, "nemu-source-detail-cache");

function fileNameForKey(key: string): string {
  return `${encodeURIComponent(key).replace(/%/g, "_")}.json`;
}

const fileStore: MobileSourceDetailCacheStore = {
  async readAll() {
    try {
      if (!cacheDirectory.exists) return [];
      const files = cacheDirectory
        .list()
        .filter(
          (entry): entry is File =>
            entry instanceof File && entry.name.endsWith(".json"),
        );
      const rawEntries: string[] = [];
      for (const file of files) {
        try {
          if (!file.exists) continue;
          if ((file.info().size ?? 0) > MOBILE_SOURCE_DETAIL_CACHE_MAX_BYTES) {
            continue;
          }
          rawEntries.push(await file.text());
        } catch {
          // An unreadable file is a miss for that key only.
        }
      }
      return rawEntries;
    } catch {
      return [];
    }
  },

  async read(key) {
    try {
      const file = new File(cacheDirectory, fileNameForKey(key));
      if (!file.exists) return null;
      if ((file.info().size ?? 0) > MOBILE_SOURCE_DETAIL_CACHE_MAX_BYTES) {
        return null;
      }
      return await file.text();
    } catch {
      // An unreadable file is a cache miss for that key only.
      return null;
    }
  },

  async write(key, raw) {
    try {
      if (!cacheDirectory.exists) {
        cacheDirectory.create({ intermediates: true });
      }
      await new File(cacheDirectory, fileNameForKey(key)).write(raw);
    } catch {
      // Cache persistence is best-effort; the network fetch is the source of truth.
    }
  },

  async remove(key) {
    try {
      const file = new File(cacheDirectory, fileNameForKey(key));
      if (file.exists) file.delete();
    } catch {
      // A missing or locked cache file is already effectively cleared.
    }
  },
};

const fileCache = createMobileSourceDetailCache(fileStore);

export const getCachedMobileSourceDetail = fileCache.getCached;
export const setCachedMobileSourceDetail = fileCache.setCached;
export const clearMobileSourceDetailCache = fileCache.clear;
export const clearMobileSourceDetailCacheForSource = fileCache.clearForSource;
