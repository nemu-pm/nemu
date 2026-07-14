import { createPluginAsyncStorage } from '../../types';
import type { MultiDhash } from '@nemu/core/dual-reader';
import type { SerializedMultiDhash } from '@nemu/core/dual-reader';
import {
  DUAL_READER_DHASH_CACHE_VERSION,
  deserializeMultiDhash,
  serializeMultiDhash,
} from '@nemu/core/dual-reader';

const storage = createPluginAsyncStorage('dual-reader');

export interface DualReadHashCacheKey {
  registryId: string;
  sourceId: string;
  mangaId: string;
  chapterId: string;
  pageIndex: number;
}

interface DualReadHashCacheValue {
  version: number;
  hash: SerializedMultiDhash;
}

function makeKey(key: DualReadHashCacheKey): string {
  return `dhash:${key.registryId}:${key.sourceId}:${key.mangaId}:${key.chapterId}:${key.pageIndex}`;
}

export async function getCachedDualReadHash(key: DualReadHashCacheKey): Promise<MultiDhash | null> {
  const cacheKey = makeKey(key);
  const cached = await storage.get<DualReadHashCacheValue>(cacheKey);
  if (!cached) return null;
  if (cached.version !== DUAL_READER_DHASH_CACHE_VERSION || !cached.hash) {
    await storage.remove(cacheKey);
    return null;
  }
  try {
    return deserializeMultiDhash(cached.hash);
  } catch {
    await storage.remove(cacheKey);
    return null;
  }
}

export async function setCachedDualReadHash(key: DualReadHashCacheKey, hash: MultiDhash): Promise<void> {
  await storage.set(makeKey(key), {
    version: DUAL_READER_DHASH_CACHE_VERSION,
    hash: serializeMultiDhash(hash),
  });
}
