/**
 * Auth transition tests (Phase 6.6 / Phase 7)
 *
 * Tests for auth state transitions and library sync/restore behavior:
 * - Sign-out "keep data" vs "remove data"
 * - Profile isolation between accounts
 * - Sign-in merge/convergence
 * - Offline edits then sign-in
 * - Multi-device sync scenarios
 *
 * These tests verify the invariants from sync.md:
 * - Profile isolation: data, cursors, and pending ops for profile A can never be read/written by profile B
 * - Auth != data: sign-in/out only attaches/detaches transport; it does not implicitly delete local data
 * - Local-first truth: UI renders local state as authoritative; cloud only merges into local
 * - User-intent safety: overrides and coverCustom are never erased by a merge unless there is an explicit newer tombstone/version
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { IndexedDBUserDataStore } from "@/data/indexeddb";
import { SyncCore, type SyncCoreRepos, type SyncMetaRepo, type PendingOpsRepo, type HLCManager } from "./core/SyncCore";
import { TestTransport } from "./transports/TestTransport";
import type {
  LocalLibraryItem,
  LocalSourceLink,
  LocalChapterProgress,
  LocalMangaProgress,
  CompositeCursor,
  UserSettings,
} from "@/data/schema";
import type { PendingOp } from "./core/types";
import { CURSOR_KEYS } from "./core/types";
import type { SyncLibraryItem, SyncLibrarySourceLink } from "./transport";
import { formatIntentClock } from "./hlc";

// Mock IndexedDB for testing
import "fake-indexeddb/auto";

// ============================================================================
// In-memory repos for SyncCore tests
// ============================================================================

class InMemoryLibraryItemRepo {
  items = new Map<string, LocalLibraryItem>();

  async getLibraryItem(id: string): Promise<LocalLibraryItem | null> {
    return this.items.get(id) ?? null;
  }

  async saveLibraryItem(item: LocalLibraryItem): Promise<void> {
    this.items.set(item.libraryItemId, item);
  }

  async getAllLibraryItems(): Promise<LocalLibraryItem[]> {
    return [...this.items.values()];
  }
}

class InMemorySourceLinkRepo {
  links = new Map<string, LocalSourceLink>();

  async getSourceLink(cursorId: string): Promise<LocalSourceLink | null> {
    return this.links.get(cursorId) ?? null;
  }

  async saveSourceLink(link: LocalSourceLink): Promise<void> {
    this.links.set(link.cursorId, link);
  }

  async removeSourceLink(cursorId: string): Promise<void> {
    this.links.delete(cursorId);
  }
}

class InMemoryChapterProgressRepo {
  entries = new Map<string, LocalChapterProgress>();

  async getChapterProgressEntry(cursorId: string): Promise<LocalChapterProgress | null> {
    return this.entries.get(cursorId) ?? null;
  }

  async saveChapterProgressEntry(entry: LocalChapterProgress): Promise<void> {
    this.entries.set(entry.cursorId, entry);
  }
}

class InMemoryMangaProgressRepo {
  entries = new Map<string, LocalMangaProgress>();

  async getMangaProgressEntry(cursorId: string): Promise<LocalMangaProgress | null> {
    return this.entries.get(cursorId) ?? null;
  }

  async saveMangaProgressEntry(entry: LocalMangaProgress): Promise<void> {
    this.entries.set(entry.cursorId, entry);
  }
}

class InMemorySyncMetaRepo implements SyncMetaRepo {
  cursors = new Map<string, CompositeCursor>();

  async getCompositeCursor(key: string): Promise<CompositeCursor> {
    return this.cursors.get(key) ?? { updatedAt: 0, cursorId: "" };
  }

  async setCompositeCursor(key: string, cursor: CompositeCursor): Promise<void> {
    this.cursors.set(key, cursor);
  }
}

class InMemoryPendingOpsRepo implements PendingOpsRepo {
  ops: PendingOp[] = [];
  private nextId = 1;

  async addPendingOp(op: Omit<PendingOp, "id">): Promise<string> {
    const id = `op-${this.nextId++}`;
    this.ops.push({ ...op, id });
    return id;
  }

  async getPendingOps(): Promise<PendingOp[]> {
    return [...this.ops];
  }

  async removePendingOp(id: string): Promise<void> {
    this.ops = this.ops.filter((op) => op.id !== id);
  }

  async updatePendingOpRetries(id: string, retries: number): Promise<void> {
    const op = this.ops.find((o) => o.id === id);
    if (op) op.retries = retries;
  }

  async getPendingCount(): Promise<number> {
    return this.ops.length;
  }
}

class InMemoryHLCManager implements HLCManager {
  private counter = 0;
  private nodeId: string;

  constructor(nodeId: string = "test-node") {
    this.nodeId = nodeId;
  }

  async generateIntentClock(): Promise<string> {
    this.counter++;
    const wallMs = Date.now();
    return formatIntentClock({ wallMs, counter: this.counter, nodeId: this.nodeId });
  }

  async receiveIntentClock(_clock: string): Promise<void> {
    // No-op for tests
  }
}

class InMemorySettingsRepo {
  settings: UserSettings = { installedSources: [] };

  async getSettings(): Promise<UserSettings> {
    return this.settings;
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    this.settings = settings;
  }
}

// ============================================================================
// Helpers
// ============================================================================

function createRepos(nodeId?: string): SyncCoreRepos & {
  libraryItems: InMemoryLibraryItemRepo;
  sourceLinks: InMemorySourceLinkRepo;
  chapterProgress: InMemoryChapterProgressRepo;
  mangaProgress: InMemoryMangaProgressRepo;
  syncMeta: InMemorySyncMetaRepo;
  pendingOps: InMemoryPendingOpsRepo;
  hlc: InMemoryHLCManager;
  settings: InMemorySettingsRepo;
} {
  return {
    libraryItems: new InMemoryLibraryItemRepo(),
    sourceLinks: new InMemorySourceLinkRepo(),
    chapterProgress: new InMemoryChapterProgressRepo(),
    mangaProgress: new InMemoryMangaProgressRepo(),
    syncMeta: new InMemorySyncMetaRepo(),
    pendingOps: new InMemoryPendingOpsRepo(),
    hlc: new InMemoryHLCManager(nodeId),
    settings: new InMemorySettingsRepo(),
  };
}

function makeClock(wallMs: number, counter: number, nodeId: string): string {
  return formatIntentClock({ wallMs, counter, nodeId });
}

function createSyncItem(id: string, updatedAt: number, overrides?: Partial<SyncLibraryItem>): SyncLibraryItem {
  return {
    cursorId: id,
    libraryItemId: id,
    metadata: { title: `Manga ${id}` },
    inLibrary: true,
    createdAt: updatedAt,
    updatedAt,
    ...overrides,
  };
}

function createSourceLink(id: string, libraryItemId: string, updatedAt: number): SyncLibrarySourceLink {
  return {
    cursorId: id,
    libraryItemId,
    registryId: "aidoku",
    sourceId: "source-1",
    sourceMangaId: `manga-${id}`,
    createdAt: updatedAt,
    updatedAt,
  };
}

async function startAndEnableSync(core: SyncCore, transport: TestTransport) {
  await core.start();
  transport.setReady(true);
  core.setTransport(transport);
}

// ============================================================================
// Sign-out "Keep Data" Flow Tests (IndexedDB-based)
// ============================================================================

describe("Sign-out keep data flow (IndexedDB)", () => {
  const userId = "test-user-123";
  const userProfileId = `user:${userId}`;

  let userStore: IndexedDBUserDataStore;
  let localStore: IndexedDBUserDataStore;

  beforeEach(async () => {
    userStore = new IndexedDBUserDataStore(userProfileId);
    localStore = new IndexedDBUserDataStore(); // No profileId = local
    await userStore.clearAccountData();
    await localStore.clearAccountData();
  });

  afterEach(async () => {
    await userStore.clearAccountData();
    await localStore.clearAccountData();
  });

  it("copies active library items with all fields preserved", async () => {
    // Setup: user profile has item with overrides and cover
    const itemWithOverrides: LocalLibraryItem = {
      libraryItemId: "manga-copy-test",
      metadata: { title: "Original Title" },
      inLibrary: true, // Active item
      inLibraryClock: makeClock(1000, 0, "device-a"),
      overrides: {
        metadata: { title: "User Custom Title" },
        metadataClock: makeClock(2000, 0, "device-a"),
        coverUrl: "custom-cover.jpg",
        coverUrlClock: makeClock(1500, 0, "device-a"),
      },
      externalIds: { aniList: 12345 },
      createdAt: 1000,
      updatedAt: 2000,
    };
    await userStore.saveLibraryItem(itemWithOverrides);

    // Verify getAllLibraryItems returns active items
    const userItems = await userStore.getAllLibraryItems();
    expect(userItems.length).toBe(1);
    expect(userItems[0].libraryItemId).toBe("manga-copy-test");

    // Execute: copy to local
    for (const item of userItems) {
      await localStore.saveLibraryItem(item);
    }

    // Verify via getAllLibraryItems (consistent with the copy method)
    const localItems = await localStore.getAllLibraryItems();
    expect(localItems.length).toBe(1);
    expect(localItems[0].metadata.title).toBe("Original Title");
    expect(localItems[0].overrides?.metadata?.title).toBe("User Custom Title");
    expect(localItems[0].overrides?.coverUrl).toBe("custom-cover.jpg");
    expect(localItems[0].inLibraryClock).toBe(makeClock(1000, 0, "device-a"));
    expect(localItems[0].overrides?.metadataClock).toBe(makeClock(2000, 0, "device-a"));
    expect(localItems[0].overrides?.coverUrlClock).toBe(makeClock(1500, 0, "device-a"));
    expect(localItems[0].externalIds?.aniList).toBe(12345);
  });

  it("getLibraryItem returns item after save (point query)", async () => {
    // This test verifies getLibraryItem works correctly after saveLibraryItem
    // Tests the schema validation path in getLibraryItem
    const item: LocalLibraryItem = {
      libraryItemId: "manga-point-query",
      metadata: { title: "Point Query Test" },
      inLibrary: true,
      inLibraryClock: makeClock(1000, 0, "device-a"),
      overrides: {
        metadata: { title: "User Title" },
        metadataClock: makeClock(2000, 0, "device-a"),
        coverUrl: "cover.jpg",
        coverUrlClock: makeClock(1500, 0, "device-a"),
      },
      createdAt: 1000,
      updatedAt: 2000,
    };
    await userStore.saveLibraryItem(item);

    // Point query should return the item
    const retrieved = await userStore.getLibraryItem("manga-point-query");
    expect(retrieved).not.toBeNull();
    expect(retrieved!.libraryItemId).toBe("manga-point-query");
    expect(retrieved!.metadata.title).toBe("Point Query Test");
    expect(retrieved!.overrides?.metadata?.title).toBe("User Title");
    expect(retrieved!.overrides?.coverUrl).toBe("cover.jpg");
  });

  it("BUG EXPOSURE: getAllLibraryItems() filters out inLibrary=false items", async () => {
    // This test exposes a bug: getAllLibraryItems() filters out removed items (inLibrary=false)
    // For the sign-out "keep data" flow, we need to preserve ALL items including tombstones.
    // 
    // Per sync.md Phase 6.5: "inLibrary=false + inLibraryClock" represents removal state.
    // These tombstones must be preserved during sign-out "keep data" to prevent resurrection
    // when the user signs back in and syncs.
    //
    // Current behavior: getAllLibraryItems() only returns items where inLibrary !== false
    // Expected behavior: For sync/copy flows, need a method that returns ALL items
    
    const removedItem: LocalLibraryItem = {
      libraryItemId: "manga-removed",
      metadata: { title: "Removed Manga" },
      inLibrary: false, // Tombstone
      inLibraryClock: makeClock(2000, 0, "device-a"),
      createdAt: 1000,
      updatedAt: 2000,
    };
    await userStore.saveLibraryItem(removedItem);

    // Verify: item is saved (getLibraryItem works)
    const savedItem = await userStore.getLibraryItem("manga-removed");
    expect(savedItem).not.toBeNull();
    expect(savedItem!.inLibrary).toBe(false);

    // BUG: getAllLibraryItems() does NOT return removed items
    // This breaks the "keep data" sign-out flow
    const allItems = await userStore.getAllLibraryItems();
    // CURRENT (BUG): returns 0 because inLibrary=false items are filtered out
    // EXPECTED: should return 1 to preserve tombstones
    expect(allItems.length).toBe(0); // This documents the current buggy behavior
    
    // TODO: Fix implementation to have a method like getAllLibraryItemsIncludingRemoved()
    // that the sign-out "keep data" flow can use
  });

  it("preserves inLibrary=false items via getLibraryItem (point query)", async () => {
    // While getAllLibraryItems filters out inLibrary=false, getLibraryItem doesn't
    // This verifies the tombstone data is stored correctly
    const removedItem: LocalLibraryItem = {
      libraryItemId: "manga-removed",
      metadata: { title: "Removed Manga" },
      inLibrary: false,
      inLibraryClock: makeClock(2000, 0, "device-a"),
      createdAt: 1000,
      updatedAt: 2000,
    };
    await userStore.saveLibraryItem(removedItem);

    // Copy to local using getLibraryItem (works for known IDs)
    const item = await userStore.getLibraryItem("manga-removed");
    expect(item).not.toBeNull();
    await localStore.saveLibraryItem(item!);

    // Verify via getLibraryItem
    const localItem = await localStore.getLibraryItem("manga-removed");
    expect(localItem).not.toBeNull();
    expect(localItem!.inLibrary).toBe(false);
    expect(localItem!.inLibraryClock).toBe(makeClock(2000, 0, "device-a"));
  });

  it("copies chapter progress with high-water mark values intact", async () => {
    const progress: LocalChapterProgress = {
      cursorId: "r:s:m:ch1",
      registryId: "r",
      sourceId: "s",
      sourceMangaId: "m",
      sourceChapterId: "ch1",
      progress: 15,
      total: 20,
      completed: true,
      lastReadAt: 5000,
      chapterNumber: 1,
      volumeNumber: 1,
      chapterTitle: "Chapter 1",
      updatedAt: 5000,
    };
    await userStore.saveChapterProgressEntry(progress);

    // Copy
    const chapters = await userStore.getAllChapterProgress();
    for (const ch of chapters) {
      await localStore.saveChapterProgressEntry(ch);
    }

    // Verify
    const localChapters = await localStore.getAllChapterProgress();
    expect(localChapters.length).toBe(1);
    expect(localChapters[0].progress).toBe(15);
    expect(localChapters[0].completed).toBe(true);
    expect(localChapters[0].lastReadAt).toBe(5000);
  });

  it("fresh local store instance reads copied data (simulates app restart)", async () => {
    // Setup and copy
    await userStore.saveLibraryItem({
      libraryItemId: "manga-1",
      metadata: { title: "Test" },
      inLibrary: true,
      createdAt: 1000,
      updatedAt: 1000,
    });

    const items = await userStore.getAllLibraryItems();
    for (const item of items) {
      await localStore.saveLibraryItem(item);
    }

    // Simulate app restart: create NEW local store instance
    const freshLocalStore = new IndexedDBUserDataStore();
    const freshItems = await freshLocalStore.getAllLibraryItems();

    expect(freshItems.length).toBe(1);
    expect(freshItems[0].libraryItemId).toBe("manga-1");
  });

  it("sign-out without keep data: local profile stays empty", async () => {
    // Setup
    await userStore.saveLibraryItem({
      libraryItemId: "manga-1",
      metadata: { title: "Test" },
      inLibrary: true,
      createdAt: 1000,
      updatedAt: 1000,
    });

    // Sign out WITHOUT keep data (just delete user profile)
    await userStore.clearAccountData();

    // Verify: user profile is empty
    const userItems = await userStore.getAllLibraryItems();
    expect(userItems.length).toBe(0);

    // Verify: local profile is STILL empty (nothing was copied)
    const localItems = await localStore.getAllLibraryItems();
    expect(localItems.length).toBe(0);
  });

  it("getLibraryEntries returns correct sources after keep-data copy", async () => {
    // Setup with item + source link
    await userStore.saveLibraryItem({
      libraryItemId: "manga-1",
      metadata: { title: "Test" },
      inLibrary: true,
      createdAt: 1000,
      updatedAt: 1000,
    });
    await userStore.saveSourceLink({
      cursorId: "r:s:m1",
      libraryItemId: "manga-1",
      registryId: "r",
      sourceId: "s",
      sourceMangaId: "m1",
      createdAt: 1000,
      updatedAt: 1000,
    });

    // Copy both
    for (const item of await userStore.getAllLibraryItems()) {
      await localStore.saveLibraryItem(item);
    }
    for (const link of await userStore.getAllSourceLinks()) {
      await localStore.saveSourceLink(link);
    }

    // Verify getLibraryEntries works
    const entries = await localStore.getLibraryEntries();
    expect(entries.length).toBe(1);
    expect(entries[0].item.libraryItemId).toBe("manga-1");
    expect(entries[0].sources.length).toBe(1);
    expect(entries[0].sources[0].sourceMangaId).toBe("m1");
  });
});

// ============================================================================
// Profile Isolation Tests (SyncCore level)
// ============================================================================

describe("Profile isolation (SyncCore)", () => {
  it("profiles have completely separate data", async () => {
    // Profile A
    const reposA = createRepos("device-a");
    const transportA = new TestTransport();
    transportA.setReady(false);
    transportA.setLibraryItemsPages([
      { entries: [createSyncItem("item-A", 1000)], hasMore: false },
    ]);

    const syncCoreA = new SyncCore({ repos: reposA });
    syncCoreA.setTransport(transportA);
    await startAndEnableSync(syncCoreA, transportA);
    await syncCoreA.syncNow("manual");

    // Profile B
    const reposB = createRepos("device-b");
    const transportB = new TestTransport();
    transportB.setReady(false);
    transportB.setLibraryItemsPages([
      { entries: [createSyncItem("item-B", 2000)], hasMore: false },
    ]);

    const syncCoreB = new SyncCore({ repos: reposB });
    syncCoreB.setTransport(transportB);
    await startAndEnableSync(syncCoreB, transportB);
    await syncCoreB.syncNow("manual");

    // Verify complete isolation
    expect(reposA.libraryItems.items.has("item-A")).toBe(true);
    expect(reposA.libraryItems.items.has("item-B")).toBe(false);
    expect(reposB.libraryItems.items.has("item-B")).toBe(true);
    expect(reposB.libraryItems.items.has("item-A")).toBe(false);

    // Cursors are isolated
    const cursorA = await reposA.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
    const cursorB = await reposB.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
    expect(cursorA.updatedAt).toBe(1000);
    expect(cursorB.updatedAt).toBe(2000);

    syncCoreA.stop();
    syncCoreB.stop();
  });

  it("pending ops are isolated per profile", async () => {
    // Profile A enqueues ops
    const reposA = createRepos("device-a");
    const transportA = new TestTransport();
    transportA.setReady(false);
    const syncCoreA = new SyncCore({ repos: reposA });
    syncCoreA.setTransport(transportA);
    await syncCoreA.start();

    await syncCoreA.enqueue({
      table: "library_items",
      operation: "save",
      data: { libraryItemId: "item-A" },
      timestamp: Date.now(),
      retries: 0,
    });
    await syncCoreA.enqueue({
      table: "library_items",
      operation: "save",
      data: { libraryItemId: "item-A2" },
      timestamp: Date.now(),
      retries: 0,
    });

    // Profile B has no ops
    const reposB = createRepos("device-b");
    const transportB = new TestTransport();
    transportB.setReady(false);
    const syncCoreB = new SyncCore({ repos: reposB });
    syncCoreB.setTransport(transportB);
    await syncCoreB.start();

    // Verify isolation
    expect(reposA.pendingOps.ops.length).toBe(2);
    expect(reposB.pendingOps.ops.length).toBe(0);
    expect(syncCoreA.pendingCount).toBe(2);
    expect(syncCoreB.pendingCount).toBe(0);

    syncCoreA.stop();
    syncCoreB.stop();
  });

  it("switching profiles: stop old core, start new core with new repos", async () => {
    // Sign in as user A
    const reposA = createRepos("device-a");
    const transportA = new TestTransport();
    transportA.setReady(false);
    transportA.setLibraryItemsPages([
      { entries: [createSyncItem("item-A", 1000)], hasMore: false },
    ]);

    const syncCoreA = new SyncCore({ repos: reposA });
    syncCoreA.setTransport(transportA);
    await startAndEnableSync(syncCoreA, transportA);
    await syncCoreA.syncNow("manual");

    expect(reposA.libraryItems.items.has("item-A")).toBe(true);

    // Sign out (stop A)
    syncCoreA.stop();

    // Sign in as user B (create new core with new repos)
    const reposB = createRepos("device-b");
    const transportB = new TestTransport();
    transportB.setReady(false);
    transportB.setLibraryItemsPages([
      { entries: [createSyncItem("item-B", 2000)], hasMore: false },
    ]);

    const syncCoreB = new SyncCore({ repos: reposB });
    syncCoreB.setTransport(transportB);
    await startAndEnableSync(syncCoreB, transportB);
    await syncCoreB.syncNow("manual");

    // B sees only B's data
    expect(reposB.libraryItems.items.has("item-B")).toBe(true);
    expect(reposB.libraryItems.items.has("item-A")).toBe(false);

    // A's repos still have A's data (kept locally)
    expect(reposA.libraryItems.items.has("item-A")).toBe(true);

    syncCoreB.stop();
  });
});

// ============================================================================
// Sign-in Sync/Merge Tests
// ============================================================================

describe("Sign-in sync behavior", () => {
  it("first sign-in pulls all cloud data into empty local", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // Cloud has 3 items
    transport.setLibraryItemsPages([
      { entries: [
        createSyncItem("item-1", 1000),
        createSyncItem("item-2", 2000),
        createSyncItem("item-3", 3000),
      ], hasMore: false },
    ]);
    transport.setSourceLinksPages([
      { entries: [createSourceLink("link-1", "item-1", 1000)], hasMore: false },
    ]);

    // Sign in (start sync)
    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    // All cloud data should be in local
    expect(repos.libraryItems.items.size).toBe(3);
    expect(repos.sourceLinks.links.size).toBe(1);

    syncCore.stop();
  });

  it("sign-in treats inLibrary=false as deletion (no resurrection)", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // Cloud has a removed item
    transport.setLibraryItemsPages([
      { entries: [createSyncItem("item-removed", 2000, {
        inLibrary: false,
        inLibraryClock: makeClock(2000, 0, "cloud"),
      })], hasMore: false },
    ]);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    // Item is stored but marked as not in library
    const item = repos.libraryItems.items.get("item-removed");
    expect(item).toBeDefined();
    expect(item!.inLibrary).toBe(false);

    syncCore.stop();
  });

  it("sign-in with local edits: local wins if clock is newer", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // Pre-populate local with a newer edit (simulate offline edit before sign-in)
    const newerClock = makeClock(5000, 0, "device-a");
    repos.libraryItems.items.set("item-1", {
      libraryItemId: "item-1",
      metadata: { title: "Local Title" },
      inLibrary: true,
      inLibraryClock: newerClock,
      overrides: {
        metadata: { title: "Local Override" },
        metadataClock: newerClock,
      },
      createdAt: 1000,
      updatedAt: 5000,
    });

    // Cloud has older version
    const olderClock = makeClock(2000, 0, "cloud");
    transport.setLibraryItemsPages([
      { entries: [createSyncItem("item-1", 2000, {
        metadata: { title: "Cloud Title" },
        inLibraryClock: olderClock,
        overrides: {
          metadata: { title: "Cloud Override" },
          metadataClock: olderClock,
        },
      })], hasMore: false },
    ]);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    // Local should still have its override (newer clock wins)
    const item = repos.libraryItems.items.get("item-1");
    expect(item!.overrides?.metadata?.title).toBe("Local Override");

    syncCore.stop();
  });

  it("sign-in with local edits: cloud wins if clock is newer", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // Pre-populate local with older edit
    const olderClock = makeClock(1000, 0, "device-a");
    repos.libraryItems.items.set("item-1", {
      libraryItemId: "item-1",
      metadata: { title: "Local Title" },
      inLibrary: true,
      inLibraryClock: olderClock,
      overrides: {
        metadata: { title: "Old Local Override" },
        metadataClock: olderClock,
      },
      createdAt: 1000,
      updatedAt: 1000,
    });

    // Cloud has newer version
    const newerClock = makeClock(5000, 0, "cloud");
    transport.setLibraryItemsPages([
      { entries: [createSyncItem("item-1", 5000, {
        metadata: { title: "Cloud Title" },
        inLibraryClock: newerClock,
        overrides: {
          metadata: { title: "Newer Cloud Override" },
          metadataClock: newerClock,
        },
      })], hasMore: false },
    ]);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    // Cloud should win (newer clock)
    const item = repos.libraryItems.items.get("item-1");
    expect(item!.overrides?.metadata?.title).toBe("Newer Cloud Override");

    syncCore.stop();
  });
});

// ============================================================================
// Offline Then Online Tests
// ============================================================================

describe("Offline edits then sign-in", () => {
  it("offline adds are pushed to cloud on sign-in", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await syncCore.start();

    // Simulate offline: add item locally (enqueue for push)
    await syncCore.enqueue({
      table: "library_items",
      operation: "save",
      data: {
        libraryItemId: "offline-item",
        metadata: { title: "Offline Add" },
        createdAt: Date.now(),
      },
      timestamp: Date.now(),
      retries: 0,
    });

    expect(syncCore.pendingCount).toBe(1);

    // Sign in (transport becomes ready)
    transport.setReady(true);
    syncCore.setTransport(transport);
    await syncCore.syncNow("manual");

    // Pending op should be pushed
    const pushEvents = transport.pushedEvents.filter(e => e.type === "libraryItem");
    expect(pushEvents.length).toBeGreaterThanOrEqual(1);
    expect(repos.pendingOps.ops.length).toBe(0);

    syncCore.stop();
  });

  it("offline removes are pushed to cloud on sign-in", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await syncCore.start();

    // Simulate offline: remove item
    const removeClock = makeClock(2000, 0, "device-a");
    await syncCore.enqueue({
      table: "library_items",
      operation: "remove",
      data: { libraryItemId: "removed-item", inLibraryClock: removeClock },
      timestamp: Date.now(),
      retries: 0,
    });

    expect(syncCore.pendingCount).toBe(1);

    // Sign in
    transport.setReady(true);
    syncCore.setTransport(transport);
    await syncCore.syncNow("manual");

    // Should push delete with clock
    const deleteEvents = transport.pushedEvents.filter(e => e.type === "deleteLibraryItem");
    expect(deleteEvents.length).toBe(1);
    expect((deleteEvents[0] as { libraryItemId: string }).libraryItemId).toBe("removed-item");
    expect((deleteEvents[0] as { inLibraryClock: string }).inLibraryClock).toBe(removeClock);

    syncCore.stop();
  });

  it("offline progress updates are pushed on sign-in", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await syncCore.start();

    // Simulate offline reading
    await syncCore.enqueue({
      table: "chapter_progress",
      operation: "save",
      data: {
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        sourceChapterId: "ch1",
        progress: 15,
        total: 20,
        completed: false,
        lastReadAt: Date.now(),
      },
      timestamp: Date.now(),
      retries: 0,
    });

    // Sign in
    transport.setReady(true);
    syncCore.setTransport(transport);
    await syncCore.syncNow("manual");

    const progressEvents = transport.pushedEvents.filter(e => e.type === "chapterProgress");
    expect(progressEvents.length).toBe(1);

    syncCore.stop();
  });

  it("pending ops persist across restart", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await syncCore.start();

    // Enqueue while offline
    await syncCore.enqueue({
      table: "library_items",
      operation: "save",
      data: { libraryItemId: "persist-test" },
      timestamp: Date.now(),
      retries: 0,
    });

    expect(repos.pendingOps.ops.length).toBe(1);

    // Simulate crash/restart
    syncCore.stop();

    // Create new core with SAME repos (simulates restart with persisted DB)
    const newTransport = new TestTransport();
    newTransport.setReady(false);
    const newSyncCore = new SyncCore({ repos }); // Same repos
    newSyncCore.setTransport(newTransport);
    await newSyncCore.start();

    // Pending ops should still be there
    expect(newSyncCore.pendingCount).toBe(1);

    // Sign in and push
    newTransport.setReady(true);
    newSyncCore.setTransport(newTransport);
    await newSyncCore.syncNow("manual");

    expect(newTransport.pushedEvents.some(e => e.type === "libraryItem")).toBe(true);
    expect(repos.pendingOps.ops.length).toBe(0);

    newSyncCore.stop();
  });
});

// ============================================================================
// Two-Device Convergence Tests (HLC merge correctness)
// ============================================================================

describe("Two-device convergence", () => {
  it("newer clock wins regardless of arrival order (scenario: A offline, B online)", async () => {
    // Scenario from sync.md:
    // A clears overrides offline at time t, B edits overrides online at t+ε.
    // When A comes online later, B's edit must win (because its HLC is larger).

    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // A has local state with older clock (clear action)
    const tA = makeClock(1000, 0, "deviceA");
    repos.libraryItems.items.set("item-1", {
      libraryItemId: "item-1",
      metadata: { title: "Source" },
      inLibrary: true,
      overrides: {
        metadata: null, // A cleared
        metadataClock: tA,
      },
      createdAt: 1000,
      updatedAt: 1000,
    });

    // B's edit on cloud (newer clock)
    const tB = makeClock(2000, 0, "deviceB"); // B is later
    transport.setLibraryItemsPages([
      { entries: [createSyncItem("item-1", 2000, {
        metadata: { title: "Source" },
        overrides: {
          metadata: { title: "B's Edit" },
          metadataClock: tB,
        },
      })], hasMore: false },
    ]);

    // A comes online
    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    // B's edit should win (newer clock)
    const item = repos.libraryItems.items.get("item-1");
    expect(item!.overrides?.metadata?.title).toBe("B's Edit");
    expect(item!.overrides?.metadataClock).toBe(tB);

    syncCore.stop();
  });

  it("removal tombstone wins over older add (delete then stale add arrives)", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // A already has the item removed
    const removeClock = makeClock(3000, 0, "deviceA");
    repos.libraryItems.items.set("item-1", {
      libraryItemId: "item-1",
      metadata: { title: "Removed" },
      inLibrary: false,
      inLibraryClock: removeClock,
      createdAt: 1000,
      updatedAt: 3000,
    });

    // Stale add arrives from cloud (older clock)
    const olderAddClock = makeClock(1000, 0, "deviceB");
    transport.setLibraryItemsPages([
      { entries: [createSyncItem("item-1", 1000, {
        metadata: { title: "Old Add" },
        inLibrary: true,
        inLibraryClock: olderAddClock,
      })], hasMore: false },
    ]);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    // Item should STILL be removed (remove clock is newer)
    const item = repos.libraryItems.items.get("item-1");
    expect(item!.inLibrary).toBe(false);
    expect(item!.inLibraryClock).toBe(removeClock);

    syncCore.stop();
  });

  it("re-add with newer clock wins over older tombstone", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // A has removed item with older clock
    const oldRemoveClock = makeClock(1000, 0, "deviceA");
    repos.libraryItems.items.set("item-1", {
      libraryItemId: "item-1",
      metadata: { title: "Removed" },
      inLibrary: false,
      inLibraryClock: oldRemoveClock,
      createdAt: 1000,
      updatedAt: 1000,
    });

    // User re-added on another device with newer clock
    const readdClock = makeClock(3000, 0, "deviceB");
    transport.setLibraryItemsPages([
      { entries: [createSyncItem("item-1", 3000, {
        metadata: { title: "Re-added" },
        inLibrary: true,
        inLibraryClock: readdClock,
      })], hasMore: false },
    ]);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    // Item should be back in library (re-add clock is newer)
    const item = repos.libraryItems.items.get("item-1");
    expect(item!.inLibrary).toBe(true);
    expect(item!.inLibraryClock).toBe(readdClock);

    syncCore.stop();
  });

  it("metadata and cover clocks are independent", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // A has metadata override at t=2000, cover at t=1000
    const metaClock = makeClock(2000, 0, "deviceA");
    const coverClock = makeClock(1000, 0, "deviceA");
    repos.libraryItems.items.set("item-1", {
      libraryItemId: "item-1",
      metadata: { title: "Source" },
      inLibrary: true,
      overrides: {
        metadata: { title: "A's Title" },
        metadataClock: metaClock,
        coverUrl: "a-cover.jpg",
        coverUrlClock: coverClock,
      },
      createdAt: 1000,
      updatedAt: 2000,
    });

    // Cloud has metadata at t=1500 (loses), cover at t=3000 (wins)
    const cloudMetaClock = makeClock(1500, 0, "cloud");
    const cloudCoverClock = makeClock(3000, 0, "cloud");
    transport.setLibraryItemsPages([
      { entries: [createSyncItem("item-1", 3000, {
        metadata: { title: "Source" },
        overrides: {
          metadata: { title: "Cloud Title" },
          metadataClock: cloudMetaClock,
          coverUrl: "cloud-cover.jpg",
          coverUrlClock: cloudCoverClock,
        },
      })], hasMore: false },
    ]);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    const item = repos.libraryItems.items.get("item-1");
    // A's title should win (2000 > 1500)
    expect(item!.overrides?.metadata?.title).toBe("A's Title");
    expect(item!.overrides?.metadataClock).toBe(metaClock);
    // Cloud's cover should win (3000 > 1000)
    expect(item!.overrides?.coverUrl).toBe("cloud-cover.jpg");
    expect(item!.overrides?.coverUrlClock).toBe(cloudCoverClock);

    syncCore.stop();
  });
});

// ============================================================================
// Source Link Tombstone Tests
// ============================================================================

describe("Source link tombstone handling", () => {
  it("tombstone prevents resurrection from out-of-order old add", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // First sync: get tombstone
    transport.setSourceLinksPages([
      { entries: [{
        cursorId: "link-1",
        libraryItemId: "item-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        createdAt: 1000,
        updatedAt: 3000,
        deletedAt: 3000, // Tombstone
      }], hasMore: false },
    ]);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    // Tombstone is stored
    const tombstone = repos.sourceLinks.links.get("link-1");
    expect(tombstone?.deletedAt).toBe(3000);

    // Second sync: old add arrives (out-of-order)
    transport.setSourceLinksPages([
      { entries: [{
        cursorId: "link-1",
        libraryItemId: "item-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        createdAt: 1000,
        updatedAt: 1000, // Older than tombstone
        // No deletedAt (this is an "add")
      }], hasMore: false },
    ]);

    await syncCore.syncNow("manual");

    // Should NOT resurrect
    const afterSecondSync = repos.sourceLinks.links.get("link-1");
    expect(afterSecondSync?.deletedAt).toBe(3000); // Still tombstoned

    syncCore.stop();
  });
});

// ============================================================================
// Progress High-Water Mark Tests
// ============================================================================

describe("Progress high-water mark during sync", () => {
  it("progress never decreases during merge", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // Local has higher progress
    repos.chapterProgress.entries.set("cp-1", {
      cursorId: "cp-1",
      registryId: "r",
      sourceId: "s",
      sourceMangaId: "m",
      sourceChapterId: "ch1",
      progress: 18,
      total: 20,
      completed: false,
      lastReadAt: 5000,
      updatedAt: 5000,
    });

    // Cloud has lower progress but newer updatedAt
    transport.setChapterProgressPages([
      { entries: [{
        cursorId: "cp-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        sourceChapterId: "ch1",
        progress: 10, // Lower
        total: 20,
        completed: false,
        lastReadAt: 3000, // Also older
        updatedAt: 6000, // Newer updatedAt
      }], hasMore: false },
    ]);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    const progress = repos.chapterProgress.entries.get("cp-1");
    // Progress should be max(18, 10) = 18
    expect(progress!.progress).toBe(18);
    // lastReadAt should be max(5000, 3000) = 5000
    expect(progress!.lastReadAt).toBe(5000);

    syncCore.stop();
  });

  it("completed is sticky (OR merge)", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // Local: completed
    repos.chapterProgress.entries.set("cp-1", {
      cursorId: "cp-1",
      registryId: "r",
      sourceId: "s",
      sourceMangaId: "m",
      sourceChapterId: "ch1",
      progress: 20,
      total: 20,
      completed: true, // Completed
      lastReadAt: 5000,
      updatedAt: 5000,
    });

    // Cloud: not completed (maybe user re-reading on another device)
    transport.setChapterProgressPages([
      { entries: [{
        cursorId: "cp-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        sourceChapterId: "ch1",
        progress: 5,
        total: 20,
        completed: false, // Not completed
        lastReadAt: 6000,
        updatedAt: 6000,
      }], hasMore: false },
    ]);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    const progress = repos.chapterProgress.entries.get("cp-1");
    // completed should stay true (OR semantics)
    expect(progress!.completed).toBe(true);
    // But progress stays at max
    expect(progress!.progress).toBe(20);

    syncCore.stop();
  });
});

// ============================================================================
// Transport Readiness Tests
// ============================================================================

describe("Transport readiness transitions", () => {
  it("NullTransport: app works offline, ops queue locally", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false); // Simulates NullTransport (logged out)

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await syncCore.start();

    // User adds item while logged out
    await syncCore.enqueue({
      table: "library_items",
      operation: "save",
      data: { libraryItemId: "offline-add" },
      timestamp: Date.now(),
      retries: 0,
    });

    // Sync attempt does nothing (transport not ready)
    await syncCore.syncNow("manual");

    // Op is still pending
    expect(syncCore.pendingCount).toBe(1);
    expect(transport.pushedEvents.length).toBe(0);

    syncCore.stop();
  });

  it("transport becoming ready triggers auto-sync", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);
    transport.setLibraryItemsPages([
      { entries: [createSyncItem("item-1", 1000)], hasMore: false },
    ]);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await syncCore.start();

    // Initially nothing synced
    expect(repos.libraryItems.items.size).toBe(0);

    // Create a promise to wait for applied event
    const applied = new Promise<void>((resolve) => {
      syncCore.onApplied((ev) => {
        if (ev.table === "libraryItems") resolve();
      });
    });

    // Simulate sign-in: transport becomes ready
    transport.setReady(true);
    syncCore.setTransport(transport);

    await applied;

    // Data should be synced
    expect(repos.libraryItems.items.size).toBe(1);

    syncCore.stop();
  });
});

// ============================================================================
// Error Recovery Tests
// ============================================================================

describe("Error recovery during sync", () => {
  it("push failure increments retries, succeeds on retry", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await syncCore.start();

    // Enqueue op
    await syncCore.enqueue({
      table: "library_items",
      operation: "save",
      data: { libraryItemId: "retry-item" },
      timestamp: Date.now(),
      retries: 0,
    });

    // First sync: inject failure
    transport.setReady(true);
    transport.injectPushFailure(new Error("Network error"));
    syncCore.setTransport(transport);
    await syncCore.syncNow("manual");

    // Op should be retried
    expect(repos.pendingOps.ops.length).toBe(1);
    expect(repos.pendingOps.ops[0].retries).toBeGreaterThanOrEqual(1);

    // Second sync: should succeed
    await syncCore.syncNow("manual");

    expect(repos.pendingOps.ops.length).toBe(0);
    expect(transport.pushedEvents.some(e => e.type === "libraryItem")).toBe(true);

    syncCore.stop();
  });

  it("ops exceeding max retries are dropped", async () => {
    const repos = createRepos("device-a");

    // Pre-add an op that's already at max retries
    await repos.pendingOps.addPendingOp({
      table: "library_items",
      operation: "save",
      data: { libraryItemId: "doomed" },
      timestamp: Date.now(),
      retries: 2, // At max
    });

    const transport = new TestTransport();
    transport.setReady(false);

    const syncCore = new SyncCore({
      repos,
      config: { retryPolicy: { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100 } },
    });
    syncCore.setTransport(transport);
    await syncCore.start();

    // Enable and sync
    transport.setReady(true);
    syncCore.setTransport(transport);
    await syncCore.syncNow("manual");

    // Op should be dropped (abandoned)
    expect(repos.pendingOps.ops.length).toBe(0);

    syncCore.stop();
  });
});

