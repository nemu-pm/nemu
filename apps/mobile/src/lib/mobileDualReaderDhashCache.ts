/**
 * Mobile dHash cache for the dual-reader alignment engine.
 *
 * Mirrors the web `dhash-cache.ts` (`src/lib/plugins/builtin/dual-reader/dhash-cache.ts`):
 * same key shape (`dhash:${registryId}:${sourceId}:${mangaId}:${chapterId}:${pageIndex}`),
 * same value schema (`{ version: 3, hash: SerializedMultiDhash }`), and the same
 * `serializeMultiDhash`/`deserializeMultiDhash` round-trip from `@nemu/core`.
 *
 * Web backs this with IndexedDB (`createPluginAsyncStorage`); mobile backs it
 * with a JSON file under `Paths.cache/nemu-dual-reader-dhash` via
 * `mobileDualReaderPersistence` (the same file-cache pattern the TTS cache uses).
 * The on-disk schema matches web so the two stay in lock step; only the storage
 * medium differs.
 */
import type { MultiDhash, SerializedMultiDhash } from "@nemu/core/dual-reader";
import {
  DUAL_READER_DHASH_CACHE_VERSION,
  deserializeMultiDhash,
  serializeMultiDhash,
} from "@nemu/core/dual-reader";
import {
  DUAL_READER_DHASH_DIR,
  clearJsonCacheDirectory,
  readJsonCache,
  removeJsonCache,
  writeBoundedJsonCache,
} from "./mobileDualReaderPersistence";
import {
  MOBILE_DUAL_READER_DHASH_CACHE_POLICY,
  selectMobileDualReaderDhashCacheEvictions,
} from "./mobileDualReaderDhashCachePolicy";
import { getActiveMobileSourceProfileScope } from "@/sources/mobileSourceProfileScope";

export interface MobileDualReadHashCacheKey {
  registryId: string;
  sourceId: string;
  mangaId: string;
  chapterId: string;
  pageIndex: number;
}

interface MobileDualReadHashCacheValue {
  version: number;
  hash: SerializedMultiDhash;
}

const DUAL_READER_DHASH_PERSISTENCE_POLICY = {
  ...MOBILE_DUAL_READER_DHASH_CACHE_POLICY,
  selectEvictions: (
    entries: ReadonlyArray<{
      fileName: string;
      sizeBytes: number;
      modifiedAtMs: number;
    }>,
    nowMs: number,
    protectedFileName: string,
  ) =>
    selectMobileDualReaderDhashCacheEvictions(
      entries.map((entry) => ({
        id: entry.fileName,
        sizeBytes: entry.sizeBytes,
        modifiedAtMs: entry.modifiedAtMs,
      })),
      MOBILE_DUAL_READER_DHASH_CACHE_POLICY,
      nowMs,
      protectedFileName,
    ),
};

function makeKey(key: MobileDualReadHashCacheKey): string {
  return `dhash:${getActiveMobileSourceProfileScope()}:${key.registryId}:${key.sourceId}:${key.mangaId}:${key.chapterId}:${key.pageIndex}`;
}

export async function getCachedMobileDualReadHash(
  key: MobileDualReadHashCacheKey,
): Promise<MultiDhash | null> {
  const cacheKey = makeKey(key);
  const cached = await readJsonCache<MobileDualReadHashCacheValue>(
    DUAL_READER_DHASH_DIR,
    cacheKey,
  );
  if (!cached) return null;
  if (cached.version !== DUAL_READER_DHASH_CACHE_VERSION || !cached.hash) {
    await removeJsonCache(DUAL_READER_DHASH_DIR, cacheKey);
    return null;
  }
  try {
    return deserializeMultiDhash(cached.hash);
  } catch {
    // Old Android/JSC builds could persist signed 32-bit values after the
    // Number-based BigInt shim truncated a 64-bit hash. Never reuse that
    // corrupt alignment input; evict it so the exact pair is recomputed.
    await removeJsonCache(DUAL_READER_DHASH_DIR, cacheKey);
    return null;
  }
}

export async function setCachedMobileDualReadHash(
  key: MobileDualReadHashCacheKey,
  hash: MultiDhash,
): Promise<void> {
  await writeBoundedJsonCache<MobileDualReadHashCacheValue>(
    DUAL_READER_DHASH_DIR,
    makeKey(key),
    {
      version: DUAL_READER_DHASH_CACHE_VERSION,
      hash: serializeMultiDhash(hash),
    },
    DUAL_READER_DHASH_PERSISTENCE_POLICY,
  );
}

export async function removeCachedMobileDualReadHash(
  key: MobileDualReadHashCacheKey,
): Promise<void> {
  await removeJsonCache(DUAL_READER_DHASH_DIR, makeKey(key));
}

export async function clearMobileDualReaderDhashCache(): Promise<void> {
  await clearJsonCacheDirectory(DUAL_READER_DHASH_DIR);
}
