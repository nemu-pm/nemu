/**
 * A missing clock only exists on records written before logical timestamps
 * were required. Any explicitly timestamped write may replace such a record.
 */
export function shouldApplyLww(
  existingUpdatedAt: number | undefined,
  incomingUpdatedAt: number,
): boolean {
  return existingUpdatedAt === undefined || existingUpdatedAt < incomingUpdatedAt;
}

export function isAfterRemovalBarrier(
  lastRemovedAt: number | undefined,
  incomingUpdatedAt: number,
): boolean {
  return lastRemovedAt === undefined || incomingUpdatedAt > lastRemovedAt;
}

export function maximumRemovalBarrier(
  records: readonly { lastRemovedAt?: number }[],
): number | undefined {
  let maximum: number | undefined;
  for (const record of records) {
    if (
      record.lastRemovedAt !== undefined &&
      (maximum === undefined || record.lastRemovedAt > maximum)
    ) {
      maximum = record.lastRemovedAt;
    }
  }
  return maximum;
}

export function newestLwwRecord<T extends { updatedAt?: number }>(
  records: readonly T[],
  isTombstone: (record: T) => boolean = () => false,
): T | undefined {
  let newest: T | undefined;
  for (const record of records) {
    const newestClock = newest?.updatedAt ?? Number.NEGATIVE_INFINITY;
    const recordClock = record.updatedAt ?? Number.NEGATIVE_INFINITY;
    if (
      !newest ||
      recordClock > newestClock ||
      (recordClock === newestClock &&
        !isTombstone(newest) &&
        isTombstone(record))
    ) {
      newest = record;
    }
  }
  return newest;
}

/**
 * Collapse duplicate logical rows. A strictly newer clock wins; at an equal
 * clock a tombstone wins so duplicate ordering can never hide a deletion.
 */
export function canonicalizeLwwRecords<T extends { updatedAt?: number }>(
  records: readonly T[],
  keyOf: (record: T) => string,
  isTombstone: (record: T) => boolean = () => false,
): T[] {
  const canonical = new Map<string, T>();
  for (const record of records) {
    const key = keyOf(record);
    const existing = canonical.get(key);
    const existingClock = existing?.updatedAt ?? Number.NEGATIVE_INFINITY;
    const recordClock = record.updatedAt ?? Number.NEGATIVE_INFINITY;
    if (
      !existing ||
      recordClock > existingClock ||
      (recordClock === existingClock &&
        !isTombstone(existing) &&
        isTombstone(record))
    ) {
      canonical.set(key, record);
    }
  }
  return [...canonical.values()];
}

export type ChapterProgressHighWaterValues = {
  progress: number;
  total: number;
  completed: boolean;
  lastReadAt: number;
  chapterNumber?: number;
  volumeNumber?: number;
  chapterTitle?: string;
  updatedAt: number;
};

/**
 * Reading progress is a join-semilattice, not a strict LWW register. A device
 * with an older wall clock may still contribute a higher page/total/completed
 * value. Metadata remains LWW, while missing metadata can be backfilled by an
 * older event without rolling an existing value back.
 */
export function mergeChapterProgressHighWater(
  existing: ChapterProgressHighWaterValues | undefined,
  incoming: ChapterProgressHighWaterValues,
): ChapterProgressHighWaterValues {
  if (!existing) return incoming;
  const incomingOwnsMetadata = shouldApplyLww(
    existing.updatedAt,
    incoming.updatedAt,
  );
  const metadataValue = <T>(
    existingValue: T | undefined,
    incomingValue: T | undefined,
  ) => incomingOwnsMetadata
    ? (incomingValue ?? existingValue)
    : (existingValue ?? incomingValue);

  return {
    progress: Math.max(existing.progress, incoming.progress),
    total: Math.max(existing.total, incoming.total),
    completed: existing.completed || incoming.completed,
    lastReadAt: Math.max(existing.lastReadAt, incoming.lastReadAt),
    chapterNumber: metadataValue(existing.chapterNumber, incoming.chapterNumber),
    volumeNumber: metadataValue(existing.volumeNumber, incoming.volumeNumber),
    chapterTitle: metadataValue(existing.chapterTitle, incoming.chapterTitle),
    updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
  };
}

/** Deletes every row in `rows` except the chosen canonical one. */
export async function pruneDuplicateRows<Row extends { _id: unknown }>(
  db: { delete: (id: Row["_id"]) => Promise<unknown> },
  rows: Iterable<Row>,
  canonical: Row | null | undefined,
): Promise<void> {
  for (const row of rows) {
    if (canonical && row._id === canonical._id) continue;
    await db.delete(row._id);
  }
}
