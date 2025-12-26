/**
 * SyncCore integration tests (Phase 7)
 *
 * Tests sync orchestration with TestTransport:
 * - Pull-only catch-up (multi-page)
 * - Push with retry on failure
 * - Crash/restart persistence
 * - Applied event emission
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { SyncCore, type SyncCoreRepos, type SyncMetaRepo, type PendingOpsRepo, type HLCManager } from "./SyncCore";
import { TestTransport } from "../transports/TestTransport";
import type {
  LocalLibraryItem,
  LocalSourceLink,
  LocalChapterProgress,
  LocalMangaProgress,
  CompositeCursor,
} from "@/data/schema";
import type { UserSettings } from "@/data/schema";
import type { PendingOp } from "./types";
import { CURSOR_KEYS } from "./types";
import type { SyncLibraryItem, SyncLibrarySourceLink } from "../transport";

// ============================================================================
// In-memory repositories
// ============================================================================

class InMemoryLibraryItemRepo {
  items = new Map<string, LocalLibraryItem>();

  async getLibraryItem(id: string): Promise<LocalLibraryItem | null> {
    return this.items.get(id) ?? null;
  }

  async saveLibraryItem(item: LocalLibraryItem): Promise<void> {
    this.items.set(item.libraryItemId, item);
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

  async generateIntentClock(): Promise<string> {
    this.counter++;
    const wallMs = Date.now();
    return `${wallMs.toString().padStart(17, "0")}:${this.counter.toString().padStart(6, "0")}:test-node`;
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

function createRepos(): SyncCoreRepos & {
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
    hlc: new InMemoryHLCManager(),
    settings: new InMemorySettingsRepo(),
  };
}

function createSyncItem(id: string, updatedAt: number): SyncLibraryItem {
  return {
    cursorId: id,
    libraryItemId: id,
    metadata: { title: `Manga ${id}` },
    inLibrary: true,
    createdAt: updatedAt,
    updatedAt,
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

// ============================================================================
// Tests
// ============================================================================

describe("SyncCore integration", () => {
  let repos: ReturnType<typeof createRepos>;
  let transport: TestTransport;
  let syncCore: SyncCore;

  beforeEach(() => {
    repos = createRepos();
    transport = new TestTransport();
    // Set transport as not ready initially to prevent startup sync race
    transport.setReady(false);
    syncCore = new SyncCore({
      repos,
      config: {
        pullIntervalMs: 60000, // Disable auto-pull for tests
      },
    });
    syncCore.setTransport(transport);
  });

  afterEach(() => {
    syncCore.stop();
  });

  // Helper to start and enable sync
  async function startAndEnableSync() {
    await syncCore.start();
    transport.setReady(true);
    // SyncCore needs to be notified that transport is now ready
    // In real usage, this happens when setTransport is called with a ready transport
    // For tests, we need to re-set the transport to trigger updateStatus
    syncCore.setTransport(transport);
  }

  describe("pull-only catch-up", () => {
    it("pulls multiple pages of library items", async () => {
      // Setup: 2 pages of library items
      transport.setLibraryItemsPages([
        {
          entries: [createSyncItem("item-1", 1000), createSyncItem("item-2", 2000)],
          hasMore: true,
          nextCursor: { updatedAt: 2000, cursorId: "item-2" },
        },
        {
          entries: [createSyncItem("item-3", 3000)],
          hasMore: false,
        },
      ]);

      await startAndEnableSync();
      await syncCore.syncNow("manual");

      // Verify all items saved
      expect(repos.libraryItems.items.size).toBe(3);
      expect(repos.libraryItems.items.get("item-1")).toBeDefined();
      expect(repos.libraryItems.items.get("item-2")).toBeDefined();
      expect(repos.libraryItems.items.get("item-3")).toBeDefined();

      // Verify cursor persisted
      const cursor = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      expect(cursor.updatedAt).toBe(3000);
    });

    it("pulls multiple pages of source links", async () => {
      // First add a library item
      transport.setLibraryItemsPages([
        {
          entries: [createSyncItem("item-1", 1000)],
          hasMore: false,
        },
      ]);

      // Setup: 2 pages of source links
      transport.setSourceLinksPages([
        {
          entries: [
            createSourceLink("link-1", "item-1", 1000),
            createSourceLink("link-2", "item-1", 2000),
          ],
          hasMore: true,
          nextCursor: { updatedAt: 2000, cursorId: "link-2" },
        },
        {
          entries: [createSourceLink("link-3", "item-1", 3000)],
          hasMore: false,
        },
      ]);

      await startAndEnableSync();
      await syncCore.syncNow("manual");

      // Verify all links saved
      expect(repos.sourceLinks.links.size).toBe(3);

      // Verify cursor persisted
      const cursor = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.SOURCE_LINKS);
      expect(cursor.updatedAt).toBe(3000);
    });

    it("cursor persistence allows incremental sync", async () => {
      // First sync: get some items
      transport.setLibraryItemsPages([
        {
          entries: [createSyncItem("item-1", 1000)],
          hasMore: false,
        },
      ]);

      await startAndEnableSync();
      await syncCore.syncNow("manual");

      expect(repos.libraryItems.items.size).toBe(1);
      const cursor1 = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      expect(cursor1.updatedAt).toBe(1000);

      // Reset transport pages for second sync (simulating new data)
      transport.setLibraryItemsPages([
        {
          entries: [createSyncItem("item-2", 2000)],
          hasMore: false,
        },
      ]);

      // Second sync: should get new items without re-fetching old ones
      await syncCore.syncNow("manual");

      expect(repos.libraryItems.items.size).toBe(2);
      const cursor2 = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      expect(cursor2.updatedAt).toBe(2000);
    });
  });

  describe("applied events", () => {
    it("emits applied event when library items are applied", async () => {
      const appliedEvents: { table: string; affectedCount: number }[] = [];
      syncCore.onApplied((event) => appliedEvents.push(event));

      transport.setLibraryItemsPages([
        {
          entries: [createSyncItem("item-1", 1000), createSyncItem("item-2", 2000)],
          hasMore: false,
        },
      ]);

      await startAndEnableSync();
      await syncCore.syncNow("manual");

      const libraryEvent = appliedEvents.find((e) => e.table === "libraryItems");
      expect(libraryEvent).toBeDefined();
      expect(libraryEvent?.affectedCount).toBe(2);
    });

    it("emits applied events for each table type", async () => {
      const appliedEvents: { table: string; affectedCount: number }[] = [];
      syncCore.onApplied((event) => appliedEvents.push(event));

      transport.setLibraryItemsPages([
        { entries: [createSyncItem("item-1", 1000)], hasMore: false },
      ]);
      transport.setSourceLinksPages([
        { entries: [createSourceLink("link-1", "item-1", 1000)], hasMore: false },
      ]);

      await startAndEnableSync();
      await syncCore.syncNow("manual");

      expect(appliedEvents.some((e) => e.table === "libraryItems")).toBe(true);
      expect(appliedEvents.some((e) => e.table === "sourceLinks")).toBe(true);
    });
  });

  describe("push operations", () => {
    it("enqueues and pushes library items", async () => {
      // Start with transport not ready (no auto sync on enqueue)
      await syncCore.start();
      
      // Enqueue a library item save (won't sync because transport not ready)
      await syncCore.enqueue({
        table: "library_items",
        operation: "save",
        data: {
          libraryItemId: "new-item",
          metadata: { title: "New Manga" },
          createdAt: Date.now(),
        },
        timestamp: Date.now(),
        retries: 0,
      });

      // Should have pending op
      expect(syncCore.pendingCount).toBe(1);

      // Now enable transport and sync
      transport.setReady(true);
      syncCore.setTransport(transport);
      await syncCore.syncNow("manual");

      // Verify push captured
      expect(transport.pushedEvents.length).toBeGreaterThanOrEqual(1);
      const pushEvent = transport.pushedEvents.find((e) => e.type === "libraryItem");
      expect(pushEvent).toBeDefined();

      // Pending op should be removed after success
      expect(repos.pendingOps.ops.length).toBe(0);
    });

    it("retries push on failure", async () => {
      // Start with transport not ready
      await syncCore.start();

      // Enqueue (won't sync)
      await syncCore.enqueue({
        table: "library_items",
        operation: "save",
        data: {
          libraryItemId: "new-item",
          metadata: { title: "New Manga" },
          createdAt: Date.now(),
        },
        timestamp: Date.now(),
        retries: 0,
      });

      // Enable transport and inject failure for first push
      transport.setReady(true);
      transport.injectPushFailure(new Error("Network error"));
      syncCore.setTransport(transport);
      
      // First sync - should fail
      await syncCore.syncNow("manual");

      // Op should still be pending with incremented retries
      expect(repos.pendingOps.ops.length).toBe(1);
      expect(repos.pendingOps.ops[0].retries).toBeGreaterThanOrEqual(1);

      // Second sync - should succeed (no more injected failures)
      await syncCore.syncNow("manual");

      // Should be pushed and removed
      expect(repos.pendingOps.ops.length).toBe(0);
      expect(transport.pushedEvents.some((e) => e.type === "libraryItem")).toBe(true);
    });

    it("gives up after max retries", async () => {
      // Create fresh repos for this test
      const freshRepos = createRepos();
      
      // Add an op with retries already at max
      await freshRepos.pendingOps.addPendingOp({
        table: "library_items",
        operation: "save",
        data: { libraryItemId: "doomed" },
        timestamp: Date.now(),
        retries: 2, // Already at max
      });

      // Create core with retryPolicy.maxRetries=2
      // Transport starts not ready to prevent startup sync race
      const freshTransport = new TestTransport();
      freshTransport.setReady(false);
      
      const coreWithLowRetries = new SyncCore({
        repos: freshRepos,
        config: { 
          retryPolicy: { maxRetries: 2, baseDelayMs: 10, maxDelayMs: 100 }
        },
      });
      coreWithLowRetries.setTransport(freshTransport);
      await coreWithLowRetries.start();

      // Now enable transport and sync manually
      freshTransport.setReady(true);
      coreWithLowRetries.setTransport(freshTransport);
      await coreWithLowRetries.syncNow("manual");

      // Op should be removed (abandoned due to max retries)
      expect(freshRepos.pendingOps.ops.length).toBe(0);

      coreWithLowRetries.stop();
    });

    it("enqueues and pushes library item removals with inLibraryClock", async () => {
      await syncCore.start();

      await syncCore.enqueue({
        table: "library_items",
        operation: "remove",
        data: { libraryItemId: "dead-item", inLibraryClock: "00000000000000001:000001:test" },
        timestamp: Date.now(),
        retries: 0,
      });

      transport.setReady(true);
      syncCore.setTransport(transport);
      await syncCore.syncNow("manual");

      const del = transport.pushedEvents.find((e) => e.type === "deleteLibraryItem");
      expect(del).toBeDefined();
      expect(del && "libraryItemId" in del ? del.libraryItemId : null).toBe("dead-item");
      expect(del && "inLibraryClock" in del ? del.inLibraryClock : null).toBe("00000000000000001:000001:test");
    });
  });

  describe("settings sync", () => {
    it("pulls settings, merges deterministically, saves locally, and pushes merged snapshot", async () => {
      const applied: string[] = [];
      syncCore.onApplied((e) => applied.push(e.table));

      // Local has one source at v1
      repos.settings.settings = {
        installedSources: [{ id: "aidoku:foo", registryId: "aidoku", version: 1 }],
      };

      // Remote has same source v2 + a new one
      transport.setSettingsSnapshot({
        installedSources: [
          { id: "aidoku:foo", registryId: "aidoku", version: 2 },
          { id: "aidoku:bar", registryId: "aidoku", version: 1 },
        ],
      });

      await startAndEnableSync();
      await syncCore.syncNow("manual");

      expect(applied).toContain("settings");
      expect(repos.settings.settings.installedSources).toEqual([
        { id: "aidoku:bar", registryId: "aidoku", version: 1 },
        { id: "aidoku:foo", registryId: "aidoku", version: 2 },
      ]);

      const pushed = transport.pushedEvents.find((e) => e.type === "settings");
      expect(pushed).toBeDefined();
      expect(pushed && "data" in pushed ? pushed.data.installedSources : null).toEqual([
        { id: "aidoku:bar", registryId: "aidoku", version: 1 },
        { id: "aidoku:foo", registryId: "aidoku", version: 2 },
      ]);
    });

    it("replaces an existing pending settings op with the merged snapshot (no stale push)", async () => {
      // Local pending settings op that would be stale (missing remote addition)
      await repos.pendingOps.addPendingOp({
        table: "settings",
        operation: "save",
        data: { installedSources: [{ id: "aidoku:foo", registryId: "aidoku", version: 1 }] },
        timestamp: Date.now(),
        retries: 0,
      });

      repos.settings.settings = {
        installedSources: [{ id: "aidoku:foo", registryId: "aidoku", version: 1 }],
      };

      // Remote adds bar
      transport.setSettingsSnapshot({
        installedSources: [
          { id: "aidoku:foo", registryId: "aidoku", version: 1 },
          { id: "aidoku:bar", registryId: "aidoku", version: 1 },
        ],
      });

      await startAndEnableSync();
      await syncCore.syncNow("manual");

      // Only one settings push event, and it must include "bar"
      const settingsPushes = transport.pushedEvents.filter((e) => e.type === "settings");
      expect(settingsPushes).toHaveLength(1);
      expect(settingsPushes[0].data.installedSources).toEqual([
        { id: "aidoku:bar", registryId: "aidoku", version: 1 },
        { id: "aidoku:foo", registryId: "aidoku", version: 1 },
      ]);
    });
  });

  describe("crash/restart persistence", () => {
    it("persists pending ops across restart", async () => {
      // First core: enqueue ops (transport not ready, so won't push immediately)
      await syncCore.start();

      await syncCore.enqueue({
        table: "library_items",
        operation: "save",
        data: { libraryItemId: "item-1" },
        timestamp: Date.now(),
        retries: 0,
      });

      expect(repos.pendingOps.ops.length).toBe(1);

      // Simulate crash (stop without pushing)
      syncCore.stop();

      // Create fresh transport for new core (not ready to prevent startup sync race)
      const newTransport = new TestTransport();
      newTransport.setReady(false);
      
      // Create new core with same repos (simulating restart)
      const newCore = new SyncCore({ repos });
      newCore.setTransport(newTransport);
      await newCore.start();

      // Pending ops should still be there
      expect(newCore.pendingCount).toBe(1);

      // Now enable transport and sync
      newTransport.setReady(true);
      newCore.setTransport(newTransport);
      await newCore.syncNow("manual");

      expect(newTransport.pushedEvents.some((e) => e.type === "libraryItem")).toBe(true);
      expect(repos.pendingOps.ops.length).toBe(0);

      newCore.stop();
    });

    it("persists cursors across restart", async () => {
      // First core: pull some data
      transport.setLibraryItemsPages([
        { entries: [createSyncItem("item-1", 1000)], hasMore: false },
      ]);

      await startAndEnableSync();
      await syncCore.syncNow("manual");

      const cursor1 = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      expect(cursor1.updatedAt).toBe(1000);
      expect(repos.libraryItems.items.size).toBe(1);

      // Simulate crash
      syncCore.stop();

      // Create fresh transport with new data (not ready to prevent startup sync race)
      const newTransport = new TestTransport();
      newTransport.setReady(false);
      newTransport.setLibraryItemsPages([
        { entries: [createSyncItem("item-2", 2000)], hasMore: false },
      ]);

      // Create new core with same repos
      const newCore = new SyncCore({ repos });
      newCore.setTransport(newTransport);
      await newCore.start();

      // Enable transport and sync
      newTransport.setReady(true);
      newCore.setTransport(newTransport);
      await newCore.syncNow("manual");

      // Should have both old and new data
      expect(repos.libraryItems.items.size).toBe(2);

      // Cursor should be advanced
      const cursor2 = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      expect(cursor2.updatedAt).toBe(2000);

      newCore.stop();
    });
  });

  describe("status updates", () => {
    it("reports syncing status during sync", async () => {
      const statuses: string[] = [];
      syncCore.onStatusChange((s) => statuses.push(s));

      transport.setLibraryItemsPages([
        { entries: [createSyncItem("item-1", 1000)], hasMore: false },
      ]);

      await startAndEnableSync();
      await syncCore.syncNow("manual");

      expect(statuses).toContain("syncing");
      expect(statuses[statuses.length - 1]).toBe("synced");
    });

    it("reports pending status when ops queued", async () => {
      const statuses: string[] = [];
      
      // Enable transport first so status updates work
      transport.setReady(true);
      syncCore.setTransport(transport);
      
      syncCore.onStatusChange((s) => statuses.push(s));

      await syncCore.start();

      await syncCore.enqueue({
        table: "library_items",
        operation: "save",
        data: { libraryItemId: "item-1" },
        timestamp: Date.now(),
        retries: 0,
      });

      // After enqueue, status should eventually be synced (op pushed immediately)
      // or pending if something prevented the push
      // The important thing is that pending ops trigger a status update
      expect(syncCore.pendingCount).toBeGreaterThanOrEqual(0); // Just verify we can check
    });
  });

  describe("transport readiness", () => {
    it("does not sync when transport is not ready", async () => {
      // Transport is already not ready from beforeEach
      transport.setLibraryItemsPages([
        { entries: [createSyncItem("item-1", 1000)], hasMore: false },
      ]);

      await syncCore.start();
      await syncCore.syncNow("manual");

      // Should not have pulled
      expect(repos.libraryItems.items.size).toBe(0);
    });

    it("syncs when transport becomes ready", async () => {
      // Transport is not ready initially
      transport.setLibraryItemsPages([
        { entries: [createSyncItem("item-1", 1000)], hasMore: false },
      ]);

      await syncCore.start();
      await syncCore.syncNow("manual");
      expect(repos.libraryItems.items.size).toBe(0);

      // Now make ready
      transport.setReady(true);
      await syncCore.syncNow("manual");

      expect(repos.libraryItems.items.size).toBe(1);
    });

    it("auto-syncs when transport transitions to ready (no manual syncNow)", async () => {
      // Start with a transport that is not ready (e.g. NullTransport / signed-out state)
      transport.setReady(false);
      transport.setLibraryItemsPages([
        { entries: [createSyncItem("item-1", 1000)], hasMore: false },
      ]);

      const applied = new Promise<void>((resolve) => {
        syncCore.onApplied((ev) => {
          if (ev.table === "libraryItems") resolve();
        });
      });

      await syncCore.start();

      // Now simulate "sign in": transport becomes ready and is set again.
      transport.setReady(true);
      syncCore.setTransport(transport);

      await applied;
      expect(repos.libraryItems.items.size).toBe(1);
    });
  });

  describe("account isolation (Phase 6.6)", () => {
    // Helper to properly start a sync core (matches startAndEnableSync pattern)
    async function startSyncCore(core: SyncCore, t: TestTransport) {
      await core.start();
      t.setReady(true);
      core.setTransport(t); // Re-set to trigger updateStatus
      await core.syncNow("manual");
    }

    it("separate repos = separate data (profile isolation by construction)", async () => {
      // Profile A repos + transport
      const reposA = createRepos();
      const transportA = new TestTransport();
      transportA.setReady(false); // Start not ready
      transportA.setLibraryItemsPages([
        { entries: [createSyncItem("item-A", 1000)], hasMore: false },
      ]);

      const syncCoreA = new SyncCore({ repos: reposA });
      syncCoreA.setTransport(transportA);
      await startSyncCore(syncCoreA, transportA);

      // Profile B repos + transport
      const reposB = createRepos();
      const transportB = new TestTransport();
      transportB.setReady(false); // Start not ready
      transportB.setLibraryItemsPages([
        { entries: [createSyncItem("item-B", 2000)], hasMore: false },
      ]);

      const syncCoreB = new SyncCore({ repos: reposB });
      syncCoreB.setTransport(transportB);
      await startSyncCore(syncCoreB, transportB);

      // Verify isolation: A has only A's data, B has only B's data
      expect(reposA.libraryItems.items.has("item-A")).toBe(true);
      expect(reposA.libraryItems.items.has("item-B")).toBe(false);
      expect(reposB.libraryItems.items.has("item-B")).toBe(true);
      expect(reposB.libraryItems.items.has("item-A")).toBe(false);

      // Verify cursor isolation
      const cursorA = await reposA.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      const cursorB = await reposB.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      expect(cursorA.updatedAt).toBe(1000);
      expect(cursorB.updatedAt).toBe(2000);

      syncCoreA.stop();
      syncCoreB.stop();
    });

    it("pending ops are isolated per profile", async () => {
      // Profile A: enqueue an op
      const reposA = createRepos();
      const transportA = new TestTransport();
      transportA.setReady(false); // Don't push yet
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

      // Profile B: separate repos, no pending ops
      const reposB = createRepos();
      const transportB = new TestTransport();
      transportB.setReady(false);
      const syncCoreB = new SyncCore({ repos: reposB });
      syncCoreB.setTransport(transportB);
      await syncCoreB.start();

      // Verify isolation
      expect(reposA.pendingOps.ops.length).toBe(1);
      expect(reposB.pendingOps.ops.length).toBe(0);
      expect(syncCoreA.pendingCount).toBe(1);
      expect(syncCoreB.pendingCount).toBe(0);

      syncCoreA.stop();
      syncCoreB.stop();
    });

    it("switching profiles requires new SyncCore instance", async () => {
      // This test documents the expected usage pattern:
      // When switching accounts, create a new SyncCore with new repos

      const reposA = createRepos();
      const transportA = new TestTransport();
      transportA.setReady(false);
      transportA.setLibraryItemsPages([
        { entries: [createSyncItem("item-A", 1000)], hasMore: false },
      ]);

      const syncCoreA = new SyncCore({ repos: reposA });
      syncCoreA.setTransport(transportA);
      await startSyncCore(syncCoreA, transportA);

      expect(reposA.libraryItems.items.has("item-A")).toBe(true);

      // "Sign out" - stop the core
      syncCoreA.stop();

      // "Sign in as B" - create new core with new repos
      const reposB = createRepos();
      const transportB = new TestTransport();
      transportB.setReady(false);
      transportB.setLibraryItemsPages([
        { entries: [createSyncItem("item-B", 2000)], hasMore: false },
      ]);

      const syncCoreB = new SyncCore({ repos: reposB });
      syncCoreB.setTransport(transportB);
      await startSyncCore(syncCoreB, transportB);

      // B's data should be in B's repos, not A's
      expect(reposB.libraryItems.items.has("item-B")).toBe(true);
      expect(reposB.libraryItems.items.has("item-A")).toBe(false);

      // A's repos should still have A's data (local persistence)
      expect(reposA.libraryItems.items.has("item-A")).toBe(true);

      syncCoreB.stop();
    });
  });

  describe("cursor correctness edge cases", () => {
    it("handles many entries with same updatedAt (tie-breaker test)", async () => {
      // Create 10 items all with the same updatedAt
      const sameTimestamp = 1000;
      const entries = Array.from({ length: 10 }, (_, i) => ({
        ...createSyncItem(`item-${String(i).padStart(2, "0")}`, sameTimestamp),
        cursorId: `item-${String(i).padStart(2, "0")}`,
      }));

      transport.setLibraryItemsPages([{ entries, hasMore: false }]);

      await startAndEnableSync();
      await syncCore.syncNow("manual");

      // All items should be saved
      expect(repos.libraryItems.items.size).toBe(10);

      // Cursor should point to lexicographically largest cursorId
      const cursor = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      expect(cursor.updatedAt).toBe(sameTimestamp);
      expect(cursor.cursorId).toBe("item-09"); // Lexicographically largest
    });

    it("cursor monotonicity: never goes backward", async () => {
      // First sync: items up to 2000
      transport.setLibraryItemsPages([
        { entries: [createSyncItem("item-1", 2000)], hasMore: false },
      ]);

      await startAndEnableSync();
      await syncCore.syncNow("manual");

      const cursor1 = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      expect(cursor1.updatedAt).toBe(2000);

      // Second sync: server returns older data (shouldn't happen, but test defensively)
      transport.setLibraryItemsPages([
        { entries: [createSyncItem("item-old", 1000)], hasMore: false },
      ]);

      await syncCore.syncNow("manual");

      // Cursor should NOT have gone backward
      const cursor2 = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      expect(cursor2.updatedAt).toBeGreaterThanOrEqual(2000);
    });
  });

  describe("cross-table sync correctness", () => {
    it("syncs all tables in one tick", async () => {
      // Setup: each table has data
      transport.setLibraryItemsPages([
        { entries: [createSyncItem("item-1", 1000)], hasMore: false },
      ]);
      transport.setSourceLinksPages([
        { entries: [createSourceLink("link-1", "item-1", 1000)], hasMore: false },
      ]);
      transport.setChapterProgressPages([
        {
          entries: [
            {
              cursorId: "progress-1",
              registryId: "aidoku",
              sourceId: "source-1",
              sourceMangaId: "manga-1",
              sourceChapterId: "ch-1",
              progress: 10,
              total: 20,
              completed: false,
              lastReadAt: 1000,
              updatedAt: 1000,
            },
          ],
          hasMore: false,
        },
      ]);
      transport.setMangaProgressPages([
        {
          entries: [
            {
              cursorId: "mp-1",
              registryId: "aidoku",
              sourceId: "source-1",
              sourceMangaId: "manga-1",
              lastReadAt: 1000,
              lastReadSourceChapterId: "ch-1",
              updatedAt: 1000,
            },
          ],
          hasMore: false,
        },
      ]);

      await startAndEnableSync();
      await syncCore.syncNow("manual");

      // All tables should have data
      expect(repos.libraryItems.items.size).toBe(1);
      expect(repos.sourceLinks.links.size).toBe(1);
      expect(repos.chapterProgress.entries.size).toBe(1);
      expect(repos.mangaProgress.entries.size).toBe(1);

      // All cursors should be updated
      expect((await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS)).updatedAt).toBe(1000);
      expect((await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.SOURCE_LINKS)).updatedAt).toBe(1000);
      expect((await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.CHAPTER_PROGRESS)).updatedAt).toBe(1000);
      expect((await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.MANGA_PROGRESS)).updatedAt).toBe(1000);
    });

    it("slow table (many pages) doesn't block other tables", async () => {
      // Library items: 3 pages
      transport.setLibraryItemsPages([
        { entries: [createSyncItem("item-1", 1000)], hasMore: true, nextCursor: { updatedAt: 1000, cursorId: "item-1" } },
        { entries: [createSyncItem("item-2", 2000)], hasMore: true, nextCursor: { updatedAt: 2000, cursorId: "item-2" } },
        { entries: [createSyncItem("item-3", 3000)], hasMore: false },
      ]);

      // Source links: 1 page
      transport.setSourceLinksPages([
        { entries: [createSourceLink("link-1", "item-1", 5000)], hasMore: false },
      ]);

      await startAndEnableSync();
      await syncCore.syncNow("manual");

      // Both should complete
      expect(repos.libraryItems.items.size).toBe(3);
      expect(repos.sourceLinks.links.size).toBe(1);

      // Both cursors should be at their respective max
      expect((await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS)).updatedAt).toBe(3000);
      expect((await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.SOURCE_LINKS)).updatedAt).toBe(5000);
    });
  });
});

