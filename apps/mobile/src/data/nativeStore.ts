import type { SQLiteDatabase } from "expo-sqlite";
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
  makeChapterProgressId,
  makeCollectionItemId,
  makeSourceLinkId,
} from "./schema";
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
  mergeCollectionSnapshot,
  mergeChapterProgressSnapshot,
  mergeLibrarySnapshot,
  mergeMangaProgressSnapshot,
  nextSyncTimestamp,
  type ProgressSnapshotMerge,
} from "@nemu/core";
import {
  createPendingSyncDeletionGeneration,
  type CollectionsSnapshotApplyResult,
  type LibrarySnapshotApplyResult,
  type PendingSyncDeletion,
} from "./storeTypes";

type JsonRow = {
  json: string;
};

type SyncHealthRow = JsonRow & {
  updatedAt: number;
};

function decodeMobileSyncSnapshotState(
  row: JsonRow | null | undefined,
): MobileSyncSnapshotState | null {
  if (!row) return null;
  const value: unknown = JSON.parse(row.json);
  if (!isMobileSyncSnapshotState(value)) {
    throw new TypeError("Invalid mobile sync snapshot state.");
  }
  return value;
}

type SQLiteExecutor = Pick<
  SQLiteDatabase,
  "execAsync" | "getAllAsync" | "getFirstAsync" | "runAsync"
>;

const DEFAULT_SETTINGS: UserSettings = {
  installedSources: [],
};

let nativeStoreWriteQueue: Promise<unknown> = Promise.resolve();

function encodeJson(value: unknown): string {
  return JSON.stringify(value);
}

function decodeJson<T>(row: JsonRow | null | undefined): T | null {
  if (!row) return null;
  return JSON.parse(row.json) as T;
}

function decodeJsonRows<T>(rows: JsonRow[]): T[] {
  return rows.map((row) => JSON.parse(row.json) as T);
}

function boolToInt(value: boolean | undefined): number {
  return value === false ? 0 : 1;
}

function sortSourcesForEntry(
  item: LocalLibraryItem,
  sources: LocalSourceLink[],
) {
  const positions = item.sourceOrder?.length
    ? new Map(item.sourceOrder.map((id, index) => [id, index]))
    : null;

  return [...sources].sort((a, b) => {
    if (positions) {
      const aPos = positions.get(a.id);
      const bPos = positions.get(b.id);
      if (aPos !== undefined && bPos !== undefined) return aPos - bPos;
      if (aPos !== undefined) return -1;
      if (bPos !== undefined) return 1;
    }
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.id.localeCompare(b.id);
  });
}

export class NativeUserDataStore {
  constructor(private readonly db: SQLiteDatabase) {}

  private async runWrite<T>(operation: () => Promise<T>): Promise<T> {
    const task = nativeStoreWriteQueue.then(operation);
    nativeStoreWriteQueue = task.catch(() => undefined);
    return task;
  }

  private async runTransaction(
    operation: (txn: SQLiteExecutor) => Promise<void>,
  ): Promise<void> {
    await this.runWrite(() =>
      this.db.withExclusiveTransactionAsync((txn) => operation(txn)),
    );
  }

  private async putInstalledSource(
    db: SQLiteExecutor,
    source: InstalledSource,
  ): Promise<void> {
    const updated: InstalledSource = {
      ...source,
      updatedAt: source.updatedAt ?? nextSyncTimestamp(),
      removed: source.removed ?? false,
    };
    await db.runAsync(
      `INSERT OR REPLACE INTO installed_sources
        (id, registryId, version, updatedAt, removed, json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      updated.id,
      updated.registryId,
      updated.version,
      updated.updatedAt ?? null,
      updated.removed ? 1 : 0,
      encodeJson(updated),
    );
  }

  private async putLibraryItem(
    db: SQLiteExecutor,
    item: LocalLibraryItem,
  ): Promise<void> {
    await db.runAsync(
      `INSERT OR REPLACE INTO library_items
        (libraryItemId, title, inLibrary, createdAt, updatedAt, json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      item.libraryItemId,
      item.overrides?.metadata?.title ?? item.metadata.title,
      boolToInt(item.inLibrary),
      item.createdAt,
      item.updatedAt,
      encodeJson(item),
    );
  }

  private async putSourceLink(
    db: SQLiteExecutor,
    link: LocalSourceLink,
  ): Promise<void> {
    await db.runAsync(
      `INSERT OR REPLACE INTO source_links
        (id, libraryItemId, registryId, sourceId, sourceMangaId, createdAt, updatedAt, json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      link.id,
      link.libraryItemId,
      link.registryId,
      link.sourceId,
      link.sourceMangaId,
      link.createdAt,
      link.updatedAt,
      encodeJson(link),
    );
  }

  private async getAllChapterProgressFrom(
    db: SQLiteExecutor,
  ): Promise<LocalChapterProgress[]> {
    const rows = await db.getAllAsync<JsonRow>(
      "SELECT json FROM chapter_progress ORDER BY lastReadAt DESC",
    );
    return decodeJsonRows<LocalChapterProgress>(rows);
  }

  private async putChapterProgress(
    db: SQLiteExecutor,
    progress: LocalChapterProgress,
  ): Promise<void> {
    await db.runAsync(
      `INSERT OR REPLACE INTO chapter_progress
        (id, registryId, sourceId, sourceMangaId, sourceChapterId, libraryItemId,
         progress, total, completed, lastReadAt, updatedAt, json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      progress.id,
      progress.registryId,
      progress.sourceId,
      progress.sourceMangaId,
      progress.sourceChapterId,
      progress.libraryItemId ?? null,
      progress.progress,
      progress.total,
      progress.completed ? 1 : 0,
      progress.lastReadAt,
      progress.updatedAt,
      encodeJson(progress),
    );
  }

  private async getMangaProgressFrom(
    db: SQLiteExecutor,
  ): Promise<LocalMangaProgress[]> {
    const rows = await db.getAllAsync<JsonRow>(
      "SELECT json FROM manga_progress ORDER BY lastReadAt DESC",
    );
    return decodeJsonRows<LocalMangaProgress>(rows);
  }

  private async putMangaProgress(
    db: SQLiteExecutor,
    progress: LocalMangaProgress,
  ): Promise<void> {
    await db.runAsync(
      `INSERT OR REPLACE INTO manga_progress
        (id, registryId, sourceId, sourceMangaId, libraryItemId, lastReadAt, updatedAt, json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      progress.id,
      progress.registryId,
      progress.sourceId,
      progress.sourceMangaId,
      progress.libraryItemId ?? null,
      progress.lastReadAt,
      progress.updatedAt,
      encodeJson(progress),
    );
  }

  private async putCollection(
    db: SQLiteExecutor,
    collection: LocalCollection,
  ): Promise<void> {
    await db.runAsync(
      "INSERT OR REPLACE INTO collections (collectionId, name, createdAt, updatedAt, json) VALUES (?, ?, ?, ?, ?)",
      collection.collectionId,
      collection.name,
      collection.createdAt,
      collection.updatedAt,
      encodeJson(collection),
    );
  }

  private async putCollectionItem(
    db: SQLiteExecutor,
    item: LocalCollectionItem,
  ): Promise<void> {
    await db.runAsync(
      `INSERT OR REPLACE INTO collection_items
        (id, collectionId, libraryItemId, addedAt, updatedAt, json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      makeCollectionItemId(item.collectionId, item.libraryItemId),
      item.collectionId,
      item.libraryItemId,
      item.addedAt,
      item.updatedAt,
      encodeJson(item),
    );
  }

  async getSyncGeneration(): Promise<number | null> {
    const row = await this.db.getFirstAsync<{ generation: number }>(
      "SELECT generation FROM sync_state WHERE id = ?",
      "cloud",
    );
    return row?.generation ?? null;
  }

  async applySyncGeneration(
    generation: number,
  ): Promise<ReturnType<typeof decideSyncGeneration>> {
    let decision: ReturnType<typeof decideSyncGeneration> = "stale";
    await this.runTransaction(async (txn) => {
      const row = await txn.getFirstAsync<{ generation: number }>(
        "SELECT generation FROM sync_state WHERE id = ?",
        "cloud",
      );
      decision = decideSyncGeneration(row?.generation ?? null, generation);
      if (decision === "stale" || decision === "current") return;

      if (decision === "reset") {
        const settingsRow = await txn.getFirstAsync<JsonRow>(
          "SELECT json FROM settings WHERE id = ?",
          "user",
        );
        const settings = decodeJson<UserSettings>(settingsRow);
        await txn.execAsync(`
DELETE FROM installed_sources;
DELETE FROM library_items;
DELETE FROM source_links;
DELETE FROM chapter_progress;
DELETE FROM manga_progress;
DELETE FROM collections;
DELETE FROM collection_items;
DELETE FROM pending_sync_deletions;
DELETE FROM sync_health;
`);
        if (settings) {
          await txn.runAsync(
            "UPDATE settings SET json = ? WHERE id = ?",
            encodeJson({ ...settings, installedSources: [] }),
            "user",
          );
        }
      }

      await txn.runAsync(
        "INSERT OR REPLACE INTO sync_state (id, generation) VALUES (?, ?)",
        "cloud",
        generation,
      );
    });
    return decision;
  }

  async getSyncSnapshotState(): Promise<MobileSyncSnapshotState | null> {
    const row = await this.db.getFirstAsync<JsonRow>(
      "SELECT json FROM sync_health WHERE id = ?",
      "cloud",
    );
    return decodeMobileSyncSnapshotState(row);
  }

  async recordSyncSnapshotState(
    state: MobileSyncSnapshotState,
    shouldContinue: () => boolean = () => true,
  ): Promise<boolean> {
    if (!isMobileSyncSnapshotState(state)) {
      throw new TypeError("Invalid mobile sync snapshot state.");
    }

    let accepted = false;
    await this.runTransaction(async (txn) => {
      if (!shouldContinue()) return;
      const generationRow = await txn.getFirstAsync<{ generation: number }>(
        "SELECT generation FROM sync_state WHERE id = ?",
        "cloud",
      );
      if (
        generationRow?.generation !== undefined &&
        state.generation < generationRow.generation
      ) {
        return;
      }

      const existingRow = await txn.getFirstAsync<SyncHealthRow>(
        "SELECT json, updatedAt FROM sync_health WHERE id = ?",
        "cloud",
      );
      const existing = decodeMobileSyncSnapshotState(existingRow);
      if (existing && state.generation < existing.generation) {
        return;
      }
      if (!shouldContinue()) return;

      // Commit order, not wall-clock order, decides same-generation health.
      // A device clock corrected from the future must never keep a later
      // successful retry behind an older budget warning. The durable SQLite
      // sequence advances monotonically inside this exclusive transaction.
      const updatedAt = nextSyncTimestamp(
        existingRow?.updatedAt,
        existing?.observedAt,
      );
      const committedState = { ...state, observedAt: updatedAt };
      await txn.runAsync(
        `INSERT OR REPLACE INTO sync_health (id, json, updatedAt)
         VALUES (?, ?, ?)`,
        "cloud",
        encodeJson(committedState),
        updatedAt,
      );
      accepted = true;
    });
    return accepted;
  }

  async getSettings(): Promise<UserSettings> {
    const row = await this.db.getFirstAsync<JsonRow>(
      "SELECT json FROM settings WHERE id = ?",
      "user",
    );
    const settings = decodeJson<UserSettings>(row) ?? DEFAULT_SETTINGS;
    return {
      ...settings,
      installedSources: await this.getInstalledSources(),
    };
  }

  async getSyncSettings(): Promise<UserSettings> {
    const row = await this.db.getFirstAsync<JsonRow>(
      "SELECT json FROM settings WHERE id = ?",
      "user",
    );
    const settings = decodeJson<UserSettings>(row) ?? DEFAULT_SETTINGS;
    return {
      ...settings,
      installedSources: await this.getAllInstalledSources(),
    };
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    await this.runTransaction(async (txn) => {
      await txn.runAsync(
        "INSERT OR REPLACE INTO settings (id, json, updatedAt) VALUES (?, ?, ?)",
        "user",
        encodeJson(settings),
        Date.now(),
      );
      for (const source of settings.installedSources) {
        await this.putInstalledSource(txn, source);
      }
    });
  }

  async clearPackageCacheReferences(): Promise<void> {
    const sources = await this.getInstalledSources();
    const cachedSources = sources.filter(sourceHasCachedPackage);
    if (cachedSources.length === 0) return;

    await this.runTransaction(async (txn) => {
      for (const source of cachedSources) {
        await this.putInstalledSource(
          txn,
          clearInstalledSourcePackageCache(source),
        );
      }
    });
  }

  async clearAllUserData(): Promise<void> {
    await this.runTransaction(async (txn) => {
      await txn.execAsync(`
DELETE FROM settings;
DELETE FROM installed_sources;
DELETE FROM source_settings;
DELETE FROM registries;
DELETE FROM library_items;
DELETE FROM source_links;
DELETE FROM chapter_progress;
DELETE FROM manga_progress;
DELETE FROM collections;
DELETE FROM collection_items;
DELETE FROM pending_sync_deletions;
DELETE FROM sync_state;
DELETE FROM sync_health;
`);
    });
  }

  async clearAccountData(): Promise<void> {
    await this.runTransaction(async (txn) => {
      await txn.execAsync(`
DELETE FROM settings;
DELETE FROM installed_sources;
DELETE FROM source_settings;
DELETE FROM library_items;
DELETE FROM source_links;
DELETE FROM chapter_progress;
DELETE FROM manga_progress;
DELETE FROM collections;
DELETE FROM collection_items;
DELETE FROM pending_sync_deletions;
DELETE FROM sync_state;
DELETE FROM sync_health;
`);
    });
  }

  async hasSyncedData(): Promise<boolean> {
    const row = await this.db.getFirstAsync<{ count: number }>(
      "SELECT COUNT(*) AS count FROM library_items",
    );
    return (row?.count ?? 0) > 0;
  }

  async getInstalledSources(): Promise<InstalledSource[]> {
    const rows = await this.db.getAllAsync<JsonRow>(
      "SELECT json FROM installed_sources WHERE removed = 0 ORDER BY updatedAt DESC, id ASC",
    );
    return decodeJsonRows<InstalledSource>(rows);
  }

  private async getAllInstalledSources(): Promise<InstalledSource[]> {
    const rows = await this.db.getAllAsync<JsonRow>(
      "SELECT json FROM installed_sources ORDER BY updatedAt DESC, id ASC",
    );
    return decodeJsonRows<InstalledSource>(rows);
  }

  async getInstalledSource(id: string): Promise<InstalledSource | null> {
    const row = await this.db.getFirstAsync<JsonRow>(
      "SELECT json FROM installed_sources WHERE id = ? AND removed = 0",
      id,
    );
    return decodeJson<InstalledSource>(row);
  }

  async saveInstalledSource(source: InstalledSource): Promise<void> {
    await this.runTransaction(async (txn) => {
      const row = await txn.getFirstAsync<JsonRow>(
        "SELECT json FROM installed_sources WHERE id = ? LIMIT 1",
        source.id,
      );
      const existing = decodeJson<InstalledSource>(row);
      await this.putInstalledSource(txn, {
        ...source,
        updatedAt: source.updatedAt ?? nextSyncTimestamp(existing?.updatedAt),
      });
    });
  }

  async removeInstalledSource(
    id: string,
    registryId?: string,
    updatedAt?: number,
  ): Promise<void> {
    const existing = (await this.getSyncSettings()).installedSources.find(
      (source) => source.id === id,
    );
    const tombstone: InstalledSource = {
      id,
      registryId:
        registryId ?? existing?.registryId ?? id.split(":")[0] ?? "unknown",
      version: existing?.version ?? 0,
      updatedAt: updatedAt ?? nextSyncTimestamp(existing?.updatedAt),
      removed: true,
    };
    await this.saveInstalledSource(tombstone);
  }

  async getSourceSettings(
    sourceKey: string,
  ): Promise<LocalSourceSettings | null> {
    const row = await this.db.getFirstAsync<JsonRow>(
      "SELECT json FROM source_settings WHERE sourceKey = ?",
      sourceKey,
    );
    return decodeJson<LocalSourceSettings>(row);
  }

  async saveSourceSettings(settings: LocalSourceSettings): Promise<void> {
    const updated: LocalSourceSettings = {
      ...settings,
      updatedAt: settings.updatedAt ?? Date.now(),
    };
    await this.runWrite(() =>
      this.db.runAsync(
        "INSERT OR REPLACE INTO source_settings (sourceKey, updatedAt, json) VALUES (?, ?, ?)",
        updated.sourceKey,
        updated.updatedAt,
        encodeJson(updated),
      ),
    );
  }

  async resetSourceSettings(sourceKey: string): Promise<void> {
    await this.runWrite(() =>
      this.db.runAsync(
        "DELETE FROM source_settings WHERE sourceKey = ?",
        sourceKey,
      ),
    );
  }

  async getRegistries(): Promise<SourceRegistry[]> {
    const rows = await this.db.getAllAsync<JsonRow>(
      "SELECT json FROM registries ORDER BY name ASC, id ASC",
    );
    return decodeJsonRows<SourceRegistry>(rows);
  }

  async getRegistry(id: string): Promise<SourceRegistry | null> {
    const row = await this.db.getFirstAsync<JsonRow>(
      "SELECT json FROM registries WHERE id = ?",
      id,
    );
    return decodeJson<SourceRegistry>(row);
  }

  async saveRegistry(registry: SourceRegistry): Promise<void> {
    await this.runWrite(() =>
      this.db.runAsync(
        "INSERT OR REPLACE INTO registries (id, name, type, url, json) VALUES (?, ?, ?, ?, ?)",
        registry.id,
        registry.name,
        registry.type,
        registry.type === "url" ? registry.url : null,
        encodeJson(registry),
      ),
    );
  }

  async removeRegistry(id: string): Promise<void> {
    await this.runWrite(() =>
      this.db.runAsync("DELETE FROM registries WHERE id = ?", id),
    );
  }

  async getLibraryEntries(): Promise<LibraryEntry[]> {
    const items = await this.getAllLibraryItems();
    const links = await this.getAllSourceLinks();
    const linksByItem = new Map<string, LocalSourceLink[]>();
    for (const link of links) {
      if (link.removed) continue;
      const list = linksByItem.get(link.libraryItemId) ?? [];
      list.push(link);
      linksByItem.set(link.libraryItemId, list);
    }

    return items
      .map((item) => ({
        item,
        sources: sortSourcesForEntry(
          item,
          linksByItem.get(item.libraryItemId) ?? [],
        ),
      }))
      .filter((entry) => entry.item.inLibrary !== false)
      .sort((a, b) => b.item.updatedAt - a.item.updatedAt);
  }

  async getLibraryItem(
    libraryItemId: string,
  ): Promise<LocalLibraryItem | null> {
    const row = await this.db.getFirstAsync<JsonRow>(
      "SELECT json FROM library_items WHERE libraryItemId = ?",
      libraryItemId,
    );
    return decodeJson<LocalLibraryItem>(row);
  }

  async getAllLibraryItems(options?: {
    includeRemoved?: boolean;
  }): Promise<LocalLibraryItem[]> {
    const rows = await this.db.getAllAsync<JsonRow>(
      options?.includeRemoved
        ? "SELECT json FROM library_items ORDER BY updatedAt DESC"
        : "SELECT json FROM library_items WHERE inLibrary = 1 ORDER BY updatedAt DESC",
    );
    return decodeJsonRows<LocalLibraryItem>(rows);
  }

  async getSourceLinksForItem(
    libraryItemId: string,
    options?: { includeRemoved?: boolean },
  ): Promise<LocalSourceLink[]> {
    const rows = await this.db.getAllAsync<JsonRow>(
      "SELECT json FROM source_links WHERE libraryItemId = ? ORDER BY createdAt ASC",
      libraryItemId,
    );
    const item = await this.getLibraryItem(libraryItemId);
    const sources = decodeJsonRows<LocalSourceLink>(rows).filter(
      (source) => options?.includeRemoved || !source.removed,
    );
    return item ? sortSourcesForEntry(item, sources) : sources;
  }

  async getSourceLink(id: string): Promise<LocalSourceLink | null> {
    const row = await this.db.getFirstAsync<JsonRow>(
      "SELECT json FROM source_links WHERE id = ? LIMIT 1",
      id,
    );
    return decodeJson<LocalSourceLink>(row);
  }

  async saveLibraryItem(item: LocalLibraryItem): Promise<void> {
    await this.runWrite(() => this.putLibraryItem(this.db, item));
  }

  async saveLibrarySnapshot(
    items: LocalLibraryItem[],
    links: LocalSourceLink[],
  ): Promise<void> {
    await this.runTransaction(async (txn) => {
      await txn.runAsync("DELETE FROM library_items");
      await txn.runAsync("DELETE FROM source_links");
      for (const item of items) {
        await this.putLibraryItem(txn, item);
      }
      for (const link of links) {
        await this.putSourceLink(txn, link);
      }
    });
  }

  async applyLibrarySnapshot(
    cloudItems: LocalLibraryItem[],
    cloudLinks: LocalSourceLink[],
  ): Promise<LibrarySnapshotApplyResult> {
    let changedItems: LocalLibraryItem[] = [];
    let changedLinks: LocalSourceLink[] = [];
    let localItemsToPush: LocalLibraryItem[] = [];
    let localLinksToPush: LocalSourceLink[] = [];
    // Read + merge + replace inside one queued transaction: a user write can
    // only run before the read (and be merged) or after the commit (and win
    // by INSERT OR REPLACE) — never between, where the old flow erased it.
    await this.runTransaction(async (txn) => {
      const localItems = decodeJsonRows<LocalLibraryItem>(
        await txn.getAllAsync<JsonRow>(
          "SELECT json FROM library_items ORDER BY updatedAt DESC",
        ),
      );
      const localLinks = decodeJsonRows<LocalSourceLink>(
        await txn.getAllAsync<JsonRow>(
          "SELECT json FROM source_links ORDER BY createdAt ASC",
        ),
      );
      const merged = mergeLibrarySnapshot(
        localItems,
        localLinks,
        cloudItems,
        cloudLinks,
      );
      await txn.runAsync("DELETE FROM library_items");
      await txn.runAsync("DELETE FROM source_links");
      for (const item of merged.items) {
        await this.putLibraryItem(txn, item);
      }
      for (const link of merged.links) {
        await this.putSourceLink(txn, link);
      }
      changedItems = merged.changedItems;
      changedLinks = merged.changedLinks;
      localItemsToPush = merged.localItemsToPush;
      localLinksToPush = merged.localLinksToPush;
    });
    return { changedItems, changedLinks, localItemsToPush, localLinksToPush };
  }

  async removeLibraryItem(
    libraryItemId: string,
    updatedAt?: number,
  ): Promise<void> {
    await this.runTransaction(async (txn) => {
      const item = await txn.getFirstAsync<JsonRow>(
        "SELECT json FROM library_items WHERE libraryItemId = ? LIMIT 1",
        libraryItemId,
      );
      const parsedItem = decodeJson<LocalLibraryItem>(item);
      const collectionRows = await txn.getAllAsync<JsonRow>(
        "SELECT json FROM collection_items WHERE libraryItemId = ?",
        libraryItemId,
      );
      const collectionItems =
        decodeJsonRows<LocalCollectionItem>(collectionRows);
      const now =
        updatedAt ??
        nextSyncTimestamp(
          parsedItem?.updatedAt,
          ...collectionItems.map((entry) => entry.updatedAt),
        );
      if (parsedItem) {
        await this.putLibraryItem(txn, {
          ...parsedItem,
          inLibrary: false,
          updatedAt: now,
        });
      }

      for (const collectionItem of collectionItems) {
        await this.putCollectionItem(txn, {
          ...collectionItem,
          removed: true,
          updatedAt: now,
        });
      }
    });
  }

  async saveSourceLink(link: LocalSourceLink): Promise<void> {
    await this.runTransaction(async (txn) => {
      await this.putSourceLink(txn, link);
      await txn.runAsync(
        "DELETE FROM pending_sync_deletions WHERE id = ?",
        `source-link:${link.id}`,
      );
    });
  }

  async removeSourceLink(
    registryId: string,
    sourceId: string,
    sourceMangaId: string,
    updatedAt?: number,
  ): Promise<void> {
    const sourceLinkId = makeSourceLinkId(registryId, sourceId, sourceMangaId);
    await this.runTransaction(async (txn) => {
      const row = await txn.getFirstAsync<JsonRow>(
        "SELECT json FROM source_links WHERE id = ? LIMIT 1",
        sourceLinkId,
      );
      const existing = decodeJson<LocalSourceLink>(row);
      const deletionId = `source-link:${sourceLinkId}`;
      const pendingRow = await txn.getFirstAsync<JsonRow>(
        "SELECT json FROM pending_sync_deletions WHERE id = ? LIMIT 1",
        deletionId,
      );
      const pending = decodeJson<PendingSyncDeletion>(pendingRow);
      const now =
        updatedAt ?? nextSyncTimestamp(existing?.updatedAt, pending?.createdAt);
      const deletion: PendingSyncDeletion = {
        id: deletionId,
        kind: "source-link",
        generation: createPendingSyncDeletionGeneration(),
        registryId,
        sourceId,
        sourceMangaId,
        createdAt: now,
      };
      if (existing) {
        await this.putSourceLink(txn, {
          ...existing,
          removed: true,
          updatedAt: now,
        });
      }
      await txn.runAsync(
        `INSERT OR REPLACE INTO pending_sync_deletions (id, kind, json, createdAt)
         VALUES (?, ?, ?, ?)`,
        deletion.id,
        deletion.kind,
        encodeJson(deletion),
        deletion.createdAt,
      );
    });
  }

  async getChapterProgress(
    registryId: string,
    sourceId: string,
    mangaId: string,
    chapterId: string,
  ): Promise<LocalChapterProgress | null> {
    const id = makeChapterProgressId(registryId, sourceId, mangaId, chapterId);
    const row = await this.db.getFirstAsync<JsonRow>(
      "SELECT json FROM chapter_progress WHERE id = ?",
      id,
    );
    return decodeJson<LocalChapterProgress>(row);
  }

  async getMangaChapterProgress(
    registryId: string,
    sourceId: string,
    mangaId: string,
  ): Promise<Record<string, LocalChapterProgress>> {
    const rows = await this.db.getAllAsync<JsonRow>(
      `SELECT json FROM chapter_progress
       WHERE registryId = ? AND sourceId = ? AND sourceMangaId = ?
       ORDER BY lastReadAt DESC`,
      registryId,
      sourceId,
      mangaId,
    );
    return Object.fromEntries(
      decodeJsonRows<LocalChapterProgress>(rows).map((entry) => [
        entry.sourceChapterId,
        entry,
      ]),
    );
  }

  async getAllChapterProgress(): Promise<LocalChapterProgress[]> {
    return this.getAllChapterProgressFrom(this.db);
  }

  async saveChapterProgress(progress: LocalChapterProgress): Promise<void> {
    await this.runWrite(async () => {
      const existing = await this.getChapterProgress(
        progress.registryId,
        progress.sourceId,
        progress.sourceMangaId,
        progress.sourceChapterId,
      );
      const merged = mergeChapterProgressForSave(existing, progress);
      await this.putChapterProgress(this.db, merged);
    });
  }

  private async mergeChapterProgressBatch(
    progress: LocalChapterProgress[],
  ): Promise<ProgressSnapshotMerge<LocalChapterProgress>> {
    let result = mergeChapterProgressSnapshot<LocalChapterProgress>([], []);
    await this.runTransaction(async (txn) => {
      const existing = await this.getAllChapterProgressFrom(txn);
      result = mergeChapterProgressSnapshot(existing, progress);
      for (const entry of result.changed) {
        await this.putChapterProgress(txn, entry);
      }
    });
    return result;
  }

  async saveChapterProgressBatch(
    progress: LocalChapterProgress[],
  ): Promise<void> {
    await this.mergeChapterProgressBatch(progress);
  }

  async getMangaProgress(): Promise<LocalMangaProgress[]> {
    return this.getMangaProgressFrom(this.db);
  }

  async getAllMangaProgress(): Promise<LocalMangaProgress[]> {
    return this.getMangaProgress();
  }

  async saveMangaProgress(progress: LocalMangaProgress): Promise<void> {
    await this.runWrite(async () => {
      const existing = (await this.getMangaProgress()).find(
        (entry) => entry.id === progress.id,
      );
      const merged = mergeMangaProgressForSave(existing, progress);
      await this.putMangaProgress(this.db, merged);
    });
  }

  private async mergeMangaProgressBatch(
    progress: LocalMangaProgress[],
  ): Promise<ProgressSnapshotMerge<LocalMangaProgress>> {
    let result = mergeMangaProgressSnapshot<LocalMangaProgress>([], []);
    await this.runTransaction(async (txn) => {
      const existing = await this.getMangaProgressFrom(txn);
      result = mergeMangaProgressSnapshot(existing, progress);
      for (const entry of result.changed) {
        await this.putMangaProgress(txn, entry);
      }
    });
    return result;
  }

  async saveMangaProgressBatch(progress: LocalMangaProgress[]): Promise<void> {
    await this.mergeMangaProgressBatch(progress);
  }

  async getCollections(): Promise<LocalCollection[]> {
    const rows = await this.db.getAllAsync<JsonRow>(
      "SELECT json FROM collections ORDER BY createdAt DESC, collectionId ASC",
    );
    return decodeJsonRows<LocalCollection>(rows);
  }

  async getCollection(collectionId: string): Promise<LocalCollection | null> {
    const row = await this.db.getFirstAsync<JsonRow>(
      "SELECT json FROM collections WHERE collectionId = ?",
      collectionId,
    );
    return decodeJson<LocalCollection>(row);
  }

  async getCollectionItems(): Promise<LocalCollectionItem[]> {
    const rows = await this.db.getAllAsync<JsonRow>(
      "SELECT json FROM collection_items ORDER BY addedAt DESC",
    );
    return decodeJsonRows<LocalCollectionItem>(rows);
  }

  async saveCollectionsSnapshot(
    collections: LocalCollection[],
    collectionItems: LocalCollectionItem[],
  ): Promise<void> {
    await this.runTransaction(async (txn) => {
      await txn.runAsync("DELETE FROM collections");
      await txn.runAsync("DELETE FROM collection_items");
      for (const collection of collections) {
        await this.putCollection(txn, collection);
      }
      for (const collectionItem of collectionItems) {
        await this.putCollectionItem(txn, collectionItem);
      }
    });
  }

  async applyCollectionsSnapshot(
    cloudCollections: LocalCollection[],
    cloudCollectionItems: LocalCollectionItem[],
  ): Promise<CollectionsSnapshotApplyResult> {
    let changedCollections: LocalCollection[] = [];
    let changedCollectionItems: LocalCollectionItem[] = [];
    let localCollectionsToPush: LocalCollection[] = [];
    let localCollectionItemsToPush: LocalCollectionItem[] = [];
    // Same atomicity contract as applyLibrarySnapshot: read + merge + replace
    // in one queued transaction so concurrent user writes can't be erased.
    await this.runTransaction(async (txn) => {
      const localCollections = decodeJsonRows<LocalCollection>(
        await txn.getAllAsync<JsonRow>(
          "SELECT json FROM collections ORDER BY createdAt DESC, collectionId ASC",
        ),
      );
      const localCollectionItems = decodeJsonRows<LocalCollectionItem>(
        await txn.getAllAsync<JsonRow>(
          "SELECT json FROM collection_items ORDER BY addedAt DESC",
        ),
      );
      const merged = mergeCollectionSnapshot(
        localCollections,
        localCollectionItems,
        cloudCollections,
        cloudCollectionItems,
      );
      await txn.runAsync("DELETE FROM collections");
      await txn.runAsync("DELETE FROM collection_items");
      for (const collection of merged.collections) {
        await this.putCollection(txn, collection);
      }
      for (const collectionItem of merged.collectionItems) {
        await this.putCollectionItem(txn, collectionItem);
      }
      changedCollections = merged.changedCollections;
      changedCollectionItems = merged.changedCollectionItems;
      localCollectionsToPush = merged.localCollectionsToPush;
      localCollectionItemsToPush = merged.localCollectionItemsToPush;
    });
    return {
      changedCollections,
      changedCollectionItems,
      localCollectionsToPush,
      localCollectionItemsToPush,
    };
  }

  async saveCollection(collection: LocalCollection): Promise<void> {
    await this.runTransaction(async (txn) => {
      await this.putCollection(txn, collection);
      await txn.runAsync(
        "DELETE FROM pending_sync_deletions WHERE id = ?",
        `collection:${collection.collectionId}`,
      );
    });
  }

  async removeCollection(
    collectionId: string,
    updatedAt?: number,
  ): Promise<void> {
    await this.runTransaction(async (txn) => {
      const collectionRow = await txn.getFirstAsync<JsonRow>(
        "SELECT json FROM collections WHERE collectionId = ? LIMIT 1",
        collectionId,
      );
      const collection = decodeJson<LocalCollection>(collectionRow);
      const itemRows = await txn.getAllAsync<JsonRow>(
        "SELECT json FROM collection_items WHERE collectionId = ?",
        collectionId,
      );
      const items = decodeJsonRows<LocalCollectionItem>(itemRows);
      const deletionId = `collection:${collectionId}`;
      const pendingRow = await txn.getFirstAsync<JsonRow>(
        "SELECT json FROM pending_sync_deletions WHERE id = ? LIMIT 1",
        deletionId,
      );
      const pending = decodeJson<PendingSyncDeletion>(pendingRow);
      const now =
        updatedAt ??
        nextSyncTimestamp(
          collection?.updatedAt,
          pending?.createdAt,
          ...items.map((item) => item.updatedAt),
        );
      const deletion: PendingSyncDeletion = {
        id: deletionId,
        kind: "collection",
        generation: createPendingSyncDeletionGeneration(),
        collectionId,
        createdAt: now,
      };
      if (collection) {
        await this.putCollection(txn, {
          ...collection,
          removed: true,
          updatedAt: now,
        });
      }
      for (const item of items) {
        await this.putCollectionItem(txn, {
          ...item,
          removed: true,
          updatedAt: now,
        });
      }
      await txn.runAsync(
        `INSERT OR REPLACE INTO pending_sync_deletions (id, kind, json, createdAt)
         VALUES (?, ?, ?, ?)`,
        deletion.id,
        deletion.kind,
        encodeJson(deletion),
        deletion.createdAt,
      );
    });
  }

  async getPendingSyncDeletions(): Promise<PendingSyncDeletion[]> {
    const rows = await this.db.getAllAsync<JsonRow>(
      "SELECT json FROM pending_sync_deletions ORDER BY createdAt ASC, id ASC",
    );
    return decodeJsonRows<PendingSyncDeletion>(rows);
  }

  async clearPendingSyncDeletion(deletion: PendingSyncDeletion): Promise<void> {
    await this.runWrite(() =>
      this.db.runAsync(
        "DELETE FROM pending_sync_deletions WHERE id = ? AND json = ?",
        deletion.id,
        encodeJson(deletion),
      ),
    );
  }

  private async getCollectionItemFrom(
    db: SQLiteExecutor,
    collectionId: string,
    libraryItemId: string,
  ): Promise<LocalCollectionItem | null> {
    const row = await db.getFirstAsync<JsonRow>(
      "SELECT json FROM collection_items WHERE id = ? LIMIT 1",
      makeCollectionItemId(collectionId, libraryItemId),
    );
    return decodeJson<LocalCollectionItem>(row);
  }

  async addCollectionItems(
    collectionId: string,
    libraryItemIds: string[],
    updatedAt?: number,
  ): Promise<void> {
    await this.runTransaction(async (txn) => {
      const collectionRow = await txn.getFirstAsync<JsonRow>(
        "SELECT json FROM collections WHERE collectionId = ? LIMIT 1",
        collectionId,
      );
      const collection = decodeJson<LocalCollection>(collectionRow);
      if (!collection || collection.removed) return;
      const existingItems = await Promise.all(
        libraryItemIds.map((libraryItemId) =>
          this.getCollectionItemFrom(txn, collectionId, libraryItemId),
        ),
      );
      const now =
        updatedAt ??
        nextSyncTimestamp(...existingItems.map((item) => item?.updatedAt));
      for (const [index, libraryItemId] of libraryItemIds.entries()) {
        // Preserve the original addedAt on re-add — the Convex counterpart
        // keeps it, and getCollectionItems orders by addedAt, so fabricating
        // a new timestamp makes item order drift across devices.
        const existing = existingItems[index];
        const item: LocalCollectionItem = {
          collectionId,
          libraryItemId,
          addedAt: existing?.addedAt ?? now,
          updatedAt: now,
          removed: false,
        };
        await this.putCollectionItem(txn, item);
      }
    });
  }

  async removeCollectionItems(
    collectionId: string,
    libraryItemIds: string[],
    updatedAt?: number,
  ): Promise<void> {
    await this.runTransaction(async (txn) => {
      const existingItems = await Promise.all(
        libraryItemIds.map((libraryItemId) =>
          this.getCollectionItemFrom(txn, collectionId, libraryItemId),
        ),
      );
      const now =
        updatedAt ??
        nextSyncTimestamp(...existingItems.map((item) => item?.updatedAt));
      for (const [index, libraryItemId] of libraryItemIds.entries()) {
        const existing = existingItems[index];
        await this.putCollectionItem(txn, {
          collectionId,
          libraryItemId,
          // Keep the row's original addedAt on the tombstone (cloud does the
          // same); only updatedAt reflects the removal.
          addedAt: existing?.addedAt ?? now,
          updatedAt: now,
          removed: true,
        });
      }
    });
  }

  async getAllSourceLinks(): Promise<LocalSourceLink[]> {
    const rows = await this.db.getAllAsync<JsonRow>(
      "SELECT json FROM source_links ORDER BY createdAt ASC",
    );
    return decodeJsonRows<LocalSourceLink>(rows);
  }

  applyChapterProgressSnapshot(
    progress: LocalChapterProgress[],
  ): Promise<ProgressSnapshotMerge<LocalChapterProgress>> {
    return this.mergeChapterProgressBatch(progress);
  }

  applyMangaProgressSnapshot(
    progress: LocalMangaProgress[],
  ): Promise<ProgressSnapshotMerge<LocalMangaProgress>> {
    return this.mergeMangaProgressBatch(progress);
  }

  async applyInstalledSourcesSnapshot(
    sources: InstalledSource[],
  ): Promise<void> {
    await this.runTransaction(async (txn) => {
      for (const source of sources) {
        // The snapshot was merged (and hydrated over the network) outside this
        // transaction, so guard by updatedAt: a source installed/updated/
        // uninstalled concurrently has a newer row that must not be rolled
        // back to the snapshot's stale view.
        const existingRow = await txn.getFirstAsync<JsonRow>(
          "SELECT json FROM installed_sources WHERE id = ? LIMIT 1",
          source.id,
        );
        const existing = decodeJson<InstalledSource>(existingRow);
        if (existing && (existing.updatedAt ?? 0) > (source.updatedAt ?? 0)) {
          continue;
        }
        await this.putInstalledSource(txn, source);
      }
    });
  }
}
