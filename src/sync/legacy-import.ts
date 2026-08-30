import type {
  ChapterSummary,
  ExternalIds,
  LocalChapterProgress,
  LocalLibraryItem,
  LocalMangaProgress,
  LocalSourceLink,
  MangaMetadata,
} from "@/data/schema";
import {
  boundedLegacySyncTimestamp,
  makeChapterProgressId,
  makeSourceLinkId,
  mangaProgressFromChapterProgress,
} from "@nemu/core";

/**
 * Normal migration retries reproduce the same LWW clock from the legacy row.
 * Corrupt/future values receive the oldest valid clock so imports cannot race
 * the server at a client-derived future ceiling. Only that repair case
 * consults the current time.
 */
export function legacyImportTimestamp(
  observedAt: number,
  now = Date.now(),
): number {
  return boundedLegacySyncTimestamp(observedAt, now);
}

/** Keep legacy event/creation clocks integer and no newer than their LWW row. */
function legacyImportEventTimestamp(
  observedAt: number,
  updatedAt: number,
): number {
  const maximum = Math.max(0, Math.floor(updatedAt) - 1);
  if (!Number.isFinite(observedAt)) return 0;
  return Math.min(maximum, Math.max(0, Math.floor(observedAt)));
}

export type LegacyLibraryImportInput = {
  /** Stable key from the legacy IndexedDB row. Reuse it so retries are idempotent. */
  id: string;
  addedAt: number;
  metadata: MangaMetadata;
  overrides?: Partial<MangaMetadata>;
  coverCustom?: string;
  externalIds?: ExternalIds;
  sources: Array<{
    registryId: string;
    sourceId: string;
    mangaId: string;
    latestChapter?: ChapterSummary;
    updateAcknowledged?: ChapterSummary;
  }>;
};

export type LegacyHistoryImportInput = {
  registryId: string;
  sourceId: string;
  mangaId: string;
  chapterId: string;
  progress: number;
  total: number;
  completed: boolean;
  dateRead: number;
  chapterNumber?: number;
  volumeNumber?: number;
  chapterTitle?: string;
};

export function convertLegacyLibraryEntry(
  legacy: LegacyLibraryImportInput,
  libraryItemId = legacy.id,
  updatedAt = legacyImportTimestamp(legacy.addedAt),
): { item: LocalLibraryItem; links: LocalSourceLink[] } {
  const createdAt = legacyImportEventTimestamp(legacy.addedAt, updatedAt);
  const links = legacy.sources.map(
    (source) =>
      ({
        id: makeSourceLinkId(
          source.registryId,
          source.sourceId,
          source.mangaId,
        ),
        libraryItemId,
        registryId: source.registryId,
        sourceId: source.sourceId,
        sourceMangaId: source.mangaId,
        latestChapter: source.latestChapter,
        updateAckChapter: source.updateAcknowledged,
        createdAt,
        updatedAt,
      }) satisfies LocalSourceLink,
  );

  const item: LocalLibraryItem = {
    libraryItemId,
    metadata: legacy.metadata,
    externalIds: legacy.externalIds,
    inLibrary: true,
    sourceOrder: links.map((link) => link.id),
    createdAt,
    updatedAt,
  };
  if (legacy.overrides || legacy.coverCustom) {
    item.overrides = {
      ...(legacy.overrides ? { metadata: legacy.overrides } : {}),
      ...(legacy.coverCustom ? { coverUrl: legacy.coverCustom } : {}),
    };
  }

  return { item, links };
}

export function convertLegacyHistoryEntry(
  legacy: LegacyHistoryImportInput,
  libraryItemId?: string,
  updatedAt = legacyImportTimestamp(legacy.dateRead),
): LocalChapterProgress {
  const lastReadAt = legacyImportEventTimestamp(legacy.dateRead, updatedAt);
  return {
    id: makeChapterProgressId(
      legacy.registryId,
      legacy.sourceId,
      legacy.mangaId,
      legacy.chapterId,
    ),
    registryId: legacy.registryId,
    sourceId: legacy.sourceId,
    sourceMangaId: legacy.mangaId,
    sourceChapterId: legacy.chapterId,
    libraryItemId,
    progress: legacy.progress,
    total: legacy.total,
    completed: legacy.completed,
    lastReadAt,
    chapterNumber: legacy.chapterNumber,
    volumeNumber: legacy.volumeNumber,
    chapterTitle: legacy.chapterTitle,
    updatedAt,
  };
}

export function deriveLegacyMangaProgress(
  chapters: readonly LocalChapterProgress[],
): LocalMangaProgress[] {
  const byManga = new Map<
    string,
    { latest: LocalChapterProgress; updatedAt: number }
  >();
  for (const chapter of chapters) {
    const key = makeSourceLinkId(
      chapter.registryId,
      chapter.sourceId,
      chapter.sourceMangaId,
    );
    const current = byManga.get(key);
    if (
      !current ||
      chapter.lastReadAt > current.latest.lastReadAt ||
      (chapter.lastReadAt === current.latest.lastReadAt &&
        chapter.updatedAt > current.latest.updatedAt)
    ) {
      byManga.set(key, {
        latest: chapter,
        updatedAt: Math.max(current?.updatedAt ?? 0, chapter.updatedAt),
      });
    } else if (chapter.updatedAt > current.updatedAt) {
      current.updatedAt = chapter.updatedAt;
    }
  }

  return [...byManga.values()].map(({ latest, updatedAt }) => ({
    ...mangaProgressFromChapterProgress(latest),
    updatedAt,
  }));
}
