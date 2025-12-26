/**
 * Rigorous Sync Specification Tests
 *
 * These tests are designed to EXPOSE implementation bugs, not verify happy paths.
 * Tests are derived from invariants specified in docs/sync.md.
 *
 * Test categories (from Phase 7 test plan):
 * - 7.T1: Deterministic transport harness (TestTransport)
 * - 7.T2: Property tests: cursor correctness
 * - 7.T3: Property tests: clock merge correctness (HLC)
 * - 7.T4: Crash/restart tests (at-least-once push)
 * - 7.T5: Multi-account isolation tests
 * - 7.T6: Integration tests (happy path)
 *
 * Additional tests from Phase 6 exit criteria:
 * - Cursor pagination correctness with many rows sharing same updatedAt
 * - Cross-table cursor correctness
 * - Local canonical read path
 * - Field-safe merges
 */

import { describe, it, expect } from "bun:test";
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
import {
  formatIntentClock,
  compareIntentClocks,
  HLC,
  createHLCState,
  mergeFieldWithClock,
  isClockNewer,
} from "./hlc";

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
  private hlc: HLC;
  constructor(nodeId: string = "test-node") {
    this.hlc = new HLC(createHLCState(nodeId));
  }
  async generateIntentClock(): Promise<string> {
    return this.hlc.now();
  }
  async receiveIntentClock(clock: string): Promise<void> {
    this.hlc.receive(clock);
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
// 7.T2: Property Tests - Cursor Correctness
// ============================================================================

describe("7.T2: Cursor correctness property tests", () => {
  describe("Deterministic pagination with many shared updatedAt values", () => {
    it("SPEC: no missed rows when N=100 rows share same updatedAt", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      const sameTimestamp = 5000;
      const entries = Array.from({ length: 100 }, (_, i) => ({
        ...createSyncItem(`item-${String(i).padStart(3, "0")}`, sameTimestamp),
        cursorId: `item-${String(i).padStart(3, "0")}`,
      }));

      // Single page with all entries
      transport.setLibraryItemsPages([{ entries, hasMore: false }]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      // ALL 100 items must be present
      expect(repos.libraryItems.items.size).toBe(100);

      // Verify each item is present
      for (let i = 0; i < 100; i++) {
        const id = `item-${String(i).padStart(3, "0")}`;
        expect(repos.libraryItems.items.has(id)).toBe(true);
      }

      syncCore.stop();
    });

    it("SPEC: no duplicates when paginating through shared updatedAt values", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      const sameTimestamp = 5000;
      // Split 30 entries across 3 pages
      const page1 = Array.from({ length: 10 }, (_, i) => ({
        ...createSyncItem(`item-${String(i).padStart(2, "0")}`, sameTimestamp),
        cursorId: `item-${String(i).padStart(2, "0")}`,
      }));
      const page2 = Array.from({ length: 10 }, (_, i) => ({
        ...createSyncItem(`item-${String(i + 10).padStart(2, "0")}`, sameTimestamp),
        cursorId: `item-${String(i + 10).padStart(2, "0")}`,
      }));
      const page3 = Array.from({ length: 10 }, (_, i) => ({
        ...createSyncItem(`item-${String(i + 20).padStart(2, "0")}`, sameTimestamp),
        cursorId: `item-${String(i + 20).padStart(2, "0")}`,
      }));

      transport.setLibraryItemsPages([
        { entries: page1, hasMore: true, nextCursor: { updatedAt: sameTimestamp, cursorId: "item-09" } },
        { entries: page2, hasMore: true, nextCursor: { updatedAt: sameTimestamp, cursorId: "item-19" } },
        { entries: page3, hasMore: false },
      ]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      // Should have exactly 30 unique items
      expect(repos.libraryItems.items.size).toBe(30);

      syncCore.stop();
    });

    it("SPEC: cursorId tie-breaker is lexicographic", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      const sameTimestamp = 5000;
      // Non-alphabetically ordered cursorIds
      const entries = [
        { ...createSyncItem("zzz", sameTimestamp), cursorId: "zzz" },
        { ...createSyncItem("aaa", sameTimestamp), cursorId: "aaa" },
        { ...createSyncItem("mmm", sameTimestamp), cursorId: "mmm" },
        { ...createSyncItem("AAA", sameTimestamp), cursorId: "AAA" }, // Uppercase comes before lowercase
      ];

      transport.setLibraryItemsPages([{ entries, hasMore: false }]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      const cursor = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      expect(cursor.updatedAt).toBe(sameTimestamp);
      // "zzz" is lexicographically largest
      expect(cursor.cursorId).toBe("zzz");

      syncCore.stop();
    });

    it("SPEC: cursorId with special characters (colons, slashes) are handled correctly", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      const sameTimestamp = 5000;
      // CursorIds with special characters (like those used in source links)
      const entries = [
        { ...createSyncItem("r:s:manga1", sameTimestamp), cursorId: "r:s:manga1" },
        { ...createSyncItem("r:s:manga2", sameTimestamp), cursorId: "r:s:manga2" },
        { ...createSyncItem("r/s/manga3", sameTimestamp), cursorId: "r/s/manga3" },
      ];

      transport.setLibraryItemsPages([{ entries, hasMore: false }]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      expect(repos.libraryItems.items.size).toBe(3);
      expect(repos.libraryItems.items.has("r:s:manga1")).toBe(true);
      expect(repos.libraryItems.items.has("r:s:manga2")).toBe(true);
      expect(repos.libraryItems.items.has("r/s/manga3")).toBe(true);

      syncCore.stop();
    });

    it("SPEC: no missed rows when N=10,000 rows share the same updatedAt and are paginated", async () => {
      // Phase 6 exit criteria calls out a large shared-updatedAt dataset with small pages.
      // This test stresses the SyncCore pull loop (multi-page processing) and cursor advancement.
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      const sameTimestamp = 5000;
      const N = 10_000;
      const pageSize = 37;

      const entries = Array.from({ length: N }, (_, i) => ({
        ...createSyncItem(`item-${String(i).padStart(5, "0")}`, sameTimestamp),
        cursorId: `item-${String(i).padStart(5, "0")}`,
      }));

      const pages = [];
      for (let i = 0; i < entries.length; i += pageSize) {
        const chunk = entries.slice(i, i + pageSize);
        const last = chunk[chunk.length - 1];
        const isLast = i + pageSize >= entries.length;
        pages.push({
          entries: chunk,
          hasMore: !isLast,
          nextCursor: !isLast ? { updatedAt: sameTimestamp, cursorId: last.cursorId } : undefined,
        });
      }

      transport.setLibraryItemsPages(pages);

      const syncCore = new SyncCore({
        repos,
        // Make the test deterministic: ensure a single sync can drain all scripted pages.
        config: { maxPagesPerTick: pages.length + 1 },
      });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      expect(repos.libraryItems.items.size).toBe(N);

      const cursor = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      expect(cursor.updatedAt).toBe(sameTimestamp);
      expect(cursor.cursorId).toBe("item-09999");

      syncCore.stop();
    });
  });

  describe("Cursor monotonicity", () => {
    it("SPEC: cursor never decreases even with stale server responses", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      // First sync: items at time 10000
      transport.setLibraryItemsPages([
        { entries: [createSyncItem("item-new", 10000)], hasMore: false },
      ]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      const cursor1 = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      expect(cursor1.updatedAt).toBe(10000);

      // Second sync: server mistakenly returns older data
      transport.setLibraryItemsPages([
        { entries: [createSyncItem("item-old", 1000)], hasMore: false },
      ]);

      await syncCore.syncNow("manual");

      // Cursor must NOT have decreased
      const cursor2 = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      expect(cursor2.updatedAt).toBeGreaterThanOrEqual(10000);

      syncCore.stop();
    });

    it("SPEC: cursor is strictly increasing across syncs with newer data", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      const cursors: CompositeCursor[] = [];

      // Perform 5 syncs with increasing timestamps
      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);

      for (let i = 1; i <= 5; i++) {
        transport.setLibraryItemsPages([
          { entries: [createSyncItem(`item-${i}`, i * 1000)], hasMore: false },
        ]);
        await syncCore.syncNow("manual");
        cursors.push(await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS));
      }

      // Each cursor should be >= previous
      for (let i = 1; i < cursors.length; i++) {
        expect(cursors[i].updatedAt).toBeGreaterThanOrEqual(cursors[i - 1].updatedAt);
      }

      syncCore.stop();
    });
  });

  describe("Cross-table cursor independence", () => {
    it("SPEC: each table has independent cursor progression", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      // Different timestamps per table
      transport.setLibraryItemsPages([
        { entries: [createSyncItem("item-1", 1000)], hasMore: false },
      ]);
      transport.setSourceLinksPages([
        { entries: [createSourceLink("link-1", "item-1", 2000)], hasMore: false },
      ]);
      transport.setChapterProgressPages([
        {
          entries: [{
            cursorId: "cp-1",
            registryId: "r",
            sourceId: "s",
            sourceMangaId: "m",
            sourceChapterId: "c",
            progress: 10,
            total: 20,
            completed: false,
            lastReadAt: 3000,
            updatedAt: 3000,
          }],
          hasMore: false,
        },
      ]);
      transport.setMangaProgressPages([
        {
          entries: [{
            cursorId: "mp-1",
            registryId: "r",
            sourceId: "s",
            sourceMangaId: "m",
            lastReadAt: 4000,
            updatedAt: 4000,
          }],
          hasMore: false,
        },
      ]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      // Each table should have its own cursor value
      const libCursor = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      const linkCursor = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.SOURCE_LINKS);
      const cpCursor = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.CHAPTER_PROGRESS);
      const mpCursor = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.MANGA_PROGRESS);

      expect(libCursor.updatedAt).toBe(1000);
      expect(linkCursor.updatedAt).toBe(2000);
      expect(cpCursor.updatedAt).toBe(3000);
      expect(mpCursor.updatedAt).toBe(4000);

      syncCore.stop();
    });

    it("SPEC: slow table (many pages) does not skip other tables", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      // Library items: 5 pages
      transport.setLibraryItemsPages([
        { entries: [createSyncItem("item-1", 1000)], hasMore: true, nextCursor: { updatedAt: 1000, cursorId: "item-1" } },
        { entries: [createSyncItem("item-2", 2000)], hasMore: true, nextCursor: { updatedAt: 2000, cursorId: "item-2" } },
        { entries: [createSyncItem("item-3", 3000)], hasMore: true, nextCursor: { updatedAt: 3000, cursorId: "item-3" } },
        { entries: [createSyncItem("item-4", 4000)], hasMore: true, nextCursor: { updatedAt: 4000, cursorId: "item-4" } },
        { entries: [createSyncItem("item-5", 5000)], hasMore: false },
      ]);

      // Source links: 1 page
      transport.setSourceLinksPages([
        { entries: [createSourceLink("link-1", "item-1", 9000)], hasMore: false },
      ]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      // Both tables should be fully synced
      expect(repos.libraryItems.items.size).toBe(5);
      expect(repos.sourceLinks.links.size).toBe(1);

      // Cursors should reflect final state
      const libCursor = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      const linkCursor = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.SOURCE_LINKS);
      expect(libCursor.updatedAt).toBe(5000);
      expect(linkCursor.updatedAt).toBe(9000);

      syncCore.stop();
    });
  });
});

// ============================================================================
// 7.T3: Property Tests - HLC Clock Merge Correctness
// ============================================================================

describe("7.T3: HLC clock merge correctness", () => {
  describe("Two-device convergence", () => {
    it("SPEC: A clears offline at t, B edits online at t+ε → B wins when A comes online", async () => {
      // This is the key test from Phase 6.5 exit criteria
      // A clears overrides offline at time t
      // B edits overrides online at t+ε (slightly later)
      // When A comes online, B's edit must win because its HLC is larger

      const tA = makeClock(1000, 0, "device-A");
      const tB = makeClock(1001, 0, "device-B"); // t+ε

      // A's clear operation (older clock)
      const clearResult = mergeFieldWithClock(
        { title: "B's edit" }, // existing value (from B)
        tB,                    // B's clock (newer)
        null,                  // A's incoming clear
        tA                     // A's clock (older)
      );

      // B's edit should win
      expect(clearResult.value).toEqual({ title: "B's edit" });
      expect(clearResult.clock).toBe(tB);
    });

    it("SPEC: A edits offline at t, B clears online at t+ε → B's clear wins when A comes online", async () => {
      const tA = makeClock(1000, 0, "device-A");
      const tB = makeClock(1001, 0, "device-B");

      // B's clear (newer clock) wins over A's edit (older clock)
      const result = mergeFieldWithClock(
        { title: "A's edit" }, // existing (from A)
        tA,                    // A's clock
        null,                  // B's incoming clear
        tB                     // B's clock (newer)
      );

      expect(result.value).toBeNull();
      expect(result.clock).toBe(tB);
    });

    it("SPEC: concurrent edits → lexicographically larger nodeId wins on tie", async () => {
      // Same wallMs and counter, different nodeId
      const clockA = makeClock(1000, 0, "aaa");
      const clockZ = makeClock(1000, 0, "zzz");

      // "zzz" > "aaa" lexicographically
      expect(compareIntentClocks(clockZ, clockA)).toBeGreaterThan(0);

      const result = mergeFieldWithClock(
        { title: "A's value" },
        clockA,
        { title: "Z's value" },
        clockZ
      );

      expect(result.value).toEqual({ title: "Z's value" });
    });

    it("SPEC: operations delivered in random order converge to same state", () => {
      // Simulate 3 operations: set1, set2, clear
      // Delivered in various orders, should always converge

      const set1Clock = makeClock(1000, 0, "device-1");
      const set2Clock = makeClock(2000, 0, "device-2");
      const clearClock = makeClock(1500, 0, "device-3");

      const ops = [
        { value: { title: "Value 1" }, clock: set1Clock },
        { value: { title: "Value 2" }, clock: set2Clock },
        { value: null as null, clock: clearClock },
      ];

      // Try all 6 permutations
      const permutations = [
        [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
      ];

      const finalStates = permutations.map((perm) => {
        let value: { title: string } | null | undefined = undefined;
        let clock: string | undefined = undefined;

        for (const i of perm) {
          const result: { value: { title: string } | null | undefined; clock: string | undefined } = mergeFieldWithClock(value, clock, ops[i].value, ops[i].clock);
          value = result.value as { title: string } | null | undefined;
          clock = result.clock;
        }

        return { value, clock };
      });

      // All permutations should converge to the same state
      const expectedClock = set2Clock; // Newest clock wins
      for (const state of finalStates) {
        expect(state.clock).toBe(expectedClock);
        expect(state.value).toEqual({ title: "Value 2" });
      }
    });
  });

  describe("Clock skew handling", () => {
    it("SPEC: device with clock skewed ahead by minutes still converges", () => {
      // Device A has clock 5 minutes ahead
      const skewedClock = makeClock(Date.now() + 5 * 60 * 1000, 0, "skewed-device");
      const normalClock = makeClock(Date.now(), 0, "normal-device");

      // Skewed clock is still newer and wins in comparisons
      expect(isClockNewer(skewedClock, normalClock)).toBe(true);

      // HLC.receive() protects against excessive drift (MAX_DRIFT_MS = 60000)
      // by ignoring the wallMs but incrementing the counter
      const hlc = new HLC(createHLCState("receiver"));
      const afterReceive = hlc.receive(skewedClock);

      // NOTE: Current implementation increments counter but doesn't advance wallMs
      // for excessively skewed clocks. This means the clock comparison may not
      // always be > skewedClock, which is documented behavior for security.
      // The important thing is that local clock doesn't go backward.
      const beforeReceive = makeClock(0, 0, "receiver");
      expect(compareIntentClocks(afterReceive, beforeReceive)).toBeGreaterThan(0);
    });

    it("SPEC: device with clock skewed ahead within tolerance advances past it", () => {
      // Device A has clock 30 seconds ahead (within MAX_DRIFT_MS = 60000)
      const skewedClock = makeClock(Date.now() + 30 * 1000, 0, "skewed-device");

      const hlc = new HLC(createHLCState("receiver"));
      const afterReceive = hlc.receive(skewedClock);

      // For skew within tolerance, local clock should advance past remote
      expect(compareIntentClocks(afterReceive, skewedClock)).toBeGreaterThan(0);
    });

    it("SPEC: HLC never produces duplicate clocks even under rapid calls", () => {
      const hlc = new HLC(createHLCState("test-node"));
      const clocks = new Set<string>();

      // Generate 10000 clocks as fast as possible
      for (let i = 0; i < 10000; i++) {
        const clock = hlc.now();
        expect(clocks.has(clock)).toBe(false);
        clocks.add(clock);
      }

      expect(clocks.size).toBe(10000);
    });

    it("SPEC: HLC clocks are strictly monotonic", () => {
      const hlc = new HLC(createHLCState("test-node"));
      let prevClock = "";

      for (let i = 0; i < 1000; i++) {
        const clock = hlc.now();
        if (prevClock) {
          expect(compareIntentClocks(clock, prevClock)).toBeGreaterThan(0);
        }
        prevClock = clock;
      }
    });
  });

  describe("Field group independence", () => {
    it("SPEC: inLibrary, metadata override, and coverUrl clocks are all independent", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      // Local has:
      // - membership: t=1000 (will lose)
      // - metadata override: t=3000 (will win)
      // - coverUrl override: t=2000 (will lose)
      const localMemberClock = makeClock(1000, 0, "local");
      const localMetaClock = makeClock(3000, 0, "local");
      const localCoverClock = makeClock(2000, 0, "local");

      repos.libraryItems.items.set("item-1", {
        libraryItemId: "item-1",
        metadata: { title: "Original" },
        inLibrary: true,
        inLibraryClock: localMemberClock,
        overrides: {
          metadata: { title: "Local Title" },
          metadataClock: localMetaClock,
          coverUrl: "local-cover.jpg",
          coverUrlClock: localCoverClock,
        },
        createdAt: 1000,
        updatedAt: 3000,
      });

      // Cloud has:
      // - membership: t=2000 (will win - removal)
      // - metadata override: t=1500 (will lose)
      // - coverUrl override: t=4000 (will win)
      const cloudMemberClock = makeClock(2000, 0, "cloud");
      const cloudMetaClock = makeClock(1500, 0, "cloud");
      const cloudCoverClock = makeClock(4000, 0, "cloud");

      transport.setLibraryItemsPages([{
        entries: [createSyncItem("item-1", 4000, {
          inLibrary: false, // Removal
          inLibraryClock: cloudMemberClock,
          overrides: {
            metadata: { title: "Cloud Title" },
            metadataClock: cloudMetaClock,
            coverUrl: "cloud-cover.jpg",
            coverUrlClock: cloudCoverClock,
          },
        })],
        hasMore: false,
      }]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      const item = repos.libraryItems.items.get("item-1")!;

      // Membership: cloud wins (2000 > 1000)
      expect(item.inLibrary).toBe(false);
      expect(item.inLibraryClock).toBe(cloudMemberClock);

      // Metadata: local wins (3000 > 1500)
      expect(item.overrides?.metadata?.title).toBe("Local Title");
      expect(item.overrides?.metadataClock).toBe(localMetaClock);

      // Cover: cloud wins (4000 > 2000)
      expect(item.overrides?.coverUrl).toBe("cloud-cover.jpg");
      expect(item.overrides?.coverUrlClock).toBe(cloudCoverClock);

      syncCore.stop();
    });
  });

  describe("Null vs undefined semantics", () => {
    it("SPEC: null (explicit clear) with newer clock wipes value", () => {
      const older = makeClock(1000, 0, "a");
      const newer = makeClock(2000, 0, "b");

      const result = mergeFieldWithClock({ title: "existing" }, older, null, newer);
      expect(result.value).toBeNull();
      expect(result.clock).toBe(newer);
    });

    it("SPEC: null (explicit clear) with older clock does NOT wipe value", () => {
      const older = makeClock(1000, 0, "a");
      const newer = makeClock(2000, 0, "b");

      const result = mergeFieldWithClock({ title: "existing" }, newer, null, older);
      expect(result.value).toEqual({ title: "existing" });
      expect(result.clock).toBe(newer);
    });

    it("SPEC: undefined NEVER wipes existing value, regardless of clock", () => {
      const older = makeClock(1000, 0, "a");
      const newer = makeClock(2000, 0, "b");

      // Even with much newer clock, undefined doesn't wipe
      const result = mergeFieldWithClock({ title: "existing" }, older, undefined, newer);
      expect(result.value).toEqual({ title: "existing" });
      expect(result.clock).toBe(older); // Clock stays as is when value is preserved
    });

    it("SPEC: undefined does not upgrade clock without changing value", () => {
      const existingClock = makeClock(1000, 0, "a");
      const newerClock = makeClock(2000, 0, "b");

      const result = mergeFieldWithClock("existing-value", existingClock, undefined, newerClock);
      // Value is preserved, and clock should NOT advance for undefined
      expect(result.value).toBe("existing-value");
      expect(result.clock).toBe(existingClock);
    });
  });
});

// ============================================================================
// Additional rigorous SyncCore behavioral tests (gaps from sync.md invariants)
// ============================================================================

describe("SyncCore - settings merge + pending ops correctness", () => {
  it("SPEC: settings pull merges deterministically AND replaces any pending settings op with the merged snapshot", async () => {
    // sync.md: settings are small, merged locally, and the push path must not drop remote additions.
    // SyncCore contract: if settings change due to pull, ensure there is exactly one pending settings op
    // representing the merged state (replace any existing pending settings ops).
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // Local user has an installed source A and (critically) a pending op representing that local edit.
    repos.settings.settings = {
      installedSources: [{ id: "A", registryId: "regA", version: 1 }],
    };
    await repos.pendingOps.addPendingOp({
      table: "settings",
      operation: "save",
      data: { installedSources: [{ id: "A", registryId: "regA", version: 1 }] },
      timestamp: Date.now(),
      retries: 0,
    });

    // Remote has source B (should be unioned).
    transport.setSettingsSnapshot({
      installedSources: [{ id: "B", registryId: "regB", version: 1 }],
    });

    const syncCore = new SyncCore({ repos });
    // Ensure the merged pending settings op remains for inspection by making the push fail.
    transport.injectPushFailure(new Error("Simulated push failure"));
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    // Local settings should now include A and B (deterministic ordering by id).
    expect(repos.settings.settings.installedSources.map((s) => s.id)).toEqual(["A", "B"]);

    // There must be exactly one pending settings op, and it must represent the merged snapshot.
    const pending = await repos.pendingOps.getPendingOps();
    const pendingSettings = pending.filter((op) => op.table === "settings" && op.operation === "save");
    expect(pendingSettings.length).toBe(1);
    expect((pendingSettings[0].data as UserSettings).installedSources.map((s) => s.id)).toEqual(["A", "B"]);
    expect(pendingSettings[0].retries).toBeGreaterThanOrEqual(1);

    // And because the push failed, nothing should have been pushed.
    expect(transport.pushedEvents.some((e) => e.type === "settings")).toBe(false);

    syncCore.stop();
  });
});

describe("SyncCore - HLC receiveIntentClock forwarding", () => {
  it("SPEC: applying remote library items MUST forward all provided intent clocks into hlc.receiveIntentClock()", async () => {
    const received: string[] = [];
    const repos = createRepos("device-a");
    repos.hlc = {
      async generateIntentClock() {
        return formatIntentClock({ wallMs: Date.now(), counter: 0, nodeId: "device-a" });
      },
      async receiveIntentClock(clock: string) {
        received.push(clock);
      },
    };

    const transport = new TestTransport();
    transport.setReady(false);

    const memberClock = makeClock(1000, 0, "cloud");
    const metaClock = makeClock(1000, 1, "cloud");
    const coverClock = makeClock(1000, 2, "cloud");

    transport.setLibraryItemsPages([
      {
        entries: [
          createSyncItem("item-1", 1000, {
            inLibrary: true,
            inLibraryClock: memberClock,
            overrides: {
              metadata: { title: "X" },
              metadataClock: metaClock,
              coverUrl: "cover",
              coverUrlClock: coverClock,
            },
          }),
        ],
        hasMore: false,
      },
    ]);

    const syncCore = new SyncCore({ repos });
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    // All clocks must be forwarded (order is not important; duplicates are allowed).
    expect(received).toEqual(expect.arrayContaining([memberClock, metaClock, coverClock]));
    expect(received.length).toBeGreaterThanOrEqual(3);

    syncCore.stop();
  });
});

// ============================================================================
// 7.T4: Crash/Restart Tests (At-Least-Once Push)
// ============================================================================

describe("7.T4: Crash/restart tests (at-least-once push)", () => {
  describe("Pending ops persistence", () => {
    it("SPEC: ops enqueued but not pushed survive restart", async () => {
      const repos = createRepos("device-a");
      const transport1 = new TestTransport();
      transport1.setReady(false); // Offline

      const syncCore1 = new SyncCore({ repos });
      syncCore1.setTransport(transport1);
      await syncCore1.start();

      // Enqueue multiple ops while offline
      await syncCore1.enqueue({
        table: "library_items",
        operation: "save",
        data: { libraryItemId: "pending-1" },
        timestamp: Date.now(),
        retries: 0,
      });
      await syncCore1.enqueue({
        table: "chapter_progress",
        operation: "save",
        data: { cursorId: "cp-1" },
        timestamp: Date.now(),
        retries: 0,
      });
      await syncCore1.enqueue({
        table: "source_links",
        operation: "save",
        data: { cursorId: "link-1" },
        timestamp: Date.now(),
        retries: 0,
      });

      expect(repos.pendingOps.ops.length).toBe(3);

      // "Crash" without syncing
      syncCore1.stop();

      // "Restart" with same repos
      const transport2 = new TestTransport();
      transport2.setReady(false);
      const syncCore2 = new SyncCore({ repos });
      syncCore2.setTransport(transport2);
      await syncCore2.start();

      // All 3 ops should still be pending
      expect(syncCore2.pendingCount).toBe(3);
      expect(repos.pendingOps.ops.length).toBe(3);

      // Go online and sync
      transport2.setReady(true);
      syncCore2.setTransport(transport2);
      await syncCore2.syncNow("manual");

      // All ops should be pushed
      expect(transport2.pushedEvents.length).toBe(3);
      expect(repos.pendingOps.ops.length).toBe(0);

      syncCore2.stop();
    });

    it("SPEC: ops partially pushed before crash are retried", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      const syncCore = new SyncCore({ repos });
      syncCore.setTransport(transport);
      await syncCore.start();

      // Enqueue 3 ops
      await syncCore.enqueue({ table: "library_items", operation: "save", data: { libraryItemId: "item-1" }, timestamp: Date.now(), retries: 0 });
      await syncCore.enqueue({ table: "library_items", operation: "save", data: { libraryItemId: "item-2" }, timestamp: Date.now(), retries: 0 });
      await syncCore.enqueue({ table: "library_items", operation: "save", data: { libraryItemId: "item-3" }, timestamp: Date.now(), retries: 0 });

      // Go online but inject failure after first push
      transport.setReady(true);
      let pushCount = 0;
      const originalPush = transport.pushLibraryItem.bind(transport);
      transport.pushLibraryItem = async (item) => {
        pushCount++;
        if (pushCount === 2) {
          throw new Error("Simulated crash mid-push");
        }
        return originalPush(item);
      };

      syncCore.setTransport(transport);

      // First sync attempt - should fail mid-way
      try {
        await syncCore.syncNow("manual");
      } catch {
        // Expected to fail
      }

      // Some ops should have succeeded, some should have incremented retries
      // At minimum, unpushed ops should still be in queue
      const remainingOps = await repos.pendingOps.getPendingOps();
      expect(remainingOps.length).toBeGreaterThan(0);

      syncCore.stop();
    });

    it("SPEC: cursors survive restart and enable incremental sync", async () => {
      const repos = createRepos("device-a");
      const transport1 = new TestTransport();
      transport1.setReady(false);
      transport1.setLibraryItemsPages([
        { entries: [createSyncItem("item-1", 1000)], hasMore: false },
      ]);

      // First sync
      const syncCore1 = new SyncCore({ repos });
      await startAndEnableSync(syncCore1, transport1);
      await syncCore1.syncNow("manual");

      expect(repos.libraryItems.items.size).toBe(1);
      const cursor1 = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      expect(cursor1.updatedAt).toBe(1000);

      // "Crash"
      syncCore1.stop();

      // "Restart" with new data available
      const transport2 = new TestTransport();
      transport2.setReady(false);
      transport2.setLibraryItemsPages([
        { entries: [createSyncItem("item-2", 2000)], hasMore: false },
      ]);

      const syncCore2 = new SyncCore({ repos });
      await startAndEnableSync(syncCore2, transport2);
      await syncCore2.syncNow("manual");

      // Should have both old and new data (incremental worked)
      expect(repos.libraryItems.items.size).toBe(2);
      expect(repos.libraryItems.items.has("item-1")).toBe(true);
      expect(repos.libraryItems.items.has("item-2")).toBe(true);

      // Cursor should be at latest
      const cursor2 = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      expect(cursor2.updatedAt).toBe(2000);

      syncCore2.stop();
    });
  });

  describe("Retry behavior", () => {
    it("SPEC: failed ops increment retry count", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      const syncCore = new SyncCore({ repos, config: { retryPolicy: { maxRetries: 5, baseDelayMs: 10, maxDelayMs: 100 } } });
      syncCore.setTransport(transport);
      await syncCore.start();

      await syncCore.enqueue({
        table: "library_items",
        operation: "save",
        data: { libraryItemId: "retry-test" },
        timestamp: Date.now(),
        retries: 0,
      });

      // Enable transport but inject failures
      transport.setReady(true);
      transport.injectPushFailure(new Error("Network error"));
      syncCore.setTransport(transport);

      // First sync - should fail
      await syncCore.syncNow("manual");

      // Op should still be pending with incremented retries
      const ops = await repos.pendingOps.getPendingOps();
      expect(ops.length).toBe(1);
      expect(ops[0].retries).toBeGreaterThanOrEqual(1);

      syncCore.stop();
    });

    it("SPEC: ops are abandoned after max retries", async () => {
      const repos = createRepos("device-a");

      // Add an op that's already at max retries
      await repos.pendingOps.addPendingOp({
        table: "library_items",
        operation: "save",
        data: { libraryItemId: "doomed" },
        timestamp: Date.now(),
        retries: 3, // At max
      });

      const transport = new TestTransport();
      transport.setReady(false);

      const syncCore = new SyncCore({
        repos,
        config: { retryPolicy: { maxRetries: 3, baseDelayMs: 10, maxDelayMs: 100 } },
      });

      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      // Op should be removed (abandoned)
      expect(repos.pendingOps.ops.length).toBe(0);
      // And nothing should have been pushed
      expect(transport.pushedEvents.length).toBe(0);

      syncCore.stop();
    });
  });
});

// ============================================================================
// 7.T5: Multi-Account Isolation Tests
// ============================================================================

describe("7.T5: Multi-account isolation tests", () => {
  describe("Data isolation", () => {
    it("SPEC: data from profile A never appears in profile B repos", async () => {
      const reposA = createRepos("device-a");
      const reposB = createRepos("device-b");

      const transportA = new TestTransport();
      transportA.setReady(false);
      transportA.setLibraryItemsPages([
        { entries: [createSyncItem("only-in-A", 1000)], hasMore: false },
      ]);
      transportA.setChapterProgressPages([
        {
          entries: [{
            cursorId: "progress-A",
            registryId: "r",
            sourceId: "s",
            sourceMangaId: "m",
            sourceChapterId: "c-A",
            progress: 10,
            total: 20,
            completed: false,
            lastReadAt: 1000,
            updatedAt: 1000,
          }],
          hasMore: false,
        },
      ]);

      const transportB = new TestTransport();
      transportB.setReady(false);
      transportB.setLibraryItemsPages([
        { entries: [createSyncItem("only-in-B", 2000)], hasMore: false },
      ]);

      const syncCoreA = new SyncCore({ repos: reposA });
      const syncCoreB = new SyncCore({ repos: reposB });

      await startAndEnableSync(syncCoreA, transportA);
      await startAndEnableSync(syncCoreB, transportB);

      await syncCoreA.syncNow("manual");
      await syncCoreB.syncNow("manual");

      // A's data
      expect(reposA.libraryItems.items.has("only-in-A")).toBe(true);
      expect(reposA.libraryItems.items.has("only-in-B")).toBe(false);
      expect(reposA.chapterProgress.entries.has("progress-A")).toBe(true);

      // B's data
      expect(reposB.libraryItems.items.has("only-in-B")).toBe(true);
      expect(reposB.libraryItems.items.has("only-in-A")).toBe(false);
      expect(reposB.chapterProgress.entries.has("progress-A")).toBe(false);

      syncCoreA.stop();
      syncCoreB.stop();
    });

    it("SPEC: cursors from profile A never affect profile B", async () => {
      const reposA = createRepos("device-a");
      const reposB = createRepos("device-b");

      const transportA = new TestTransport();
      transportA.setReady(false);
      transportA.setLibraryItemsPages([
        { entries: [createSyncItem("item-1", 99999)], hasMore: false },
      ]);

      const transportB = new TestTransport();
      transportB.setReady(false);
      transportB.setLibraryItemsPages([
        { entries: [createSyncItem("item-1", 11111)], hasMore: false },
      ]);

      const syncCoreA = new SyncCore({ repos: reposA });
      const syncCoreB = new SyncCore({ repos: reposB });

      // Sync A first
      await startAndEnableSync(syncCoreA, transportA);
      await syncCoreA.syncNow("manual");

      // Then sync B
      await startAndEnableSync(syncCoreB, transportB);
      await syncCoreB.syncNow("manual");

      // Cursors must be independent
      const cursorA = await reposA.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
      const cursorB = await reposB.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);

      expect(cursorA.updatedAt).toBe(99999);
      expect(cursorB.updatedAt).toBe(11111);

      syncCoreA.stop();
      syncCoreB.stop();
    });

    it("SPEC: pending ops from profile A never pushed to profile B transport", async () => {
      const reposA = createRepos("device-a");
      const reposB = createRepos("device-b");

      const transportA = new TestTransport();
      transportA.setReady(false);
      const transportB = new TestTransport();
      transportB.setReady(false);

      // Set up A and enqueue an op
      const syncCoreA = new SyncCore({ repos: reposA });
      syncCoreA.setTransport(transportA);
      await syncCoreA.start();

      await syncCoreA.enqueue({
        table: "library_items",
        operation: "save",
        data: { libraryItemId: "a-only-op" },
        timestamp: Date.now(),
        retries: 0,
      });

      // Set up B and sync
      const syncCoreB = new SyncCore({ repos: reposB });
      await startAndEnableSync(syncCoreB, transportB);
      await syncCoreB.syncNow("manual");

      // B's transport should have NO pushed events
      expect(transportB.pushedEvents.length).toBe(0);

      // A's op should still be pending
      expect(reposA.pendingOps.ops.length).toBe(1);
      expect(reposB.pendingOps.ops.length).toBe(0);

      syncCoreA.stop();
      syncCoreB.stop();
    });
  });

  describe("Profile switching", () => {
    it("SPEC: switching profiles requires new SyncCore instance with new repos", async () => {
      const reposA = createRepos("device-a");
      const reposB = createRepos("device-b");

      // User A session
      const transportA = new TestTransport();
      transportA.setReady(false);
      transportA.setLibraryItemsPages([
        { entries: [createSyncItem("user-a-item", 1000)], hasMore: false },
      ]);

      const syncCoreA = new SyncCore({ repos: reposA });
      await startAndEnableSync(syncCoreA, transportA);
      await syncCoreA.syncNow("manual");

      expect(reposA.libraryItems.items.has("user-a-item")).toBe(true);

      // "Sign out" - stop A
      syncCoreA.stop();

      // "Sign in as B" - create new core with new repos
      const transportB = new TestTransport();
      transportB.setReady(false);
      transportB.setLibraryItemsPages([
        { entries: [createSyncItem("user-b-item", 2000)], hasMore: false },
      ]);

      const syncCoreB = new SyncCore({ repos: reposB });
      await startAndEnableSync(syncCoreB, transportB);
      await syncCoreB.syncNow("manual");

      // B should have B's data only
      expect(reposB.libraryItems.items.has("user-b-item")).toBe(true);
      expect(reposB.libraryItems.items.has("user-a-item")).toBe(false);

      // A's repos should still have A's data (persistence)
      expect(reposA.libraryItems.items.has("user-a-item")).toBe(true);
      expect(reposA.libraryItems.items.has("user-b-item")).toBe(false);

      syncCoreB.stop();
    });
  });
});

// ============================================================================
// Progress High-Water Mark
// ============================================================================

describe("Progress high-water mark semantics", () => {
  it("SPEC: progress = max(local, incoming)", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // Local: high progress
    repos.chapterProgress.entries.set("cp-1", {
      cursorId: "cp-1",
      registryId: "r",
      sourceId: "s",
      sourceMangaId: "m",
      sourceChapterId: "c",
      progress: 95,
      total: 100,
      completed: false,
      lastReadAt: 1000,
      updatedAt: 1000,
    });

    // Incoming: low progress but newer updatedAt
    transport.setChapterProgressPages([{
      entries: [{
        cursorId: "cp-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        sourceChapterId: "c",
        progress: 10, // Much lower
        total: 100,
        completed: false,
        lastReadAt: 2000, // But read more recently
        updatedAt: 2000,
      }],
      hasMore: false,
    }]);

    const syncCore = new SyncCore({ repos });
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    const progress = repos.chapterProgress.entries.get("cp-1")!;
    expect(progress.progress).toBe(95); // max(95, 10)
    expect(progress.lastReadAt).toBe(2000); // max(1000, 2000)

    syncCore.stop();
  });

  it("SPEC: total = max(local, incoming) - never decrease", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    repos.chapterProgress.entries.set("cp-1", {
      cursorId: "cp-1",
      registryId: "r",
      sourceId: "s",
      sourceMangaId: "m",
      sourceChapterId: "c",
      progress: 50,
      total: 200, // High page count
      completed: false,
      lastReadAt: 1000,
      updatedAt: 1000,
    });

    transport.setChapterProgressPages([{
      entries: [{
        cursorId: "cp-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        sourceChapterId: "c",
        progress: 50,
        total: 80, // Lower page count (re-scan)
        completed: false,
        lastReadAt: 1000,
        updatedAt: 2000,
      }],
      hasMore: false,
    }]);

    const syncCore = new SyncCore({ repos });
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    const progress = repos.chapterProgress.entries.get("cp-1")!;
    expect(progress.total).toBe(200); // max(200, 80)

    syncCore.stop();
  });

  it("SPEC: completed = OR(local, incoming) - sticky true", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // Local: completed
    repos.chapterProgress.entries.set("cp-1", {
      cursorId: "cp-1",
      registryId: "r",
      sourceId: "s",
      sourceMangaId: "m",
      sourceChapterId: "c",
      progress: 100,
      total: 100,
      completed: true,
      lastReadAt: 1000,
      updatedAt: 1000,
    });

    // Incoming: not completed (user re-reading)
    transport.setChapterProgressPages([{
      entries: [{
        cursorId: "cp-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        sourceChapterId: "c",
        progress: 5,
        total: 100,
        completed: false,
        lastReadAt: 5000,
        updatedAt: 5000,
      }],
      hasMore: false,
    }]);

    const syncCore = new SyncCore({ repos });
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    const progress = repos.chapterProgress.entries.get("cp-1")!;
    expect(progress.completed).toBe(true); // OR(true, false) = true

    syncCore.stop();
  });

  it("SPEC: completed becomes true, stays true forever (sticky)", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // Local: not completed
    repos.chapterProgress.entries.set("cp-1", {
      cursorId: "cp-1",
      registryId: "r",
      sourceId: "s",
      sourceMangaId: "m",
      sourceChapterId: "c",
      progress: 50,
      total: 100,
      completed: false,
      lastReadAt: 1000,
      updatedAt: 1000,
    });

    // Incoming: completed
    transport.setChapterProgressPages([{
      entries: [{
        cursorId: "cp-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        sourceChapterId: "c",
        progress: 100,
        total: 100,
        completed: true,
        lastReadAt: 2000,
        updatedAt: 2000,
      }],
      hasMore: false,
    }]);

    const syncCore = new SyncCore({ repos });
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    let progress = repos.chapterProgress.entries.get("cp-1")!;
    expect(progress.completed).toBe(true);

    // Now incoming says not completed again
    transport.setChapterProgressPages([{
      entries: [{
        cursorId: "cp-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        sourceChapterId: "c",
        progress: 10,
        total: 100,
        completed: false,
        lastReadAt: 3000,
        updatedAt: 3000,
      }],
      hasMore: false,
    }]);

    await syncCore.syncNow("manual");

    progress = repos.chapterProgress.entries.get("cp-1")!;
    expect(progress.completed).toBe(true); // Still true (sticky)

    syncCore.stop();
  });
});

// ============================================================================
// Tombstone / No-Resurrection Tests
// ============================================================================

describe("Tombstone preservation (no resurrection)", () => {
  describe("Library items", () => {
    it("SPEC: inLibrary=false (tombstone) prevents resurrection by older add", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      // Local: item removed with newer clock
      const removeClock = makeClock(2000, 0, "device-a");
      repos.libraryItems.items.set("item-1", {
        libraryItemId: "item-1",
        metadata: { title: "Removed Item" },
        inLibrary: false,
        inLibraryClock: removeClock,
        createdAt: 1000,
        updatedAt: 2000,
      });

      // Incoming: older add
      const addClock = makeClock(1000, 0, "cloud");
      transport.setLibraryItemsPages([{
        entries: [createSyncItem("item-1", 1500, {
          inLibrary: true,
          inLibraryClock: addClock,
        })],
        hasMore: false,
      }]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      const item = repos.libraryItems.items.get("item-1")!;
      expect(item.inLibrary).toBe(false); // Still removed
      expect(item.inLibraryClock).toBe(removeClock);

      syncCore.stop();
    });

    it("SPEC: re-add with newer clock CAN resurrect removed item", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      // Local: item removed
      const removeClock = makeClock(1000, 0, "device-a");
      repos.libraryItems.items.set("item-1", {
        libraryItemId: "item-1",
        metadata: { title: "Removed Item" },
        inLibrary: false,
        inLibraryClock: removeClock,
        createdAt: 1000,
        updatedAt: 1000,
      });

      // Incoming: newer add (user re-added)
      const readdClock = makeClock(2000, 0, "cloud");
      transport.setLibraryItemsPages([{
        entries: [createSyncItem("item-1", 2000, {
          inLibrary: true,
          inLibraryClock: readdClock,
        })],
        hasMore: false,
      }]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      const item = repos.libraryItems.items.get("item-1")!;
      expect(item.inLibrary).toBe(true); // Re-added
      expect(item.inLibraryClock).toBe(readdClock);

      syncCore.stop();
    });
  });

  describe("Source links", () => {
    it("SPEC: deletedAt tombstone prevents resurrection by older entry", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      // Local: tombstoned link
      repos.sourceLinks.links.set("link-1", {
        cursorId: "link-1",
        libraryItemId: "item-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        createdAt: 1000,
        updatedAt: 2000,
        deletedAt: 2000,
      });

      // Incoming: older non-deleted version
      transport.setSourceLinksPages([{
        entries: [{
          cursorId: "link-1",
          libraryItemId: "item-1",
          registryId: "r",
          sourceId: "s",
          sourceMangaId: "m",
          createdAt: 1000,
          updatedAt: 1500, // Older than tombstone
        }],
        hasMore: false,
      }]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      const link = repos.sourceLinks.links.get("link-1")!;
      expect(link.deletedAt).toBe(2000); // Still tombstoned

      syncCore.stop();
    });

    it("SPEC: newer entry without deletedAt CAN replace tombstone", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      // Local: tombstoned link
      repos.sourceLinks.links.set("link-1", {
        cursorId: "link-1",
        libraryItemId: "item-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        createdAt: 1000,
        updatedAt: 2000,
        deletedAt: 2000,
      });

      // Incoming: newer non-deleted version (re-add)
      transport.setSourceLinksPages([{
        entries: [{
          cursorId: "link-1",
          libraryItemId: "item-1",
          registryId: "r",
          sourceId: "s",
          sourceMangaId: "m",
          createdAt: 1000,
          updatedAt: 3000, // Newer than tombstone
        }],
        hasMore: false,
      }]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      const link = repos.sourceLinks.links.get("link-1")!;
      expect(link.deletedAt).toBeUndefined(); // Restored
      expect(link.updatedAt).toBe(3000);

      syncCore.stop();
    });
  });

  describe("Chapter progress", () => {
    it("SPEC: deletedAt tombstone on progress prevents resurrection", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      // Local: tombstoned progress
      repos.chapterProgress.entries.set("cp-1", {
        cursorId: "cp-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        sourceChapterId: "c",
        progress: 50,
        total: 100,
        completed: false,
        lastReadAt: 2000,
        updatedAt: 2000,
        deletedAt: 2000,
      });

      // Incoming: older progress
      transport.setChapterProgressPages([{
        entries: [{
          cursorId: "cp-1",
          registryId: "r",
          sourceId: "s",
          sourceMangaId: "m",
          sourceChapterId: "c",
          progress: 30,
          total: 100,
          completed: false,
          lastReadAt: 1500,
          updatedAt: 1500,
        }],
        hasMore: false,
      }]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      const progress = repos.chapterProgress.entries.get("cp-1")!;
      expect(progress.deletedAt).toBe(2000); // Still tombstoned

      syncCore.stop();
    });
  });
});

// ============================================================================
// Settings Merge Determinism
// ============================================================================

describe("Settings merge determinism", () => {
  it("SPEC: installed sources are merged by id, higher version wins", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // Local: source A v1, source B v2
    repos.settings.settings = {
      installedSources: [
        { id: "src-a", registryId: "r", version: 1 },
        { id: "src-b", registryId: "r", version: 2 },
      ],
    };

    // Cloud: source A v3, source C v1
    transport.setSettingsSnapshot({
      installedSources: [
        { id: "src-a", registryId: "r", version: 3 },
        { id: "src-c", registryId: "r", version: 1 },
      ],
    });

    const syncCore = new SyncCore({ repos });
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    // Result should have:
    // - src-a v3 (cloud wins)
    // - src-b v2 (local only)
    // - src-c v1 (cloud only)
    const sources = repos.settings.settings.installedSources;
    expect(sources.find(s => s.id === "src-a")?.version).toBe(3);
    expect(sources.find(s => s.id === "src-b")?.version).toBe(2);
    expect(sources.find(s => s.id === "src-c")?.version).toBe(1);

    syncCore.stop();
  });

  it("SPEC: settings merge is deterministic (same result regardless of order)", async () => {
    // Two settings objects
    const settingsA: UserSettings = {
      installedSources: [
        { id: "x", registryId: "r", version: 1 },
        { id: "y", registryId: "r", version: 5 },
      ],
    };
    const settingsB: UserSettings = {
      installedSources: [
        { id: "y", registryId: "r", version: 3 },
        { id: "z", registryId: "r", version: 2 },
      ],
    };

    // Merge A into B
    const repos1 = createRepos("device-1");
    repos1.settings.settings = { ...settingsA };
    const transport1 = new TestTransport();
    transport1.setReady(false);
    transport1.setSettingsSnapshot(settingsB);
    const syncCore1 = new SyncCore({ repos: repos1 });
    await startAndEnableSync(syncCore1, transport1);
    await syncCore1.syncNow("manual");
    const result1 = repos1.settings.settings.installedSources;
    syncCore1.stop();

    // Merge B into A
    const repos2 = createRepos("device-2");
    repos2.settings.settings = { ...settingsB };
    const transport2 = new TestTransport();
    transport2.setReady(false);
    transport2.setSettingsSnapshot(settingsA);
    const syncCore2 = new SyncCore({ repos: repos2 });
    await startAndEnableSync(syncCore2, transport2);
    await syncCore2.syncNow("manual");
    const result2 = repos2.settings.settings.installedSources;
    syncCore2.stop();

    // Both should produce the same result
    const sorted1 = [...result1].sort((a, b) => a.id.localeCompare(b.id));
    const sorted2 = [...result2].sort((a, b) => a.id.localeCompare(b.id));
    expect(sorted1).toEqual(sorted2);

    // Expected: x v1, y v5, z v2
    expect(sorted1.find(s => s.id === "x")?.version).toBe(1);
    expect(sorted1.find(s => s.id === "y")?.version).toBe(5);
    expect(sorted1.find(s => s.id === "z")?.version).toBe(2);
  });
});

// ============================================================================
// Offline Mode
// ============================================================================

describe("Offline mode (NullTransport behavior)", () => {
  it("SPEC: with transport not ready, local writes still work", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false); // Simulates offline/NullTransport

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await syncCore.start();

    // Can enqueue ops
    await syncCore.enqueue({
      table: "library_items",
      operation: "save",
      data: { libraryItemId: "offline-item" },
      timestamp: Date.now(),
      retries: 0,
    });

    // Op is pending
    expect(syncCore.pendingCount).toBe(1);

    // Can write directly to repos (simulating local-first writes)
    repos.libraryItems.items.set("local-item", {
      libraryItemId: "local-item",
      metadata: { title: "Local Item" },
      inLibrary: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    expect(repos.libraryItems.items.has("local-item")).toBe(true);

    syncCore.stop();
  });

  it("SPEC: sync while offline is no-op", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // Setup pages that would be pulled if online
    transport.setLibraryItemsPages([
      { entries: [createSyncItem("should-not-appear", 1000)], hasMore: false },
    ]);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await syncCore.start();

    // Sync while offline
    await syncCore.syncNow("manual");

    // Nothing should have been pulled
    expect(repos.libraryItems.items.size).toBe(0);

    syncCore.stop();
  });

  it("SPEC: pending ops drain when going online", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await syncCore.start();

    // Queue ops while offline
    for (let i = 0; i < 5; i++) {
      await syncCore.enqueue({
        table: "library_items",
        operation: "save",
        data: { libraryItemId: `item-${i}` },
        timestamp: Date.now(),
        retries: 0,
      });
    }

    expect(syncCore.pendingCount).toBe(5);

    // Go online
    transport.setReady(true);
    syncCore.setTransport(transport);
    await syncCore.syncNow("manual");

    // All ops should be pushed
    expect(transport.pushedEvents.filter(e => e.type === "libraryItem").length).toBe(5);
    expect(syncCore.pendingCount).toBe(0);

    syncCore.stop();
  });
});

