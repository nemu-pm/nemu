/**
 * NullTransport - Transport for logged-out mode (Phase 7)
 *
 * Returns empty results for pulls and no-ops for pushes.
 * Used when the user is not authenticated.
 *
 * Invariants:
 * - isReady() always returns false
 * - All pulls return empty results
 * - All pushes are no-ops (pending ops stay in queue)
 */

import type {
  SyncTransport,
  PaginatedResponse,
  SyncLibraryItem,
  SyncLibrarySourceLink,
  SyncChapterProgress,
  SyncMangaProgress,
  SyncAllResponse,
  PushLibraryItem,
  PushLibrarySourceLink,
  PushChapterProgress,
  CompositeCursor,
} from "../transport";
import type { UserSettings } from "@/data/schema";

const EMPTY_PAGINATED = <T>(): PaginatedResponse<T> => ({
  entries: [],
  hasMore: false,
});

/**
 * Null hook that always returns undefined (loading state).
 * This prevents any UI updates from null transport.
 */
const nullHook = () => undefined;

export class NullTransport implements SyncTransport {
  // Incremental subscription hooks - always return undefined (skip state)
  useLibraryItemsSince = nullHook;
  useSourceLinksSince = nullHook;
  useChapterProgressSince = nullHook;
  useMangaProgressSince = nullHook;

  // Legacy full-snapshot hooks - always return undefined
  useLibrary = nullHook;
  useSettings = nullHook;
  useHistorySince = nullHook;
  useOAuthProvider = nullHook;

  // Lifecycle
  async start(): Promise<void> {
    // No-op
  }

  async stop(): Promise<void> {
    // No-op
  }

  isReady(): boolean {
    return false;
  }

  // Pull methods - return empty results
  async pullLibraryItems(
    _cursor: CompositeCursor,
    _limit?: number
  ): Promise<PaginatedResponse<SyncLibraryItem>> {
    return EMPTY_PAGINATED();
  }

  async pullSourceLinks(
    _cursor: CompositeCursor,
    _limit?: number
  ): Promise<PaginatedResponse<SyncLibrarySourceLink>> {
    return EMPTY_PAGINATED();
  }

  async pullChapterProgress(
    _cursor: CompositeCursor,
    _limit?: number
  ): Promise<PaginatedResponse<SyncChapterProgress>> {
    return EMPTY_PAGINATED();
  }

  async pullMangaProgress(
    _cursor: CompositeCursor,
    _limit?: number
  ): Promise<PaginatedResponse<SyncMangaProgress>> {
    return EMPTY_PAGINATED();
  }

  async pullAll(_cursor: CompositeCursor, _limit?: number): Promise<SyncAllResponse> {
    return {
      libraryItems: [],
      sourceLinks: [],
      chapterProgress: [],
      mangaProgress: [],
      hasMore: false,
    };
  }

  async pullSettings(): Promise<UserSettings> {
    return { installedSources: [] };
  }

  // Push methods - no-ops (throw so pending ops stay queued)
  async pushLibraryItem(_item: PushLibraryItem): Promise<void> {
    throw new Error("NullTransport: Cannot push while offline");
  }

  async pushSourceLink(_link: PushLibrarySourceLink): Promise<void> {
    throw new Error("NullTransport: Cannot push while offline");
  }

  async pushChapterProgress(_progress: PushChapterProgress): Promise<void> {
    throw new Error("NullTransport: Cannot push while offline");
  }

  async pushSettings(_settings: UserSettings): Promise<void> {
    throw new Error("NullTransport: Cannot push while offline");
  }

  async deleteLibraryItem(_libraryItemId: string, _inLibraryClock: string): Promise<void> {
    throw new Error("NullTransport: Cannot delete while offline");
  }

  async deleteSourceLink(
    _libraryItemId: string,
    _registryId: string,
    _sourceId: string,
    _sourceMangaId: string
  ): Promise<void> {
    throw new Error("NullTransport: Cannot delete while offline");
  }
}

/**
 * Singleton instance for convenience
 */
export const nullTransport = new NullTransport();

