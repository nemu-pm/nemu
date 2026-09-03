import type { SyncSnapshotResourceKey } from "@nemu/core";

export {
  makeChapterProgressId,
  makeCollectionItemId,
  makeMangaProgressId,
  makeSourceLinkId,
} from "@nemu/core";

export type ChapterSummary = {
  id: string;
  title?: string;
  chapterNumber?: number;
  volumeNumber?: number;
  dateUploaded?: number;
  locked?: boolean;
  lang?: string;
};

export type ExternalIds = {
  mangaUpdates?: number;
  aniList?: number;
  mal?: number;
};

export type MangaMetadata = {
  title: string;
  cover?: string;
  authors?: string[];
  description?: string;
  tags?: string[];
  status?: number;
  url?: string;
};

export type InstalledSource = {
  id: string;
  registryId: string;
  sourceKind?: "aidoku" | "tachiyomi";
  sourceId?: string;
  name?: string;
  icon?: string;
  languages?: string[];
  contentRating?: number;
  hasAuthentication?: boolean;
  hasCloudflare?: boolean;
  downloadUrl?: string;
  packageUri?: string | null;
  packageCacheKey?: string | null;
  packageMetadata?: SourcePackageMetadata | null;
  version: number;
  updatedAt?: number;
  removed?: boolean;
};

export type SourcePackageListing = {
  id: string;
  name: string;
  kind?: 0 | 1;
};

export type SourcePackageField = {
  id?: string;
  /** Check-filter choice label; distinct from the section title. */
  name?: string;
  title: string;
  type: string;
  hideFromHeader?: boolean;
  optionCount?: number;
  options?: string[];
  ids?: string[];
  placeholder?: string;
  default?: boolean | number | { index: number; ascending: boolean };
  canAscend?: boolean;
  canExclude?: boolean;
};

export type SourcePackageSetting = {
  key: string;
  title: string;
  type: string;
  subtitle?: string;
  footer?: string;
  optionCount?: number;
  values?: string[];
  titles?: string[];
  /** Array-backed single-choice mode used by Aidoku multi-single-select. */
  single?: boolean;
  default?: string | string[] | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  formatValue?: (value: number) => string;
  placeholder?: string;
  secure?: boolean;
  requires?: string;
  requiresFalse?: string;
  requiresFeature?: string;
  notification?: string;
  refreshes?: Array<"content" | "listings" | "settings" | "filters">;
  action?: string;
  url?: string;
  urlKey?: string;
  method?: "basic" | "web" | "oauth";
  logoutTitle?: string;
  localStorageKeys?: string[];
  useEmail?: boolean;
  external?: boolean;
  destructive?: boolean;
  confirmTitle?: string;
  confirmMessage?: string;
  callbackScheme?: string;
  tokenUrl?: string;
  pkce?: boolean;
  info?: string;
  icon?: {
    type?: "system" | "url";
    name?: string;
    url?: string;
    color?: string;
  };
  items?: SourcePackageSetting[];
};

export type SourcePackageMetadata = {
  sourceId: string;
  name: string;
  version: number;
  languages?: string[];
  contentRating?: number;
  urls?: string[];
  listings: SourcePackageListing[];
  filters: SourcePackageField[];
  settings: SourcePackageSetting[];
  hasWasm: boolean;
};

export type ReadingMode = "rtl" | "ltr" | "scrolling";
export type PagePairingMode = "manga" | "book";
export type ThemePreference = "system" | "light" | "dark";
export type AppLanguage = "en" | "zh" | "ja";
export type MetadataLanguagePreference = "auto" | AppLanguage;

export type ReaderPluginSettings = {
  enabled?: boolean;
  values?: Record<string, unknown>;
  updatedAt?: number;
};

export type UserSettings = {
  installedSources: InstalledSource[];
  appLanguage?: AppLanguage;
  metadataLanguagePreference?: MetadataLanguagePreference;
  readingMode?: ReadingMode;
  readerScrollWidthPct?: number;
  readerTwoPageMode?: boolean;
  readerPagePairingMode?: PagePairingMode;
  readerProcessPageImages?: boolean;
  themePreference?: ThemePreference;
  searchSelectedSourceIds?: string[];
  readerPlugins?: Record<string, ReaderPluginSettings>;
  mobileWelcomeCompleted?: boolean;
  /** Master switch for transient haptic feedback; `undefined` means enabled. */
  hapticsFeedbackEnabled?: boolean;
  /** End-of-chapter check animation; `undefined` means disabled. */
  chapterCompleteCelebration?: boolean;
  /** Keep the screen awake while reading; `undefined` means enabled. */
  readerKeepAwake?: boolean;
  /** Lock the reader to portrait; `undefined` means disabled. */
  readerLockPortrait?: boolean;
};

/**
 * Durable, account-scoped outcome of the bounded cloud snapshot collector.
 *
 * The state deliberately carries no auth subject. Native stores live inside an
 * already account-scoped SQLite profile, and Expo web uses a hashed profile
 * storage key. Keeping the subject out of this record prevents diagnostics from
 * becoming another surface that can disclose account identity.
 */
export type MobileSyncSnapshotState = {
  status: "healthy" | "budget-exceeded";
  generation: number;
  origin: "foreground" | "background";
  resourceKey?: SyncSnapshotResourceKey | "total";
  totalRows?: number;
  totalEstimatedBytes?: number;
  /** Durable per-profile transition order. Stores normalize this with a
   * monotonic clock, so it must not be interpreted as wall-clock telemetry. */
  observedAt: number;
};

const MOBILE_SYNC_SNAPSHOT_RESOURCE_KEYS = new Set<
  SyncSnapshotResourceKey | "total"
>([
  "libraryItems",
  "sourceLinks",
  "collections",
  "collectionItems",
  "chapterProgress",
  "mangaProgress",
  "settings",
  "total",
]);

function isOptionalNonNegativeSafeInteger(value: unknown): boolean {
  return (
    value === undefined ||
    (Number.isSafeInteger(value) && (value as number) >= 0)
  );
}

export function isMobileSyncSnapshotState(
  value: unknown,
): value is MobileSyncSnapshotState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<MobileSyncSnapshotState>;
  return (
    (candidate.status === "healthy" ||
      candidate.status === "budget-exceeded") &&
    Number.isSafeInteger(candidate.generation) &&
    (candidate.generation ?? -1) >= 0 &&
    (candidate.origin === "foreground" || candidate.origin === "background") &&
    (candidate.resourceKey === undefined ||
      MOBILE_SYNC_SNAPSHOT_RESOURCE_KEYS.has(candidate.resourceKey)) &&
    isOptionalNonNegativeSafeInteger(candidate.totalRows) &&
    isOptionalNonNegativeSafeInteger(candidate.totalEstimatedBytes) &&
    Number.isFinite(candidate.observedAt) &&
    (candidate.observedAt ?? -1) >= 0
  );
}

export type LocalSourceSettings = {
  sourceKey: string;
  values: Record<string, unknown>;
  updatedAt: number;
};

export type SourceRegistry =
  | {
      id: string;
      name: string;
      type: "builtin";
    }
  | {
      id: string;
      name: string;
      type: "url";
      url: string;
    };

export type UserOverrides = {
  metadata?: Partial<MangaMetadata> | null;
  coverUrl?: string | null;
};

export type LocalLibraryItem = {
  libraryItemId: string;
  metadata: MangaMetadata;
  externalIds?: ExternalIds;
  inLibrary: boolean;
  overrides?: UserOverrides;
  sourceOrder?: string[];
  createdAt: number;
  updatedAt: number;
};

export type LocalSourceLink = {
  id: string;
  libraryItemId: string;
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  latestChapter?: ChapterSummary;
  latestChapterSortKey?: string;
  latestFetchedAt?: number;
  updateAckChapter?: ChapterSummary;
  updateAckChapterSortKey?: string;
  updateAckAt?: number;
  createdAt: number;
  updatedAt: number;
  removed?: boolean;
};

export type LocalChapterProgress = {
  id: string;
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  sourceChapterId: string;
  libraryItemId?: string;
  progress: number;
  total: number;
  completed: boolean;
  lastReadAt: number;
  chapterNumber?: number;
  volumeNumber?: number;
  chapterTitle?: string;
  /** Normalized position inside a single logical long-strip page. */
  intraPageProgress?: number;
  /** Content identity that must match before `intraPageProgress` is restored. */
  intraPageContentIdentity?: string;
  updatedAt: number;
};

export type LocalMangaProgress = {
  id: string;
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  libraryItemId?: string;
  lastReadAt: number;
  lastReadSourceChapterId?: string;
  lastReadChapterNumber?: number;
  lastReadVolumeNumber?: number;
  lastReadChapterTitle?: string;
  updatedAt: number;
};

export type LocalCollection = {
  collectionId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  removed?: boolean;
};

export type LocalCollectionItem = {
  collectionId: string;
  libraryItemId: string;
  addedAt: number;
  updatedAt: number;
  removed?: boolean;
};

export type LibraryEntry = {
  item: LocalLibraryItem;
  sources: LocalSourceLink[];
};

// Library view helpers are single-sourced in `@nemu/core/library` (structural
// types accept both apps' concrete LibraryEntry/LocalSourceLink). Re-exported
// here so existing `@/data/schema` imports keep working unchanged.
export {
  getEntryTitle,
  getEntryCover,
  sourceHasUpdate,
  entryHasAnyUpdate,
} from "@nemu/core/library";
