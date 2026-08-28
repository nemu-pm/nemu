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
 */
export function mergeChapterProgressHighWater(
  existing: ChapterProgressHighWaterValues | undefined,
  incoming: ChapterProgressHighWaterValues,
): ChapterProgressHighWaterValues {
  const now = estimatedSyncServerTime();
  const normalizedIncoming = {
    ...incoming,
    lastReadAt: normalizeSyncClock(incoming.lastReadAt, now),
    updatedAt: normalizeSyncClock(incoming.updatedAt, now),
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
      updatedAt: normalizedIncoming.updatedAt,
    };
  }
  const normalizedExisting = {
    ...existing,
    lastReadAt: normalizeSyncClock(existing.lastReadAt, now),
    updatedAt: normalizeSyncClock(existing.updatedAt, now),
  };
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
  const existingIntraPageState =
    chapterProgressIntraPageState(normalizedExisting);
  const incomingIntraPageState =
    chapterProgressIntraPageState(normalizedIncoming);
  const intraPageState = incomingOwnsMetadata
    ? (incomingIntraPageState ?? existingIntraPageState)
    : (existingIntraPageState ?? incomingIntraPageState);

  return {
    progress: Math.max(
      normalizedExisting.progress,
      normalizedIncoming.progress,
    ),
    total: Math.max(normalizedExisting.total, normalizedIncoming.total),
    completed: normalizedExisting.completed || normalizedIncoming.completed,
    lastReadAt: Math.max(
      normalizedExisting.lastReadAt,
      normalizedIncoming.lastReadAt,
    ),
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
    updatedAt: Math.max(
      normalizedExisting.updatedAt,
      normalizedIncoming.updatedAt,
    ),
  };
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
    updatedAt: record.updatedAt,
  };
}
