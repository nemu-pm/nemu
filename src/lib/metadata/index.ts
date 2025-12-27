/**
 * Metadata fetching service
 *
 * Smart Match: Parallel search + AI fallback + per-field merge
 */

import type { MangaMetadata } from "@/data/schema";

// Types
export type { Provider, ProviderSearchResult, MetadataSearchResult, SmartMatchPhase, SelectionProvider, LocalizationData } from "./types";
export { SELECTION_NO_CHANGE, SELECTION_AI } from "./types";

// Matching utilities
export {
  normalize,
  hasExactMatch,
  findMatchingTitle,
  getMUCandidates,
  getALCandidates,
  getMALCandidates,
} from "./matching";

// Providers
export {
  searchMangaUpdatesRaw,
  type MUSeriesDetail,
} from "./providers/mangaupdates";
export {
  searchAniListRaw,
  mapAniListToMetadata,
  type ALMedia,
} from "./providers/anilist";
export {
  searchJikanRaw,
  mapJikanToMetadata,
  type JikanManga,
} from "./providers/jikan";

// Smart Match Store
export {
  useSmartMatchStore,
  searchAllProviders,
  searchProviders,
  findExactMatches,
  type SmartMatchStore,
  type MetadataField,
  type FieldOption,
  type FieldSelection,
  type ExactMatch,
  type AIField,
  type AIFieldData,
} from "./store";

// Localization
export {
  isTextInLanguage,
  areAuthorsInLanguage,
  fetchChineseTitleFromGemini,
  fetchLocalizedDescription,
  getAITabsNeeded,
  type EffectiveLanguage,
  type GeminiFunctions,
  type AITabsNeeded,
} from "./localize";

/** Create metadata from source manga data */
export function metadataFromSource(manga: {
  title: string;
  cover?: string;
  authors?: string[];
  description?: string;
  tags?: string[];
  status?: number;
  url?: string;
}): MangaMetadata {
  return {
    title: manga.title,
    cover: manga.cover,
    authors: manga.authors,
    description: manga.description,
    tags: manga.tags,
    status: manga.status,
    url: manga.url,
  };
}
