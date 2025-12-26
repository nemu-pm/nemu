/**
 * TestTransport - Transport for testing (Phase 7)
 *
 * Provides scripted/deterministic responses for testing sync logic.
 * Features:
 * - Scripted pages per table
 * - Push capture (append-only log)
 * - Failure injection (errors, timeouts)
 *
 * Usage:
 *   const transport = new TestTransport();
 *   transport.setLibraryItemsPages([
 *     { entries: [...], hasMore: true, nextCursor: {...} },
 *     { entries: [...], hasMore: false },
 *   ]);
 *   // ... run sync tests ...
 *   expect(transport.pushedItems).toEqual([...]);
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

type PushEvent =
  | { type: "libraryItem"; data: PushLibraryItem }
  | { type: "sourceLink"; data: PushLibrarySourceLink }
  | { type: "chapterProgress"; data: PushChapterProgress }
  | { type: "settings"; data: UserSettings }
  | { type: "deleteLibraryItem"; libraryItemId: string; inLibraryClock: string }
  | { type: "deleteSourceLink"; libraryItemId: string; registryId: string; sourceId: string; sourceMangaId: string };

/**
 * Null hook that always returns undefined (loading state).
 */
const nullHook = () => undefined;

export class TestTransport implements SyncTransport {
  private _ready = true;

  // Scripted pages for each table
  private libraryItemsPages: PaginatedResponse<SyncLibraryItem>[] = [];
  private sourceLinksPages: PaginatedResponse<SyncLibrarySourceLink>[] = [];
  private chapterProgressPages: PaginatedResponse<SyncChapterProgress>[] = [];
  private mangaProgressPages: PaginatedResponse<SyncMangaProgress>[] = [];
  private settingsSnapshot: UserSettings = { installedSources: [] };

  // Page indices (reset when pages are set)
  private libraryItemsPageIndex = 0;
  private sourceLinksPageIndex = 0;
  private chapterProgressPageIndex = 0;
  private mangaProgressPageIndex = 0;

  // Push capture
  public pushedEvents: PushEvent[] = [];

  // Failure injection
  private shouldFailNextPull = false;
  private shouldFailNextPush = false;
  private pullError: Error | null = null;
  private pushError: Error | null = null;

  // Incremental subscription hooks - return undefined (tests should use pull methods)
  useLibraryItemsSince = nullHook;
  useSourceLinksSince = nullHook;
  useChapterProgressSince = nullHook;
  useMangaProgressSince = nullHook;

  // Legacy full-snapshot hooks - return undefined
  useLibrary = nullHook;
  useSettings = nullHook;
  useHistorySince = nullHook;
  useOAuthProvider = nullHook;

  // ============================================================================
  // Configuration methods
  // ============================================================================

  setReady(ready: boolean): void {
    this._ready = ready;
  }

  setLibraryItemsPages(pages: PaginatedResponse<SyncLibraryItem>[]): void {
    this.libraryItemsPages = pages;
    this.libraryItemsPageIndex = 0;
  }

  setSourceLinksPages(pages: PaginatedResponse<SyncLibrarySourceLink>[]): void {
    this.sourceLinksPages = pages;
    this.sourceLinksPageIndex = 0;
  }

  setChapterProgressPages(pages: PaginatedResponse<SyncChapterProgress>[]): void {
    this.chapterProgressPages = pages;
    this.chapterProgressPageIndex = 0;
  }

  setMangaProgressPages(pages: PaginatedResponse<SyncMangaProgress>[]): void {
    this.mangaProgressPages = pages;
    this.mangaProgressPageIndex = 0;
  }

  setSettingsSnapshot(settings: UserSettings): void {
    this.settingsSnapshot = settings;
  }

  injectPullFailure(error: Error): void {
    this.shouldFailNextPull = true;
    this.pullError = error;
  }

  injectPushFailure(error: Error): void {
    this.shouldFailNextPush = true;
    this.pushError = error;
  }

  clearPushedEvents(): void {
    this.pushedEvents = [];
  }

  reset(): void {
    this.libraryItemsPages = [];
    this.sourceLinksPages = [];
    this.chapterProgressPages = [];
    this.mangaProgressPages = [];
    this.libraryItemsPageIndex = 0;
    this.sourceLinksPageIndex = 0;
    this.chapterProgressPageIndex = 0;
    this.mangaProgressPageIndex = 0;
    this.pushedEvents = [];
    this.shouldFailNextPull = false;
    this.shouldFailNextPush = false;
    this.pullError = null;
    this.pushError = null;
    this._ready = true;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async start(): Promise<void> {
    this._ready = true;
  }

  async stop(): Promise<void> {
    this._ready = false;
  }

  isReady(): boolean {
    return this._ready;
  }

  // ============================================================================
  // Pull methods
  // ============================================================================

  private maybeThrowPullError(): void {
    if (this.shouldFailNextPull && this.pullError) {
      this.shouldFailNextPull = false;
      const error = this.pullError;
      this.pullError = null;
      throw error;
    }
  }

  async pullLibraryItems(
    _cursor: CompositeCursor,
    _limit?: number
  ): Promise<PaginatedResponse<SyncLibraryItem>> {
    this.maybeThrowPullError();

    if (this.libraryItemsPageIndex >= this.libraryItemsPages.length) {
      return { entries: [], hasMore: false };
    }

    const page = this.libraryItemsPages[this.libraryItemsPageIndex];
    this.libraryItemsPageIndex++;
    return page;
  }

  async pullSourceLinks(
    _cursor: CompositeCursor,
    _limit?: number
  ): Promise<PaginatedResponse<SyncLibrarySourceLink>> {
    this.maybeThrowPullError();

    if (this.sourceLinksPageIndex >= this.sourceLinksPages.length) {
      return { entries: [], hasMore: false };
    }

    const page = this.sourceLinksPages[this.sourceLinksPageIndex];
    this.sourceLinksPageIndex++;
    return page;
  }

  async pullChapterProgress(
    _cursor: CompositeCursor,
    _limit?: number
  ): Promise<PaginatedResponse<SyncChapterProgress>> {
    this.maybeThrowPullError();

    if (this.chapterProgressPageIndex >= this.chapterProgressPages.length) {
      return { entries: [], hasMore: false };
    }

    const page = this.chapterProgressPages[this.chapterProgressPageIndex];
    this.chapterProgressPageIndex++;
    return page;
  }

  async pullMangaProgress(
    _cursor: CompositeCursor,
    _limit?: number
  ): Promise<PaginatedResponse<SyncMangaProgress>> {
    this.maybeThrowPullError();

    if (this.mangaProgressPageIndex >= this.mangaProgressPages.length) {
      return { entries: [], hasMore: false };
    }

    const page = this.mangaProgressPages[this.mangaProgressPageIndex];
    this.mangaProgressPageIndex++;
    return page;
  }

  async pullAll(_cursor: CompositeCursor, _limit?: number): Promise<SyncAllResponse> {
    this.maybeThrowPullError();

    // For simplicity, just return first page of each
    const libraryItems = this.libraryItemsPages[0]?.entries ?? [];
    const sourceLinks = this.sourceLinksPages[0]?.entries ?? [];
    const chapterProgress = this.chapterProgressPages[0]?.entries ?? [];
    const mangaProgress = this.mangaProgressPages[0]?.entries ?? [];

    return {
      libraryItems,
      sourceLinks,
      chapterProgress,
      mangaProgress,
      hasMore: false,
    };
  }

  async pullSettings(): Promise<UserSettings> {
    this.maybeThrowPullError();
    return this.settingsSnapshot;
  }

  // ============================================================================
  // Push methods
  // ============================================================================

  private maybeThrowPushError(): void {
    if (this.shouldFailNextPush && this.pushError) {
      this.shouldFailNextPush = false;
      const error = this.pushError;
      this.pushError = null;
      throw error;
    }
  }

  async pushLibraryItem(item: PushLibraryItem): Promise<void> {
    this.maybeThrowPushError();
    this.pushedEvents.push({ type: "libraryItem", data: item });
  }

  async pushSourceLink(link: PushLibrarySourceLink): Promise<void> {
    this.maybeThrowPushError();
    this.pushedEvents.push({ type: "sourceLink", data: link });
  }

  async pushChapterProgress(progress: PushChapterProgress): Promise<void> {
    this.maybeThrowPushError();
    this.pushedEvents.push({ type: "chapterProgress", data: progress });
  }

  async pushSettings(settings: UserSettings): Promise<void> {
    this.maybeThrowPushError();
    this.pushedEvents.push({ type: "settings", data: settings });
  }

  async deleteLibraryItem(libraryItemId: string, inLibraryClock: string): Promise<void> {
    this.maybeThrowPushError();
    this.pushedEvents.push({ type: "deleteLibraryItem", libraryItemId, inLibraryClock });
  }

  async deleteSourceLink(
    libraryItemId: string,
    registryId: string,
    sourceId: string,
    sourceMangaId: string
  ): Promise<void> {
    this.maybeThrowPushError();
    this.pushedEvents.push({
      type: "deleteSourceLink",
      libraryItemId,
      registryId,
      sourceId,
      sourceMangaId,
    });
  }
}

