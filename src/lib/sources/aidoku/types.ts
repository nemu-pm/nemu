// Aidoku types matching the Swift/Rust structures

export interface Manga {
  sourceId?: string;
  id?: string;
  key: string;
  title?: string;
  cover?: string;
  authors?: string[];
  artists?: string[];
  description?: string;
  url?: string;
  tags?: string[];
  status?: MangaStatus;
  nsfw?: ContentRating;
  contentRating?: ContentRating;
  viewer?: Viewer;
  chapters?: Chapter[];
}

export interface Chapter {
  sourceId?: string;
  id?: string;
  key: string;
  mangaId?: string;
  title?: string;
  scanlator?: string;
  url?: string;
  lang?: string;
  chapterNumber?: number;
  volumeNumber?: number;
  dateUploaded?: number; // timestamp in ms
  sourceOrder?: number;
}

export interface Page {
  index: number;
  url?: string;
  base64?: string;
  text?: string;
  /** Context for image processing (e.g., width/height for descrambling) */
  context?: Record<string, string>;
}

/** Response data for image processing */
export interface ImageResponse {
  code: number;
  headers: Record<string, string>;
  request: {
    url: string | null;
    headers: Record<string, string>;
  };
  /** Resource ID of the image in the store */
  imageRid: number;
}

export interface MangaPageResult {
  entries: Manga[];
  hasNextPage: boolean;
}

export interface DeepLink {
  manga?: Manga;
  chapter?: Chapter;
}

// Filter types matching aidoku-rs Filter enum
export const FilterType = {
  Title: 0,
  Author: 1,
  Select: 2,
  Sort: 3,
  Check: 4,
  Group: 5,
  Genre: 6,
} as const;

export type FilterType = (typeof FilterType)[keyof typeof FilterType];

export interface BaseFilter {
  type: FilterType;
  name: string;
}

export interface TitleFilter extends BaseFilter {
  type: typeof FilterType.Title;
}

export interface AuthorFilter extends BaseFilter {
  type: typeof FilterType.Author;
}

export interface SelectFilter extends BaseFilter {
  type: typeof FilterType.Select;
  options: string[];
  default: number;
}

export interface SortFilter extends BaseFilter {
  type: typeof FilterType.Sort;
  options: string[];
  default: SortSelection;
  canAscend: boolean;
}

export interface SortSelection {
  index: number;
  ascending: boolean;
}

export interface CheckFilter extends BaseFilter {
  type: typeof FilterType.Check;
  default: boolean;
}

export interface GroupFilter extends BaseFilter {
  type: typeof FilterType.Group;
  filters: Filter[];
}

export interface GenreFilter extends BaseFilter {
  type: typeof FilterType.Genre;
  options: string[];
  canExclude: boolean;
  default: GenreSelection[];
}

export interface GenreSelection {
  index: number;
  state: GenreState;
}

export const GenreState = {
  Excluded: -1,
  None: 0,
  Included: 1,
} as const;

export type GenreState = (typeof GenreState)[keyof typeof GenreState];

export type Filter =
  | TitleFilter
  | AuthorFilter
  | SelectFilter
  | SortFilter
  | CheckFilter
  | GroupFilter
  | GenreFilter;

// Filter value for search queries
export interface FilterValue {
  type: FilterType;
  name: string;
  value?: string | number | boolean | SortSelection | GenreSelection[];
}

export interface Listing {
  id: string;
  name: string;
}

export interface SourceInfo {
  id: string;
  name: string;
  lang: string;
  version: number;
  urls?: string[];
  url?: string;
  contentRating?: number;
  languages?: string[];
}

export interface SourceManifest {
  info: SourceInfo;
  listings?: Listing[];
  config?: {
    hidesFiltersWhileSearching?: boolean;
    supportsAuthorSearch?: boolean;
    supportsTagSearch?: boolean;
  };
}

/** Discovered source metadata (for registry/loading) */
export interface DiscoveredSource {
  id: string;
  info: SourceInfo;
  manifest: SourceManifest;
  path: string;
  wasmPath: string;
  iconPath?: string;
}

export const MangaStatus = {
  Unknown: 0,
  Ongoing: 1,
  Completed: 2,
  Cancelled: 3,
  Hiatus: 4,
} as const;

export type MangaStatus = (typeof MangaStatus)[keyof typeof MangaStatus];

export const ContentRating = {
  Safe: 0,
  Suggestive: 1,
  Nsfw: 2,
} as const;

export type ContentRating = (typeof ContentRating)[keyof typeof ContentRating];

export const Viewer = {
  Default: 0,
  RightToLeft: 1,
  LeftToRight: 2,
  Vertical: 3,
  Webtoon: 4,
} as const;

export type Viewer = (typeof Viewer)[keyof typeof Viewer];

// Object type enum matching WasmStd
export const ObjectType = {
  Null: 0,
  Int: 1,
  Float: 2,
  String: 3,
  Bool: 4,
  Array: 5,
  Object: 6,
  Date: 7,
  Node: 8,
  Unknown: 9,
} as const;

export type ObjectType = (typeof ObjectType)[keyof typeof ObjectType];
