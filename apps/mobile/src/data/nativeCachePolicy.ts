export type NativeBinaryCachePolicy = {
  maxBytes: number;
  maxEntries: number;
  maxAgeMs: number;
  maxEntryBytes: number;
  /** Optional post-pressure targets that prevent one-entry eviction churn. */
  targetBytes?: number;
  targetEntries?: number;
};

export type NativeBinaryCacheEntry = {
  id: string;
  size: number;
  modifiedAt: number;
  /**
   * Last read hit, when the cache tracked one. `expo-file-system`'s File API
   * exposes `modificationTime` but cannot set it, so a read cannot touch the
   * file itself; the cache supplies its own access timestamps instead.
   */
  lastAccessAt?: number;
};

function safeSize(size: number): number {
  return Number.isFinite(size) && size > 0 ? size : 0;
}

/**
 * Recency of an entry: the later of its write time and its last recorded read.
 * Without the read signal a frequently displayed cover is evicted purely for
 * being written long ago.
 */
export function nativeBinaryCacheEntryRecency(
  entry: NativeBinaryCacheEntry,
): number {
  const modified = Number.isFinite(entry.modifiedAt)
    ? entry.modifiedAt
    : Number.NEGATIVE_INFINITY;
  const accessed = Number.isFinite(entry.lastAccessAt)
    ? (entry.lastAccessAt as number)
    : Number.NEGATIVE_INFINITY;
  const recency = Math.max(modified, accessed);
  return Number.isFinite(recency) ? recency : Number.NaN;
}

/**
 * Selects expired entries first, then evicts the least recently used remaining
 * files until both the byte and entry-count limits are satisfied. Replacement
 * writes refresh recency through the file's modification time; plain reads
 * refresh it through `lastAccessAt`.
 */
export function selectNativeBinaryCacheEvictions(
  entries: NativeBinaryCacheEntry[],
  policy: Pick<
    NativeBinaryCachePolicy,
    "maxAgeMs" | "maxBytes" | "maxEntries" | "targetBytes" | "targetEntries"
  >,
  now = Date.now(),
  protectedId?: string,
): string[] {
  const evicted = new Set<string>();
  const recencyById = new Map(
    entries.map((entry) => [entry.id, nativeBinaryCacheEntryRecency(entry)]),
  );
  const recencyOf = (entry: NativeBinaryCacheEntry) =>
    recencyById.get(entry.id) ?? entry.modifiedAt;
  const oldestFirst = [...entries].sort((left, right) => {
    const leftRecency = recencyOf(left);
    const rightRecency = recencyOf(right);
    if (leftRecency !== rightRecency) {
      return leftRecency - rightRecency;
    }
    return left.id.localeCompare(right.id);
  });

  for (const entry of oldestFirst) {
    const recency = recencyOf(entry);
    const age = Math.max(0, now - recency);
    if (
      entry.id !== protectedId &&
      (!Number.isFinite(recency) || age > policy.maxAgeMs)
    ) {
      evicted.add(entry.id);
    }
  }

  const retained = oldestFirst.filter((entry) => !evicted.has(entry.id));
  let retainedBytes = retained.reduce(
    (total, entry) => total + safeSize(entry.size),
    0,
  );
  let retainedEntries = retained.length;
  const underPressure =
    retainedBytes > policy.maxBytes || retainedEntries > policy.maxEntries;
  const byteLimit = underPressure
    ? Math.min(policy.maxBytes, policy.targetBytes ?? policy.maxBytes)
    : policy.maxBytes;
  const entryLimit = underPressure
    ? Math.min(policy.maxEntries, policy.targetEntries ?? policy.maxEntries)
    : policy.maxEntries;
  for (const entry of [
    ...retained.filter((candidate) => candidate.id !== protectedId),
    ...retained.filter((candidate) => candidate.id === protectedId),
  ]) {
    if (
      retainedBytes <= byteLimit &&
      retainedEntries <= entryLimit
    ) {
      break;
    }
    evicted.add(entry.id);
    retainedBytes -= safeSize(entry.size);
    retainedEntries -= 1;
  }

  return [...evicted];
}
