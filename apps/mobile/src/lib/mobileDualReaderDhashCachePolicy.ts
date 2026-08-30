export type MobileDualReaderDhashCachePolicy = {
  maxBytes: number;
  maxEntries: number;
  maxAgeMs: number;
};

export type MobileDualReaderDhashCacheEntry = {
  id: string;
  sizeBytes: number;
  modifiedAtMs: number;
};

export const MOBILE_DUAL_READER_DHASH_CACHE_POLICY = {
  maxBytes: 64 * 1024 * 1024,
  maxEntries: 4_096,
  maxAgeMs: 90 * 24 * 60 * 60 * 1_000,
} as const satisfies MobileDualReaderDhashCachePolicy;

function safeSize(sizeBytes: number): number {
  return Number.isFinite(sizeBytes) && sizeBytes > 0 ? sizeBytes : 0;
}

function compareStableIds(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sortableModifiedAt(modifiedAtMs: number): number {
  return Number.isFinite(modifiedAtMs)
    ? modifiedAtMs
    : Number.NEGATIVE_INFINITY;
}

/**
 * Select expired entries first, then the oldest remaining entries until both
 * quotas are satisfied. Equal timestamps use the encoded file name as a stable
 * tie-breaker, so Android and iOS evict the same logical entry.
 */
export function selectMobileDualReaderDhashCacheEvictions(
  entries: readonly MobileDualReaderDhashCacheEntry[],
  policy: MobileDualReaderDhashCachePolicy = MOBILE_DUAL_READER_DHASH_CACHE_POLICY,
  nowMs = Date.now(),
  protectedId?: string,
): string[] {
  const oldestFirst = [...entries].sort((left, right) => {
    const leftModifiedAt = sortableModifiedAt(left.modifiedAtMs);
    const rightModifiedAt = sortableModifiedAt(right.modifiedAtMs);
    if (leftModifiedAt !== rightModifiedAt) {
      return leftModifiedAt - rightModifiedAt;
    }
    return compareStableIds(left.id, right.id);
  });
  const evicted = new Set<string>();

  for (const entry of oldestFirst) {
    const ageMs = Math.max(0, nowMs - entry.modifiedAtMs);
    if (
      entry.id !== protectedId &&
      (!Number.isFinite(entry.modifiedAtMs) || ageMs > policy.maxAgeMs)
    ) {
      evicted.add(entry.id);
    }
  }

  const retained = oldestFirst.filter((entry) => !evicted.has(entry.id));
  let retainedBytes = retained.reduce(
    (total, entry) => total + safeSize(entry.sizeBytes),
    0,
  );
  let retainedEntries = retained.length;
  const unprotectedFirst = [
    ...retained.filter((entry) => entry.id !== protectedId),
    ...retained.filter((entry) => entry.id === protectedId),
  ];

  for (const entry of unprotectedFirst) {
    if (
      retainedBytes <= policy.maxBytes &&
      retainedEntries <= policy.maxEntries
    ) {
      break;
    }
    evicted.add(entry.id);
    retainedBytes -= safeSize(entry.sizeBytes);
    retainedEntries -= 1;
  }

  return [...evicted];
}
