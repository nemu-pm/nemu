/**
 * ConvexTransport implementation (sync.md)
 *
 * Implements SyncTransport using Convex queries/mutations.
 *
 * Features:
 * - Uses composite cursor { updatedAt: number, cursorId: string }
 * - All sync types include cursorId for idempotent upserts
 * - Reactive subscriptions use Convex's useQuery
 * - Push operations use existing mutations
 */

import { useQuery } from "convex/react";
import type { ConvexReactClient } from "convex/react";
import { api } from "../../convex/_generated/api";
import type {
  SyncTransport,
  SyncLibraryItem,
  SyncLibrarySourceLink,
  SyncChapterProgress,
  SyncMangaProgress,
  PaginatedResponse,
  SyncAllResponse,
  PushLibraryItem,
  PushLibrarySourceLink,
  PushChapterProgress,
  SubscriptionHook,
  CompositeCursor,
  CloudLibraryItem,
  CloudSettings,
  CloudHistoryEntry,
} from "./transport";
import type { UserSettings } from "@/data/schema";

// ============================================================================
// Subscription hooks (use Convex useQuery)
// ============================================================================

/**
 * Hook to subscribe to library items since cursor.
 * Uses Convex reactive query under the hood.
 */
export const useConvexLibraryItemsSince: SubscriptionHook<
  { cursor: CompositeCursor; limit?: number },
  PaginatedResponse<SyncLibraryItem>
> = (args) => {
  return useQuery(
    api.sync.libraryItemsListSince,
    args === "skip" ? "skip" : { cursor: args.cursor, limit: args.limit }
  );
};

/**
 * Hook to subscribe to source links since cursor.
 */
export const useConvexSourceLinksSince: SubscriptionHook<
  { cursor: CompositeCursor; limit?: number },
  PaginatedResponse<SyncLibrarySourceLink>
> = (args) => {
  return useQuery(
    api.sync.librarySourceLinksListSince,
    args === "skip" ? "skip" : { cursor: args.cursor, limit: args.limit }
  );
};

/**
 * Hook to subscribe to chapter progress since cursor.
 */
export const useConvexChapterProgressSince: SubscriptionHook<
  { cursor: CompositeCursor; limit?: number },
  PaginatedResponse<SyncChapterProgress>
> = (args) => {
  return useQuery(
    api.sync.chapterProgressListSince,
    args === "skip" ? "skip" : { cursor: args.cursor, limit: args.limit }
  );
};

/**
 * Hook to subscribe to manga progress since cursor.
 */
export const useConvexMangaProgressSince: SubscriptionHook<
  { cursor: CompositeCursor; limit?: number },
  PaginatedResponse<SyncMangaProgress>
> = (args) => {
  return useQuery(
    api.sync.mangaProgressListSince,
    args === "skip" ? "skip" : { cursor: args.cursor, limit: args.limit }
  );
};

// ============================================================================
// Legacy full-snapshot hooks
// ============================================================================

/**
 * Hook to get full library (legacy).
 */
export const useConvexLibrary: SubscriptionHook<
  Record<string, never>,
  CloudLibraryItem[]
> = (args) => {
  const result = useQuery(api.library.list, args === "skip" ? "skip" : {});
  if (result === undefined) return undefined;

  // Legacy compat: very old rows may not have `metadata` yet (top-level `title`/`cover` existed historically).
  // We normalize here so the legacy type stays stable, and so callers don't crash on missing metadata.
  return result
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((doc: any): CloudLibraryItem | null => {
      const metadata =
        doc.metadata ??
        (doc.title
          ? {
              title: doc.title as string,
              cover: doc.cover as string | undefined,
            }
          : null);

      if (!metadata) return null;

      return {
        mangaId: doc.mangaId,
        addedAt: doc.addedAt,
        metadata,
        overrides: doc.overrides,
        coverCustom: doc.coverCustom,
        externalIds: doc.externalIds,
        sources: doc.sources,
        updatedAt: doc.updatedAt,
        deletedAt: doc.deletedAt,
      };
    })
    .filter((x): x is CloudLibraryItem => x !== null);
};

/**
 * Hook to get settings (legacy).
 */
export const useConvexSettings: SubscriptionHook<
  Record<string, never>,
  CloudSettings
> = (args) => {
  return useQuery(api.settings.get, args === "skip" ? "skip" : {});
};

/**
 * Hook to get history since cursor (legacy).
 */
export const useConvexHistorySince: SubscriptionHook<
  { cursor: number; limit?: number },
  { entries: CloudHistoryEntry[]; nextCursor?: number; hasMore: boolean }
> = (args) => {
  return useQuery(
    api.history.listSince,
    args === "skip" ? "skip" : { cursor: args.cursor, limit: args.limit }
  );
};

/**
 * Hook to get OAuth provider.
 */
export const useConvexOAuthProvider: SubscriptionHook<
  Record<string, never>,
  string | null
> = (args) => {
  return useQuery(api.auth.getOAuthProvider, args === "skip" ? "skip" : {});
};

// ============================================================================
// ConvexTransport class
// ============================================================================

export class ConvexTransport implements SyncTransport {
  private convex: ConvexReactClient | null = null;
  private ready = false;

  // Incremental subscription hooks
  useLibraryItemsSince = useConvexLibraryItemsSince;
  useSourceLinksSince = useConvexSourceLinksSince;
  useChapterProgressSince = useConvexChapterProgressSince;
  useMangaProgressSince = useConvexMangaProgressSince;

  // Legacy full-snapshot hooks
  useLibrary = useConvexLibrary;
  useSettings = useConvexSettings;
  useHistorySince = useConvexHistorySince;
  useOAuthProvider = useConvexOAuthProvider;

  constructor(convex?: ConvexReactClient) {
    if (convex) {
      this.convex = convex;
      this.ready = true;
    }
  }

  // ============ Lifecycle ============

  async start(): Promise<void> {
    // Convex client is passed in constructor
    this.ready = this.convex !== null;
  }

  async stop(): Promise<void> {
    this.ready = false;
  }

  isReady(): boolean {
    return this.ready && this.convex !== null;
  }

  setConvex(convex: ConvexReactClient | null): void {
    this.convex = convex;
    this.ready = convex !== null;
  }

  // ============ One-shot Pull (server → client) ============

  async pullLibraryItems(
    cursor: CompositeCursor,
    limit?: number
  ): Promise<PaginatedResponse<SyncLibraryItem>> {
    if (!this.convex) throw new Error("ConvexTransport not initialized");

    const result = await this.convex.query(api.sync.libraryItemsListSince, {
      cursor,
      limit,
    });

    return {
      entries: result.entries,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async pullSourceLinks(
    cursor: CompositeCursor,
    limit?: number
  ): Promise<PaginatedResponse<SyncLibrarySourceLink>> {
    if (!this.convex) throw new Error("ConvexTransport not initialized");

    const result = await this.convex.query(api.sync.librarySourceLinksListSince, {
      cursor,
      limit,
    });

    return {
      entries: result.entries,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async pullChapterProgress(
    cursor: CompositeCursor,
    limit?: number
  ): Promise<PaginatedResponse<SyncChapterProgress>> {
    if (!this.convex) throw new Error("ConvexTransport not initialized");

    const result = await this.convex.query(api.sync.chapterProgressListSince, {
      cursor,
      limit,
    });

    return {
      entries: result.entries,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async pullMangaProgress(
    cursor: CompositeCursor,
    limit?: number
  ): Promise<PaginatedResponse<SyncMangaProgress>> {
    if (!this.convex) throw new Error("ConvexTransport not initialized");

    const result = await this.convex.query(api.sync.mangaProgressListSince, {
      cursor,
      limit,
    });

    return {
      entries: result.entries,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async pullAll(cursor: CompositeCursor, limit?: number): Promise<SyncAllResponse> {
    if (!this.convex) throw new Error("ConvexTransport not initialized");

    const result = await this.convex.query(api.sync.getAllSince, {
      cursor,
      limit,
    });

    return {
      libraryItems: result.libraryItems,
      sourceLinks: result.sourceLinks,
      chapterProgress: result.chapterProgress,
      mangaProgress: result.mangaProgress,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    };
  }

  async pullSettings(): Promise<UserSettings> {
    if (!this.convex) throw new Error("ConvexTransport not initialized");
    const result = await this.convex.query(api.settings.get, {});
    return { installedSources: result.installedSources ?? [] };
  }

  // ============ Push (client → server) ============

  /**
   * Push a library item.
   * Uses existing library.save mutation (which dual-writes to new tables).
   */
  async pushLibraryItem(item: PushLibraryItem): Promise<void> {
    if (!this.convex) throw new Error("ConvexTransport not initialized");

    // The mutation dual-writes to library_items with normalized overrides shape
    // Note: server always sets inLibrary=true on save (saving = add/re-add)
    await this.convex.mutation(api.library.save, {
      mangaId: item.libraryItemId,
      addedAt: item.createdAt,
      metadata: item.metadata,
      normalizedOverrides: item.overrides,
      externalIds: item.externalIds,
      inLibraryClock: item.inLibraryClock,
      sources: [], // Source links pushed separately
      sourcesMode: "merge",
    });
  }

  /**
   * Push a library source link.
   * Uses existing library.save mutation to update sources.
   */
  async pushSourceLink(link: PushLibrarySourceLink): Promise<void> {
    if (!this.convex) throw new Error("ConvexTransport not initialized");

    // Fetch the current library item to get metadata
    const existing = await this.convex.query(api.library.get, {
      mangaId: link.libraryItemId,
    });

    if (!existing) {
      // Library item doesn't exist yet, skip (it will be pushed with pushLibraryItem)
      console.warn(
        `[ConvexTransport] pushSourceLink: library item ${link.libraryItemId} not found`
      );
      return;
    }

    // Legacy compat: old rows may not have structured metadata yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legacy = existing as any;
    const metadata =
      existing.metadata ??
      (legacy.title
        ? {
            title: legacy.title as string,
            cover: legacy.cover as string | undefined,
          }
        : null);

    if (!metadata) {
      console.warn(
        `[ConvexTransport] pushSourceLink: library item ${link.libraryItemId} missing metadata`
      );
      return;
    }

    // Add/update this source link
    await this.convex.mutation(api.library.save, {
      mangaId: link.libraryItemId,
      addedAt: existing.addedAt,
      metadata,
      overrides: existing.overrides,
      coverCustom: existing.coverCustom,
      externalIds: existing.externalIds,
      sources: [
        {
          registryId: link.registryId,
          sourceId: link.sourceId,
          mangaId: link.sourceMangaId,
          latestChapter: link.latestChapter,
          updateAcknowledged: link.updateAckChapter,
        },
      ],
      sourcesMode: "merge",
    });
  }

  /**
   * Push chapter progress.
   * Uses existing history.save mutation (which dual-writes to chapter_progress and manga_progress).
   */
  async pushChapterProgress(progress: PushChapterProgress): Promise<void> {
    if (!this.convex) throw new Error("ConvexTransport not initialized");

    await this.convex.mutation(api.history.save, {
      registryId: progress.registryId,
      sourceId: progress.sourceId,
      mangaId: progress.sourceMangaId,
      chapterId: progress.sourceChapterId,
      progress: progress.progress,
      total: progress.total,
      completed: progress.completed,
      dateRead: progress.lastReadAt,
      chapterNumber: progress.chapterNumber,
      volumeNumber: progress.volumeNumber,
      chapterTitle: progress.chapterTitle,
    });
  }

  async pushSettings(settings: UserSettings): Promise<void> {
    if (!this.convex) throw new Error("ConvexTransport not initialized");
    await this.convex.mutation(api.settings.save, settings);
  }

  /**
   * Delete a library item (soft delete).
   */
  async deleteLibraryItem(libraryItemId: string, inLibraryClock: string): Promise<void> {
    if (!this.convex) throw new Error("ConvexTransport not initialized");

    await this.convex.mutation(api.library.remove, {
      mangaId: libraryItemId,
      inLibraryClock,
    });
  }

  /**
   * Delete a library source link.
   * Fetches the library item and saves it without the specified source.
   */
  async deleteSourceLink(
    libraryItemId: string,
    registryId: string,
    sourceId: string,
    sourceMangaId: string
  ): Promise<void> {
    if (!this.convex) throw new Error("ConvexTransport not initialized");

    // Fetch the current library item
    const existing = await this.convex.query(api.library.get, {
      mangaId: libraryItemId,
    });

    if (!existing) {
      // Library item doesn't exist, nothing to delete
      return;
    }

    // Legacy compat: old rows may not have structured metadata yet.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const legacy = existing as any;
    const metadata =
      existing.metadata ??
      (legacy.title
        ? {
            title: legacy.title as string,
            cover: legacy.cover as string | undefined,
          }
        : null);

    if (!metadata) {
      console.warn(
        `[ConvexTransport] deleteSourceLink: library item ${libraryItemId} missing metadata`
      );
      return;
    }

    // Filter out the source link to delete
    const sourceKey = `${registryId}:${sourceId}:${sourceMangaId}`;
    const filteredSources = existing.sources.filter(
      (s) => `${s.registryId}:${s.sourceId}:${s.mangaId}` !== sourceKey
    );

    // If no sources would remain, don't remove (keep at least one)
    if (filteredSources.length === 0) {
      console.warn(
        `[ConvexTransport] deleteSourceLink: cannot remove last source from ${libraryItemId}`
      );
      return;
    }

    // Save with filtered sources using "replace" mode
    await this.convex.mutation(api.library.save, {
      mangaId: libraryItemId,
      addedAt: existing.addedAt,
      metadata,
      overrides: existing.overrides,
      coverCustom: existing.coverCustom,
      externalIds: existing.externalIds,
      sources: filteredSources,
      sourcesMode: "replace",
    });
  }
}

