import type {
  InstalledSource,
  LibraryEntry,
  LocalChapterProgress,
  LocalCollection,
  LocalCollectionItem,
  LocalLibraryItem,
  LocalMangaProgress,
  MobileSyncSnapshotState,
  LocalSourceSettings,
  LocalSourceLink,
  SourceRegistry,
  UserSettings,
} from "./schema";
import {
  isMobileSyncSnapshotState,
  makeCollectionItemId,
  makeSourceLinkId,
} from "./schema";
import {
  createPendingSyncDeletionGeneration,
  type MobileDataStore,
  type PendingSyncDeletion,
} from "./storeTypes";
import {
  clearInstalledSourcePackageCache,
  sourceHasCachedPackage,
} from "@/lib/mobileDataManagement";
import {
  mergeChapterProgressForSave,
  mergeMangaProgressForSave,
} from "./progressMerge";
import {
  decideSyncGeneration,
  mergeChapterProgressSnapshot,
  mergeMangaProgressSnapshot,
  nextSyncTimestamp,
  sha256Bytes,
  type ProgressSnapshotMerge,
  type SyncGenerationDecision,
} from "@nemu/core";

type WebState = {
  syncGeneration: number | null;
  syncSnapshotState: MobileSyncSnapshotState | null;
  settings: UserSettings;
  installedSources: InstalledSource[];
  sourceSettings: LocalSourceSettings[];
  registries: SourceRegistry[];
  libraryItems: LocalLibraryItem[];
  sourceLinks: LocalSourceLink[];
  chapterProgress: LocalChapterProgress[];
  mangaProgress: LocalMangaProgress[];
  collections: LocalCollection[];
  collectionItems: LocalCollectionItem[];
  pendingSyncDeletions: PendingSyncDeletion[];
};

export const MOBILE_WEB_STATE_KEY = "nemu:mobile-web-state";

export function getMobileWebStateKey(profileId: string | null): string {
  if (!profileId) return `${MOBILE_WEB_STATE_KEY}:anonymous`;
  const hash = Array.from(
    sha256Bytes(new TextEncoder().encode(profileId)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${MOBILE_WEB_STATE_KEY}:profile:${hash}`;
}

const DEFAULT_STATE: WebState = {
  syncGeneration: null,
  syncSnapshotState: null,
  settings: { installedSources: [] },
  installedSources: [],
  sourceSettings: [],
  registries: [],
  libraryItems: [],
  sourceLinks: [],
  chapterProgress: [],
  mangaProgress: [],
  collections: [],
  collectionItems: [],
  pendingSyncDeletions: [],
};

function scalarSettings(settings: UserSettings): UserSettings {
  return { ...settings, installedSources: [] };
}

const volatileSyncSnapshotStates = new Map<string, MobileSyncSnapshotState>();

export function resetMobileWebSyncSnapshotStateForTesting(): void {
  volatileSyncSnapshotStates.clear();
}

function parseWebState(raw: string): Partial<WebState> {
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("Invalid mobile Web account state.");
  }
  const state = parsed as Partial<WebState>;
  if (
    state.syncSnapshotState !== undefined &&
    state.syncSnapshotState !== null &&
    !isMobileSyncSnapshotState(state.syncSnapshotState)
  ) {
    throw new TypeError("Invalid mobile sync snapshot state.");
  }
  return state;
}

function readState(storageKey: string): WebState {
  // Missing storage is an empty profile; unreadable or corrupt storage is not.
  // Propagating those failures prevents later writes from replacing an
  // existing account with DEFAULT_STATE after a SecurityError/parse failure.
  const raw = localStorage.getItem(storageKey);
  if (!raw) return DEFAULT_STATE;
  return { ...DEFAULT_STATE, ...parseWebState(raw) };
}

function readSyncSnapshotState(
  storageKey: string,
): MobileSyncSnapshotState | null {
  // Sync gating must distinguish "no saved warning" from an unreadable
  // account store. Returning the default state for SecurityError/corrupt JSON
  // would restart the bounded subscription and repeat the same large pull.
  const raw = localStorage.getItem(storageKey);
  if (!raw) return null;
  const parsed = parseWebState(raw);
  return parsed.syncSnapshotState ?? null;
}

function writeState(storageKey: string, state: WebState) {
  // A write is either durable or it fails the caller. Silently swallowing
  // quota/private-mode failures makes sync health claim success while the
  // next read falls back to the old state, recreating the silent retry loop.
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function updateState(
  storageKey: string,
  mutator: (state: WebState) => WebState,
) {
  writeState(storageKey, mutator(readState(storageKey)));
}

export class WebUserDataStore implements MobileDataStore {
  constructor(private readonly storageKey = MOBILE_WEB_STATE_KEY) {}

  private get volatileSyncSnapshotState(): MobileSyncSnapshotState | null {
    return volatileSyncSnapshotStates.get(this.storageKey) ?? null;
  }

  private set volatileSyncSnapshotState(state: MobileSyncSnapshotState | null) {
    if (state) volatileSyncSnapshotStates.set(this.storageKey, state);
    else volatileSyncSnapshotStates.delete(this.storageKey);
  }

  private readState(): WebState {
    return readState(this.storageKey);
  }

  private writeState(state: WebState): void {
    writeState(this.storageKey, state);
  }

  private updateState(mutator: (state: WebState) => WebState): void {
    updateState(this.storageKey, mutator);
  }

  async getSyncGeneration(): Promise<number | null> {
    return this.readState().syncGeneration;
  }

  async applySyncGeneration(
    generation: number,
  ): Promise<SyncGenerationDecision> {
    const state = this.readState();
    const decision = decideSyncGeneration(state.syncGeneration, generation);
    if (decision === "stale" || decision === "current") return decision;
    if (decision === "initialize") {
      this.writeState({ ...state, syncGeneration: generation });
      return decision;
    }
    this.writeState({
      ...DEFAULT_STATE,
      syncGeneration: generation,
      settings: { ...state.settings, installedSources: [] },
      sourceSettings: state.sourceSettings,
      registries: state.registries,
    });
    this.volatileSyncSnapshotState = null;
    return decision;
  }

  async getSyncSnapshotState(): Promise<MobileSyncSnapshotState | null> {
    const volatile = this.volatileSyncSnapshotState;
    let durable: MobileSyncSnapshotState | null;
    try {
      durable = readSyncSnapshotState(this.storageKey);
    } catch (error) {
      // A quota failure may coincide with storage becoming unreadable. Keep
      // the already-observed fail-closed warning usable for this account and
      // process; otherwise surface the read failure so the Provider gates all
      // snapshot subscriptions and Settings can explain the pause.
      if (volatile) return volatile;
      throw error;
    }
    if (!volatile) return durable;
    if (!durable || volatile.generation >= durable.generation) return volatile;
    return durable;
  }

  async recordSyncSnapshotState(
    snapshot: MobileSyncSnapshotState,
    shouldContinue: () => boolean = () => true,
  ): Promise<boolean> {
    if (!shouldContinue()) return false;
    const volatileAtStart = this.volatileSyncSnapshotState;
    if (volatileAtStart && snapshot.generation < volatileAtStart.generation) {
      return false;
    }
    let attemptedSnapshot: MobileSyncSnapshotState | null = null;
    try {
      const state = this.readState();
      if (!shouldContinue()) return false;
      if (
        (state.syncGeneration !== null &&
          snapshot.generation < state.syncGeneration) ||
        (state.syncSnapshotState !== null &&
          snapshot.generation < state.syncSnapshotState.generation) ||
        (this.volatileSyncSnapshotState !== null &&
          snapshot.generation < this.volatileSyncSnapshotState.generation)
      ) {
        return false;
      }
      attemptedSnapshot = {
        ...snapshot,
        observedAt: nextSyncTimestamp(
          state.syncSnapshotState?.observedAt,
          this.volatileSyncSnapshotState?.observedAt,
        ),
      };
      if (!shouldContinue()) return false;
      this.writeState({ ...state, syncSnapshotState: attemptedSnapshot });
    } catch (error) {
      // Quota/private-mode failures cannot be durable. Preserve only the
      // fail-closed warning in this store instance so the current session is
      // still gated and informed; never treat an uncommitted healthy result as
      // recovery, and always rethrow so callers know persistence failed.
      const failClosedSnapshot = attemptedSnapshot ?? snapshot;
      if (
        failClosedSnapshot.status === "budget-exceeded" &&
        (this.volatileSyncSnapshotState === null ||
          failClosedSnapshot.generation >=
            this.volatileSyncSnapshotState.generation)
      ) {
        this.volatileSyncSnapshotState = {
          ...failClosedSnapshot,
          observedAt: nextSyncTimestamp(
            this.volatileSyncSnapshotState?.observedAt,
            failClosedSnapshot.observedAt,
          ),
        };
      }
      throw error;
    }
    this.volatileSyncSnapshotState = null;
    return true;
  }

  async getSettings(): Promise<UserSettings> {
    const state = this.readState();
    return {
      ...state.settings,
      installedSources: state.installedSources.filter(
        (source) => !source.removed,
      ),
    };
  }

  async getSyncSettings(): Promise<UserSettings> {
    const state = this.readState();
    return {
      ...state.settings,
      installedSources: state.installedSources,
    };
  }

  async updateSettings(
    updater: (current: UserSettings) => UserSettings,
  ): Promise<UserSettings> {
    let updated: UserSettings | null = null;
    this.updateState((state) => {
      const current = {
        ...state.settings,
        installedSources: state.installedSources.filter(
          (source) => !source.removed,
        ),
      };
      const candidate = updater(current);
      updated = {
        ...scalarSettings(candidate),
        installedSources: current.installedSources,
      };
      return { ...state, settings: scalarSettings(updated) };
    });
    if (!updated) throw new Error("Settings update did not run.");
    return updated;
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    this.updateState((state) => {
      return {
        ...state,
        settings: scalarSettings(settings),
      };
    });
  }

  async clearPackageCacheReferences(): Promise<void> {
    this.updateState((state) => {
      if (!state.installedSources.some(sourceHasCachedPackage)) return state;

      const installedSources = state.installedSources.map((source) =>
        clearInstalledSourcePackageCache(source),
      );
      return {
        ...state,
        installedSources,
        settings: {
          ...state.settings,
          installedSources: installedSources.filter(
            (source) => !source.removed,
          ),
        },
      };
    });
  }

  async clearAllUserData(): Promise<void> {
    this.writeState(DEFAULT_STATE);
    this.volatileSyncSnapshotState = null;
  }

  async clearAccountData(): Promise<void> {
    this.updateState((state) => ({
      ...DEFAULT_STATE,
      registries: state.registries,
    }));
    this.volatileSyncSnapshotState = null;
  }

  async hasSyncedData(): Promise<boolean> {
    return this.readState().libraryItems.length > 0;
  }

  async getInstalledSources(): Promise<InstalledSource[]> {
    return this.readState().installedSources.filter(
      (source) => !source.removed,
    );
  }

  async getInstalledSource(id: string): Promise<InstalledSource | null> {
    return (
      this.readState().installedSources.find(
        (source) => source.id === id && !source.removed,
      ) ?? null
    );
  }

  async saveInstalledSource(source: InstalledSource): Promise<void> {
    this.updateState((state) => {
      const existing = state.installedSources.find(
        (item) => item.id === source.id,
      );
      return {
        ...state,
        installedSources: [
          ...state.installedSources.filter((item) => item.id !== source.id),
          {
            ...source,
            updatedAt:
              source.updatedAt ?? nextSyncTimestamp(existing?.updatedAt),
            removed: source.removed ?? false,
          },
        ],
      };
    });
  }

  async removeInstalledSource(
    id: string,
    registryId?: string,
    updatedAt?: number,
  ): Promise<void> {
    const existing = this.readState().installedSources.find(
      (source) => source.id === id,
    );
    await this.saveInstalledSource({
      id,
      registryId: registryId ?? existing?.registryId ?? "unknown",
      version: existing?.version ?? 0,
      updatedAt: updatedAt ?? nextSyncTimestamp(existing?.updatedAt),
      removed: true,
    });
  }

  async applyInstalledSourcesSnapshot(
    sources: InstalledSource[],
  ): Promise<void> {
    this.updateState((state) => {
      const installedSources = new Map(
        state.installedSources.map((source) => [source.id, source]),
      );
      for (const source of sources) {
        const existing = installedSources.get(source.id);
        if (existing && (existing.updatedAt ?? 0) > (source.updatedAt ?? 0)) {
          continue;
        }
        installedSources.set(source.id, {
          ...source,
          updatedAt: source.updatedAt ?? nextSyncTimestamp(existing?.updatedAt),
          removed: source.removed ?? false,
        });
      }
      return { ...state, installedSources: [...installedSources.values()] };
    });
  }

  async getSourceSettings(
    sourceKey: string,
  ): Promise<LocalSourceSettings | null> {
    return (
      this.readState().sourceSettings.find(
        (settings) => settings.sourceKey === sourceKey,
      ) ?? null
    );
  }

  async saveSourceSettings(settings: LocalSourceSettings): Promise<void> {
    this.updateState((state) => ({
      ...state,
      sourceSettings: [
        ...state.sourceSettings.filter(
          (item) => item.sourceKey !== settings.sourceKey,
        ),
        { ...settings, updatedAt: settings.updatedAt ?? Date.now() },
      ],
    }));
  }

  async resetSourceSettings(sourceKey: string): Promise<void> {
    this.updateState((state) => ({
      ...state,
      sourceSettings: state.sourceSettings.filter(
        (settings) => settings.sourceKey !== sourceKey,
      ),
    }));
  }

  async getRegistries(): Promise<SourceRegistry[]> {
    return this.readState().registries;
  }

  async getRegistry(id: string): Promise<SourceRegistry | null> {
    return (
      this.readState().registries.find((registry) => registry.id === id) ?? null
    );
  }

  async saveRegistry(registry: SourceRegistry): Promise<void> {
    this.updateState((state) => ({
      ...state,
      registries: [
        ...state.registries.filter((item) => item.id !== registry.id),
        registry,
      ],
    }));
  }

  async removeRegistry(id: string): Promise<void> {
    this.updateState((state) => ({
      ...state,
      registries: state.registries.filter((registry) => registry.id !== id),
    }));
  }

  async getLibraryEntries(): Promise<LibraryEntry[]> {
    const state = this.readState();
    return state.libraryItems
      .filter((item) => item.inLibrary !== false)
      .map((item) => ({
        item,
        sources: state.sourceLinks.filter(
          (source) =>
            source.libraryItemId === item.libraryItemId && !source.removed,
        ),
      }))
      .sort((a, b) => b.item.updatedAt - a.item.updatedAt);
  }

  async getLibraryItem(
    libraryItemId: string,
  ): Promise<LocalLibraryItem | null> {
    return (
      this.readState().libraryItems.find(
        (item) => item.libraryItemId === libraryItemId,
      ) ?? null
    );
  }

  async getAllLibraryItems(options?: {
    includeRemoved?: boolean;
  }): Promise<LocalLibraryItem[]> {
    const items = this.readState().libraryItems;
    return options?.includeRemoved
      ? items
      : items.filter((item) => item.inLibrary !== false);
  }

  async getSourceLinksForItem(
    libraryItemId: string,
    options?: { includeRemoved?: boolean },
  ): Promise<LocalSourceLink[]> {
    return this.readState().sourceLinks.filter(
      (link) =>
        link.libraryItemId === libraryItemId &&
        (options?.includeRemoved || !link.removed),
    );
  }

  async getSourceLink(id: string): Promise<LocalSourceLink | null> {
    return this.readState().sourceLinks.find((link) => link.id === id) ?? null;
  }

  async getAllSourceLinks(): Promise<LocalSourceLink[]> {
    return this.readState().sourceLinks;
  }

  async saveLibraryItem(item: LocalLibraryItem): Promise<void> {
    this.updateState((state) => ({
      ...state,
      libraryItems: [
        ...state.libraryItems.filter(
          (next) => next.libraryItemId !== item.libraryItemId,
        ),
        item,
      ],
    }));
  }

  async saveLibrarySnapshot(
    items: LocalLibraryItem[],
    links: LocalSourceLink[],
  ): Promise<void> {
    this.updateState((state) => ({
      ...state,
      libraryItems: items,
      sourceLinks: links,
    }));
  }

  async removeLibraryItem(
    libraryItemId: string,
    updatedAt?: number,
  ): Promise<void> {
    this.updateState((state) => {
      const item = state.libraryItems.find(
        (entry) => entry.libraryItemId === libraryItemId,
      );
      const memberships = state.collectionItems.filter(
        (entry) => entry.libraryItemId === libraryItemId,
      );
      const now =
        updatedAt ??
        nextSyncTimestamp(
          item?.updatedAt,
          ...memberships.map((entry) => entry.updatedAt),
        );
      return {
        ...state,
        libraryItems: state.libraryItems.map((entry) =>
          entry.libraryItemId === libraryItemId
            ? { ...entry, inLibrary: false, updatedAt: now }
            : entry,
        ),
        collectionItems: state.collectionItems.map((entry) =>
          entry.libraryItemId === libraryItemId
            ? { ...entry, removed: true, updatedAt: now }
            : entry,
        ),
      };
    });
  }

  async restoreLibraryItem(
    libraryItemId: string,
    updatedAt?: number,
  ): Promise<void> {
    this.updateState((state) => {
      const item = state.libraryItems.find(
        (entry) => entry.libraryItemId === libraryItemId,
      );
      const memberships = state.collectionItems.filter(
        (entry) => entry.libraryItemId === libraryItemId,
      );
      const now =
        updatedAt ??
        nextSyncTimestamp(
          item?.updatedAt,
          ...memberships.map((entry) => entry.updatedAt),
        );
      return {
        ...state,
        libraryItems: state.libraryItems.map((entry) =>
          entry.libraryItemId === libraryItemId
            ? { ...entry, inLibrary: true, updatedAt: now }
            : entry,
        ),
        collectionItems: state.collectionItems.map((entry) =>
          entry.libraryItemId === libraryItemId && entry.removed
            ? { ...entry, removed: false, updatedAt: now }
            : entry,
        ),
      };
    });
  }

  async saveSourceLink(link: LocalSourceLink): Promise<void> {
    this.updateState((state) => ({
      ...state,
      sourceLinks: [
        ...state.sourceLinks.filter((next) => next.id !== link.id),
        link,
      ],
      pendingSyncDeletions: state.pendingSyncDeletions.filter(
        (deletion) => deletion.id !== `source-link:${link.id}`,
      ),
    }));
  }

  async removeSourceLink(
    registryId: string,
    sourceId: string,
    sourceMangaId: string,
    updatedAt?: number,
  ): Promise<void> {
    const id = makeSourceLinkId(registryId, sourceId, sourceMangaId);
    this.updateState((state) => {
      const existing = state.sourceLinks.find((link) => link.id === id);
      const deletionId = `source-link:${id}`;
      const priorDeletion = state.pendingSyncDeletions.find(
        (item) => item.id === deletionId,
      );
      const now =
        updatedAt ??
        nextSyncTimestamp(existing?.updatedAt, priorDeletion?.createdAt);
      const deletion: PendingSyncDeletion = {
        id: deletionId,
        kind: "source-link",
        generation: createPendingSyncDeletionGeneration(),
        registryId,
        sourceId,
        sourceMangaId,
        createdAt: now,
      };
      return {
        ...state,
        sourceLinks: state.sourceLinks.map((link) =>
          link.id === id ? { ...link, removed: true, updatedAt: now } : link,
        ),
        pendingSyncDeletions: [
          ...state.pendingSyncDeletions.filter(
            (item) => item.id !== deletion.id,
          ),
          deletion,
        ],
      };
    });
  }

  async getChapterProgress(
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string,
  ): Promise<LocalChapterProgress | null> {
    return (
      this.readState().chapterProgress.find(
        (entry) =>
          entry.registryId === registryId &&
          entry.sourceId === sourceId &&
          entry.sourceMangaId === mangaId &&
          entry.sourceChapterId === chapterId,
      ) ?? null
    );
  }

  async getMangaChapterProgress(
    registryId: string,
    sourceId: string,
    mangaId: string,
  ): Promise<Record<string, LocalChapterProgress>> {
    return Object.fromEntries(
      this.readState()
        .chapterProgress.filter(
          (entry) =>
            entry.registryId === registryId &&
            entry.sourceId === sourceId &&
            entry.sourceMangaId === mangaId,
        )
        .map((entry) => [entry.sourceChapterId, entry]),
    );
  }

  async getAllChapterProgress(): Promise<LocalChapterProgress[]> {
    return this.readState().chapterProgress;
  }

  async saveChapterProgress(progress: LocalChapterProgress): Promise<void> {
    this.updateState((state) => ({
      ...state,
      chapterProgress: [
        ...state.chapterProgress.filter((entry) => entry.id !== progress.id),
        mergeChapterProgressForSave(
          state.chapterProgress.find((entry) => entry.id === progress.id),
          progress,
        ),
      ],
    }));
  }

  private mergeChapterProgressBatch(
    progress: LocalChapterProgress[],
  ): ProgressSnapshotMerge<LocalChapterProgress> {
    const state = this.readState();
    const result = mergeChapterProgressSnapshot(
      state.chapterProgress,
      progress,
    );
    if (result.changed.length > 0) {
      this.writeState({ ...state, chapterProgress: result.progress });
    }
    return result;
  }

  async saveChapterProgressBatch(
    progress: LocalChapterProgress[],
  ): Promise<void> {
    this.mergeChapterProgressBatch(progress);
  }

  async applyChapterProgressSnapshot(
    progress: LocalChapterProgress[],
  ): Promise<ProgressSnapshotMerge<LocalChapterProgress>> {
    return this.mergeChapterProgressBatch(progress);
  }

  async getMangaProgress(): Promise<LocalMangaProgress[]> {
    return this.readState().mangaProgress;
  }

  async getAllMangaProgress(): Promise<LocalMangaProgress[]> {
    return this.getMangaProgress();
  }

  async saveMangaProgress(progress: LocalMangaProgress): Promise<void> {
    this.updateState((state) => ({
      ...state,
      mangaProgress: [
        ...state.mangaProgress.filter((entry) => entry.id !== progress.id),
        mergeMangaProgressForSave(
          state.mangaProgress.find((entry) => entry.id === progress.id),
          progress,
        ),
      ],
    }));
  }

  private mergeMangaProgressBatch(
    progress: LocalMangaProgress[],
  ): ProgressSnapshotMerge<LocalMangaProgress> {
    const state = this.readState();
    const result = mergeMangaProgressSnapshot(state.mangaProgress, progress);
    if (result.changed.length > 0) {
      this.writeState({ ...state, mangaProgress: result.progress });
    }
    return result;
  }

  async saveMangaProgressBatch(progress: LocalMangaProgress[]): Promise<void> {
    this.mergeMangaProgressBatch(progress);
  }

  async applyMangaProgressSnapshot(
    progress: LocalMangaProgress[],
  ): Promise<ProgressSnapshotMerge<LocalMangaProgress>> {
    return this.mergeMangaProgressBatch(progress);
  }

  async getCollections(): Promise<LocalCollection[]> {
    return this.readState().collections;
  }

  async getCollection(collectionId: string): Promise<LocalCollection | null> {
    return (
      this.readState().collections.find(
        (collection) => collection.collectionId === collectionId,
      ) ?? null
    );
  }

  async getCollectionItems(): Promise<LocalCollectionItem[]> {
    return this.readState().collectionItems;
  }

  async saveCollectionsSnapshot(
    collections: LocalCollection[],
    collectionItems: LocalCollectionItem[],
  ): Promise<void> {
    this.updateState((state) => ({
      ...state,
      collections,
      collectionItems,
    }));
  }

  async saveCollection(collection: LocalCollection): Promise<void> {
    this.updateState((state) => ({
      ...state,
      collections: [
        ...state.collections.filter(
          (item) => item.collectionId !== collection.collectionId,
        ),
        collection,
      ],
      pendingSyncDeletions: state.pendingSyncDeletions.filter(
        (deletion) => deletion.id !== `collection:${collection.collectionId}`,
      ),
    }));
  }

  async removeCollection(
    collectionId: string,
    updatedAt?: number,
  ): Promise<void> {
    this.updateState((state) => {
      const collection = state.collections.find(
        (item) => item.collectionId === collectionId,
      );
      const items = state.collectionItems.filter(
        (item) => item.collectionId === collectionId,
      );
      const deletionId = `collection:${collectionId}`;
      const priorDeletion = state.pendingSyncDeletions.find(
        (item) => item.id === deletionId,
      );
      const now =
        updatedAt ??
        nextSyncTimestamp(
          collection?.updatedAt,
          priorDeletion?.createdAt,
          ...items.map((item) => item.updatedAt),
        );
      const deletion: PendingSyncDeletion = {
        id: deletionId,
        kind: "collection",
        generation: createPendingSyncDeletionGeneration(),
        collectionId,
        createdAt: now,
      };
      return {
        ...state,
        collections: state.collections.map((item) =>
          item.collectionId === collectionId
            ? { ...item, removed: true, updatedAt: now }
            : item,
        ),
        collectionItems: state.collectionItems.map((item) =>
          item.collectionId === collectionId
            ? { ...item, removed: true, updatedAt: now }
            : item,
        ),
        pendingSyncDeletions: [
          ...state.pendingSyncDeletions.filter(
            (item) => item.id !== deletion.id,
          ),
          deletion,
        ],
      };
    });
  }

  async getPendingSyncDeletions(): Promise<PendingSyncDeletion[]> {
    return this.readState().pendingSyncDeletions;
  }

  async clearPendingSyncDeletion(deletion: PendingSyncDeletion): Promise<void> {
    const expected = JSON.stringify(deletion);
    this.updateState((state) => ({
      ...state,
      pendingSyncDeletions: state.pendingSyncDeletions.filter(
        (item) => item.id !== deletion.id || JSON.stringify(item) !== expected,
      ),
    }));
  }

  async addCollectionItems(
    collectionId: string,
    libraryItemIds: string[],
    updatedAt?: number,
  ): Promise<void> {
    this.updateState((state) => {
      if (
        !state.collections.some(
          (collection) =>
            collection.collectionId === collectionId && !collection.removed,
        )
      ) {
        return state;
      }
      const nextItems = state.collectionItems.filter(
        (item) =>
          !libraryItemIds.includes(item.libraryItemId) ||
          item.collectionId !== collectionId,
      );
      const observed = state.collectionItems
        .filter(
          (item) =>
            item.collectionId === collectionId &&
            libraryItemIds.includes(item.libraryItemId),
        )
        .map((item) => item.updatedAt);
      const now = updatedAt ?? nextSyncTimestamp(...observed);
      return {
        ...state,
        collectionItems: [
          ...nextItems,
          ...libraryItemIds.map((libraryItemId) => {
            const existing = state.collectionItems.find(
              (item) =>
                item.collectionId === collectionId &&
                item.libraryItemId === libraryItemId,
            );
            return {
              collectionId,
              libraryItemId,
              addedAt: existing?.addedAt ?? now,
              updatedAt: now,
              removed: false,
            };
          }),
        ],
      };
    });
  }

  async removeCollectionItems(
    collectionId: string,
    libraryItemIds: string[],
    updatedAt?: number,
  ): Promise<void> {
    const ids = new Set(
      libraryItemIds.map((libraryItemId) =>
        makeCollectionItemId(collectionId, libraryItemId),
      ),
    );
    this.updateState((state) => {
      const existingItems = state.collectionItems.filter((item) =>
        ids.has(makeCollectionItemId(item.collectionId, item.libraryItemId)),
      );
      const now =
        updatedAt ??
        nextSyncTimestamp(...existingItems.map((item) => item.updatedAt));
      return {
        ...state,
        collectionItems: [
          ...state.collectionItems.filter(
            (item) =>
              !ids.has(
                makeCollectionItemId(item.collectionId, item.libraryItemId),
              ),
          ),
          ...libraryItemIds.map((libraryItemId) => {
            const existing = existingItems.find(
              (item) =>
                item.collectionId === collectionId &&
                item.libraryItemId === libraryItemId,
            );
            return {
              collectionId,
              libraryItemId,
              addedAt: existing?.addedAt ?? now,
              updatedAt: now,
              removed: true,
            };
          }),
        ],
      };
    });
  }
}
