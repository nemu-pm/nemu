import { Directory, File, Paths } from "expo-file-system";
import {
  createMobileSourceDetailCache,
  decodeMobileSourceDetailCache,
  encodeMobileSourceDetailCache,
  makeMobileSourceDetailCacheKey,
  MOBILE_SOURCE_DETAIL_CACHE_MAX_BYTES,
  MOBILE_SOURCE_DETAIL_CACHE_MAX_CHAPTERS,
  MOBILE_SOURCE_DETAIL_CACHE_MAX_ENTRIES,
  MOBILE_SOURCE_DETAIL_CACHE_MEMORY_ENTRIES,
  MOBILE_SOURCE_DETAIL_CACHE_TTL_MS,
  getMobileSourceDetailMetadataAgeMs,
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
  MOBILE_SOURCE_DETAIL_CACHE_MEMORY_ENTRIES,
  MOBILE_SOURCE_DETAIL_CACHE_TTL_MS,
  getMobileSourceDetailMetadataAgeMs,
  type MobileSourceDetailCacheHit,
  type MobileSourceDetailCachePayload,
  type MobileSourceDetailCacheStore,
};

const cacheDirectory = new Directory(Paths.cache, "nemu-source-detail-cache");

function fileNameForKey(key: string): string {
  return `${encodeURIComponent(key).replace(/%/g, "_")}.json`;
}

function listCacheFiles(): File[] {
  if (!cacheDirectory.exists) return [];
  return cacheDirectory
    .list()
    .filter(
      (entry): entry is File =>
        entry instanceof File && entry.name.endsWith(".json"),
    );
}

async function readCacheFiles(files: File[]): Promise<string[]> {
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
}

const fileStore: MobileSourceDetailCacheStore = {
  async readAll() {
    try {
      return await readCacheFiles(listCacheFiles());
    } catch {
      return [];
    }
  },

  // The file-name encoding is applied character by character, so every key
  // starting with `prefix` has a file name starting with the encoded prefix
  // (the core re-checks decoded keys, so a rare lossy collision is harmless).
  async readPrefixed(prefix) {
    try {
      const stem = fileNameForKey(prefix).replace(/\.json$/, "");
      return await readCacheFiles(
        listCacheFiles().filter((file) => file.name.startsWith(stem)),
      );
    } catch {
      return [];
    }
  },

  // Least recently written first; entries used this session are kept.
  async prune(maxEntries, keep) {
    try {
      const files = listCacheFiles();
      if (files.length <= maxEntries) return;
      const keepNames = new Set([...keep].map(fileNameForKey));
      const candidates = files
        .filter((file) => !keepNames.has(file.name))
        .map((file) => {
          let modifiedAt = 0;
          try {
            modifiedAt = file.info().modificationTime ?? 0;
          } catch {
            // Unknown age sorts first: an unreadable file is the best to drop.
          }
          return { file, modifiedAt };
        })
        .sort((left, right) => left.modifiedAt - right.modifiedAt);
      let overflow = files.length - maxEntries;
      for (const { file } of candidates) {
        if (overflow <= 0) break;
        try {
          file.delete();
        } catch {
          // A locked file stays; the next prune retries it.
        }
        overflow -= 1;
      }
    } catch {
      // Pruning is best-effort.
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
export const setCachedMobileSourceDetailChapters = fileCache.setCachedChapters;
export const clearMobileSourceDetailCache = fileCache.clear;
export const clearMobileSourceDetailCacheForSource = fileCache.clearForSource;
