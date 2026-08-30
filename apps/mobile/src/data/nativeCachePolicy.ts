export type NativeBinaryCachePolicy = {
  maxBytes: number;
  maxEntries: number;
  maxAgeMs: number;
  maxEntryBytes: number;
};

export type NativeBinaryCacheEntry = {
  id: string;
  size: number;
  modifiedAt: number;
};

function safeSize(size: number): number {
  return Number.isFinite(size) && size > 0 ? size : 0;
}

/**
 * Selects expired entries first, then evicts the oldest remaining files until
 * both the byte and entry-count limits are satisfied. The native cache uses
 * file modification time, so replacement writes naturally refresh recency.
 */
export function selectNativeBinaryCacheEvictions(
  entries: NativeBinaryCacheEntry[],
  policy: Pick<NativeBinaryCachePolicy, "maxAgeMs" | "maxBytes" | "maxEntries">,
  now = Date.now(),
  protectedId?: string,
): string[] {
  const evicted = new Set<string>();
  const oldestFirst = [...entries].sort((left, right) => {
    if (left.modifiedAt !== right.modifiedAt) {
      return left.modifiedAt - right.modifiedAt;
    }
    return left.id.localeCompare(right.id);
  });

  for (const entry of oldestFirst) {
    const age = Math.max(0, now - entry.modifiedAt);
    if (
      entry.id !== protectedId &&
      (!Number.isFinite(entry.modifiedAt) || age > policy.maxAgeMs)
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
  for (const entry of [
    ...retained.filter((candidate) => candidate.id !== protectedId),
    ...retained.filter((candidate) => candidate.id === protectedId),
  ]) {
    if (
      retainedBytes <= policy.maxBytes &&
      retainedEntries <= policy.maxEntries
    ) {
      break;
    }
    evicted.add(entry.id);
    retainedBytes -= safeSize(entry.size);
    retainedEntries -= 1;
  }

  return [...evicted];
}
