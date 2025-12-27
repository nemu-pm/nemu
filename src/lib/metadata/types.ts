/**
 * Types for metadata fetching and smart match
 */

import type { MangaMetadata } from "@/data/schema";

/** Supported metadata providers */
export type Provider = "mangaupdates" | "anilist" | "mal";

/** Raw search result from a provider */
export interface ProviderSearchResult {
  provider: Provider;
  externalId: number;
  title: string;
  alternativeTitles: string[];
  metadata: MangaMetadata;
  coverUrl?: string;
  sourceUrl?: string;
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
