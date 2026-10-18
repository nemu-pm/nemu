/**
 * Canonical last-write-wins primitives shared by the Convex backend and every
 * client runtime.
 *
 * `convex/lww.ts` re-exports this module (Convex's bundler follows relative
 * imports out of the functions directory), and the client-side merges in
 * `sync.ts` delegate to it. Keeping exactly one implementation is what stops
 * the two sides from settling into a permanent, invisible divergence.
 */

import {
  estimatedSyncServerTime,
  isAcceptableSyncClock,
  normalizeSyncClock,
} from "./sync-clock";

/**
 * A missing clock only exists on records written before logical timestamps
 * were required. Any explicitly timestamped write may replace such a record.
 */
export function shouldApplyLww(
  existingUpdatedAt: number | undefined,
  incomingUpdatedAt: number,
): boolean {
  const now = estimatedSyncServerTime();
  if (!isAcceptableSyncClock(incomingUpdatedAt, now)) return false;
  return (
    existingUpdatedAt === undefined ||
    !isAcceptableSyncClock(existingUpdatedAt, now) ||
    existingUpdatedAt < incomingUpdatedAt
  );
}

export type ChapterProgressHighWaterValues = {
  progress: number;
  total: number;
  completed: boolean;
  lastReadAt: number;
  chapterNumber?: number;
  volumeNumber?: number;
  chapterTitle?: string;
  /** Normalized position inside a single logical long-strip page. */
  intraPageProgress?: number;
  /** Content-bound identity that makes `intraPageProgress` safe to restore. */
  intraPageContentIdentity?: string;
  /**
   * Sync clock of the newest Mark as Unread this record has seen. Reading
   * state recorded at or before it is discarded by the merge.
   */
  resetAt?: number;
  updatedAt: number;
};

export type ChapterProgressIntraPageState = {
  intraPageProgress: number;
  intraPageContentIdentity: string;
};

export const CHAPTER_PROGRESS_INTRA_PAGE_CONTENT_IDENTITY_PREFIX =
  "mobile-image:reader-page-state-v1:";

/** Backend capability version required before clients send the optional pair. */
export const CHAPTER_PROGRESS_INTRA_PAGE_SYNC_VERSION = 1;

/** Backend capability version required before clients send `resetAt`. */
export const CHAPTER_PROGRESS_RESET_SYNC_VERSION = 2;

/**
 * The chapter-progress protocol version the backend advertises (in the
 * `chapterProgressIntraPageVersion` field, which older clients already read
 * as ">= 1 means the reader position is accepted").
 */
export const CHAPTER_PROGRESS_SYNC_VERSION = CHAPTER_PROGRESS_RESET_SYNC_VERSION;

/**
 * Treat capability metadata as an untrusted protocol value. Older backends
 * omit it entirely, and malformed/fractional versions must not opt a client
 * into sending fields that the deployed mutation validator may not accept.
 */
export function supportsChapterProgressIntraPageSync(
  version: unknown,
): boolean {
  return (
    typeof version === "number" &&
    Number.isSafeInteger(version) &&
    version >= CHAPTER_PROGRESS_INTRA_PAGE_SYNC_VERSION
  );
}

/** Same contract as `supportsChapterProgressIntraPageSync`, for `resetAt`. */
export function supportsChapterProgressResetSync(version: unknown): boolean {
  return (
    typeof version === "number" &&
    Number.isSafeInteger(version) &&
    version >= CHAPTER_PROGRESS_RESET_SYNC_VERSION
  );
}

const CHAPTER_PROGRESS_INTRA_PAGE_CONTENT_IDENTITY_PATTERN =
  /^mobile-image:reader-page-state-v1:[0-9a-f]{64}$/;

/**
 * Return the reader's content-bound sub-page position only when the pair is
 * canonical. The values must never be consumed independently: a percentage
 * without the matching content digest could restore into a changed page.
 */
export function chapterProgressIntraPageState(
  record: Pick<
    ChapterProgressHighWaterValues,
    "intraPageProgress" | "intraPageContentIdentity"
  >,
): ChapterProgressIntraPageState | undefined {
  if (
    typeof record.intraPageProgress !== "number" ||
    !Number.isFinite(record.intraPageProgress) ||
    record.intraPageProgress < 0 ||
    record.intraPageProgress > 1 ||
    typeof record.intraPageContentIdentity !== "string" ||
    !CHAPTER_PROGRESS_INTRA_PAGE_CONTENT_IDENTITY_PATTERN.test(
      record.intraPageContentIdentity,
    )
  ) {
    return undefined;
  }
  return {
    intraPageProgress: record.intraPageProgress,
    intraPageContentIdentity: record.intraPageContentIdentity,
  };
}

type ChapterProgressResetClockFields = Pick<
  ChapterProgressHighWaterValues,
  "resetAt" | "updatedAt"
>;

/** The record's reset clock when it is a valid sync clock, else none. */
export function chapterProgressResetClock(
  record: Pick<ChapterProgressHighWaterValues, "resetAt">,
  now = estimatedSyncServerTime(),
): number | undefined {
  return typeof record.resetAt === "number" &&
    isAcceptableSyncClock(record.resetAt, now)
    ? record.resetAt
    : undefined;
}

/**
 * Whether a record holds any reading at all: a page, a finish or a read
 * event. A chapter marked unread (and not opened since) holds none, so it is
 * never a work's "last read" chapter.
 */
export function chapterProgressHasReading(
  record: Pick<
    ChapterProgressHighWaterValues,
    "progress" | "completed" | "lastReadAt"
  >,
): boolean {
  return record.completed || record.progress > 0 || record.lastReadAt > 0;
}

/**
 * Reading progress is a join-semilattice, not a strict LWW register. A device
 * with an older wall clock may still contribute a higher page/total/completed
 * value. Metadata remains LWW, while missing metadata can be backfilled by an
 * older event without rolling an existing value back.
 *
 * `existing` is the authoritative stored side and `incoming` the arriving
 * write, so a strictly newer `incoming` takes metadata ownership and an equal
 * clock leaves `existing` in charge. Callers must map their roles onto that
 * contract — on the client the *cloud* row is `existing`, because the server
 * is the tie-breaking authority for both sides.
 *
 * Mark as Unread is a reset clock (`resetAt`) rather than a value: the newer
 * clock of the two wins, and a side's reading state (progress, total,
 * completed, lastReadAt and the intra-page position) only counts when that
 * side carries the winning reset itself or was written after it
 * (`updatedAt > resetAt`). Reading recorded before the reset is discarded;
 * reading after it merges by high-water mark as before. Records without the
 * field (older clients, older rows) merge exactly as they always have. Chapter
 * metadata is not reading state and keeps its LWW backfill on both sides.
 */
export function mergeChapterProgressHighWater(
  existing: ChapterProgressHighWaterValues | undefined,
  incoming: ChapterProgressHighWaterValues,
): ChapterProgressHighWaterValues {
  const now = estimatedSyncServerTime();
  const incomingResetAt = chapterProgressResetClock(incoming, now);
  const normalizedIncoming = {
    ...incoming,
    lastReadAt: normalizeSyncClock(incoming.lastReadAt, now),
    // A reset is never newer than the record that carries it.
    updatedAt: Math.max(
      normalizeSyncClock(incoming.updatedAt, now),
      incomingResetAt ?? 0,
    ),
  };
  if (!existing) {
    const intraPageState = chapterProgressIntraPageState(normalizedIncoming);
    return {
      progress: normalizedIncoming.progress,
      total: normalizedIncoming.total,
      completed: normalizedIncoming.completed,
      lastReadAt: normalizedIncoming.lastReadAt,
      chapterNumber: normalizedIncoming.chapterNumber,
      volumeNumber: normalizedIncoming.volumeNumber,
      chapterTitle: normalizedIncoming.chapterTitle,
      ...(intraPageState ?? {}),
      ...(incomingResetAt === undefined ? {} : { resetAt: incomingResetAt }),
      updatedAt: normalizedIncoming.updatedAt,
    };
  }
  const existingResetAt = chapterProgressResetClock(existing, now);
  const normalizedExisting = {
    ...existing,
    lastReadAt: normalizeSyncClock(existing.lastReadAt, now),
    updatedAt: Math.max(
      normalizeSyncClock(existing.updatedAt, now),
      existingResetAt ?? 0,
    ),
  };
  const resetAt =
    existingResetAt === undefined
      ? incomingResetAt
      : incomingResetAt === undefined
        ? existingResetAt
        : Math.max(existingResetAt, incomingResetAt);
  const counts = (sideResetAt: number | undefined, updatedAt: number) =>
    resetAt === undefined || sideResetAt === resetAt || updatedAt > resetAt;
  const existingCounts = counts(existingResetAt, normalizedExisting.updatedAt);
  const incomingCounts = counts(incomingResetAt, normalizedIncoming.updatedAt);
  const reading = [
    ...(existingCounts ? [normalizedExisting] : []),
    ...(incomingCounts ? [normalizedIncoming] : []),
  ];
  const highest = (value: (side: ChapterProgressHighWaterValues) => number) =>
    reading.reduce((maximum, side) => Math.max(maximum, value(side)), 0);

  const incomingOwnsMetadata = shouldApplyLww(
    normalizedExisting.updatedAt,
    normalizedIncoming.updatedAt,
  );
  const metadataValue = <T>(
    existingValue: T | undefined,
    incomingValue: T | undefined,
  ) =>
    incomingOwnsMetadata
      ? (incomingValue ?? existingValue)
      : (existingValue ?? incomingValue);
  const existingIntraPageState = existingCounts
    ? chapterProgressIntraPageState(normalizedExisting)
    : undefined;
  const incomingIntraPageState = incomingCounts
    ? chapterProgressIntraPageState(normalizedIncoming)
    : undefined;
  const intraPageState = incomingOwnsMetadata
    ? (incomingIntraPageState ?? existingIntraPageState)
    : (existingIntraPageState ?? incomingIntraPageState);

  return {
    progress: highest((side) => side.progress),
    total: highest((side) => side.total),
    completed: reading.some((side) => side.completed),
    lastReadAt: highest((side) => side.lastReadAt),
    chapterNumber: metadataValue(
      normalizedExisting.chapterNumber,
      normalizedIncoming.chapterNumber,
    ),
    volumeNumber: metadataValue(
      normalizedExisting.volumeNumber,
      normalizedIncoming.volumeNumber,
    ),
    chapterTitle: metadataValue(
      normalizedExisting.chapterTitle,
      normalizedIncoming.chapterTitle,
    ),
    ...(intraPageState ?? {}),
    ...(resetAt === undefined ? {} : { resetAt }),
    updatedAt: Math.max(
      normalizedExisting.updatedAt,
      normalizedIncoming.updatedAt,
    ),
  };
}

/**
 * Whether the arriving side's reading state survives a merge with the stored
 * side, i.e. whether it was not recorded before a newer reset. The server
 * feeds only such arrivals into the work's read-event summary.
 */
export function chapterProgressReadingSurvivesMerge(
  existing: ChapterProgressResetClockFields | undefined,
  incoming: ChapterProgressResetClockFields,
): boolean {
  const now = estimatedSyncServerTime();
  const incomingResetAt = chapterProgressResetClock(incoming, now);
  const existingResetAt = existing
    ? chapterProgressResetClock(existing, now)
    : undefined;
  if (existingResetAt === undefined) return true;
  if (incomingResetAt !== undefined && incomingResetAt >= existingResetAt) {
    return true;
  }
  return normalizeSyncClock(incoming.updatedAt, now) > existingResetAt;
}

/** Project any chapter-progress-shaped record onto the merge's value fields. */
export function chapterProgressHighWaterValues(
  record: ChapterProgressHighWaterValues,
): ChapterProgressHighWaterValues {
  const intraPageState = chapterProgressIntraPageState(record);
  return {
    progress: record.progress,
    total: record.total,
    completed: record.completed,
    lastReadAt: record.lastReadAt,
    chapterNumber: record.chapterNumber,
    volumeNumber: record.volumeNumber,
    chapterTitle: record.chapterTitle,
    ...(intraPageState ?? {}),
    ...(record.resetAt === undefined ? {} : { resetAt: record.resetAt }),
    updatedAt: record.updatedAt,
  };
}
