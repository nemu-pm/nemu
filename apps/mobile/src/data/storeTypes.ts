import type {
  InstalledSource,
  LibraryEntry,
  LocalChapterProgress,
  LocalCollection,
  LocalCollectionItem,
  LocalLibraryItem,
  LocalMangaProgress,
  LocalSourceSettings,
  LocalSourceLink,
  MobileSyncSnapshotState,
  SourceRegistry,
  UserSettings,
} from "./schema";
import type { ProgressSnapshotMerge, SyncGenerationDecision } from "@nemu/core";

export type LibrarySnapshotApplyResult = {
  changedItems: LocalLibraryItem[];
  changedLinks: LocalSourceLink[];
  localItemsToPush: LocalLibraryItem[];
  localLinksToPush: LocalSourceLink[];
};

export type CollectionsSnapshotApplyResult = {
  changedCollections: LocalCollection[];
  changedCollectionItems: LocalCollectionItem[];
  localCollectionsToPush: LocalCollection[];
  localCollectionItemsToPush: LocalCollectionItem[];
};

export type PendingSyncDeletion =
  | {
      id: string;
      kind: "source-link";
      generation: string;
      registryId: string;
      sourceId: string;
      sourceMangaId: string;
      createdAt: number;
    }
  | {
      id: string;
      kind: "collection";
      generation: string;
      collectionId: string;
      createdAt: number;
    };

let pendingSyncDeletionGeneration = 0;

export function createPendingSyncDeletionGeneration(): string {
  pendingSyncDeletionGeneration += 1;
  return `${Date.now().toString(36)}-${pendingSyncDeletionGeneration.toString(36)}`;
}

export type MobileDataStore = {
  getSyncGeneration(): Promise<number | null>;
  /**
   * Accepts a cloud snapshot generation atomically. A newer generation clears
   * only cloud-synced rows, installed-source state, and pending deletion
   * outbox entries before persisting the new generation. Scalar settings,
   * local source settings, and registries remain local.
   */
  applySyncGeneration(generation: number): Promise<SyncGenerationDecision>;
  getSyncSnapshotState(): Promise<MobileSyncSnapshotState | null>;
  /**
   * Records a bounded-snapshot outcome only when it is not stale relative to
   * the account profile's durable generation or a newer recorded outcome.
   * Returns false when the outcome was fenced or was already superseded.
   */
  recordSyncSnapshotState(
    state: MobileSyncSnapshotState,
    shouldContinue?: () => boolean,
  ): Promise<boolean>;
  getSettings(): Promise<UserSettings>;
  getSyncSettings(): Promise<UserSettings>;
  saveSettings(settings: UserSettings, expectedGeneration?: number): Promise<void>;
  clearPackageCacheReferences(): Promise<void>;
  clearAllUserData(): Promise<void>;
  getInstalledSources(): Promise<InstalledSource[]>;
  getInstalledSource(id: string): Promise<InstalledSource | null>;
  saveInstalledSource(source: InstalledSource, expectedGeneration?: number): Promise<void>;
  /**
   * Atomically saves an installed-source update only while the durable source
   * is still the same active revision the caller observed. Runtime package
   * hydration and other async metadata reads use this to avoid resurrecting a
   * tombstone or overwriting a newer install after their work completes.
   */
  saveInstalledSourceIfCurrent?(
    source: InstalledSource,
    expectedUpdatedAt?: number,
  ): Promise<boolean>;
  removeInstalledSource(
    id: string,
    registryId?: string,
    updatedAt?: number,
    expectedGeneration?: number,
  ): Promise<void>;
  getSourceSettings(sourceKey: string): Promise<LocalSourceSettings | null>;
  saveSourceSettings(settings: LocalSourceSettings): Promise<void>;
  resetSourceSettings(sourceKey: string): Promise<void>;
  getRegistries(): Promise<SourceRegistry[]>;
  getRegistry(id: string): Promise<SourceRegistry | null>;
  saveRegistry(registry: SourceRegistry): Promise<void>;
  removeRegistry(id: string): Promise<void>;
  getLibraryEntries(): Promise<LibraryEntry[]>;
  getLibraryItem(libraryItemId: string): Promise<LocalLibraryItem | null>;
  getAllLibraryItems(options?: { includeRemoved?: boolean }): Promise<LocalLibraryItem[]>;
  getSourceLinksForItem(
    libraryItemId: string,
    options?: { includeRemoved?: boolean },
  ): Promise<LocalSourceLink[]>;
  getSourceLink(id: string): Promise<LocalSourceLink | null>;
  getAllSourceLinks(): Promise<LocalSourceLink[]>;
  saveLibraryItem(item: LocalLibraryItem, expectedGeneration?: number): Promise<void>;
  saveLibrarySnapshot(items: LocalLibraryItem[], links: LocalSourceLink[]): Promise<void>;
  removeLibraryItem(
    libraryItemId: string,
    updatedAt?: number,
    expectedGeneration?: number,
  ): Promise<void>;
  saveSourceLink(link: LocalSourceLink, expectedGeneration?: number): Promise<void>;
  removeSourceLink(
    registryId: string,
    sourceId: string,
    sourceMangaId: string,
    updatedAt?: number,
    expectedGeneration?: number,
  ): Promise<void>;
  getChapterProgress(
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string
  ): Promise<LocalChapterProgress | null>;
  getMangaChapterProgress(
    registryId: string,
    sourceId: string,
    mangaId: string
  ): Promise<Record<string, LocalChapterProgress>>;
  getAllChapterProgress(): Promise<LocalChapterProgress[]>;
  saveChapterProgress(progress: LocalChapterProgress, expectedGeneration?: number): Promise<void>;
  saveChapterProgressBatch(
    progress: LocalChapterProgress[],
    expectedGeneration?: number,
  ): Promise<void>;
  getMangaProgress(): Promise<LocalMangaProgress[]>;
  getAllMangaProgress(): Promise<LocalMangaProgress[]>;
  saveMangaProgress(progress: LocalMangaProgress, expectedGeneration?: number): Promise<void>;
  saveMangaProgressBatch(
    progress: LocalMangaProgress[],
    expectedGeneration?: number,
  ): Promise<void>;
  getCollections(): Promise<LocalCollection[]>;
  getCollection(collectionId: string): Promise<LocalCollection | null>;
  getCollectionItems(): Promise<LocalCollectionItem[]>;
  saveCollectionsSnapshot(
    collections: LocalCollection[],
    collectionItems: LocalCollectionItem[]
  ): Promise<void>;
  saveCollection(collection: LocalCollection, expectedGeneration?: number): Promise<void>;
  removeCollection(
    collectionId: string,
    updatedAt?: number,
    expectedGeneration?: number,
  ): Promise<void>;
  addCollectionItems(
    collectionId: string,
    libraryItemIds: string[],
    updatedAt?: number,
    expectedGeneration?: number,
  ): Promise<void>;
  removeCollectionItems(
    collectionId: string,
    libraryItemIds: string[],
    updatedAt?: number,
    expectedGeneration?: number,
  ): Promise<void>;
  clearAccountData(): Promise<void>;
  hasSyncedData(): Promise<boolean>;
  getPendingSyncDeletions?(): Promise<PendingSyncDeletion[]>;
  clearPendingSyncDeletion?(deletion: PendingSyncDeletion): Promise<void>;
  /**
   * Atomic cloud-snapshot applies. Each reads local state, merges via the
   * shared @nemu/core mergers, and rewrites — all inside ONE write-queue slot,
   * so a concurrent user write can never land between the read and the
   * rewrite and be erased (the old read-outside/merge/replace-all flow lost
   * such writes). Local-only by contract: implementations must never push to
   * the cloud (the sync bridge pushes the returned winners itself). Optional
   * so in-memory stubs/fakes keep compiling; the sync bridge falls back to
   * the legacy non-atomic path when absent.
   */
  applyLibrarySnapshot?(
    cloudItems: LocalLibraryItem[],
    cloudLinks: LocalSourceLink[],
  ): Promise<LibrarySnapshotApplyResult>;
  applyCollectionsSnapshot?(
    cloudCollections: LocalCollection[],
    cloudCollectionItems: LocalCollectionItem[],
  ): Promise<CollectionsSnapshotApplyResult>;
  applyChapterProgressSnapshot?(
    progress: LocalChapterProgress[],
  ): Promise<ProgressSnapshotMerge<LocalChapterProgress>>;
  applyMangaProgressSnapshot?(
    progress: LocalMangaProgress[],
  ): Promise<ProgressSnapshotMerge<LocalMangaProgress>>;
  applyInstalledSourcesSnapshot?(sources: InstalledSource[]): Promise<void>;
};
