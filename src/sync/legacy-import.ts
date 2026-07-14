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
  makeChapterProgressId,
  makeSourceLinkId,
  mangaProgressFromChapterProgress,
} from "@nemu/core";

/**
 * A migration retry must reproduce the same LWW clock. Date.now() would turn a
 * partially imported prefix into a newer user edit on every retry, so derive a
 * stable post-legacy timestamp from the row itself instead.
 */
export function legacyImportTimestamp(observedAt: number): number {
  if (!Number.isFinite(observedAt)) return 1;
  const bounded = Math.min(
    Number.MAX_SAFE_INTEGER - 1,
    Math.max(0, Math.floor(observedAt)),
  );
  return bounded + 1;
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
  const links = legacy.sources.map((source) => ({
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
    createdAt: legacy.addedAt,
    updatedAt,
  } satisfies LocalSourceLink));

  const item: LocalLibraryItem = {
    libraryItemId,
    metadata: legacy.metadata,
    externalIds: legacy.externalIds,
    inLibrary: true,
    sourceOrder: links.map((link) => link.id),
    createdAt: legacy.addedAt,
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
    lastReadAt: legacy.dateRead,
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
