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
  /** Whether chapter is locked (paywall/login required) */
  locked?: boolean;
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

// Filter types for UI/internal use
// NOTE: These are NOT the same as Swift's OLD ABI FilterType values!
// Swift OLD ABI uses: base=0, group=1, text=2, check=3, select=4, sort=5, sortSelection=6, title=7, author=8, genre=9
// The runtime.ts converts these to the appropriate format for each ABI
export const FilterType = {
  Title: 0,
  Author: 1,
  Select: 2,
  Sort: 3,
  Check: 4,
  Group: 5,
  Genre: 6,
  Text: 7,
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

export interface TextFilter extends BaseFilter {
  type: typeof FilterType.Text;
  placeholder?: string;
}

export interface SelectFilter extends BaseFilter {
  type: typeof FilterType.Select;
  options: string[];
  /** IDs corresponding to options (use ids[index] for actual value, fallback to options[index]) */
  ids?: string[];
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
  canExclude?: boolean;
  default: boolean;
}

export interface GroupFilter extends BaseFilter {
  type: typeof FilterType.Group;
  filters: Filter[];
}

export interface GenreFilter extends BaseFilter {
  type: typeof FilterType.Genre;
  options: string[];
  /** IDs corresponding to options (use ids[index] for actual value, fallback to options[index]) */
  ids?: string[];
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
  | TextFilter
  | SelectFilter
  | SortFilter
  | CheckFilter
  | GroupFilter
  | GenreFilter;

// Filter value for search queries
// NOTE: For Select and Genre filters, value should be string ID(s), NOT indices!
// Swift uses string IDs from filter.ids[index] ?? filter.options[index]
export interface FilterValue {
  type: FilterType;
  name: string;
  value?: string | number | boolean | SortSelection | MultiSelectValue;
  /** Child filters for Group type */
  filters?: FilterValue[];
}

/** Value for Genre/MultiSelect filters - string arrays of included/excluded option IDs */
export interface MultiSelectValue {
  included: string[];
  excluded: string[];
}

export interface Listing {
  id: string;
  name: string;
  kind?: ListingKind;
}

export const ListingKind = {
  Default: 0,
  List: 1,
} as const;

export type ListingKind = (typeof ListingKind)[keyof typeof ListingKind];

// Home layout types matching aidoku-rs home.rs

export interface HomeLayout {
  components: HomeComponent[];
}

export interface HomeComponent {
  title?: string;
  subtitle?: string;
  value: HomeComponentValue;
}

export type HomeComponentValue =
  | HomeImageScroller
  | HomeBigScroller
  | HomeScroller
  | HomeMangaList
  | HomeMangaChapterList
  | HomeFilters
  | HomeLinks;

export interface HomeImageScroller {
  type: "imageScroller";
  links: HomeLink[];
  autoScrollInterval?: number;
  width?: number;
  height?: number;
}

export interface HomeBigScroller {
  type: "bigScroller";
  entries: Manga[];
  autoScrollInterval?: number;
}

export interface HomeScroller {
  type: "scroller";
  entries: HomeLink[];
  listing?: Listing;
}

export interface HomeMangaList {
  type: "mangaList";
  ranking: boolean;
  pageSize?: number;
  entries: HomeLink[];
  listing?: Listing;
}

export interface HomeMangaChapterList {
  type: "mangaChapterList";
  pageSize?: number;
  entries: MangaWithChapter[];
  listing?: Listing;
}

export interface HomeFilters {
  type: "filters";
  items: HomeFilterItem[];
}

export interface HomeLinks {
  type: "links";
  links: HomeLink[];
}

export interface HomeLink {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  value?: HomeLinkValue;
}

export type HomeLinkValue =
  | { type: "url"; url: string }
  | { type: "listing"; listing: Listing }
  | { type: "manga"; manga: Manga };

export interface HomeFilterItem {
  title: string;
  values?: FilterValue[];
}

export interface MangaWithChapter {
  manga: Manga;
  chapter: Chapter;
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

/** Raw filter info from manifest JSON (matches Swift FilterInfo) */
export interface FilterInfo {
  type: string;
  /** Display name for the filter */
  title?: string;
  /** Secondary name (used for check filter labels) */
  name?: string;
  /** Placeholder text for text inputs */
  placeholder?: string;
  default?: unknown;
  id?: unknown;
  filters?: FilterInfo[];
  options?: string[];
  /** IDs corresponding to options (for multi-select) */
  ids?: string[];
  canExclude?: boolean;
  canAscend?: boolean;
  /** Whether to hide from header (Swift-specific) */
  hideFromHeader?: boolean;
  /** Whether to use tag/pill style (for multiselect) */
  usesTagStyle?: boolean;
  /** Whether this is a genre filter */
  isGenre?: boolean;
}

export interface SourceManifest {
  info: SourceInfo;
  listings?: Listing[];
  filters?: FilterInfo[];
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
