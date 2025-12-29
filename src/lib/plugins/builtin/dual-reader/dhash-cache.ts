import { createPluginAsyncStorage } from '../../types';
import type { MultiDhash } from '@/lib/dual-reader/hash';
import type { SerializedMultiDhash } from '@/lib/dual-reader/hash-serialization';
import { deserializeMultiDhash, serializeMultiDhash } from '@/lib/dual-reader/hash-serialization';

const storage = createPluginAsyncStorage('dual-reader');

export interface DualReadHashCacheKey {
  registryId: string;
  sourceId: string;
  mangaId: string;
  chapterId: string;
  pageIndex: number;
}

interface DualReadHashCacheValue {
  version: 2;
  hash: SerializedMultiDhash;
}

function makeKey(key: DualReadHashCacheKey): string {
  return `dhash:${key.registryId}:${key.sourceId}:${key.mangaId}:${key.chapterId}:${key.pageIndex}`;
}

export async function getCachedDualReadHash(key: DualReadHashCacheKey): Promise<MultiDhash | null> {
  const cached = await storage.get<DualReadHashCacheValue>(makeKey(key));
  if (!cached || cached.version !== 2 || !cached.hash) return null;
  return deserializeMultiDhash(cached.hash);
}

export async function setCachedDualReadHash(key: DualReadHashCacheKey, hash: MultiDhash): Promise<void> {
  await storage.set(makeKey(key), { version: 2, hash: serializeMultiDhash(hash) });
}
