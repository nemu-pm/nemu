/**
 * Rigorous auth transition and library sync tests (Phase 6.6 / Phase 7)
 *
 * These tests are designed to EXPOSE implementation bugs, not just verify happy paths.
 * Tests follow the invariants from sync.md:
 *
 * INVARIANTS (must hold in every test):
 * 1. Profile isolation: data, cursors, and pending ops for profile A can never be read/written by profile B
 * 2. Auth != data: sign-in/out only attaches/detaches transport; it does not implicitly delete local data
 * 3. Local-first truth: UI renders local state as authoritative; cloud only merges into local
 * 4. User-intent safety: overrides and coverUrl are never erased by merge unless explicit newer tombstone
 * 5. No resurrection: deleted items with tombstones cannot be resurrected by older adds
 * 6. HLC ordering: newer clock wins per field-group, not arrival time
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
import type { SyncLibraryItem } from "./transport";
import { formatIntentClock } from "./hlc";

import "fake-indexeddb/auto";

// ============================================================================
// In-memory repos (same as in other test files)
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
  async getAllSourceLinks(): Promise<LocalSourceLink[]> {
    return [...this.links.values()];
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
    return formatIntentClock({ wallMs: Date.now(), counter: this.counter, nodeId: this.nodeId });
  }
  async receiveIntentClock(_clock: string): Promise<void> {}
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

async function startAndEnableSync(core: SyncCore, transport: TestTransport) {
  await core.start();
  transport.setReady(true);
  core.setTransport(transport);
}

// ============================================================================
// SIGN-OUT "KEEP DATA" - RIGOROUS TESTS
// ============================================================================

describe("Sign-out 'keep data' flow - rigorous tests", () => {
  const userId = "user-123";
  const userProfileId = `user:${userId}`;

  let userStore: IndexedDBUserDataStore;
  let localStore: IndexedDBUserDataStore;

  beforeEach(async () => {
    userStore = new IndexedDBUserDataStore(userProfileId);
    localStore = new IndexedDBUserDataStore();
    await userStore.clearAccountData();
    await localStore.clearAccountData();
  });

  afterEach(async () => {
    await userStore.clearAccountData();
    await localStore.clearAccountData();
  });

  describe("Tombstone preservation (critical for no-resurrection)", () => {
    it("SPEC: inLibrary=false items MUST be preserved to prevent resurrection on re-signin", async () => {
      // Per sync.md Phase 6.5: "inLibrary=false + inLibraryClock" represents removal state.
      // These tombstones MUST be preserved during sign-out "keep data"
      const removedItem: LocalLibraryItem = {
        libraryItemId: "manga-removed",
        metadata: { title: "Removed Manga" },
        inLibrary: false,
        inLibraryClock: makeClock(2000, 0, "device-a"),
        createdAt: 1000,
        updatedAt: 2000,
      };
      await userStore.saveLibraryItem(removedItem);

      // Verify the item is stored via point query
      const storedItem = await userStore.getLibraryItem("manga-removed");
      expect(storedItem).not.toBeNull();
      expect(storedItem!.inLibrary).toBe(false);
      expect(storedItem!.inLibraryClock).toBe(makeClock(2000, 0, "device-a"));

      // Default listing is allowed to hide removed items (UI convenience),
      // but MUST provide an opt-in to include tombstones for correct sync/sign-out copy.
      const defaultList = await userStore.getAllLibraryItems();
      expect(defaultList.some((i) => i.libraryItemId === "manga-removed")).toBe(false);

      const allItems = await userStore.getAllLibraryItems({ includeRemoved: true });
      expect(allItems.some((i) => i.libraryItemId === "manga-removed")).toBe(true);
      const tombstone = allItems.find((i) => i.libraryItemId === "manga-removed")!;
      expect(tombstone.inLibrary).toBe(false);
      expect(tombstone.inLibraryClock).toBe(makeClock(2000, 0, "device-a"));
    });

    it("SPEC: source link tombstones (deletedAt) MUST be preserved via point query", async () => {
      // Note: getAllSourceLinks() filters out deletedAt by default (UI convenience),
      // but MUST provide an opt-in to include tombstones for correct sync/sign-out copy.
      const tombstonedLink: LocalSourceLink = {
        cursorId: "r:s:manga-removed",
        libraryItemId: "manga-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "manga-removed",
        createdAt: 1000,
        updatedAt: 2000,
        deletedAt: 2000, // Tombstone
      };
      await userStore.saveSourceLink(tombstonedLink);

      // Verify tombstone is stored via point query
      const storedLink = await userStore.getSourceLink("r:s:manga-removed");
      expect(storedLink).not.toBeNull();
      expect(storedLink!.deletedAt).toBe(2000);

      const defaultList = await userStore.getAllSourceLinks();
      expect(defaultList.some((l) => l.cursorId === "r:s:manga-removed")).toBe(false);

      const allLinks = await userStore.getAllSourceLinks({ includeDeleted: true });
      expect(allLinks.some((l) => l.cursorId === "r:s:manga-removed")).toBe(true);
      const link = allLinks.find((l) => l.cursorId === "r:s:manga-removed")!;
      expect(link.deletedAt).toBe(2000);
    });
  });

  describe("HLC clock preservation (critical for merge correctness)", () => {
    it("SPEC: inLibraryClock MUST be preserved exactly", async () => {
      const clock = makeClock(1234567890, 5, "device-xyz");
      const item: LocalLibraryItem = {
        libraryItemId: "manga-clocked",
        metadata: { title: "Clocked Manga" },
        inLibrary: true,
        inLibraryClock: clock,
        createdAt: 1000,
        updatedAt: 1000,
      };
      await userStore.saveLibraryItem(item);

      const items = await userStore.getAllLibraryItems();
      for (const i of items) {
        await localStore.saveLibraryItem(i);
      }

      const localItem = await localStore.getLibraryItem("manga-clocked");
      expect(localItem!.inLibraryClock).toBe(clock);
    });

    it("SPEC: overrides.metadataClock MUST be preserved exactly", async () => {
      const clock = makeClock(9999999999, 10, "device-abc");
      const item: LocalLibraryItem = {
        libraryItemId: "manga-override-clock",
        metadata: { title: "Original" },
        inLibrary: true,
        overrides: {
          metadata: { title: "User Title" },
          metadataClock: clock,
        },
        createdAt: 1000,
        updatedAt: 1000,
      };
      await userStore.saveLibraryItem(item);

      const items = await userStore.getAllLibraryItems();
      for (const i of items) {
        await localStore.saveLibraryItem(i);
      }

      const localItem = await localStore.getLibraryItem("manga-override-clock");
      expect(localItem!.overrides?.metadataClock).toBe(clock);
    });

    it("SPEC: overrides.coverUrlClock MUST be preserved exactly", async () => {
      const clock = makeClock(8888888888, 3, "device-cover");
      const item: LocalLibraryItem = {
        libraryItemId: "manga-cover-clock",
        metadata: { title: "Original" },
        inLibrary: true,
        overrides: {
          coverUrl: "custom-cover.jpg",
          coverUrlClock: clock,
        },
        createdAt: 1000,
        updatedAt: 1000,
      };
      await userStore.saveLibraryItem(item);

      const items = await userStore.getAllLibraryItems();
      for (const i of items) {
        await localStore.saveLibraryItem(i);
      }

      const localItem = await localStore.getLibraryItem("manga-cover-clock");
      expect(localItem!.overrides?.coverUrlClock).toBe(clock);
    });
  });

  describe("Field completeness (no data loss)", () => {
    it("SPEC: externalIds MUST be preserved", async () => {
      const item: LocalLibraryItem = {
        libraryItemId: "manga-external",
        metadata: { title: "External IDs" },
        inLibrary: true,
        inLibraryClock: makeClock(1000, 0, "device-a"),
        externalIds: { aniList: 12345, mal: 67890 },
        createdAt: 1000,
        updatedAt: 1000,
      };
      await userStore.saveLibraryItem(item);

      const items = await userStore.getAllLibraryItems();
      for (const i of items) {
        await localStore.saveLibraryItem(i);
      }

      const localItem = await localStore.getLibraryItem("manga-external");
      expect(localItem!.externalIds?.aniList).toBe(12345);
      expect(localItem!.externalIds?.mal).toBe(67890);
    });

    it("SPEC: all metadata fields MUST be preserved", async () => {
      // First verify the stores are empty
      const beforeItems = await userStore.getAllLibraryItems();
      expect(beforeItems.length).toBe(0);

      const item: LocalLibraryItem = {
        libraryItemId: "manga-full-metadata",
        metadata: {
          title: "Full Metadata",
          cover: "cover.jpg",
          authors: ["Author A", "Author B"],
          artists: ["Artist X"],
          description: "A long description",
          tags: ["action", "adventure"],
          status: 1, // MangaStatus.ongoing = 1
          url: "https://example.com/manga",
        },
        inLibrary: true, // Must be true to pass getAllLibraryItems filter
        inLibraryClock: makeClock(1000, 0, "device-a"),
        createdAt: 1000,
        updatedAt: 1000,
      };
      await userStore.saveLibraryItem(item);

      // Verify via point query first
      const savedItem = await userStore.getLibraryItem("manga-full-metadata");
      expect(savedItem).not.toBeNull();
      expect(savedItem!.inLibrary).toBe(true);

      const items = await userStore.getAllLibraryItems();
      expect(items.length).toBe(1); // Should find the active item
      
      for (const i of items) {
        await localStore.saveLibraryItem(i);
      }

      const localItem = await localStore.getLibraryItem("manga-full-metadata");
      expect(localItem).not.toBeNull();
      expect(localItem!.metadata.title).toBe("Full Metadata");
      expect(localItem!.metadata.cover).toBe("cover.jpg");
      expect(localItem!.metadata.authors).toEqual(["Author A", "Author B"]);
      expect(localItem!.metadata.artists).toEqual(["Artist X"]);
      expect(localItem!.metadata.description).toBe("A long description");
      expect(localItem!.metadata.tags).toEqual(["action", "adventure"]);
      expect(localItem!.metadata.status).toBe(1);
      expect(localItem!.metadata.url).toBe("https://example.com/manga");
    });

    it("SPEC: null overrides (explicit clear) MUST be preserved, not converted to undefined", async () => {
      const item: LocalLibraryItem = {
        libraryItemId: "manga-null-override",
        metadata: { title: "Cleared Override" },
        inLibrary: true,
        overrides: {
          metadata: null, // Explicit clear
          metadataClock: makeClock(2000, 0, "device-a"),
          coverUrl: null, // Explicit clear
          coverUrlClock: makeClock(2000, 0, "device-a"),
        },
        createdAt: 1000,
        updatedAt: 2000,
      };
      await userStore.saveLibraryItem(item);

      const items = await userStore.getAllLibraryItems();
      for (const i of items) {
        await localStore.saveLibraryItem(i);
      }

      const localItem = await localStore.getLibraryItem("manga-null-override");
      // null must stay null, not become undefined
      expect(localItem!.overrides?.metadata).toBeNull();
      expect(localItem!.overrides?.coverUrl).toBeNull();
    });
  });

  describe("Source link preservation", () => {
    it("SPEC: source link availability fields MUST be preserved", async () => {
      const link: LocalSourceLink = {
        cursorId: "r:s:manga-avail",
        libraryItemId: "manga-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "manga-avail",
        latestChapter: { id: "ch-100", chapterNumber: 100, volumeNumber: 10, title: "Latest" },
        latestChapterSortKey: "010:100",
        latestFetchedAt: 5000,
        updateAckChapter: { id: "ch-90", chapterNumber: 90 },
        updateAckChapterSortKey: "009:090",
        updateAckAt: 4000,
        createdAt: 1000,
        updatedAt: 5000,
      };
      await userStore.saveSourceLink(link);

      const links = await userStore.getAllSourceLinks();
      for (const l of links) {
        await localStore.saveSourceLink(l);
      }

      const localLink = await localStore.getSourceLink("r:s:manga-avail");
      expect(localLink!.latestChapter?.chapterNumber).toBe(100);
      expect(localLink!.latestChapterSortKey).toBe("010:100");
      expect(localLink!.updateAckChapter?.chapterNumber).toBe(90);
    });
  });

  describe("Progress preservation", () => {
    it("SPEC: chapter progress with all fields MUST be preserved", async () => {
      const progress: LocalChapterProgress = {
        cursorId: "r:s:m:ch-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        sourceChapterId: "ch-1",
        progress: 15,
        total: 20,
        completed: true,
        lastReadAt: 5000,
        chapterNumber: 1.5,
        volumeNumber: 2,
        chapterTitle: "Chapter 1.5: The Beginning",
        libraryItemId: "manga-1",
        updatedAt: 5000,
      };
      await userStore.saveChapterProgressEntry(progress);

      const chapters = await userStore.getAllChapterProgress();
      for (const ch of chapters) {
        await localStore.saveChapterProgressEntry(ch);
      }

      const localProgress = await localStore.getChapterProgressEntry("r:s:m:ch-1");
      expect(localProgress!.progress).toBe(15);
      expect(localProgress!.total).toBe(20);
      expect(localProgress!.completed).toBe(true);
      expect(localProgress!.chapterNumber).toBe(1.5);
      expect(localProgress!.volumeNumber).toBe(2);
      expect(localProgress!.chapterTitle).toBe("Chapter 1.5: The Beginning");
      expect(localProgress!.libraryItemId).toBe("manga-1");
    });

    it("SPEC: manga progress with optional fields MUST be preserved", async () => {
      const mangaProgress: LocalMangaProgress = {
        cursorId: "r:s:manga-prog",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "manga-prog",
        lastReadAt: 6000,
        lastReadSourceChapterId: "ch-50",
        lastReadChapterNumber: 50,
        lastReadVolumeNumber: 5,
        lastReadChapterTitle: "The Finale",
        libraryItemId: "manga-1",
        updatedAt: 6000,
      };
      await userStore.saveMangaProgressEntry(mangaProgress);

      const mangas = await userStore.getAllMangaProgress();
      for (const m of mangas) {
        await localStore.saveMangaProgressEntry(m);
      }

      const localManga = await localStore.getMangaProgressEntry("r:s:manga-prog");
      expect(localManga!.lastReadSourceChapterId).toBe("ch-50");
      expect(localManga!.lastReadChapterNumber).toBe(50);
      expect(localManga!.lastReadVolumeNumber).toBe(5);
      expect(localManga!.lastReadChapterTitle).toBe("The Finale");
    });
  });
});

// ============================================================================
// SIGN-IN SYNC BEHAVIOR - RIGOROUS TESTS
// ============================================================================

describe("Sign-in sync behavior - rigorous tests", () => {
  describe("No resurrection invariant", () => {
    it("SPEC: cloud tombstone (inLibrary=false) must NOT be treated as active item", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      // Cloud has a removed item with tombstone
      const removeClock = makeClock(2000, 0, "cloud");
      transport.setLibraryItemsPages([{
        entries: [createSyncItem("item-1", 2000, {
          inLibrary: false,
          inLibraryClock: removeClock,
        })],
        hasMore: false,
      }]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      const item = repos.libraryItems.items.get("item-1");
      expect(item).toBeDefined();
      expect(item!.inLibrary).toBe(false);
      expect(item!.inLibraryClock).toBe(removeClock);

      syncCore.stop();
    });

    it("SPEC: local tombstone MUST NOT be overwritten by older cloud add", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      // Local has item removed with newer clock
      const localRemoveClock = makeClock(3000, 0, "device-a");
      repos.libraryItems.items.set("item-1", {
        libraryItemId: "item-1",
        metadata: { title: "Removed Locally" },
        inLibrary: false,
        inLibraryClock: localRemoveClock,
        createdAt: 1000,
        updatedAt: 3000,
      });

      // Cloud has older add
      const cloudAddClock = makeClock(2000, 0, "cloud");
      transport.setLibraryItemsPages([{
        entries: [createSyncItem("item-1", 2000, {
          inLibrary: true,
          inLibraryClock: cloudAddClock,
        })],
        hasMore: false,
      }]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      // Local tombstone with newer clock must win
      const item = repos.libraryItems.items.get("item-1");
      expect(item!.inLibrary).toBe(false);
      expect(item!.inLibraryClock).toBe(localRemoveClock);

      syncCore.stop();
    });

    it("SPEC: source link tombstone must prevent resurrection by out-of-order add", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      // First: receive tombstone
      transport.setSourceLinksPages([{
        entries: [{
          cursorId: "link-1",
          libraryItemId: "item-1",
          registryId: "r",
          sourceId: "s",
          sourceMangaId: "m",
          createdAt: 1000,
          updatedAt: 3000,
          deletedAt: 3000,
        }],
        hasMore: false,
      }]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      // Tombstone stored
      expect(repos.sourceLinks.links.get("link-1")?.deletedAt).toBe(3000);

      // Now: receive older add (out-of-order)
      transport.setSourceLinksPages([{
        entries: [{
          cursorId: "link-1",
          libraryItemId: "item-1",
          registryId: "r",
          sourceId: "s",
          sourceMangaId: "m",
          createdAt: 1000,
          updatedAt: 2000, // Older than tombstone
          // No deletedAt = this is an add
        }],
        hasMore: false,
      }]);

      await syncCore.syncNow("manual");

      // Must still be tombstoned
      expect(repos.sourceLinks.links.get("link-1")?.deletedAt).toBe(3000);

      syncCore.stop();
    });
  });

  describe("HLC field-group independence", () => {
    it("SPEC: metadata and cover clocks are INDEPENDENT - each wins separately", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      // Local: metadata at t=3000 (wins), cover at t=1000 (loses)
      const localMetaClock = makeClock(3000, 0, "device-a");
      const localCoverClock = makeClock(1000, 0, "device-a");
      repos.libraryItems.items.set("item-1", {
        libraryItemId: "item-1",
        metadata: { title: "Original" },
        inLibrary: true,
        overrides: {
          metadata: { title: "Local Title" },
          metadataClock: localMetaClock,
          coverUrl: "local-cover.jpg",
          coverUrlClock: localCoverClock,
        },
        createdAt: 1000,
        updatedAt: 3000,
      });

      // Cloud: metadata at t=2000 (loses), cover at t=4000 (wins)
      const cloudMetaClock = makeClock(2000, 0, "cloud");
      const cloudCoverClock = makeClock(4000, 0, "cloud");
      transport.setLibraryItemsPages([{
        entries: [createSyncItem("item-1", 4000, {
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
      // Local metadata wins (3000 > 2000)
      expect(item.overrides?.metadata?.title).toBe("Local Title");
      expect(item.overrides?.metadataClock).toBe(localMetaClock);
      // Cloud cover wins (4000 > 1000)
      expect(item.overrides?.coverUrl).toBe("cloud-cover.jpg");
      expect(item.overrides?.coverUrlClock).toBe(cloudCoverClock);

      syncCore.stop();
    });

    it("SPEC: inLibraryClock is independent from overrides clocks", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      // Local: membership at t=1000, overrides at t=3000
      const localMemberClock = makeClock(1000, 0, "device-a");
      const localMetaClock = makeClock(3000, 0, "device-a");
      repos.libraryItems.items.set("item-1", {
        libraryItemId: "item-1",
        metadata: { title: "Original" },
        inLibrary: true,
        inLibraryClock: localMemberClock,
        overrides: {
          metadata: { title: "Local Override" },
          metadataClock: localMetaClock,
        },
        createdAt: 1000,
        updatedAt: 3000,
      });

      // Cloud: membership at t=2000 (remove), overrides at t=500
      const cloudMemberClock = makeClock(2000, 0, "cloud");
      const cloudMetaClock = makeClock(500, 0, "cloud");
      transport.setLibraryItemsPages([{
        entries: [createSyncItem("item-1", 2000, {
          inLibrary: false, // Removal
          inLibraryClock: cloudMemberClock,
          overrides: {
            metadata: { title: "Cloud Override" },
            metadataClock: cloudMetaClock,
          },
        })],
        hasMore: false,
      }]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      const item = repos.libraryItems.items.get("item-1")!;
      // Cloud membership wins (2000 > 1000)
      expect(item.inLibrary).toBe(false);
      expect(item.inLibraryClock).toBe(cloudMemberClock);
      // Local overrides wins (3000 > 500)
      expect(item.overrides?.metadata?.title).toBe("Local Override");
      expect(item.overrides?.metadataClock).toBe(localMetaClock);

      syncCore.stop();
    });
  });

  describe("Explicit clear vs undefined", () => {
    it("SPEC: null (explicit clear) with newer clock MUST wipe existing value", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      // Local: has metadata override
      repos.libraryItems.items.set("item-1", {
        libraryItemId: "item-1",
        metadata: { title: "Original" },
        inLibrary: true,
        overrides: {
          metadata: { title: "Local Override" },
          metadataClock: makeClock(1000, 0, "device-a"),
        },
        createdAt: 1000,
        updatedAt: 1000,
      });

      // Cloud: explicit clear (null) with newer clock
      transport.setLibraryItemsPages([{
        entries: [createSyncItem("item-1", 2000, {
          overrides: {
            metadata: null, // Explicit clear
            metadataClock: makeClock(2000, 0, "cloud"),
          },
        })],
        hasMore: false,
      }]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      const item = repos.libraryItems.items.get("item-1")!;
      expect(item.overrides?.metadata).toBeNull();

      syncCore.stop();
    });

    it("SPEC: undefined with newer clock MUST NOT wipe existing value", async () => {
      const repos = createRepos("device-a");
      const transport = new TestTransport();
      transport.setReady(false);

      // Local: has metadata override
      const localClock = makeClock(1000, 0, "device-a");
      repos.libraryItems.items.set("item-1", {
        libraryItemId: "item-1",
        metadata: { title: "Original" },
        inLibrary: true,
        overrides: {
          metadata: { title: "Local Override" },
          metadataClock: localClock,
        },
        createdAt: 1000,
        updatedAt: 1000,
      });

      // Cloud: undefined metadata (not provided) even with newer clock
      transport.setLibraryItemsPages([{
        entries: [createSyncItem("item-1", 2000, {
          overrides: {
            // metadata is undefined - not provided
            metadataClock: makeClock(2000, 0, "cloud"),
          },
        })],
        hasMore: false,
      }]);

      const syncCore = new SyncCore({ repos });
      await startAndEnableSync(syncCore, transport);
      await syncCore.syncNow("manual");

      const item = repos.libraryItems.items.get("item-1")!;
      // Existing value MUST be preserved
      expect(item.overrides?.metadata?.title).toBe("Local Override");

      syncCore.stop();
    });
  });
});

// ============================================================================
// PROGRESS HIGH-WATER MARK - RIGOROUS TESTS
// ============================================================================

describe("Progress high-water mark - rigorous tests", () => {
  it("SPEC: progress MUST use max() not last-write-wins", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // Local: higher progress, older timestamp
    repos.chapterProgress.entries.set("cp-1", {
      cursorId: "cp-1",
      registryId: "r",
      sourceId: "s",
      sourceMangaId: "m",
      sourceChapterId: "ch1",
      progress: 18, // Higher
      total: 20,
      completed: false,
      lastReadAt: 3000,
      updatedAt: 3000,
    });

    // Cloud: lower progress, newer timestamp
    transport.setChapterProgressPages([{
      entries: [{
        cursorId: "cp-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        sourceChapterId: "ch1",
        progress: 5, // Lower
        total: 20,
        completed: false,
        lastReadAt: 4000, // Newer
        updatedAt: 5000, // Much newer
      }],
      hasMore: false,
    }]);

    const syncCore = new SyncCore({ repos });
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    const progress = repos.chapterProgress.entries.get("cp-1")!;
    expect(progress.progress).toBe(18); // max(18, 5) = 18
    expect(progress.lastReadAt).toBe(4000); // max(3000, 4000) = 4000

    syncCore.stop();
  });

  it("SPEC: total MUST use max() (never decrease page count)", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    repos.chapterProgress.entries.set("cp-1", {
      cursorId: "cp-1",
      registryId: "r",
      sourceId: "s",
      sourceMangaId: "m",
      sourceChapterId: "ch1",
      progress: 10,
      total: 50, // Original scan: 50 pages
      completed: false,
      lastReadAt: 1000,
      updatedAt: 1000,
    });

    // Cloud: re-scan shows fewer pages
    transport.setChapterProgressPages([{
      entries: [{
        cursorId: "cp-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        sourceChapterId: "ch1",
        progress: 10,
        total: 30, // Re-scan: only 30 pages
        completed: false,
        lastReadAt: 2000,
        updatedAt: 2000,
      }],
      hasMore: false,
    }]);

    const syncCore = new SyncCore({ repos });
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    const progress = repos.chapterProgress.entries.get("cp-1")!;
    expect(progress.total).toBe(50); // max(50, 30) = 50

    syncCore.stop();
  });

  it("SPEC: completed is STICKY (OR semantics) - once true, never becomes false", async () => {
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
      completed: true, // Was completed
      lastReadAt: 1000,
      updatedAt: 1000,
    });

    // Cloud: user re-reading, marked incomplete
    transport.setChapterProgressPages([{
      entries: [{
        cursorId: "cp-1",
        registryId: "r",
        sourceId: "s",
        sourceMangaId: "m",
        sourceChapterId: "ch1",
        progress: 3,
        total: 20,
        completed: false, // Not complete anymore?
        lastReadAt: 5000, // Much newer
        updatedAt: 5000,
      }],
      hasMore: false,
    }]);

    const syncCore = new SyncCore({ repos });
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    const progress = repos.chapterProgress.entries.get("cp-1")!;
    expect(progress.completed).toBe(true); // Sticky!
    expect(progress.progress).toBe(20); // max(20, 3) = 20

    syncCore.stop();
  });
});

// ============================================================================
// OFFLINE THEN ONLINE - RIGOROUS TESTS
// ============================================================================

describe("Offline then online - rigorous tests", () => {
  it("SPEC: pending ops must persist and be pushed on reconnect", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false); // Offline

    const syncCore = new SyncCore({ repos });
    syncCore.setTransport(transport);
    await syncCore.start();

    // Queue ops while offline
    await syncCore.enqueue({
      table: "library_items",
      operation: "save",
      data: { libraryItemId: "offline-add" },
      timestamp: Date.now(),
      retries: 0,
    });
    await syncCore.enqueue({
      table: "chapter_progress",
      operation: "save",
      data: { cursorId: "cp-1", progress: 10 },
      timestamp: Date.now(),
      retries: 0,
    });

    expect(syncCore.pendingCount).toBe(2);

    // Try to sync while offline - should not push
    await syncCore.syncNow("manual");
    expect(transport.pushedEvents.length).toBe(0);
    expect(syncCore.pendingCount).toBe(2);

    // Go online
    transport.setReady(true);
    syncCore.setTransport(transport);
    await syncCore.syncNow("manual");

    // All ops pushed
    expect(transport.pushedEvents.filter(e => e.type === "libraryItem").length).toBe(1);
    expect(transport.pushedEvents.filter(e => e.type === "chapterProgress").length).toBe(1);
    expect(repos.pendingOps.ops.length).toBe(0);

    syncCore.stop();
  });

  it("SPEC: pending ops must survive app restart (persistence test)", async () => {
    const repos = createRepos("device-a");
    const transport1 = new TestTransport();
    transport1.setReady(false);

    const syncCore1 = new SyncCore({ repos });
    syncCore1.setTransport(transport1);
    await syncCore1.start();

    // Queue op
    await syncCore1.enqueue({
      table: "library_items",
      operation: "save",
      data: { libraryItemId: "persist-test" },
      timestamp: Date.now(),
      retries: 0,
    });

    expect(repos.pendingOps.ops.length).toBe(1);

    // "Crash"
    syncCore1.stop();

    // "Restart" with same repos (simulates persistent storage)
    const transport2 = new TestTransport();
    transport2.setReady(false);
    const syncCore2 = new SyncCore({ repos });
    syncCore2.setTransport(transport2);
    await syncCore2.start();

    // Pending op still there
    expect(syncCore2.pendingCount).toBe(1);

    // Go online and push
    transport2.setReady(true);
    syncCore2.setTransport(transport2);
    await syncCore2.syncNow("manual");

    expect(transport2.pushedEvents.some(e => e.type === "libraryItem")).toBe(true);
    expect(repos.pendingOps.ops.length).toBe(0);

    syncCore2.stop();
  });

  it("SPEC: cursors must persist and enable incremental sync after restart", async () => {
    const repos = createRepos("device-a");
    const transport1 = new TestTransport();
    transport1.setReady(false);
    transport1.setLibraryItemsPages([{
      entries: [createSyncItem("item-1", 1000)],
      hasMore: false,
    }]);

    const syncCore1 = new SyncCore({ repos });
    await startAndEnableSync(syncCore1, transport1);
    await syncCore1.syncNow("manual");

    const cursor1 = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
    expect(cursor1.updatedAt).toBe(1000);
    expect(repos.libraryItems.items.size).toBe(1);

    // "Crash"
    syncCore1.stop();

    // "Restart" with new data on server
    const transport2 = new TestTransport();
    transport2.setReady(false);
    transport2.setLibraryItemsPages([{
      entries: [createSyncItem("item-2", 2000)],
      hasMore: false,
    }]);

    const syncCore2 = new SyncCore({ repos });
    await startAndEnableSync(syncCore2, transport2);
    await syncCore2.syncNow("manual");

    // Should have both items (incremental sync worked)
    expect(repos.libraryItems.items.size).toBe(2);
    const cursor2 = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
    expect(cursor2.updatedAt).toBe(2000);

    syncCore2.stop();
  });
});

// ============================================================================
// PROFILE ISOLATION - RIGOROUS TESTS
// ============================================================================

describe("Profile isolation - rigorous tests", () => {
  it("SPEC: data written to profile A must NEVER appear in profile B", async () => {
    const reposA = createRepos("device-a");
    const reposB = createRepos("device-b");

    const transportA = new TestTransport();
    transportA.setReady(false);
    transportA.setLibraryItemsPages([{
      entries: [createSyncItem("item-A", 1000)],
      hasMore: false,
    }]);

    const transportB = new TestTransport();
    transportB.setReady(false);
    transportB.setLibraryItemsPages([{
      entries: [createSyncItem("item-B", 2000)],
      hasMore: false,
    }]);

    const syncCoreA = new SyncCore({ repos: reposA });
    const syncCoreB = new SyncCore({ repos: reposB });

    await startAndEnableSync(syncCoreA, transportA);
    await startAndEnableSync(syncCoreB, transportB);

    await syncCoreA.syncNow("manual");
    await syncCoreB.syncNow("manual");

    // Complete isolation
    expect(reposA.libraryItems.items.has("item-A")).toBe(true);
    expect(reposA.libraryItems.items.has("item-B")).toBe(false);
    expect(reposB.libraryItems.items.has("item-B")).toBe(true);
    expect(reposB.libraryItems.items.has("item-A")).toBe(false);

    syncCoreA.stop();
    syncCoreB.stop();
  });

  it("SPEC: cursors from profile A must NEVER affect profile B", async () => {
    const reposA = createRepos("device-a");
    const reposB = createRepos("device-b");

    const transportA = new TestTransport();
    transportA.setReady(false);
    transportA.setLibraryItemsPages([{
      entries: [createSyncItem("item-1", 9999)],
      hasMore: false,
    }]);

    const transportB = new TestTransport();
    transportB.setReady(false);
    transportB.setLibraryItemsPages([{
      entries: [createSyncItem("item-1", 1111)],
      hasMore: false,
    }]);

    const syncCoreA = new SyncCore({ repos: reposA });
    const syncCoreB = new SyncCore({ repos: reposB });

    await startAndEnableSync(syncCoreA, transportA);
    await syncCoreA.syncNow("manual");

    await startAndEnableSync(syncCoreB, transportB);
    await syncCoreB.syncNow("manual");

    // Cursors are isolated
    const cursorA = await reposA.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
    const cursorB = await reposB.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);

    expect(cursorA.updatedAt).toBe(9999);
    expect(cursorB.updatedAt).toBe(1111);

    syncCoreA.stop();
    syncCoreB.stop();
  });

  it("SPEC: pending ops from profile A must NEVER be pushed for profile B", async () => {
    const reposA = createRepos("device-a");
    const reposB = createRepos("device-b");

    const transportA = new TestTransport();
    transportA.setReady(false);
    const transportB = new TestTransport();
    transportB.setReady(false);

    const syncCoreA = new SyncCore({ repos: reposA });
    syncCoreA.setTransport(transportA);
    await syncCoreA.start();

    // Enqueue op for A
    await syncCoreA.enqueue({
      table: "library_items",
      operation: "save",
      data: { libraryItemId: "item-only-for-A" },
      timestamp: Date.now(),
      retries: 0,
    });

    // Create B and sync
    const syncCoreB = new SyncCore({ repos: reposB });
    await startAndEnableSync(syncCoreB, transportB);
    await syncCoreB.syncNow("manual");

    // B should have pushed nothing (no pending ops)
    expect(transportB.pushedEvents.length).toBe(0);
    // A's pending op still exists
    expect(reposA.pendingOps.ops.length).toBe(1);
    expect(reposB.pendingOps.ops.length).toBe(0);

    syncCoreA.stop();
    syncCoreB.stop();
  });
});

// ============================================================================
// CURSOR CORRECTNESS - EDGE CASES
// ============================================================================

describe("Cursor correctness - edge cases", () => {
  it("SPEC: many entries with same updatedAt must all be processed (tie-breaker test)", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // 100 items all with same timestamp
    const sameTimestamp = 1000;
    const entries = Array.from({ length: 100 }, (_, i) => ({
      ...createSyncItem(`item-${String(i).padStart(3, "0")}`, sameTimestamp),
      cursorId: `item-${String(i).padStart(3, "0")}`,
    }));

    transport.setLibraryItemsPages([{ entries, hasMore: false }]);

    const syncCore = new SyncCore({ repos });
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    // All 100 items must be saved
    expect(repos.libraryItems.items.size).toBe(100);

    // Cursor should point to lexicographically largest
    const cursor = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
    expect(cursor.updatedAt).toBe(sameTimestamp);
    expect(cursor.cursorId).toBe("item-099");

    syncCore.stop();
  });

  it("SPEC: cursor must NEVER go backward (monotonicity)", async () => {
    const repos = createRepos("device-a");
    const transport = new TestTransport();
    transport.setReady(false);

    // First sync: items up to 5000
    transport.setLibraryItemsPages([{
      entries: [createSyncItem("item-1", 5000)],
      hasMore: false,
    }]);

    const syncCore = new SyncCore({ repos });
    await startAndEnableSync(syncCore, transport);
    await syncCore.syncNow("manual");

    const cursor1 = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
    expect(cursor1.updatedAt).toBe(5000);

    // Second sync: server somehow returns older data (shouldn't happen, but test defensively)
    transport.setLibraryItemsPages([{
      entries: [createSyncItem("item-old", 1000)], // Older!
      hasMore: false,
    }]);

    await syncCore.syncNow("manual");

    // Cursor must NOT have gone backward
    const cursor2 = await repos.syncMeta.getCompositeCursor(CURSOR_KEYS.LIBRARY_ITEMS);
    expect(cursor2.updatedAt).toBeGreaterThanOrEqual(5000);

    syncCore.stop();
  });
});

