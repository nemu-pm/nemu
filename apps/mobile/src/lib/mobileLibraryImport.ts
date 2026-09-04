import type {
  ChapterSummary,
  LibraryEntry,
  LocalLibraryItem,
  LocalSourceLink,
  MangaMetadata,
} from "@/data/schema";
import { makeSourceLinkId } from "@/data/schema";
import { makeSourceKey } from "@/sources/aidokuRegistry";
import type { SearchSourceDisplay } from "./mobileSearch";
import type { MobileSourceDetailsRefresh } from "@/sources/mobileSourceDetails";
import type { MobileLiveSearchManga } from "@/sources/mobileSourceSearch";
import { makeChapterSortKey } from "./mobileLibraryDetails";

export type LiveSearchLibraryImport = {
  item: LocalLibraryItem;
  sourceLink: LocalSourceLink;
};

/**
 * The minimal detail-refresh fields a library import needs. A live source
 * refresh satisfies this structurally; so does a cached detail snapshot that
 * no longer has a source runtime attached.
 */
export type MobileSourceDetailsSnapshot = {
  metadata: MangaMetadata;
  latestChapter?: ChapterSummary;
  fetchedAt?: number;
};

export function makeLiveSearchSourceLinkId(
  source: SearchSourceDisplay,
  manga: MobileLiveSearchManga
): string {
  return makeSourceLinkId(source.registryId, source.rawSourceId, manga.id);
}

export function makeLiveSearchLibraryItemId(
  source: SearchSourceDisplay,
  manga: MobileLiveSearchManga
): string {
  return `source:${makeLiveSearchSourceLinkId(source, manga)}`;
}

function liveSearchMetadata(manga: MobileLiveSearchManga): MangaMetadata {
  return {
    title: manga.title || manga.id,
    cover: manga.cover,
    authors: manga.authors,
    description: manga.description,
    tags: manga.tags,
    status: manga.status,
    url: manga.url,
  };
}

function makeSourceLibraryImport(
  source: SearchSourceDisplay,
  mangaId: string,
  metadata: MangaMetadata,
  now: number,
  refresh?: MobileSourceDetailsSnapshot
): LiveSearchLibraryImport {
  const sourceLinkId = makeSourceLinkId(source.registryId, source.rawSourceId, mangaId);
  const libraryItemId = `source:${sourceLinkId}`;
  const updatedAt = refresh?.fetchedAt ?? now;
  const latestChapter = refresh?.latestChapter;
  const latestChapterSortKey = latestChapter ? makeChapterSortKey(latestChapter) : undefined;

  return {
    item: {
      libraryItemId,
      metadata,
      inLibrary: true,
      sourceOrder: [sourceLinkId],
      createdAt: now,
      updatedAt,
    },
    sourceLink: {
      id: sourceLinkId,
      libraryItemId,
      registryId: source.registryId,
      sourceId: source.rawSourceId,
      sourceMangaId: mangaId,
      latestChapter,
      latestChapterSortKey,
      latestFetchedAt: refresh?.fetchedAt,
      updateAckChapter: latestChapter,
      updateAckChapterSortKey: latestChapterSortKey,
      updateAckAt: refresh?.fetchedAt,
      createdAt: now,
      updatedAt,
    },
  };
}

export function makeLiveSearchLibraryImport(
  source: SearchSourceDisplay,
  manga: MobileLiveSearchManga,
  now = Date.now(),
  refresh?: Extract<MobileSourceDetailsRefresh, { status: "ready" }>
): LiveSearchLibraryImport {
  return makeSourceLibraryImport(
    source,
    manga.id,
    refresh?.metadata ?? liveSearchMetadata(manga),
    now,
    refresh
  );
}

export function makeSourceDetailsLibraryImport(
  source: SearchSourceDisplay,
  mangaId: string,
  refresh: Extract<MobileSourceDetailsRefresh, { status: "ready" }>,
  now = Date.now()
): LiveSearchLibraryImport {
  return makeSourceLibraryImport(source, mangaId, refresh.metadata, now, refresh);
}

export function makeSourceDetailsSnapshotLibraryImport(
  source: SearchSourceDisplay,
  mangaId: string,
  snapshot: MobileSourceDetailsSnapshot,
  now = Date.now()
): LiveSearchLibraryImport {
  return makeSourceLibraryImport(source, mangaId, snapshot.metadata, now, snapshot);
}

export function findLibraryEntryForLiveSearchResult(
  entries: LibraryEntry[],
  source: SearchSourceDisplay,
  manga: MobileLiveSearchManga
): LibraryEntry | null {
  const sourceKeys = new Set(
    source.sourceKeys ?? [makeSourceKey(source.registryId, source.rawSourceId)],
  );
  return (
    entries.find((entry) =>
      entry.sources.some(
        (link) =>
          link.sourceMangaId === manga.id &&
          sourceKeys.has(makeSourceKey(link.registryId, link.sourceId)),
      ),
    ) ?? null
  );
}
