import {
  chapterProgressIntraPageState,
  chapterProgressHighWaterValues,
  mergeChapterProgressHighWater,
} from "./sync-lww";
import {
  estimatedSyncServerTime,
  isAcceptableSyncClock,
  normalizeSyncClock,
} from "./sync-clock";

// The canonical LWW merge and the sync protocol error vocabulary are shared
// with the Convex backend and the mobile client. Re-export them here so
// `@nemu/core` stays the single import surface for every consumer.
export * from "./sync-lww";
export * from "./sync-errors";
export * from "./sync-clock";

export type SourceKind = "aidoku" | "tachiyomi";

export type ChapterSummary = {
  id: string;
  title?: string;
  chapterNumber?: number;
  volumeNumber?: number;
  dateUploaded?: number;
  locked?: boolean;
  lang?: string;
};

export type CloudChapterSummary = {
  id: string;
  title?: string;
  chapterNumber?: number;
  volumeNumber?: number;
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

export type UserOverrides = {
  metadata?: Partial<MangaMetadata> | null;
  coverUrl?: string | null;
};

export type InstalledSource = {
  id: string;
  registryId: string;
  sourceKind?: SourceKind;
  sourceId?: string;
  name?: string;
  icon?: string;
  languages?: string[];
  contentRating?: number;
  hasAuthentication?: boolean;
  hasCloudflare?: boolean;
  downloadUrl?: string;
  version: number;
  updatedAt?: number;
  removed?: boolean;
};

export type CloudInstalledSource = Omit<InstalledSource, "updatedAt"> & {
  updatedAt: number;
};

export type LocalLibraryItem = {
  libraryItemId: string;
  metadata: MangaMetadata;
  externalIds?: ExternalIds;
  inLibrary: boolean;
  /** Permanent redirect left by a semantic library-item merge. */
  mergedIntoLibraryItemId?: string;
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
  intraPageProgress?: number;
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

function withoutChapterProgressIntraPageState<
  TProgress extends LocalChapterProgress,
>(progress: TProgress): TProgress {
  const copy = { ...progress };
  delete copy.intraPageProgress;
  delete copy.intraPageContentIdentity;
  return copy;
}

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

export type CloudLibraryItem = {
  id: string;
  libraryItemId?: string;
  metadata: MangaMetadata;
  externalIds?: ExternalIds;
  inLibrary?: boolean;
  /** Permanent redirect left by a semantic library-item merge. */
  mergedIntoLibraryItemId?: string;
  overrides?: UserOverrides;
  sourceOrder?: string[];
  createdAt: number;
  updatedAt: number;
};

export type CloudSourceLink = {
  id?: string;
  libraryItemId: string;
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  latestChapter?: CloudChapterSummary;
  latestChapterSortKey?: string;
  latestFetchedAt?: number;
  updateAckChapter?: CloudChapterSummary;
  updateAckChapterSortKey?: string;
  updateAckAt?: number;
  createdAt: number;
  updatedAt: number;
  removed?: boolean;
};

export type CloudChapterProgress = {
  id?: string;
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
  intraPageProgress?: number;
  intraPageContentIdentity?: string;
  updatedAt: number;
};

export type CloudMangaProgress = {
  id?: string;
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

export type CloudSourceLinkInput = {
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  latestChapter?: CloudChapterSummary;
  latestChapterSortKey?: string;
  latestFetchedAt?: number;
  updateAckChapter?: CloudChapterSummary;
  updateAckChapterSortKey?: string;
  updateAckAt?: number;
  createdAt: number;
  updatedAt: number;
  removed?: boolean;
};

export type CloudLibrarySaveInput = {
  libraryItemId: string;
  createdAt: number;
  updatedAt: number;
  metadata: MangaMetadata;
  overrides?: UserOverrides;
  externalIds?: ExternalIds;
  sourceOrder?: string[];
  sources: CloudSourceLinkInput[];
  sourcesMode: "merge" | "replace";
};

export type CloudHistorySaveInput = {
  registryId: string;
  sourceId: string;
  sourceMangaId: string;
  sourceChapterId: string;
  progress: number;
  total: number;
  completed: boolean;
  lastReadAt: number;
  chapterNumber?: number;
  volumeNumber?: number;
  chapterTitle?: string;
  intraPageProgress?: number;
  intraPageContentIdentity?: string;
  updatedAt: number;
};

export type LibrarySnapshotMerge<
  TItem extends LocalLibraryItem,
  TLink extends LocalSourceLink,
> = {
  items: TItem[];
  links: TLink[];
  localItemsToPush: TItem[];
  localLinksToPush: TLink[];
};

export type CollectionSnapshotMerge<
  TCollection extends LocalCollection,
  TCollectionItem extends LocalCollectionItem,
> = {
  collections: TCollection[];
  collectionItems: TCollectionItem[];
  localCollectionsToPush: TCollection[];
  localCollectionItemsToPush: TCollectionItem[];
};

export const DEFAULT_INSTALLED_SOURCE_LOCAL_FIELDS = ["sourceKind"] as const;

export function makeSourceLinkId(
  registryId: string,
  sourceId: string,
  sourceMangaId: string,
): string {
  return `${encodeURIComponent(registryId)}:${encodeURIComponent(sourceId)}:${encodeURIComponent(sourceMangaId)}`;
}

export function makeChapterProgressId(
  registryId: string,
  sourceId: string,
  sourceMangaId: string,
  sourceChapterId: string,
): string {
  return `${encodeURIComponent(registryId)}:${encodeURIComponent(sourceId)}:${encodeURIComponent(sourceMangaId)}:${encodeURIComponent(sourceChapterId)}`;
}

export function makeMangaProgressId(
  registryId: string,
  sourceId: string,
  sourceMangaId: string,
): string {
  return makeSourceLinkId(registryId, sourceId, sourceMangaId);
}

export function makeCollectionItemId(
  collectionId: string,
  libraryItemId: string,
): string {
  return `${encodeURIComponent(collectionId)}:${encodeURIComponent(libraryItemId)}`;
}

export const MAX_LIBRARY_MERGE_ALIAS_HOPS = 32;

/** Resolve one bounded, cycle-free semantic merge alias from an in-memory view. */
export function resolveLibraryItemMergeAlias(
  requestedLibraryItemId: string,
  getTarget: (libraryItemId: string) => string | undefined,
  maxHops = MAX_LIBRARY_MERGE_ALIAS_HOPS,
): string {
  if (
    requestedLibraryItemId.length === 0 ||
    !Number.isSafeInteger(maxHops) ||
    maxHops < 0 ||
    maxHops > MAX_LIBRARY_MERGE_ALIAS_HOPS
  ) {
    throw new Error("Invalid library merge alias.");
  }
  const seen = new Set<string>();
  let libraryItemId = requestedLibraryItemId;
  for (let hop = 0; hop <= maxHops; hop += 1) {
    if (seen.has(libraryItemId)) {
      throw new Error("Library merge alias cycle detected.");
    }
    seen.add(libraryItemId);
    const target = getTarget(libraryItemId);
    if (target === undefined) return libraryItemId;
    if (target.length === 0 || target === libraryItemId) {
      throw new Error("Invalid library merge alias.");
    }
    if (hop === maxHops) {
      throw new Error("Library merge alias chain is too deep.");
    }
    libraryItemId = target;
  }
  throw new Error("Library merge alias chain is too deep.");
}

export function toCloudChapterSummary(
  chapter: ChapterSummary | null | undefined,
): CloudChapterSummary | undefined {
  if (!chapter) return undefined;
  return {
    id: chapter.id,
    title: chapter.title,
    chapterNumber: chapter.chapterNumber,
    volumeNumber: chapter.volumeNumber,
    lang: chapter.lang,
  };
}

export function toCloudSourceLink(link: LocalSourceLink): CloudSourceLinkInput {
  const now = estimatedSyncServerTime();
  return {
    registryId: link.registryId,
    sourceId: link.sourceId,
    sourceMangaId: link.sourceMangaId,
    latestChapter: toCloudChapterSummary(link.latestChapter),
    latestChapterSortKey: link.latestChapterSortKey,
    latestFetchedAt: link.latestFetchedAt,
    updateAckChapter: toCloudChapterSummary(link.updateAckChapter),
    updateAckChapterSortKey: link.updateAckChapterSortKey,
    updateAckAt: link.updateAckAt,
    createdAt: normalizeSyncClock(link.createdAt, now),
    updatedAt: normalizeSyncClock(link.updatedAt, now),
    removed: link.removed,
  };
}

export function toCloudLibrarySaveInput(
  item: LocalLibraryItem,
  links: LocalSourceLink[],
  sourcesMode: "merge" | "replace" = "merge",
): CloudLibrarySaveInput {
  const now = estimatedSyncServerTime();
  return {
    libraryItemId: item.libraryItemId,
    createdAt: normalizeSyncClock(item.createdAt, now),
    updatedAt: normalizeSyncClock(item.updatedAt, now),
    metadata: item.metadata,
    overrides: item.overrides,
    externalIds: item.externalIds,
    sourceOrder: item.sourceOrder,
    sources: links.map(toCloudSourceLink),
    sourcesMode,
  };
}

/**
 * Keep source-link fanout below the server's per-mutation indexed-write bound.
 * Merge batches are associative at one logical clock. Replace semantics need
 * the complete key set in one transaction, so oversized replace requests fail
 * explicitly instead of silently tombstoning links from a later batch.
 */
export const MAX_LIBRARY_SOURCE_LINKS_PER_MUTATION = 256;

export function toCloudLibrarySaveInputBatches(
  item: LocalLibraryItem,
  links: LocalSourceLink[],
  sourcesMode: "merge" | "replace" = "merge",
): CloudLibrarySaveInput[] {
  if (sourcesMode === "replace") {
    if (links.length > MAX_LIBRARY_SOURCE_LINKS_PER_MUTATION) {
      throw new Error(
        `Library source replacement exceeds ${MAX_LIBRARY_SOURCE_LINKS_PER_MUTATION} links`,
      );
    }
    return [toCloudLibrarySaveInput(item, links, sourcesMode)];
  }
  const batches: CloudLibrarySaveInput[] = [];
  for (
    let offset = 0;
    offset < links.length;
    offset += MAX_LIBRARY_SOURCE_LINKS_PER_MUTATION
  ) {
    batches.push(
      toCloudLibrarySaveInput(
        item,
        links.slice(offset, offset + MAX_LIBRARY_SOURCE_LINKS_PER_MUTATION),
        sourcesMode,
      ),
    );
  }
  return batches;
}

export function toCloudInstalledSource(
  source: InstalledSource,
): CloudInstalledSource {
  return {
    id: source.id,
    registryId: source.registryId,
    ...(source.sourceKind == null ? {} : { sourceKind: source.sourceKind }),
    sourceId: source.sourceId,
    name: source.name,
    icon: source.icon,
    languages: source.languages,
    contentRating: source.contentRating,
    hasAuthentication: source.hasAuthentication,
    hasCloudflare: source.hasCloudflare,
    downloadUrl: source.downloadUrl,
    version: source.version,
    updatedAt: normalizeSyncClock(source.updatedAt),
    removed: source.removed,
  };
}

export function toCloudHistorySaveInput(
  progress: LocalChapterProgress,
  options: { includeIntraPageState?: boolean } = {},
): CloudHistorySaveInput {
  const now = estimatedSyncServerTime();
  const intraPageState =
    options.includeIntraPageState === true
      ? chapterProgressIntraPageState(progress)
      : undefined;
  return {
    registryId: progress.registryId,
    sourceId: progress.sourceId,
    sourceMangaId: progress.sourceMangaId,
    sourceChapterId: progress.sourceChapterId,
    progress: progress.progress,
    total: progress.total,
    completed: progress.completed,
    lastReadAt: normalizeSyncClock(progress.lastReadAt, now),
    chapterNumber: progress.chapterNumber,
    volumeNumber: progress.volumeNumber,
    chapterTitle: progress.chapterTitle,
    ...(intraPageState ?? {}),
    updatedAt: normalizeSyncClock(progress.updatedAt, now),
  };
}

export function mangaProgressFromChapterProgress(
  progress: LocalChapterProgress,
  updatedAt = progress.updatedAt,
): LocalMangaProgress {
  return {
    id: makeMangaProgressId(
      progress.registryId,
      progress.sourceId,
      progress.sourceMangaId,
    ),
    registryId: progress.registryId,
    sourceId: progress.sourceId,
    sourceMangaId: progress.sourceMangaId,
    libraryItemId: progress.libraryItemId,
    lastReadAt: progress.lastReadAt,
    lastReadSourceChapterId: progress.sourceChapterId,
    lastReadChapterNumber: progress.chapterNumber,
    lastReadVolumeNumber: progress.volumeNumber,
    lastReadChapterTitle: progress.chapterTitle,
    updatedAt,
  };
}

export function mapCloudLibraryItems<T extends CloudLibraryItem>(
  items: T[],
): LocalLibraryItem[] {
  return items.map((item) => ({
    libraryItemId: item.libraryItemId ?? item.id,
    metadata: item.metadata,
    externalIds: item.externalIds,
    inLibrary: item.inLibrary ?? true,
    ...(item.mergedIntoLibraryItemId === undefined
      ? {}
      : { mergedIntoLibraryItemId: item.mergedIntoLibraryItemId }),
    overrides: item.overrides,
    sourceOrder: item.sourceOrder,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
}

export function mapCloudSourceLinks<T extends CloudSourceLink>(
  links: T[],
): LocalSourceLink[] {
  return links.map((link) => ({
    id: makeSourceLinkId(link.registryId, link.sourceId, link.sourceMangaId),
    libraryItemId: link.libraryItemId,
    registryId: link.registryId,
    sourceId: link.sourceId,
    sourceMangaId: link.sourceMangaId,
    latestChapter: link.latestChapter,
    latestChapterSortKey: link.latestChapterSortKey,
    latestFetchedAt: link.latestFetchedAt,
    updateAckChapter: link.updateAckChapter,
    updateAckChapterSortKey: link.updateAckChapterSortKey,
    updateAckAt: link.updateAckAt,
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    removed: link.removed,
  }));
}

type CloudCollection = LocalCollection;
type CloudCollectionItem = LocalCollectionItem;

export function mapCloudCollections<T extends CloudCollection>(
  collections: T[],
): LocalCollection[] {
  return collections.map((collection) => ({
    collectionId: collection.collectionId,
    name: collection.name,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
    removed: collection.removed,
  }));
}

export function mapCloudCollectionItems<T extends CloudCollectionItem>(
  items: T[],
): LocalCollectionItem[] {
  return items.map((item) => ({
    collectionId: item.collectionId,
    libraryItemId: item.libraryItemId,
    addedAt: item.addedAt,
    updatedAt: item.updatedAt,
    removed: item.removed,
  }));
}

export function mapCloudChapterProgress<T extends CloudChapterProgress>(
  progress: T[],
): LocalChapterProgress[] {
  return progress.map((entry) => {
    const intraPageState = chapterProgressIntraPageState(entry);
    return {
      id: makeChapterProgressId(
        entry.registryId,
        entry.sourceId,
        entry.sourceMangaId,
        entry.sourceChapterId,
      ),
      registryId: entry.registryId,
      sourceId: entry.sourceId,
      sourceMangaId: entry.sourceMangaId,
      sourceChapterId: entry.sourceChapterId,
      libraryItemId: entry.libraryItemId,
      progress: entry.progress,
      total: entry.total,
      completed: entry.completed,
      lastReadAt: entry.lastReadAt,
      chapterNumber: entry.chapterNumber,
      volumeNumber: entry.volumeNumber,
      chapterTitle: entry.chapterTitle,
      ...(intraPageState ?? {}),
      updatedAt: entry.updatedAt,
    };
  });
}

export function mapCloudMangaProgress<T extends CloudMangaProgress>(
  progress: T[],
): LocalMangaProgress[] {
  return progress.map((entry) => ({
    id: makeMangaProgressId(
      entry.registryId,
      entry.sourceId,
      entry.sourceMangaId,
    ),
    registryId: entry.registryId,
    sourceId: entry.sourceId,
    sourceMangaId: entry.sourceMangaId,
    libraryItemId: entry.libraryItemId,
    lastReadAt: entry.lastReadAt,
    lastReadSourceChapterId: entry.lastReadSourceChapterId,
    lastReadChapterNumber: entry.lastReadChapterNumber,
    lastReadVolumeNumber: entry.lastReadVolumeNumber,
    lastReadChapterTitle: entry.lastReadChapterTitle,
    updatedAt: entry.updatedAt,
  }));
}

function shouldUseLocalRecord(
  local: { updatedAt: number } | undefined,
  cloud: { updatedAt: number } | undefined,
): boolean {
  if (!local) return false;
  if (!cloud) return true;
  const now = estimatedSyncServerTime();
  return (
    normalizeSyncClock(local.updatedAt, now) >
    normalizeSyncClock(cloud.updatedAt, now)
  );
}

function mergeRecordMap<T extends { updatedAt: number }>(
  localRecords: T[],
  cloudRecords: T[],
  keyOf: (record: T) => string,
  isTombstone: (record: T) => boolean = (record) =>
    (record as T & { removed?: boolean }).removed === true,
): { records: T[]; localWinners: T[] } {
  const now = estimatedSyncServerTime();
  const normalizeRecord = (record: T): T => ({
    ...record,
    updatedAt: normalizeSyncClock(record.updatedAt, now),
  });
  const toCanonicalMap = (input: T[]): Map<string, T> => {
    const map = new Map<string, T>();
    for (const rawRecord of input) {
      const record = normalizeRecord(rawRecord);
      const key = keyOf(record);
      const existing = map.get(key);
      if (
        !existing ||
        record.updatedAt > existing.updatedAt ||
        (record.updatedAt === existing.updatedAt &&
          !isTombstone(existing) &&
          isTombstone(record))
      ) {
        map.set(key, record);
      }
    }
    return map;
  };
  const localById = toCanonicalMap(localRecords);
  const cloudById = toCanonicalMap(cloudRecords);
  const records: T[] = [];
  const localWinners: T[] = [];

  for (const id of new Set([...localById.keys(), ...cloudById.keys()])) {
    const local = localById.get(id);
    const cloud = cloudById.get(id);
    if (local && shouldUseLocalRecord(local, cloud)) {
      records.push(local);
      localWinners.push(local);
    } else if (cloud) {
      records.push(cloud);
    }
  }

  return { records, localWinners };
}

function mergeLibraryItemRecordMap<T extends LocalLibraryItem>(
  localRecords: T[],
  cloudRecords: T[],
): { records: T[]; localWinners: T[] } {
  const now = estimatedSyncServerTime();
  const normalizeRecord = (record: T): T => ({
    ...record,
    updatedAt: normalizeSyncClock(record.updatedAt, now),
  });
  const toCanonicalMap = (input: T[]): Map<string, T> => {
    const map = new Map<string, T>();
    for (const rawRecord of input) {
      const record = normalizeRecord(rawRecord);
      const existing = map.get(record.libraryItemId);
      if (!existing) {
        map.set(record.libraryItemId, record);
        continue;
      }
      const existingAlias = existing.mergedIntoLibraryItemId;
      const recordAlias = record.mergedIntoLibraryItemId;
      if (
        existingAlias !== undefined &&
        recordAlias !== undefined &&
        existingAlias !== recordAlias
      ) {
        throw new Error("Conflicting library merge aliases in sync snapshot.");
      }
      const aliasWins =
        recordAlias !== undefined &&
        (existingAlias === undefined || record.updatedAt > existing.updatedAt);
      const ordinaryLwwWins =
        recordAlias === undefined &&
        existingAlias === undefined &&
        (record.updatedAt > existing.updatedAt ||
          (record.updatedAt === existing.updatedAt &&
            existing.inLibrary !== false &&
            record.inLibrary === false));
      if (aliasWins || ordinaryLwwWins) {
        map.set(record.libraryItemId, record);
      }
    }
    return map;
  };
  const localById = toCanonicalMap(localRecords);
  const cloudById = toCanonicalMap(cloudRecords);
  const records: T[] = [];
  const localWinners: T[] = [];

  for (const id of new Set([...localById.keys(), ...cloudById.keys()])) {
    const local = localById.get(id);
    const cloud = cloudById.get(id);
    // A merge alias is an identity redirect, not a clock-ranked deletion. The
    // server is authoritative when both sides have aliases; otherwise retain
    // a local alias even against a later stale active cloud record and replay
    // the semantic remove/merge operation.
    if (cloud?.mergedIntoLibraryItemId !== undefined) {
      records.push(cloud);
    } else if (local?.mergedIntoLibraryItemId !== undefined) {
      records.push(local);
      localWinners.push(local);
    } else if (local && shouldUseLocalRecord(local, cloud)) {
      records.push(local);
      localWinners.push(local);
    } else if (cloud) {
      records.push(cloud);
    }
  }

  return { records, localWinners };
}

function resolveSnapshotLibraryItemId<T extends LocalLibraryItem>(
  libraryItemId: string,
  itemsById: ReadonlyMap<string, T>,
): string {
  return resolveLibraryItemMergeAlias(
    libraryItemId,
    (current) => itemsById.get(current)?.mergedIntoLibraryItemId,
  );
}

export function mergeLibrarySnapshot<
  TItem extends LocalLibraryItem,
  TLink extends LocalSourceLink,
>(
  localItems: TItem[],
  localLinks: TLink[],
  cloudItems: TItem[],
  cloudLinks: TLink[],
): LibrarySnapshotMerge<TItem, TLink> {
  const itemMerge = mergeLibraryItemRecordMap(localItems, cloudItems);
  const itemsById = new Map(
    itemMerge.records.map((item) => [item.libraryItemId, item]),
  );
  for (const item of itemMerge.records) {
    if (item.mergedIntoLibraryItemId === undefined) continue;
    const terminalLibraryItemId = resolveSnapshotLibraryItemId(
      item.libraryItemId,
      itemsById,
    );
    if (!itemsById.has(terminalLibraryItemId)) {
      throw new Error(
        "Library merge alias target is missing from sync snapshot.",
      );
    }
  }
  const itemIds = new Set(itemMerge.records.map((item) => item.libraryItemId));
  const canonicalizeLink = (link: TLink): TLink => ({
    ...link,
    libraryItemId: resolveSnapshotLibraryItemId(link.libraryItemId, itemsById),
  });
  const linkMerge = mergeRecordMap(
    localLinks.map(canonicalizeLink),
    cloudLinks.map(canonicalizeLink),
    (link) => link.id,
  );
  const links = linkMerge.records.filter((link) =>
    itemIds.has(link.libraryItemId),
  );
  const retainedLinkIds = new Set(links.map((link) => link.id));

  return {
    items: itemMerge.records,
    links,
    localItemsToPush: itemMerge.localWinners,
    localLinksToPush: linkMerge.localWinners.filter((link) =>
      retainedLinkIds.has(link.id),
    ),
  };
}

export function mergeCollectionSnapshot<
  TCollection extends LocalCollection,
  TCollectionItem extends LocalCollectionItem,
>(
  localCollections: TCollection[],
  localCollectionItems: TCollectionItem[],
  cloudCollections: TCollection[],
  cloudCollectionItems: TCollectionItem[],
): CollectionSnapshotMerge<TCollection, TCollectionItem> {
  const collectionMerge = mergeRecordMap(
    localCollections,
    cloudCollections,
    (collection) => collection.collectionId,
  );
  const collectionIds = new Set(
    collectionMerge.records.map((collection) => collection.collectionId),
  );
  const itemMerge = mergeRecordMap(
    localCollectionItems,
    cloudCollectionItems,
    (item) => makeCollectionItemId(item.collectionId, item.libraryItemId),
  );
  const collectionItems = itemMerge.records.filter((item) =>
    collectionIds.has(item.collectionId),
  );
  const retainedItemIds = new Set(
    collectionItems.map((item) =>
      makeCollectionItemId(item.collectionId, item.libraryItemId),
    ),
  );

  return {
    collections: collectionMerge.records,
    collectionItems,
    localCollectionsToPush: collectionMerge.localWinners,
    localCollectionItemsToPush: itemMerge.localWinners.filter((item) =>
      retainedItemIds.has(
        makeCollectionItemId(item.collectionId, item.libraryItemId),
      ),
    ),
  };
}

function preserveLocalInstalledSourceFields<
  TLocal extends InstalledSource,
  TSelected extends InstalledSource,
>(
  selected: TSelected,
  local: TLocal | undefined,
  fields: readonly (keyof TLocal & string)[],
): TLocal {
  if (!local || selected.removed) return selected as unknown as TLocal;

  const merged = { ...selected } as Record<string, unknown>;
  const localRecord = local as Record<string, unknown>;
  for (const field of fields) {
    if (merged[field] == null && localRecord[field] != null) {
      merged[field] = localRecord[field];
    }
  }
  return merged as TLocal;
}

export function mergeInstalledSources<
  TLocal extends InstalledSource,
  TCloud extends InstalledSource,
>(
  localSources: TLocal[],
  cloudSources: TCloud[],
  options: {
    preserveLocalFields?: readonly (keyof TLocal & string)[];
  } = {},
): TLocal[] {
  const preserveLocalFields =
    options.preserveLocalFields ?? DEFAULT_INSTALLED_SOURCE_LOCAL_FIELDS;
  const localById = new Map(localSources.map((source) => [source.id, source]));
  const cloudById = new Map(cloudSources.map((source) => [source.id, source]));
  const merged: TLocal[] = [];

  for (const id of new Set([...localById.keys(), ...cloudById.keys()])) {
    const local = localById.get(id);
    const cloud = cloudById.get(id);

    if (!local) {
      if (cloud) {
        merged.push({
          ...cloud,
          updatedAt: normalizeSyncClock(cloud.updatedAt),
        } as unknown as TLocal);
      }
      continue;
    }
    if (!cloud) {
      merged.push({
        ...local,
        updatedAt: normalizeSyncClock(local.updatedAt),
      });
      continue;
    }

    const now = estimatedSyncServerTime();
    const localUpdatedAt = normalizeSyncClock(local.updatedAt, now);
    const cloudUpdatedAt = normalizeSyncClock(cloud.updatedAt, now);
    if (localUpdatedAt > cloudUpdatedAt) {
      merged.push({ ...local, updatedAt: localUpdatedAt });
    } else if (cloudUpdatedAt > localUpdatedAt) {
      merged.push(
        preserveLocalInstalledSourceFields(
          { ...cloud, updatedAt: cloudUpdatedAt },
          local,
          preserveLocalFields,
        ),
      );
    } else {
      // The server keeps its existing value for equal logical clocks. Mirror
      // that authority locally so equal deliveries converge without an
      // endless re-push loop.
      merged.push(
        preserveLocalInstalledSourceFields(
          { ...cloud, updatedAt: cloudUpdatedAt },
          local,
          preserveLocalFields,
        ),
      );
    }
  }

  return merged;
}

export function mergeChapterProgressForSave<
  TProgress extends LocalChapterProgress,
>(existing: TProgress | null | undefined, incoming: TProgress): TProgress {
  if (!existing) {
    const normalized = mergeChapterProgressHighWater(
      undefined,
      chapterProgressHighWaterValues(incoming),
    );
    return {
      ...withoutChapterProgressIntraPageState(incoming),
      ...normalized,
    };
  }

  // `existing` is the stored local row; `incoming` is the arriving record —
  // a cloud delivery during snapshot application, or a fresh local write.
  // The arriving side owns metadata at an equal clock, which for a snapshot
  // makes the server authoritative exactly as it is on its own side. The
  // canonical merge expresses that as "existing keeps ties", so the arguments
  // are swapped when delegating: both sides then land on the same winner, and
  // the `??` backfill stops either from erasing a field the other lacks.
  const merged = mergeChapterProgressHighWater(
    chapterProgressHighWaterValues(incoming),
    chapterProgressHighWaterValues(existing),
  );
  const now = estimatedSyncServerTime();
  const owner =
    normalizeSyncClock(incoming.updatedAt, now) >=
    normalizeSyncClock(existing.updatedAt, now)
      ? incoming
      : existing;
  const other = owner === incoming ? existing : incoming;

  return {
    ...withoutChapterProgressIntraPageState(owner),
    // The server derives this from source links and may not have resolved one
    // yet; never let a cloud row without a link erase the local association.
    libraryItemId: owner.libraryItemId ?? other.libraryItemId,
    progress: merged.progress,
    total: merged.total,
    completed: merged.completed,
    lastReadAt: merged.lastReadAt,
    chapterNumber: merged.chapterNumber,
    volumeNumber: merged.volumeNumber,
    chapterTitle: merged.chapterTitle,
    ...chapterProgressIntraPageState(merged),
    updatedAt: merged.updatedAt,
  } as TProgress;
}

export function mergeMangaProgressForSave<TProgress extends LocalMangaProgress>(
  existing: TProgress | null | undefined,
  incoming: TProgress,
): TProgress {
  // updatedAt is the sync/LWW clock; lastReadAt is user-facing event data and
  // may move backwards when the device wall clock is corrected. Incoming wins
  // ties so cloud snapshot application remains authoritative on equal clocks.
  const now = estimatedSyncServerTime();
  const normalizedIncoming = {
    ...incoming,
    lastReadAt: normalizeSyncClock(incoming.lastReadAt, now),
    updatedAt: normalizeSyncClock(incoming.updatedAt, now),
  };
  if (
    !existing ||
    normalizedIncoming.updatedAt >= normalizeSyncClock(existing.updatedAt, now)
  ) {
    return normalizedIncoming.lastReadAt === incoming.lastReadAt &&
      normalizedIncoming.updatedAt === incoming.updatedAt
      ? incoming
      : normalizedIncoming;
  }

  const normalizedExisting = {
    ...existing,
    lastReadAt: normalizeSyncClock(existing.lastReadAt, now),
    updatedAt: normalizeSyncClock(existing.updatedAt, now),
  };
  return normalizedExisting.lastReadAt === existing.lastReadAt &&
    normalizedExisting.updatedAt === existing.updatedAt
    ? existing
    : normalizedExisting;
}

function mergeProgressBatchForSave<TProgress extends { id: string }>(
  existing: TProgress[],
  incoming: TProgress[],
  mergeOne: (existing: TProgress | undefined, incoming: TProgress) => TProgress,
): TProgress[] {
  const mergedById = new Map(existing.map((entry) => [entry.id, entry]));
  const changedIds = new Set<string>();

  for (const entry of incoming) {
    changedIds.add(entry.id);
    mergedById.set(entry.id, mergeOne(mergedById.get(entry.id), entry));
  }

  return [...changedIds]
    .map((id) => mergedById.get(id))
    .filter((entry): entry is TProgress => Boolean(entry));
}

export function mergeChapterProgressBatchForSave<
  TProgress extends LocalChapterProgress,
>(existing: TProgress[], incoming: TProgress[]): TProgress[] {
  return mergeProgressBatchForSave(
    existing,
    incoming,
    mergeChapterProgressForSave,
  );
}

export function mergeMangaProgressBatchForSave<
  TProgress extends LocalMangaProgress,
>(existing: TProgress[], incoming: TProgress[]): TProgress[] {
  return mergeProgressBatchForSave(
    existing,
    incoming,
    mergeMangaProgressForSave,
  );
}

/** One linear snapshot plan: the final local view, rows that need storage
 * writes, and local high-water winners that need a cloud reconciliation. */
export type ProgressSnapshotMerge<TProgress> = {
  progress: TProgress[];
  changed: TProgress[];
  localWinners: TProgress[];
};

export function chapterProgressNeedsPush(
  local: LocalChapterProgress,
  cloud: LocalChapterProgress | undefined,
): boolean {
  const now = estimatedSyncServerTime();
  const localIntraPageState = chapterProgressIntraPageState(local);
  const cloudIntraPageState = cloud
    ? chapterProgressIntraPageState(cloud)
    : undefined;
  return (
    !cloud ||
    !isAcceptableSyncClock(cloud.updatedAt, now) ||
    !isAcceptableSyncClock(cloud.lastReadAt, now) ||
    local.progress > cloud.progress ||
    local.total > cloud.total ||
    (local.completed && !cloud.completed) ||
    local.lastReadAt > cloud.lastReadAt ||
    normalizeSyncClock(local.updatedAt, now) >
      normalizeSyncClock(cloud.updatedAt, now) ||
    // Metadata the cloud row is missing can only reach the server through
    // another push. Without this the merge backfills locally and the two sides
    // stay permanently different while every convergence check reports "done".
    // The server backfills the same field on receipt, so this settles in one
    // extra round instead of looping.
    (local.chapterNumber !== undefined && cloud.chapterNumber === undefined) ||
    (local.volumeNumber !== undefined && cloud.volumeNumber === undefined) ||
    (local.chapterTitle !== undefined && cloud.chapterTitle === undefined) ||
    (localIntraPageState !== undefined && cloudIntraPageState === undefined)
  );
}

function chapterProgressEquals(
  left: LocalChapterProgress,
  right: LocalChapterProgress,
): boolean {
  return (
    left.id === right.id &&
    left.registryId === right.registryId &&
    left.sourceId === right.sourceId &&
    left.sourceMangaId === right.sourceMangaId &&
    left.sourceChapterId === right.sourceChapterId &&
    left.libraryItemId === right.libraryItemId &&
    left.progress === right.progress &&
    left.total === right.total &&
    left.completed === right.completed &&
    left.lastReadAt === right.lastReadAt &&
    left.chapterNumber === right.chapterNumber &&
    left.volumeNumber === right.volumeNumber &&
    left.chapterTitle === right.chapterTitle &&
    left.intraPageProgress === right.intraPageProgress &&
    left.intraPageContentIdentity === right.intraPageContentIdentity &&
    left.updatedAt === right.updatedAt
  );
}

function mangaProgressEquals(
  left: LocalMangaProgress,
  right: LocalMangaProgress,
): boolean {
  return (
    left.id === right.id &&
    left.registryId === right.registryId &&
    left.sourceId === right.sourceId &&
    left.sourceMangaId === right.sourceMangaId &&
    left.libraryItemId === right.libraryItemId &&
    left.lastReadAt === right.lastReadAt &&
    left.lastReadSourceChapterId === right.lastReadSourceChapterId &&
    left.lastReadChapterNumber === right.lastReadChapterNumber &&
    left.lastReadVolumeNumber === right.lastReadVolumeNumber &&
    left.lastReadChapterTitle === right.lastReadChapterTitle &&
    left.updatedAt === right.updatedAt
  );
}

function mergeProgressSnapshot<TProgress extends { id: string }>(
  existing: TProgress[],
  cloud: TProgress[],
  behaviors: {
    mergeOne: (
      existing: TProgress | undefined,
      incoming: TProgress,
    ) => TProgress;
    equals: (left: TProgress, right: TProgress) => boolean;
    needsPush: (local: TProgress, cloud: TProgress | undefined) => boolean;
  },
): ProgressSnapshotMerge<TProgress> {
  const originalById = new Map(existing.map((entry) => [entry.id, entry]));
  const mergedById = new Map(
    existing.map((entry) => [entry.id, behaviors.mergeOne(undefined, entry)]),
  );
  const cloudById = new Map<string, TProgress>();

  for (const entry of cloud) {
    cloudById.set(entry.id, entry);
    mergedById.set(
      entry.id,
      behaviors.mergeOne(mergedById.get(entry.id), entry),
    );
  }

  const progress = [...mergedById.values()];
  const changed = progress.filter((entry) => {
    const original = originalById.get(entry.id);
    return !original || !behaviors.equals(original, entry);
  });
  const localWinners = progress.filter((entry) =>
    behaviors.needsPush(entry, cloudById.get(entry.id)),
  );
  return { progress, changed, localWinners };
}

export function mergeChapterProgressSnapshot<
  TProgress extends LocalChapterProgress,
>(existing: TProgress[], cloud: TProgress[]): ProgressSnapshotMerge<TProgress> {
  return mergeProgressSnapshot(existing, cloud, {
    mergeOne: mergeChapterProgressForSave,
    equals: chapterProgressEquals,
    needsPush: chapterProgressNeedsPush,
  });
}

export function mergeMangaProgressSnapshot<
  TProgress extends LocalMangaProgress,
>(existing: TProgress[], cloud: TProgress[]): ProgressSnapshotMerge<TProgress> {
  return mergeProgressSnapshot(existing, cloud, {
    mergeOne: mergeMangaProgressForSave,
    equals: mangaProgressEquals,
    needsPush: (local, cloudEntry) => {
      const now = estimatedSyncServerTime();
      return (
        !cloudEntry ||
        !isAcceptableSyncClock(cloudEntry.updatedAt, now) ||
        !isAcceptableSyncClock(cloudEntry.lastReadAt, now) ||
        normalizeSyncClock(local.updatedAt, now) >
          normalizeSyncClock(cloudEntry.updatedAt, now)
      );
    },
  });
}

/**
 * Keep one collection membership mutation comfortably below Convex's indexed
 * range/read limits. The server performs multiple indexed reads per member, so
 * accepting an entire large library in one transaction can exceed platform
 * limits even when the request payload itself is valid.
 */
export const MAX_COLLECTION_MUTATION_ITEMS = 256;

export function chunkCollectionMutationItems(
  libraryItemIds: readonly string[],
): string[][] {
  const uniqueIds = [...new Set(libraryItemIds)];
  const chunks: string[][] = [];
  for (
    let offset = 0;
    offset < uniqueIds.length;
    offset += MAX_COLLECTION_MUTATION_ITEMS
  ) {
    chunks.push(
      uniqueIds.slice(offset, offset + MAX_COLLECTION_MUTATION_ITEMS),
    );
  }
  return chunks;
}

/**
 * `history.saveBatch` reuses the single-save logic per item, and each item
 * performs several indexed reads plus writes to `chapter_progress` and
 * `manga_progress`. Keep one transaction well inside Convex's per-mutation
 * bounds; the server rejects anything larger rather than truncating silently.
 */
export const MAX_CHAPTER_PROGRESS_SAVE_BATCH_ITEMS = 32;

/** Split a history push into `history.saveBatch`-sized transactions. */
export function chunkChapterProgressSaveInputs<T>(inputs: readonly T[]): T[][] {
  const chunks: T[][] = [];
  for (
    let offset = 0;
    offset < inputs.length;
    offset += MAX_CHAPTER_PROGRESS_SAVE_BATCH_ITEMS
  ) {
    chunks.push(
      inputs.slice(offset, offset + MAX_CHAPTER_PROGRESS_SAVE_BATCH_ITEMS),
    );
  }
  return chunks;
}

/** A sync transport may proceed only when its session and server token agree. */
export function areSyncAccountIdentitiesAligned(
  sessionUserId: string | null | undefined,
  serverUserId: string | null | undefined,
): sessionUserId is string {
  return Boolean(
    sessionUserId && serverUserId && sessionUserId === serverUserId,
  );
}
