import type {
  LibraryEntry,
  LocalLibraryItem,
  LocalSourceLink,
  MangaMetadata,
} from "@/data/schema";
import type { MobileSourceDetailsRefresh } from "@/sources/mobileSourceDetails";

export type AppliedMobileSourceDetails = {
  item: LocalLibraryItem;
  sourceLink: LocalSourceLink;
};

export function mergeDefinedMangaMetadata(
  existing: MangaMetadata,
  refreshed: MangaMetadata
): MangaMetadata {
  return {
    title: refreshed.title || existing.title,
    cover: refreshed.cover ?? existing.cover,
    authors: refreshed.authors ?? existing.authors,
    description: refreshed.description ?? existing.description,
    tags: refreshed.tags ?? existing.tags,
    status: refreshed.status ?? existing.status,
    url: refreshed.url ?? existing.url,
  };
}

export function makeChapterSortKey(chapter: { id: string; chapterNumber?: number }): string {
  return String(chapter.chapterNumber ?? chapter.id);
}

export function applyMobileSourceDetailsRefresh(
  entry: LibraryEntry,
  sourceLink: LocalSourceLink,
  refresh: Extract<MobileSourceDetailsRefresh, { status: "ready" }>
): AppliedMobileSourceDetails {
  const latestChapter = refresh.latestChapter;
  const latestChapterSortKey = latestChapter ? makeChapterSortKey(latestChapter) : undefined;
  const item: LocalLibraryItem = {
    ...entry.item,
    metadata: mergeDefinedMangaMetadata(entry.item.metadata, refresh.metadata),
    updatedAt: refresh.fetchedAt,
  };
  const updatedSourceLink: LocalSourceLink = {
    ...sourceLink,
    ...(latestChapter
      ? {
          latestChapter,
          latestChapterSortKey,
          updateAckChapter: latestChapter,
          updateAckChapterSortKey: latestChapterSortKey,
          updateAckAt: refresh.fetchedAt,
        }
      : {}),
    latestFetchedAt: refresh.fetchedAt,
    updatedAt: refresh.fetchedAt,
  };

  return { item, sourceLink: updatedSourceLink };
}
