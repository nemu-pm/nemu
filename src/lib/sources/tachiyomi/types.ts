// Types for Tachiyomi (Mihon) Kotlin/JS extension sources

// Per-source metadata (from extension's sources array)
export interface TachiyomiSourceInfo {
  id: string;
  name: string;
  lang: string;
  baseUrl?: string;
  supportsLatest?: boolean;
}

// Extension manifest (from manifest.json or getManifest())
export interface TachiyomiManifest {
  name: string;
  pkg: string;
  lang: string;
  version: number; // extVersionCode from build.gradle (always integer)
  nsfw: boolean;
  jsPath: string;
  icon?: string; // Relative path to icon (e.g., "icon.png")
  sources?: TachiyomiSourceInfo[]; // Populated after loading
}

export interface MangaDto {
  url: string;
  title: string;
  artist?: string;
  author?: string;
  description?: string;
  genre: string[];
  status: number;
  thumbnailUrl?: string;
  initialized: boolean;
}

export interface ChapterDto {
  url: string;
  name: string;
  dateUpload: number;
  chapterNumber: number;
  scanlator?: string;
}

export interface PageDto {
  index: number;
  url: string;
  imageUrl?: string;
}

export interface MangasPageDto {
  mangas: MangaDto[];
  hasNextPage: boolean;
}

// ============================================================================
// Filter Types - Match Kotlin/JS schema from getFilterList()
// ============================================================================

/** Base filter properties */
interface FilterBase {
  name: string;
}

/** Header - non-interactive label */
export interface HeaderFilter extends FilterBase {
  type: "header";
}

/** Separator - visual divider */
export interface SeparatorFilter extends FilterBase {
  type: "separator";
}

/** Checkbox - boolean toggle */
export interface CheckBoxFilter extends FilterBase {
  type: "checkbox";
  state: boolean;
}

/** TriState - ignore/include/exclude */
export interface TriStateFilter extends FilterBase {
  type: "tristate";
  state: number; // 0=ignore, 1=include, 2=exclude
}

/** Text - free-form text input */
export interface TextFilter extends FilterBase {
  type: "text";
  state: string;
}

/** Select - dropdown/single select */
export interface SelectFilter extends FilterBase {
  type: "select";
  state: number; // selected index
  values: string[];
}

/** Sort - sorting options with ascending toggle */
export interface SortFilter extends FilterBase {
  type: "sort";
  values: string[];
  state?: {
    index: number;
    ascending: boolean;
  };
}

/** Group - container for child filters (e.g., genre tags) */
export interface GroupFilter extends FilterBase {
  type: "group";
  filters: TachiyomiFilter[];
}

/** Union of all filter types */
export type TachiyomiFilter =
  | HeaderFilter
  | SeparatorFilter
  | CheckBoxFilter
  | TriStateFilter
  | TextFilter
  | SelectFilter
  | SortFilter
  | GroupFilter;

// ============================================================================
// Filter State Updates - sent to applyFilterState()
// ============================================================================

/** State update for a single filter */
export interface FilterStateUpdate {
  index: number;
  state?: boolean | number | string | { index: number; ascending: boolean };
  filters?: FilterStateUpdate[]; // For Group filters
}

/** Convert UI filter state to applyFilterState format */
export function filterToStateUpdate(filter: TachiyomiFilter, index: number): FilterStateUpdate | null {
  switch (filter.type) {
    case "checkbox":
      return { index, state: filter.state };
    case "tristate":
      return { index, state: filter.state };
    case "text":
      return filter.state ? { index, state: filter.state } : null;
    case "select":
      return { index, state: filter.state };
    case "sort":
      return filter.state ? { index, state: filter.state } : null;
    case "group":
      const childUpdates = filter.filters
        .map((f, i) => filterToStateUpdate(f, i))
        .filter((u): u is FilterStateUpdate => u !== null);
      return childUpdates.length > 0 ? { index, filters: childUpdates } : null;
    default:
      return null; // header, separator have no state
  }
}

/** Build filter state JSON for applyFilterState() */
export function buildFilterStateJson(filters: TachiyomiFilter[]): string {
  const updates = filters
    .map((f, i) => filterToStateUpdate(f, i))
    .filter((u): u is FilterStateUpdate => u !== null);
  return JSON.stringify(updates);
}

// ============================================================================
// Listing type (for browse tabs)
// ============================================================================

export interface TachiyomiListing {
  id: "popular" | "latest";
  name: string;
}

/** Default listings for Tachiyomi sources */
export const TACHIYOMI_LISTINGS: TachiyomiListing[] = [
  { id: "popular", name: "Popular" },
  { id: "latest", name: "Latest" },
];
