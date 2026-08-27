/**
 * The chapter-progress merge and the base LWW comparison are defined once in
 * `@nemu/core` and re-exported here so the backend and every client runtime
 * cannot drift apart. Convex's bundler follows relative imports out of the
 * functions directory, so this stays a single implementation at deploy time
 * rather than a copy kept in sync by hand.
 */
export {
  chapterProgressHighWaterValues,
  mergeChapterProgressHighWater,
  shouldApplyLww,
  type ChapterProgressHighWaterValues,
} from "../packages/core/src/sync-lww";

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
