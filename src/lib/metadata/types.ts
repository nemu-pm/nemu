/**
 * Types for metadata fetching and smart match
 */

import type { MangaMetadata } from "@/data/schema";

/** Supported metadata providers */
export type Provider = "mangaupdates" | "anilist" | "mal";

/** Special selection values for merge UI */
export const SELECTION_NO_CHANGE = "__no_change__" as const;
export const SELECTION_AI = "__ai__" as const;

/** Selection value type - provider or special value */
export type SelectionProvider = Provider | typeof SELECTION_NO_CHANGE | typeof SELECTION_AI;

/** Raw localization data preserved from provider responses */
export interface LocalizationData {
  /** AniList title object */
  alTitle?: { romaji?: string; english?: string; native?: string };
  /** AniList synonyms */
  alSynonyms?: string[];
  /** AniList staff with native names */
  alStaff?: Array<{ role: string; native?: string }>;
  /** MAL title_japanese */
  malTitleJapanese?: string;
  /** MAL title_english */
  malTitleEnglish?: string;
  /** MAL title_synonyms */
  malTitleSynonyms?: string[];
  /** MU associated titles */
  muAssociated?: Array<{ title: string }>;
}

/** Raw search result from a provider */
export interface ProviderSearchResult {
  provider: Provider;
  externalId: number;
  title: string;
  alternativeTitles: string[];
  metadata: MangaMetadata;
  coverUrl?: string;
  sourceUrl?: string;
  /** Raw localization data for non-English language support */
  localizationData?: LocalizationData;
}

/** Single best match result from provider search */
export interface MetadataSearchResult {
  source: Provider;
  externalId: number;
  metadata: MangaMetadata;
  associatedTitles: string[];
  coverUrl?: string;
  sourceUrl?: string;
}

/** Smart match progress phase */
export type SmartMatchPhase =
  | "searching"
  | "ai-fallback"
  | "ai-retry"
  | "manual"
  | "complete"
  | "error";
