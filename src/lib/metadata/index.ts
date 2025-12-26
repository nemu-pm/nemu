/**
 * Metadata fetching service
 *
 * Fallback chain: MangaUpdates → AniList → MAL → (AI optional)
 */

export * from "./types";
export * from "./matching";

export { searchMangaUpdates, searchMangaUpdatesRaw } from "./providers/mangaupdates";
export { searchAniList, searchAniListRaw } from "./providers/anilist";
export { searchJikan, searchJikanRaw } from "./providers/jikan";

import type { MangaMetadata, ExternalIds } from "@/data/schema";
import type { MetadataSearchResult, MetadataFetchResult, MetadataSearchOptions } from "./types";
import { searchMangaUpdates } from "./providers/mangaupdates";
import { searchAniList } from "./providers/anilist";
import { searchJikan } from "./providers/jikan";

/**
 * Search for metadata using the fallback chain
 * MangaUpdates → AniList → MAL
 *
 * @param title - The manga title to search for
 * @param options - Search options
 * @returns Metadata result or null if not found
 */
export async function searchMetadata(
  title: string,
  options: MetadataSearchOptions = {}
): Promise<MetadataFetchResult | null> {
  const { provider } = options;

  // If specific provider requested, only use that one
  if (provider) {
    let result: MetadataSearchResult | null = null;

    switch (provider) {
      case "mangaupdates":
        result = await searchMangaUpdates(title);
        break;
      case "anilist":
        result = await searchAniList(title);
        break;
      case "mal":
        result = await searchJikan(title);
        break;
    }

    if (result) {
      return {
        metadata: result.metadata,
        externalIds: buildExternalIds(result),
        source: result.source,
      };
    }
    return null;
  }

  // Fallback chain: MU → AL → MAL
  // Try MangaUpdates first (best CJK coverage)
  const muResult = await searchMangaUpdates(title);
  if (muResult) {
    return {
      metadata: muResult.metadata,
      externalIds: buildExternalIds(muResult),
      source: "mangaupdates",
    };
  }

  // Try AniList
  const alResult = await searchAniList(title);
  if (alResult) {
    return {
      metadata: alResult.metadata,
      externalIds: buildExternalIds(alResult),
      source: "anilist",
    };
  }

  // Try Jikan (MAL)
  const malResult = await searchJikan(title);
  if (malResult) {
    return {
      metadata: malResult.metadata,
      externalIds: buildExternalIds(malResult),
      source: "mal",
    };
  }

  return null;
}

/**
 * Build external IDs object from search result
 */
function buildExternalIds(result: MetadataSearchResult): ExternalIds {
  const ids: ExternalIds = {};

  switch (result.source) {
    case "mangaupdates":
      ids.mangaUpdates = result.externalId;
      break;
    case "anilist":
      ids.aniList = result.externalId;
      break;
    case "mal":
      ids.mal = result.externalId;
      break;
  }

  return ids;
}

/**
 * Create metadata from source manga data
 */
export function metadataFromSource(manga: {
  title: string;
  cover?: string;
  authors?: string[];
  artists?: string[];
  description?: string;
  tags?: string[];
  status?: number;
  url?: string;
}): MangaMetadata {
  return {
    title: manga.title,
    cover: manga.cover,
    authors: manga.authors,
    artists: manga.artists,
    description: manga.description,
    tags: manga.tags,
    status: manga.status,
    url: manga.url,
  };
}

