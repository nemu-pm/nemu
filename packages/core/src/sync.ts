import {
  chapterProgressIntraPageState,
  chapterProgressHighWaterValues,
  mergeChapterProgressHighWater,
} from "./sync-lww";

// The canonical LWW merge and the sync protocol error vocabulary are shared
// with the Convex backend and the mobile client. Re-export them here so
// `@nemu/core` stays the single import surface for every consumer.
export * from "./sync-lww";
export * from "./sync-errors";

export type SourceKind = "aidoku" | "tachiyomi";

/**
 * Return a client-side sync clock that is strictly newer than every record
 * observed by the local write. This keeps LWW edits valid when the wall clock
 * moves backwards or a previously-synced record carries a future timestamp.
 *
 * Callers must only use this for local user writes. Cloud snapshot application
 * keeps the server-provided timestamp unchanged so equal cloud clocks remain
 * authoritative.
 */
export function nextSyncTimestamp(
  ...observed: Array<number | null | undefined>
): number {
  let next = Date.now();
  for (const timestamp of observed) {
    if (timestamp == null || !Number.isFinite(timestamp)) continue;
    next = Math.max(next, timestamp + 1);
  }
  return next;
}

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

function withoutChapterProgressIntraPageState<
  TProgress extends LocalChapterProgress,
>(progress: TProgress): TProgress {
  const copy = { ...progress };
  delete copy.intraPageProgress;
  delete copy.intraPageContentIdentity;
  return copy;
}

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

export type CloudLibraryItem = {
  id: string;
  libraryItemId?: string;
  metadata: MangaMetadata;
  externalIds?: ExternalIds;
  inLibrary?: boolean;
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

export type LibrarySnapshotMerge<TItem extends LocalLibraryItem, TLink extends LocalSourceLink> = {
  items: TItem[];
  links: TLink[];
  changedItems: TItem[];
  changedLinks: TLink[];
  localItemsToPush: TItem[];
  localLinksToPush: TLink[];
};

export type CollectionSnapshotMerge<
  TCollection extends LocalCollection,
  TCollectionItem extends LocalCollectionItem,
> = {
  collections: TCollection[];
  collectionItems: TCollectionItem[];
  changedCollections: TCollection[];
  changedCollectionItems: TCollectionItem[];
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
    createdAt: link.createdAt,
    updatedAt: link.updatedAt,
    removed: link.removed,
  };
}

export function toCloudLibrarySaveInput(
  item: LocalLibraryItem,
  links: LocalSourceLink[],
  sourcesMode: "merge" | "replace" = "merge",
): CloudLibrarySaveInput {
  return {
    libraryItemId: item.libraryItemId,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
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
    updatedAt: source.updatedAt ?? 0,
    removed: source.removed,
  };
}

export function toCloudHistorySaveInput(
  progress: LocalChapterProgress,
  options: { includeIntraPageState?: boolean } = {},
): CloudHistorySaveInput {
  const intraPageState =
    options.includeIntraPageState === false
      ? undefined
      : chapterProgressIntraPageState(progress);
  return {
    registryId: progress.registryId,
    sourceId: progress.sourceId,
    sourceMangaId: progress.sourceMangaId,
    sourceChapterId: progress.sourceChapterId,
    progress: progress.progress,
    total: progress.total,
    completed: progress.completed,
    lastReadAt: progress.lastReadAt,
    chapterNumber: progress.chapterNumber,
    volumeNumber: progress.volumeNumber,
    chapterTitle: progress.chapterTitle,
    ...(intraPageState ?? {}),
    updatedAt: progress.updatedAt,
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
  return local.updatedAt > cloud.updatedAt;
}

/**
 * Structural equality for plain JSON-shaped snapshot records. Explicit
 * `undefined` values and missing keys are treated as equal because local rows
 * round-trip through storage JSON (which drops undefined) while cloud-mapped
 * rows may carry them.
 */
function syncSnapshotValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => syncSnapshotValuesEqual(value, right[index]))
    );
  }
  if (
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object"
  ) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    for (const key of new Set([
      ...Object.keys(leftRecord),
      ...Object.keys(rightRecord),
    ])) {
      if (!syncSnapshotValuesEqual(leftRecord[key], rightRecord[key]))
        return false;
    }
    return true;
  }
  return false;
}

function mergeRecordMap<T extends { updatedAt: number }>(
  localRecords: T[],
  cloudRecords: T[],
  keyOf: (record: T) => string,
): { records: T[]; changed: T[]; localWinners: T[] } {
  const localById = new Map(localRecords.map((record) => [keyOf(record), record]));
  const cloudById = new Map(cloudRecords.map((record) => [keyOf(record), record]));
  const records: T[] = [];
  const changed: T[] = [];
  const localWinners: T[] = [];

  for (const id of new Set([...localById.keys(), ...cloudById.keys()])) {
    const local = localById.get(id);
    const cloud = cloudById.get(id);
    if (local && shouldUseLocalRecord(local, cloud)) {
      records.push(local);
      localWinners.push(local);
    } else if (cloud) {
      records.push(cloud);
      if (!local || !syncSnapshotValuesEqual(local, cloud)) changed.push(cloud);
    }
  }

  return { records, changed, localWinners };
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
  const itemMerge = mergeRecordMap(
    localItems,
    cloudItems,
    (item) => item.libraryItemId,
  );
  const itemIds = new Set(itemMerge.records.map((item) => item.libraryItemId));
  const linkMerge = mergeRecordMap(localLinks, cloudLinks, (link) => link.id);
  const links = linkMerge.records.filter((link) => itemIds.has(link.libraryItemId));
  const retainedLinkIds = new Set(links.map((link) => link.id));

  return {
    items: itemMerge.records,
    links,
    changedItems: itemMerge.changed,
    changedLinks: [
      ...linkMerge.changed.filter((link) => retainedLinkIds.has(link.id)),
      // Local links dropped because their library item no longer exists.
      ...localLinks.filter((link) => !retainedLinkIds.has(link.id)),
    ],
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
    changedCollections: collectionMerge.changed,
    changedCollectionItems: [
      ...itemMerge.changed.filter((item) =>
        retainedItemIds.has(makeCollectionItemId(item.collectionId, item.libraryItemId)),
      ),
      // Local memberships dropped because their collection no longer exists.
      ...localCollectionItems.filter(
        (item) =>
          !retainedItemIds.has(
            makeCollectionItemId(item.collectionId, item.libraryItemId),
          ),
      ),
    ],
    localCollectionsToPush: collectionMerge.localWinners,
    localCollectionItemsToPush: itemMerge.localWinners.filter((item) =>
      retainedItemIds.has(makeCollectionItemId(item.collectionId, item.libraryItemId)),
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
      if (cloud) merged.push(cloud as unknown as TLocal);
      continue;
    }
    if (!cloud) {
      merged.push(local);
      continue;
    }

    const localUpdatedAt = local.updatedAt ?? 0;
    const cloudUpdatedAt = cloud.updatedAt ?? 0;
    if (localUpdatedAt > cloudUpdatedAt) {
      merged.push(local);
    } else if (cloudUpdatedAt > localUpdatedAt) {
      merged.push(preserveLocalInstalledSourceFields(cloud, local, preserveLocalFields));
    } else {
      // The server keeps its existing value for equal logical clocks. Mirror
      // that authority locally so equal deliveries converge without an
      // endless re-push loop.
      merged.push(preserveLocalInstalledSourceFields(cloud, local, preserveLocalFields));
    }
  }

  return merged;
}

export function mergeChapterProgressForSave<
  TProgress extends LocalChapterProgress,
>(
  existing: TProgress | null | undefined,
  incoming: TProgress,
): TProgress {
  if (!existing) {
    return {
      ...withoutChapterProgressIntraPageState(incoming),
      ...mergeChapterProgressHighWater(
        undefined,
        chapterProgressHighWaterValues(incoming),
      ),
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
  const owner = incoming.updatedAt >= existing.updatedAt ? incoming : existing;
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
  };
}

export function mergeMangaProgressForSave<TProgress extends LocalMangaProgress>(
  existing: TProgress | null | undefined,
  incoming: TProgress,
): TProgress {
  // updatedAt is the sync/LWW clock; lastReadAt is user-facing event data and
  // may move backwards when the device wall clock is corrected. Incoming wins
  // ties so cloud snapshot application remains authoritative on equal clocks.
  if (!existing || incoming.updatedAt >= existing.updatedAt) {
    return incoming;
  }

  return existing;
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
>(
  existing: TProgress[],
  incoming: TProgress[],
): TProgress[] {
  return mergeProgressBatchForSave(existing, incoming, mergeChapterProgressForSave);
}

export function mergeMangaProgressBatchForSave<
  TProgress extends LocalMangaProgress,
>(
  existing: TProgress[],
  incoming: TProgress[],
): TProgress[] {
  return mergeProgressBatchForSave(existing, incoming, mergeMangaProgressForSave);
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
  const localIntraPageState = chapterProgressIntraPageState(local);
  const cloudIntraPageState = cloud
    ? chapterProgressIntraPageState(cloud)
    : undefined;
  return (
    !cloud ||
    local.progress > cloud.progress ||
    local.total > cloud.total ||
    (local.completed && !cloud.completed) ||
    local.lastReadAt > cloud.lastReadAt ||
    local.updatedAt > cloud.updatedAt ||
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
  const mergedById = new Map(originalById);
  const cloudById = new Map<string, TProgress>();
  const cloudIds = new Set<string>();

  for (const entry of cloud) {
    cloudIds.add(entry.id);
    cloudById.set(entry.id, entry);
    mergedById.set(entry.id, behaviors.mergeOne(mergedById.get(entry.id), entry));
  }

  const progress = [...mergedById.values()];
  const changed = [...cloudIds]
    .map((id) => mergedById.get(id))
    .filter((entry): entry is TProgress => Boolean(entry))
    .filter((entry) => {
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
>(
  existing: TProgress[],
  cloud: TProgress[],
): ProgressSnapshotMerge<TProgress> {
  return mergeProgressSnapshot(existing, cloud, {
    mergeOne: mergeChapterProgressForSave,
    equals: chapterProgressEquals,
    needsPush: chapterProgressNeedsPush,
  });
}

export function mergeMangaProgressSnapshot<TProgress extends LocalMangaProgress>(
  existing: TProgress[],
  cloud: TProgress[],
): ProgressSnapshotMerge<TProgress> {
  return mergeProgressSnapshot(existing, cloud, {
    mergeOne: mergeMangaProgressForSave,
    equals: mangaProgressEquals,
    needsPush: (local, cloudEntry) =>
      !cloudEntry || local.updatedAt > cloudEntry.updatedAt,
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
  for (let offset = 0; offset < uniqueIds.length; offset += MAX_COLLECTION_MUTATION_ITEMS) {
    chunks.push(uniqueIds.slice(offset, offset + MAX_COLLECTION_MUTATION_ITEMS));
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
export function chunkChapterProgressSaveInputs<T>(
  inputs: readonly T[],
): T[][] {
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
  return Boolean(sessionUserId && serverUserId && sessionUserId === serverUserId);
}
