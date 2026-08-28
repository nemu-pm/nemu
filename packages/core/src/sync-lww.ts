/**
 * Canonical last-write-wins primitives shared by the Convex backend and every
 * client runtime.
 *
 * `convex/lww.ts` re-exports this module (Convex's bundler follows relative
 * imports out of the functions directory), and the client-side merges in
 * `sync.ts` delegate to it. Keeping exactly one implementation is what stops
 * the two sides from settling into a permanent, invisible divergence.
 */

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

export type ChapterProgressHighWaterValues = {
  progress: number;
  total: number;
  completed: boolean;
  lastReadAt: number;
  chapterNumber?: number;
  volumeNumber?: number;
  chapterTitle?: string;
  intraPageProgress?: number;
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

const CHAPTER_PROGRESS_INTRA_PAGE_CONTENT_IDENTITY_PATTERN =
  /^mobile-image:reader-page-state-v1:[0-9a-f]{64}$/;

/** Keep the scroll fraction and its logical-page digest as one atomic value. */
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
  const incomingIntraPageState = chapterProgressIntraPageState(incoming);
  if (!existing) {
    return {
      progress: incoming.progress,
      total: incoming.total,
      completed: incoming.completed,
      lastReadAt: incoming.lastReadAt,
      chapterNumber: incoming.chapterNumber,
      volumeNumber: incoming.volumeNumber,
      chapterTitle: incoming.chapterTitle,
      ...(incomingIntraPageState ?? {}),
      updatedAt: incoming.updatedAt,
    };
  }
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
  const existingIntraPageState = chapterProgressIntraPageState(existing);
  const intraPageState = incomingOwnsMetadata
    ? (incomingIntraPageState ?? existingIntraPageState)
    : (existingIntraPageState ?? incomingIntraPageState);

  return {
    progress: Math.max(existing.progress, incoming.progress),
    total: Math.max(existing.total, incoming.total),
    completed: existing.completed || incoming.completed,
    lastReadAt: Math.max(existing.lastReadAt, incoming.lastReadAt),
    chapterNumber: metadataValue(existing.chapterNumber, incoming.chapterNumber),
    volumeNumber: metadataValue(existing.volumeNumber, incoming.volumeNumber),
    chapterTitle: metadataValue(existing.chapterTitle, incoming.chapterTitle),
    ...(intraPageState ?? {}),
    updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
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
