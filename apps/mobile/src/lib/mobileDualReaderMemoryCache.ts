export const MOBILE_DUAL_READER_SAMPLE_CACHE_SIZE = 32;

/**
 * Read and refresh an entry in an insertion-ordered Map used as an LRU cache.
 * Returning `undefined` is unambiguous for the reader caches, whose values are
 * always concrete hash/sample objects.
 */
export function getMobileDualReaderLruEntry<K, V>(
  cache: Map<K, V>,
  key: K,
): V | undefined {
  if (!cache.has(key)) return undefined;
  const value = cache.get(key)!;
  cache.delete(key);
  cache.set(key, value);
  return value;
}

/** Insert or refresh an entry and evict the least-recently-used values. */
export function setMobileDualReaderLruEntry<K, V>(
  cache: Map<K, V>,
  key: K,
  value: V,
  maxSize = MOBILE_DUAL_READER_SAMPLE_CACHE_SIZE,
): void {
  const boundedSize = Math.max(1, Math.floor(maxSize));
  cache.delete(key);
  cache.set(key, value);

  while (cache.size > boundedSize) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}
