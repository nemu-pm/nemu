/**
 * Smart Match Store
 *
 * Holds search results from all providers and manages the smart match flow.
 */

import { create } from "zustand";
import type { MangaMetadata, ExternalIds } from "@/data/schema";
import type { Provider, ProviderSearchResult, SmartMatchPhase } from "./types";
import {
  hasExactMatch,
  getMUCandidates,
  getALCandidates,
  getMALCandidates,
} from "./matching";
import {
  searchMangaUpdatesRaw,
  type MUSeriesDetail,
} from "./providers/mangaupdates";
import {
  searchAniListRaw,
  mapAniListToMetadata,
  type ALMedia,
} from "./providers/anilist";
import {
  searchJikanRaw,
  mapJikanToMetadata,
  type JikanManga,
} from "./providers/jikan";
import { MangaStatus } from "@/lib/sources/types";

// =============================================================================
// Types
// =============================================================================

export type MetadataField = "title" | "cover" | "description" | "status" | "authors" | "artists" | "tags";

export interface FieldOption {
  provider: Provider;
  externalId: number;
  value: string | string[] | number | undefined;
  displayValue: string;
}

export interface FieldSelection {
  field: MetadataField;
  options: FieldOption[];
  selectedProvider: Provider | null;
}

export interface ExactMatch {
  provider: Provider;
  externalId: number;
  metadata: MangaMetadata;
  result: ProviderSearchResult;
}

export interface SmartMatchStore {
  phase: SmartMatchPhase;
  phaseMessage: string;
  results: Map<Provider, ProviderSearchResult[]>;
  exactMatches: ExactMatch[];
  fieldSelections: Map<MetadataField, FieldSelection>;
  lastSearchQuery: string | null;
  error: string | null;

  reset: () => void;
  setPhase: (phase: SmartMatchPhase, message?: string) => void;
  setResults: (provider: Provider, results: ProviderSearchResult[]) => void;
  setExactMatches: (matches: ExactMatch[]) => void;
  setLastSearchQuery: (query: string | null) => void;
  setError: (error: string | null) => void;
  selectFieldProvider: (field: MetadataField, provider: Provider | null) => void;
  hasAnyResults: () => boolean;
  hasExactMatches: () => boolean;
  getProviderResults: (provider: Provider) => ProviderSearchResult[];
  getMergedMetadata: () => { metadata: MangaMetadata; externalIds: ExternalIds };
}

// =============================================================================
// Helpers
// =============================================================================

function getFieldValue(metadata: MangaMetadata, field: MetadataField): string | string[] | number | undefined {
  switch (field) {
    case "title": return metadata.title;
    case "cover": return metadata.cover;
    case "description": return metadata.description;
    case "status": return metadata.status;
    case "authors": return metadata.authors;
    case "artists": return metadata.artists;
    case "tags": return metadata.tags;
  }
}

function formatFieldValue(value: string | string[] | number | undefined, field: MetadataField): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (field === "status") {
    switch (value) {
      case MangaStatus.Ongoing: return "Ongoing";
      case MangaStatus.Completed: return "Completed";
      case MangaStatus.Hiatus: return "Hiatus";
      case MangaStatus.Cancelled: return "Cancelled";
      default: return "Unknown";
    }
  }
  return String(value);
}

function buildFieldSelections(matches: ExactMatch[]): Map<MetadataField, FieldSelection> {
  const fields: MetadataField[] = ["title", "cover", "description", "status", "authors", "artists", "tags"];
  const selections = new Map<MetadataField, FieldSelection>();

  for (const field of fields) {
    const options: FieldOption[] = [];
    const seenValues = new Set<string>();

    // Priority: AL > MAL > MU (AniList has richest tag system)
    const priorityOrder: Provider[] = ["anilist", "mal", "mangaupdates"];

    const sortedMatches = [...matches].sort((a, b) =>
      priorityOrder.indexOf(a.provider) - priorityOrder.indexOf(b.provider)
    );

    for (const match of sortedMatches) {
      const value = getFieldValue(match.metadata, field);
      const displayValue = formatFieldValue(value, field);

      if (!displayValue) continue;
      if (seenValues.has(displayValue)) continue;
      seenValues.add(displayValue);

      options.push({
        provider: match.provider,
        externalId: match.externalId,
        value,
        displayValue,
      });
    }

    selections.set(field, {
      field,
      options,
      selectedProvider: options.length > 0 ? options[0].provider : null,
    });
  }

  return selections;
}

// =============================================================================
// Store
// =============================================================================

const initialState = {
  phase: "searching" as SmartMatchPhase,
  phaseMessage: "",
  results: new Map<Provider, ProviderSearchResult[]>(),
  exactMatches: [] as ExactMatch[],
  fieldSelections: new Map<MetadataField, FieldSelection>(),
  lastSearchQuery: null as string | null,
  error: null as string | null,
};

export const useSmartMatchStore = create<SmartMatchStore>((set, get) => ({
  ...initialState,

  reset: () => set({
    ...initialState,
    results: new Map(),
    fieldSelections: new Map(),
  }),

  setPhase: (phase, message) => set({
    phase,
    phaseMessage: message || "",
  }),

  setResults: (provider, results) => set(state => {
    const newResults = new Map(state.results);
    newResults.set(provider, results);
    return { results: newResults };
  }),

  setExactMatches: (matches) => set({
    exactMatches: matches,
    fieldSelections: buildFieldSelections(matches),
  }),

  setLastSearchQuery: (query) => set({ lastSearchQuery: query }),

  setError: (error) => set({ error }),

  selectFieldProvider: (field, provider) => set(state => {
    const newSelections = new Map(state.fieldSelections);
    const selection = newSelections.get(field);
    if (selection) {
      newSelections.set(field, { ...selection, selectedProvider: provider });
    }
    return { fieldSelections: newSelections };
  }),

  hasAnyResults: () => {
    for (const r of get().results.values()) {
      if (r.length > 0) return true;
    }
    return false;
  },

  hasExactMatches: () => get().exactMatches.length > 0,

  getProviderResults: (provider) => get().results.get(provider) || [],

  getMergedMetadata: () => {
    const { exactMatches, fieldSelections } = get();

    const metadata: MangaMetadata = { title: "" };
    const externalIds: ExternalIds = {};

    for (const [field, selection] of fieldSelections) {
      if (!selection.selectedProvider) continue;

      const option = selection.options.find(o => o.provider === selection.selectedProvider);
      if (!option || option.value === undefined) continue;

      switch (field) {
        case "title": metadata.title = option.value as string; break;
        case "cover": metadata.cover = option.value as string; break;
        case "description": metadata.description = option.value as string; break;
        case "status": metadata.status = option.value as number; break;
        case "authors": metadata.authors = option.value as string[]; break;
        case "artists": metadata.artists = option.value as string[]; break;
        case "tags": metadata.tags = option.value as string[]; break;
      }
    }

    for (const match of exactMatches) {
      switch (match.provider) {
        case "mangaupdates": externalIds.mangaUpdates = match.externalId; break;
        case "anilist": externalIds.aniList = match.externalId; break;
        case "mal": externalIds.mal = match.externalId; break;
      }
    }

    return { metadata, externalIds };
  },
}));

// =============================================================================
// Provider mappers
// =============================================================================

function mapMUToResult(detail: MUSeriesDetail): ProviderSearchResult {
  let status: number = MangaStatus.Unknown;
  if (detail.status) {
    const s = detail.status.toLowerCase();
    if (s.includes("ongoing")) status = MangaStatus.Ongoing;
    else if (s.includes("complete")) status = MangaStatus.Completed;
    else if (s.includes("hiatus")) status = MangaStatus.Hiatus;
    else if (s.includes("discontinue") || s.includes("cancel")) status = MangaStatus.Cancelled;
  }

  const authors = detail.authors?.filter(a => a.type === "Author").map(a => a.name);
  const artists = detail.authors?.filter(a => a.type === "Artist").map(a => a.name);
  // Use only genres (36 fixed items), exclude user-generated categories
  const tags = detail.genres?.map(g => g.genre) || [];

  return {
    provider: "mangaupdates",
    externalId: detail.series_id,
    title: detail.title,
    alternativeTitles: getMUCandidates(detail),
    metadata: {
      title: detail.title,
      cover: detail.image?.url.original,
      authors: authors?.length ? authors : undefined,
      artists: artists?.length ? artists : undefined,
      description: detail.description,
      tags: tags.length ? tags : undefined,
      status,
      url: detail.url,
    },
    coverUrl: detail.image?.url.original,
    sourceUrl: detail.url,
  };
}

function mapALToResult(media: ALMedia): ProviderSearchResult {
  return {
    provider: "anilist",
    externalId: media.id,
    title: media.title.romaji || media.title.english || media.title.native || "",
    alternativeTitles: getALCandidates(media),
    metadata: mapAniListToMetadata(media),
    coverUrl: media.coverImage?.extraLarge || media.coverImage?.large,
    sourceUrl: media.siteUrl,
  };
}

function mapMALToResult(manga: JikanManga): ProviderSearchResult {
  return {
    provider: "mal",
    externalId: manga.mal_id,
    title: manga.title,
    alternativeTitles: getMALCandidates(manga),
    metadata: mapJikanToMetadata(manga),
    coverUrl: manga.images?.webp?.large_image_url || manga.images?.jpg?.large_image_url,
    sourceUrl: manga.url,
  };
}

// =============================================================================
// Search functions
// =============================================================================

export async function searchProviders(
  query: string,
  providers: Provider[],
  store: SmartMatchStore
): Promise<void> {
  const searchFns: Record<Provider, () => Promise<{ provider: Provider; results: ProviderSearchResult[] }>> = {
    mangaupdates: () => searchMangaUpdatesRaw(query, 10).then(r => ({
      provider: "mangaupdates" as Provider,
      results: r.map(mapMUToResult),
    })),
    anilist: () => searchAniListRaw(query).then(r => ({
      provider: "anilist" as Provider,
      results: r.map(mapALToResult),
    })),
    mal: () => searchJikanRaw(query).then(r => ({
      provider: "mal" as Provider,
      results: r.map(mapMALToResult),
    })),
  };

  const searches = await Promise.allSettled(providers.map(p => searchFns[p]()));

  for (const result of searches) {
    if (result.status === "fulfilled") {
      store.setResults(result.value.provider, result.value.results);
    }
  }
}

export async function searchAllProviders(query: string, store: SmartMatchStore): Promise<void> {
  await searchProviders(query, ["mangaupdates", "anilist", "mal"], store);
}

export function findExactMatches(query: string, store: SmartMatchStore): ExactMatch[] {
  const matches: ExactMatch[] = [];

  for (const [provider, results] of store.results) {
    for (const result of results) {
      if (hasExactMatch(query, result.alternativeTitles)) {
        matches.push({
          provider,
          externalId: result.externalId,
          metadata: result.metadata,
          result,
        });
        break; // One match per provider
      }
    }
  }

  return matches;
}
