/**
 * Types for metadata fetching service
 */

import type { MangaMetadata, ExternalIds } from "@/data/schema";

/** Result from a metadata search */
export interface MetadataSearchResult {
  /** Source of the metadata */
  source: "mangaupdates" | "anilist" | "mal" | "ai";
  /** External ID from the source */
  externalId: number;
  /** The metadata */
  metadata: MangaMetadata;
  /** Associated/alternative titles */
  associatedTitles?: string[];
  /** Cover image URL */
  coverUrl?: string;
  /** Source URL for verification */
  sourceUrl?: string;
}

/** Full metadata fetch result */
export interface MetadataFetchResult {
  metadata: MangaMetadata;
  externalIds: ExternalIds;
  source: MetadataSearchResult["source"];
}

/** Search options */
export interface MetadataSearchOptions {
  /** Only search specific provider */
  provider?: "mangaupdates" | "anilist" | "mal";
  /** Skip AI fallback */
  skipAI?: boolean;
}


