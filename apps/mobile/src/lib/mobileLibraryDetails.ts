import type {
  LibraryEntry,
  LocalLibraryItem,
  LocalSourceLink,
  MangaMetadata,
} from "@/data/schema";
import {
  resolveMobileSourceMangaMetadataTitle,
  type MobileSourceDetailsRefresh,
} from "@/sources/mobileSourceDetails";
import { isMobileUsableCoverUrl } from "./mobileCoverPlaceholder";
import { sortMobileSourceLinks } from "./mobileSourceLinks";

export type AppliedMobileSourceDetails = {
  item: LocalLibraryItem;
  sourceLink: LocalSourceLink;
};

export function mergeDefinedMangaMetadata(
  existing: MangaMetadata,
  refreshed: MangaMetadata,
): MangaMetadata {
  return {
    title: refreshed.title || existing.title,
    // Some source detail endpoints omit their listing cover or return an
    // empty string. Do not replace a cover that was already resolved from the
    // source listing/library with an unusable value after details finish.
    cover: refreshed.cover?.trim() ? refreshed.cover : existing.cover,
    authors: refreshed.authors ?? existing.authors,
    description: refreshed.description ?? existing.description,
    tags: refreshed.tags ?? existing.tags,
    status: refreshed.status ?? existing.status,
    url: refreshed.url ?? existing.url,
  };
}

/**
 * Listing/search results resolve `modifyImageRequest` before they ever reach a
 * card, so the seed handed to the detail screen carries both the rewritten
 * cover URL and the headers that URL needs. `MangaMetadata` has no room for
 * headers, so they are re-attached here: they stay valid for exactly as long
 * as the merged cover is still the seed's cover — the same URL must not be
 * painted headerless on one frame and with headers on the next, because
 * `MobileCachedImage` treats those as two different images.
 */
export function resolveMobileSeedCoverHeaders({
  cover,
  seedCover,
  seedCoverHeaders,
}: {
  cover?: string | null;
  seedCover?: string | null;
  seedCoverHeaders?: Record<string, string> | null;
}): Record<string, string> | undefined {
  if (!cover || !seedCover || cover !== seedCover) return undefined;
  if (!seedCoverHeaders || Object.keys(seedCoverHeaders).length === 0) {
    return undefined;
  }
  return seedCoverHeaders;
}

export function makeChapterSortKey(chapter: {
  id: string;
  chapterNumber?: number;
}): string {
  return String(chapter.chapterNumber ?? chapter.id);
}

/**
 * Whether `sourceLink` is the entry's primary source (first in the user's
 * source order). Only the primary source may rewrite the library title's own
 * metadata; every other linked source can merely fill fields that are still
 * missing. Otherwise refreshing whichever tab is selected flips the library
 * title, description and cover between sources (MangaDex's English title and
 * cover replacing Manhuagui's, then back on the next switch).
 */
export function isMobilePrimarySourceLink(
  entry: LibraryEntry,
  sourceLink: Pick<LocalSourceLink, "id">,
): boolean {
  const active = entry.sources.filter((source) => source.removed !== true);
  if (active.length === 0) return true;
  return (
    sortMobileSourceLinks(active, entry.item.sourceOrder)[0]?.id ===
    sourceLink.id
  );
}

function fillMissingMangaMetadata(
  existing: MangaMetadata,
  refreshed: MangaMetadata,
): MangaMetadata {
  const merged: MangaMetadata = {
    ...existing,
    title: existing.title || refreshed.title,
  };
  if (!existing.authors?.length && refreshed.authors?.length) {
    merged.authors = refreshed.authors;
  }
  if (!existing.description?.trim() && refreshed.description?.trim()) {
    merged.description = refreshed.description;
  }
  if (!existing.tags?.length && refreshed.tags?.length) {
    merged.tags = refreshed.tags;
  }
  if (existing.status === undefined && refreshed.status !== undefined) {
    merged.status = refreshed.status;
  }
  if (!existing.url && refreshed.url) merged.url = refreshed.url;
  return merged;
}

/**
 * Library-cover rule: a placeholder is never stored; the primary source may
 * replace the stored cover with a usable one; any other source only fills a
 * missing (or placeholder) cover.
 */
export function resolveMobileLibraryCoverAfterRefresh({
  existing,
  refreshed,
  primary,
}: {
  existing?: string;
  refreshed?: string;
  primary: boolean;
}): string | undefined {
  const refreshedUsable =
    refreshed && isMobileUsableCoverUrl(refreshed) ? refreshed : undefined;
  const existingUsable =
    existing && isMobileUsableCoverUrl(existing) ? existing : undefined;
  if (primary) return refreshedUsable ?? existingUsable;
  return existingUsable ?? refreshedUsable;
}

function stableMetadataSignature(metadata: MangaMetadata): string {
  const record = metadata as Record<string, unknown>;
  return JSON.stringify(
    Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => [key, record[key]]),
  );
}

function sameMangaMetadata(left: MangaMetadata, right: MangaMetadata): boolean {
  return stableMetadataSignature(left) === stableMetadataSignature(right);
}

export function applyMobileSourceDetailsRefresh(
  entry: LibraryEntry,
  sourceLink: LocalSourceLink,
  refresh: Extract<MobileSourceDetailsRefresh, { status: "ready" }>,
): AppliedMobileSourceDetails {
  const latestChapter = refresh.latestChapter;
  const latestChapterSortKey = latestChapter
    ? makeChapterSortKey(latestChapter)
    : undefined;
  const refreshedMetadata = {
    ...refresh.metadata,
    title: resolveMobileSourceMangaMetadataTitle(
      refresh.metadata.title,
      sourceLink.sourceMangaId,
      entry.item.metadata.title,
    ),
  };
  const primary = isMobilePrimarySourceLink(entry, sourceLink);
  const mergedMetadata = primary
    ? mergeDefinedMangaMetadata(entry.item.metadata, refreshedMetadata)
    : fillMissingMangaMetadata(entry.item.metadata, refreshedMetadata);
  const cover = resolveMobileLibraryCoverAfterRefresh({
    existing: entry.item.metadata.cover,
    refreshed: refresh.metadata.cover,
    primary,
  });
  if (cover) mergedMetadata.cover = cover;
  else delete mergedMetadata.cover;
  // An unchanged library row keeps its identity (and `updatedAt`), so callers
  // skip the write and no sync round-trip is generated for a no-op refresh.
  const item: LocalLibraryItem = sameMangaMetadata(
    mergedMetadata,
    entry.item.metadata,
  )
    ? entry.item
    : {
        ...entry.item,
        metadata: mergedMetadata,
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
