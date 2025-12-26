/**
 * Apply function tests (Phase 7)
 *
 * Tests for merge semantics:
 * - HLC-based ordering for user intent fields
 * - High-water mark for progress
 * - Tombstone handling
 * - Cursor advancement
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  applyLibraryItems,
  applySourceLinks,
  applyChapterProgress,
  applyMangaProgress,
  type LibraryItemRepo,
  type SourceLinkRepo,
  type ChapterProgressRepo,
  type MangaProgressRepo,
  type SyncLibraryItemEntry,
  type SyncSourceLinkEntry,
  type SyncChapterProgressEntry,
} from "./apply";
import type {
  LocalLibraryItem,
  LocalSourceLink,
  LocalChapterProgress,
  LocalMangaProgress,
  CompositeCursor,
} from "@/data/schema";
import { formatIntentClock } from "../hlc";

// ============================================================================
// In-memory repos for testing
// ============================================================================

class InMemoryLibraryItemRepo implements LibraryItemRepo {
  items = new Map<string, LocalLibraryItem>();

  async getLibraryItem(libraryItemId: string): Promise<LocalLibraryItem | null> {
    return this.items.get(libraryItemId) ?? null;
  }

  async saveLibraryItem(item: LocalLibraryItem): Promise<void> {
    this.items.set(item.libraryItemId, item);
  }
}

class InMemorySourceLinkRepo implements SourceLinkRepo {
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

class InMemoryChapterProgressRepo implements ChapterProgressRepo {
  entries = new Map<string, LocalChapterProgress>();

  async getChapterProgressEntry(cursorId: string): Promise<LocalChapterProgress | null> {
    return this.entries.get(cursorId) ?? null;
  }

  async saveChapterProgressEntry(entry: LocalChapterProgress): Promise<void> {
    this.entries.set(entry.cursorId, entry);
  }
}

class InMemoryMangaProgressRepo implements MangaProgressRepo {
  entries = new Map<string, LocalMangaProgress>();

  async getMangaProgressEntry(cursorId: string): Promise<LocalMangaProgress | null> {
    return this.entries.get(cursorId) ?? null;
  }

  async saveMangaProgressEntry(entry: LocalMangaProgress): Promise<void> {
    this.entries.set(entry.cursorId, entry);
  }
}

// ============================================================================
// Helpers
// ============================================================================

const ZERO_CURSOR: CompositeCursor = { updatedAt: 0, cursorId: "" };

function makeClock(wallMs: number, counter: number, nodeId: string): string {
  return formatIntentClock({ wallMs, counter, nodeId });
}

// ============================================================================
// applyLibraryItems tests
// ============================================================================

describe("applyLibraryItems", () => {
  let repo: InMemoryLibraryItemRepo;

  beforeEach(() => {
    repo = new InMemoryLibraryItemRepo();
  });

  it("creates new item when not existing", async () => {
    const entry: SyncLibraryItemEntry = {
      cursorId: "item-1",
      libraryItemId: "item-1",
      metadata: { title: "Test Manga" },
      inLibrary: true,
      createdAt: 1000,
      updatedAt: 1000,
    };

    const result = await applyLibraryItems([entry], ZERO_CURSOR, repo);

    expect(result.affected).toHaveLength(1);
    expect(result.affected[0].libraryItemId).toBe("item-1");
    expect(result.affected[0].metadata.title).toBe("Test Manga");
    expect(repo.items.get("item-1")).toBeDefined();
  });

  it("does not include removed items in affected", async () => {
    const entry: SyncLibraryItemEntry = {
      cursorId: "item-1",
      libraryItemId: "item-1",
      metadata: { title: "Test Manga" },
      inLibrary: false, // Removed
      createdAt: 1000,
      updatedAt: 1000,
    };

    const result = await applyLibraryItems([entry], ZERO_CURSOR, repo);

    expect(result.affected).toHaveLength(0);
    // But item should still be saved
    const saved = repo.items.get("item-1");
    expect(saved).toBeDefined();
    expect(saved?.inLibrary).toBe(false);
  });

  describe("HLC membership merge", () => {
    it("accepts newer inLibrary state (remove after add)", async () => {
      // Existing: inLibrary=true with older clock
      const olderClock = makeClock(1000, 0, "device-a");
      repo.items.set("item-1", {
        libraryItemId: "item-1",
        metadata: { title: "Test" },
        inLibrary: true,
        inLibraryClock: olderClock,
        createdAt: 1000,
        updatedAt: 1000,
      });

      // Incoming: inLibrary=false with newer clock
      const newerClock = makeClock(2000, 0, "device-b");
      const entry: SyncLibraryItemEntry = {
        cursorId: "item-1",
        libraryItemId: "item-1",
        metadata: { title: "Test" },
        inLibrary: false,
        inLibraryClock: newerClock,
        createdAt: 1000,
        updatedAt: 2000,
      };

      const result = await applyLibraryItems([entry], ZERO_CURSOR, repo);

      expect(result.affected).toHaveLength(0); // Not in library
      const merged = repo.items.get("item-1")!;
      expect(merged.inLibrary).toBe(false);
      expect(merged.inLibraryClock).toBe(newerClock);
    });

    it("rejects older inLibrary state (re-add with older clock doesn't work)", async () => {
      // Existing: inLibrary=false with newer clock (user removed it)
      const newerClock = makeClock(2000, 0, "device-a");
      repo.items.set("item-1", {
        libraryItemId: "item-1",
        metadata: { title: "Test" },
        inLibrary: false,
        inLibraryClock: newerClock,
        createdAt: 1000,
        updatedAt: 2000,
      });

      // Incoming: inLibrary=true with older clock (stale add)
      const olderClock = makeClock(1000, 0, "device-b");
      const entry: SyncLibraryItemEntry = {
        cursorId: "item-1",
        libraryItemId: "item-1",
        metadata: { title: "Test" },
        inLibrary: true,
        inLibraryClock: olderClock,
        createdAt: 1000,
        updatedAt: 1500,
      };

      const result = await applyLibraryItems([entry], ZERO_CURSOR, repo);

      expect(result.affected).toHaveLength(0); // Still not in library
      const merged = repo.items.get("item-1")!;
      expect(merged.inLibrary).toBe(false);
      expect(merged.inLibraryClock).toBe(newerClock);
    });
  });

  describe("HLC metadata override merge", () => {
    it("metadataClock and coverUrlClock are independent", async () => {
      // Existing: metadata override with clock at t=1000, cover override with clock at t=2000
      repo.items.set("item-1", {
        libraryItemId: "item-1",
        metadata: { title: "Original" },
        inLibrary: true,
        overrides: {
          metadata: { title: "User Title" },
          metadataClock: makeClock(1000, 0, "device-a"),
          coverUrl: "user-cover.jpg",
          coverUrlClock: makeClock(2000, 0, "device-a"),
        },
        createdAt: 1000,
        updatedAt: 2000,
      });

      // Incoming: newer metadata override at t=1500, older cover override at t=500
      const entry: SyncLibraryItemEntry = {
        cursorId: "item-1",
        libraryItemId: "item-1",
        metadata: { title: "Source Title" },
        overrides: {
          metadata: { title: "Newer User Title" },
          metadataClock: makeClock(1500, 0, "device-b"),
          coverUrl: "older-cover.jpg",
          coverUrlClock: makeClock(500, 0, "device-b"),
        },
        createdAt: 1000,
        updatedAt: 2500,
      };

      await applyLibraryItems([entry], ZERO_CURSOR, repo);

      const merged = repo.items.get("item-1")!;
      // Metadata should be updated (incoming clock 1500 > existing 1000)
      expect(merged.overrides?.metadata?.title).toBe("Newer User Title");
      expect(merged.overrides?.metadataClock).toBe(makeClock(1500, 0, "device-b"));
      // Cover should NOT be updated (incoming clock 500 < existing 2000)
      expect(merged.overrides?.coverUrl).toBe("user-cover.jpg");
      expect(merged.overrides?.coverUrlClock).toBe(makeClock(2000, 0, "device-a"));
    });

    it("explicit null clear wins when clock wins", async () => {
      // Existing: metadata override
      repo.items.set("item-1", {
        libraryItemId: "item-1",
        metadata: { title: "Original" },
        inLibrary: true,
        overrides: {
          metadata: { title: "User Title" },
          metadataClock: makeClock(1000, 0, "device-a"),
        },
        createdAt: 1000,
        updatedAt: 1000,
      });

      // Incoming: null metadata (explicit clear) with newer clock
      const entry: SyncLibraryItemEntry = {
        cursorId: "item-1",
        libraryItemId: "item-1",
        metadata: { title: "Source Title" },
        overrides: {
          metadata: null, // Explicit clear
          metadataClock: makeClock(2000, 0, "device-b"),
        },
        createdAt: 1000,
        updatedAt: 2000,
      };

      await applyLibraryItems([entry], ZERO_CURSOR, repo);

      const merged = repo.items.get("item-1")!;
      expect(merged.overrides?.metadata).toBeNull();
      expect(merged.overrides?.metadataClock).toBe(makeClock(2000, 0, "device-b"));
    });

    it("explicit null clear loses when clock loses", async () => {
      // Existing: metadata override with newer clock
      repo.items.set("item-1", {
        libraryItemId: "item-1",
        metadata: { title: "Original" },
        inLibrary: true,
        overrides: {
          metadata: { title: "User Title" },
          metadataClock: makeClock(2000, 0, "device-a"),
        },
        createdAt: 1000,
        updatedAt: 2000,
      });

      // Incoming: null metadata (explicit clear) with older clock
      const entry: SyncLibraryItemEntry = {
        cursorId: "item-1",
        libraryItemId: "item-1",
        metadata: { title: "Source Title" },
        overrides: {
          metadata: null, // Explicit clear
          metadataClock: makeClock(1000, 0, "device-b"),
        },
        createdAt: 1000,
        updatedAt: 1500,
      };

      await applyLibraryItems([entry], ZERO_CURSOR, repo);

      const merged = repo.items.get("item-1")!;
      // Clear should be rejected (older clock)
      expect(merged.overrides?.metadata?.title).toBe("User Title");
      expect(merged.overrides?.metadataClock).toBe(makeClock(2000, 0, "device-a"));
    });

    it("undefined never wipes existing value", async () => {
      // Existing: metadata override
      repo.items.set("item-1", {
        libraryItemId: "item-1",
        metadata: { title: "Original" },
        inLibrary: true,
        overrides: {
          metadata: { title: "User Title" },
          metadataClock: makeClock(1000, 0, "device-a"),
        },
        createdAt: 1000,
        updatedAt: 1000,
      });

      // Incoming: undefined metadata (no override provided) with newer clock
      const entry: SyncLibraryItemEntry = {
        cursorId: "item-1",
        libraryItemId: "item-1",
        metadata: { title: "Source Title" },
        overrides: {
          metadata: undefined, // Not provided
          metadataClock: makeClock(2000, 0, "device-b"),
        },
        createdAt: 1000,
        updatedAt: 2000,
      };

      await applyLibraryItems([entry], ZERO_CURSOR, repo);

      const merged = repo.items.get("item-1")!;
      // Existing value should be preserved (undefined doesn't wipe)
      expect(merged.overrides?.metadata?.title).toBe("User Title");
      // Clock should also be preserved
      expect(merged.overrides?.metadataClock).toBe(makeClock(1000, 0, "device-a"));
    });
  });
});

// ============================================================================
// applySourceLinks tests
// ============================================================================

describe("applySourceLinks", () => {
  let repo: InMemorySourceLinkRepo;

  beforeEach(() => {
    repo = new InMemorySourceLinkRepo();
  });

  it("creates new link when not existing", async () => {
    const entry: SyncSourceLinkEntry = {
      cursorId: "link-1",
      libraryItemId: "item-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      createdAt: 1000,
      updatedAt: 1000,
    };

    const result = await applySourceLinks([entry], ZERO_CURSOR, repo);

    expect(result.affected).toHaveLength(1);
    expect(repo.links.get("link-1")).toBeDefined();
  });

  it("tombstone preserves tombstone locally (not physical delete)", async () => {
    // Existing link
    repo.links.set("link-1", {
      cursorId: "link-1",
      libraryItemId: "item-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      createdAt: 1000,
      updatedAt: 1000,
    });

    // Incoming: tombstone
    const entry: SyncSourceLinkEntry = {
      cursorId: "link-1",
      libraryItemId: "item-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      createdAt: 1000,
      updatedAt: 2000,
      deletedAt: 2000, // Tombstone
    };

    const result = await applySourceLinks([entry], ZERO_CURSOR, repo);

    expect(result.affected).toHaveLength(0); // Tombstones not in affected
    // Tombstone is PRESERVED locally (not deleted)
    const stored = repo.links.get("link-1");
    expect(stored).toBeDefined();
    expect(stored?.deletedAt).toBe(2000);
  });

  it("tombstone for non-existing link creates tombstone record", async () => {
    const entry: SyncSourceLinkEntry = {
      cursorId: "link-1",
      libraryItemId: "item-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      createdAt: 1000,
      updatedAt: 2000,
      deletedAt: 2000,
    };

    const result = await applySourceLinks([entry], ZERO_CURSOR, repo);

    expect(result.affected).toHaveLength(0);
    // Tombstone record is created
    const stored = repo.links.get("link-1");
    expect(stored).toBeDefined();
    expect(stored?.deletedAt).toBe(2000);
  });

  it("out-of-order: older entry after tombstone does NOT resurrect", async () => {
    // This is the key correctness test: tombstone preservation prevents resurrection

    // Apply tombstone first
    const tombstone: SyncSourceLinkEntry = {
      cursorId: "link-1",
      libraryItemId: "item-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      createdAt: 1000,
      updatedAt: 2000,
      deletedAt: 2000,
    };
    await applySourceLinks([tombstone], ZERO_CURSOR, repo);
    
    // Tombstone is stored
    expect(repo.links.get("link-1")?.deletedAt).toBe(2000);

    // Simulate out-of-order delivery of older non-deleted version
    const olderEntry: SyncSourceLinkEntry = {
      cursorId: "link-1",
      libraryItemId: "item-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      createdAt: 1000,
      updatedAt: 1500, // Older than tombstone
    };
    await applySourceLinks([olderEntry], ZERO_CURSOR, repo);

    // Entry should NOT resurrect - tombstone wins because it's newer
    const stored = repo.links.get("link-1");
    expect(stored?.deletedAt).toBe(2000); // Still tombstoned
  });

  it("newer entry after tombstone CAN replace it (re-add scenario)", async () => {
    // User deletes link, then re-adds it later

    // Apply tombstone
    const tombstone: SyncSourceLinkEntry = {
      cursorId: "link-1",
      libraryItemId: "item-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      createdAt: 1000,
      updatedAt: 2000,
      deletedAt: 2000,
    };
    await applySourceLinks([tombstone], ZERO_CURSOR, repo);
    expect(repo.links.get("link-1")?.deletedAt).toBe(2000);

    // Apply newer non-deleted version (user re-added)
    const readdEntry: SyncSourceLinkEntry = {
      cursorId: "link-1",
      libraryItemId: "item-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      createdAt: 1000,
      updatedAt: 3000, // Newer than tombstone
    };
    const result = await applySourceLinks([readdEntry], ZERO_CURSOR, repo);

    // Entry should be restored (newer wins)
    expect(result.affected).toHaveLength(1);
    const stored = repo.links.get("link-1");
    expect(stored?.deletedAt).toBeUndefined();
    expect(stored?.updatedAt).toBe(3000);
  });

  it("older tombstone does not delete newer entry", async () => {
    // Entry exists with newer timestamp
    repo.links.set("link-1", {
      cursorId: "link-1",
      libraryItemId: "item-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      createdAt: 1000,
      updatedAt: 3000, // Newer
    });

    // Older tombstone arrives (stale delete)
    const staleTombstone: SyncSourceLinkEntry = {
      cursorId: "link-1",
      libraryItemId: "item-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      createdAt: 1000,
      updatedAt: 2000, // Older than existing
      deletedAt: 2000,
    };
    await applySourceLinks([staleTombstone], ZERO_CURSOR, repo);

    // Entry should NOT be tombstoned - it's newer
    const stored = repo.links.get("link-1");
    expect(stored?.deletedAt).toBeUndefined();
    expect(stored?.updatedAt).toBe(3000);
  });
});

// ============================================================================
// applyChapterProgress tests
// ============================================================================

describe("applyChapterProgress", () => {
  let repo: InMemoryChapterProgressRepo;

  beforeEach(() => {
    repo = new InMemoryChapterProgressRepo();
  });

  it("creates new progress when not existing", async () => {
    const entry: SyncChapterProgressEntry = {
      cursorId: "progress-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      sourceChapterId: "chapter-1",
      progress: 10,
      total: 20,
      completed: false,
      lastReadAt: 1000,
      updatedAt: 1000,
    };

    const result = await applyChapterProgress([entry], ZERO_CURSOR, repo);

    expect(result.affected).toHaveLength(1);
    expect(result.affected[0].progress).toBe(10);
    expect(repo.entries.get("progress-1")).toBeDefined();
  });

  it("uses high-water mark for progress", async () => {
    // Existing: progress at 15
    repo.entries.set("progress-1", {
      cursorId: "progress-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      sourceChapterId: "chapter-1",
      progress: 15,
      total: 20,
      completed: false,
      lastReadAt: 1000,
      updatedAt: 1000,
    });

    // Incoming: progress at 10 (older)
    const entry: SyncChapterProgressEntry = {
      cursorId: "progress-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      sourceChapterId: "chapter-1",
      progress: 10, // Lower than existing
      total: 20,
      completed: false,
      lastReadAt: 500, // Older
      updatedAt: 2000,
    };

    await applyChapterProgress([entry], ZERO_CURSOR, repo);

    const merged = repo.entries.get("progress-1")!;
    expect(merged.progress).toBe(15); // Max of 15 and 10
    expect(merged.lastReadAt).toBe(1000); // Max of 1000 and 500
  });

  it("completed is sticky (OR semantics)", async () => {
    // Existing: completed
    repo.entries.set("progress-1", {
      cursorId: "progress-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      sourceChapterId: "chapter-1",
      progress: 19,
      total: 20,
      completed: true,
      lastReadAt: 1000,
      updatedAt: 1000,
    });

    // Incoming: not completed
    const entry: SyncChapterProgressEntry = {
      cursorId: "progress-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      sourceChapterId: "chapter-1",
      progress: 5,
      total: 20,
      completed: false,
      lastReadAt: 2000,
      updatedAt: 2000,
    };

    await applyChapterProgress([entry], ZERO_CURSOR, repo);

    const merged = repo.entries.get("progress-1")!;
    expect(merged.completed).toBe(true); // Stays true
  });

  it("tombstone preserves tombstone locally (not skipped)", async () => {
    const entry: SyncChapterProgressEntry = {
      cursorId: "progress-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      sourceChapterId: "chapter-1",
      progress: 10,
      total: 20,
      completed: false,
      lastReadAt: 1000,
      updatedAt: 1000,
      deletedAt: 1000,
    };

    const result = await applyChapterProgress([entry], ZERO_CURSOR, repo);

    expect(result.affected).toHaveLength(0); // Tombstones not in affected
    // Tombstone is PRESERVED locally
    const stored = repo.entries.get("progress-1");
    expect(stored).toBeDefined();
    expect(stored?.deletedAt).toBe(1000);
  });

  it("out-of-order: older progress after tombstone does NOT resurrect", async () => {
    // Apply tombstone first
    const tombstone: SyncChapterProgressEntry = {
      cursorId: "progress-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      sourceChapterId: "chapter-1",
      progress: 10,
      total: 20,
      completed: false,
      lastReadAt: 2000,
      updatedAt: 2000,
      deletedAt: 2000,
    };
    await applyChapterProgress([tombstone], ZERO_CURSOR, repo);
    expect(repo.entries.get("progress-1")?.deletedAt).toBe(2000);

    // Older progress arrives out-of-order
    const olderEntry: SyncChapterProgressEntry = {
      cursorId: "progress-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      sourceChapterId: "chapter-1",
      progress: 5,
      total: 20,
      completed: false,
      lastReadAt: 1000,
      updatedAt: 1500, // Older than tombstone
    };
    await applyChapterProgress([olderEntry], ZERO_CURSOR, repo);

    // Should NOT resurrect - tombstone wins
    expect(repo.entries.get("progress-1")?.deletedAt).toBe(2000);
  });

  it("high-water mark: incoming higher progress with older lastReadAt", async () => {
    // Scenario: User read further on device A (progress 15), but device B has newer read time
    repo.entries.set("progress-1", {
      cursorId: "progress-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      sourceChapterId: "chapter-1",
      progress: 10,
      total: 20,
      completed: false,
      lastReadAt: 2000, // More recent
      updatedAt: 2000,
    });

    const entry: SyncChapterProgressEntry = {
      cursorId: "progress-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      sourceChapterId: "chapter-1",
      progress: 15, // Higher progress
      total: 20,
      completed: false,
      lastReadAt: 1000, // Older timestamp
      updatedAt: 2500,
    };

    await applyChapterProgress([entry], ZERO_CURSOR, repo);

    const merged = repo.entries.get("progress-1")!;
    // Progress should be max(10, 15) = 15
    expect(merged.progress).toBe(15);
    // lastReadAt should be max(2000, 1000) = 2000
    expect(merged.lastReadAt).toBe(2000);
  });

  it("high-water mark: total never decreases", async () => {
    // Scenario: Chapter was re-scanned with fewer pages
    repo.entries.set("progress-1", {
      cursorId: "progress-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      sourceChapterId: "chapter-1",
      progress: 10,
      total: 30, // Original had 30 pages
      completed: false,
      lastReadAt: 1000,
      updatedAt: 1000,
    });

    const entry: SyncChapterProgressEntry = {
      cursorId: "progress-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      sourceChapterId: "chapter-1",
      progress: 10,
      total: 20, // Re-scan shows only 20 pages
      completed: false,
      lastReadAt: 1000,
      updatedAt: 2000,
    };

    await applyChapterProgress([entry], ZERO_CURSOR, repo);

    const merged = repo.entries.get("progress-1")!;
    // Total should be max(30, 20) = 30 (never decrease)
    expect(merged.total).toBe(30);
  });

  it("completed becomes true: can never be unset", async () => {
    // Scenario: User marked chapter complete, then re-read from beginning
    repo.entries.set("progress-1", {
      cursorId: "progress-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      sourceChapterId: "chapter-1",
      progress: 20,
      total: 20,
      completed: true, // Was completed
      lastReadAt: 1000,
      updatedAt: 1000,
    });

    const entry: SyncChapterProgressEntry = {
      cursorId: "progress-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      sourceChapterId: "chapter-1",
      progress: 5, // Re-reading from page 5
      total: 20,
      completed: false, // Now not complete
      lastReadAt: 2000,
      updatedAt: 2000,
    };

    await applyChapterProgress([entry], ZERO_CURSOR, repo);

    const merged = repo.entries.get("progress-1")!;
    // completed should stay true (sticky)
    expect(merged.completed).toBe(true);
    // But progress should be max (20 > 5)
    expect(merged.progress).toBe(20);
    // lastReadAt should update
    expect(merged.lastReadAt).toBe(2000);
  });
});

// ============================================================================
// applyMangaProgress tests
// ============================================================================

describe("applyMangaProgress", () => {
  let repo: InMemoryMangaProgressRepo;

  beforeEach(() => {
    repo = new InMemoryMangaProgressRepo();
  });

  it("creates new progress when not existing", async () => {
    const entry = {
      cursorId: "mp-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      lastReadAt: 1000,
      lastReadSourceChapterId: "ch-1",
      updatedAt: 1000,
    };

    const result = await applyMangaProgress([entry], ZERO_CURSOR, repo);

    expect(result.affected).toHaveLength(1);
    expect(repo.entries.get("mp-1")).toBeDefined();
  });

  it("tombstone preserves tombstone locally", async () => {
    const entry = {
      cursorId: "mp-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      lastReadAt: 1000,
      updatedAt: 1000,
      deletedAt: 1000,
    };

    const result = await applyMangaProgress([entry], ZERO_CURSOR, repo);

    expect(result.affected).toHaveLength(0); // Tombstones not in affected
    const stored = repo.entries.get("mp-1");
    expect(stored).toBeDefined();
    expect(stored?.deletedAt).toBe(1000);
  });

  it("out-of-order: older entry after tombstone does NOT resurrect", async () => {
    // Apply tombstone first
    const tombstone = {
      cursorId: "mp-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      lastReadAt: 2000,
      updatedAt: 2000,
      deletedAt: 2000,
    };
    await applyMangaProgress([tombstone], ZERO_CURSOR, repo);
    expect(repo.entries.get("mp-1")?.deletedAt).toBe(2000);

    // Older entry arrives out-of-order
    const olderEntry = {
      cursorId: "mp-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      lastReadAt: 1000,
      lastReadSourceChapterId: "ch-1",
      updatedAt: 1500, // Older than tombstone
    };
    await applyMangaProgress([olderEntry], ZERO_CURSOR, repo);

    // Should NOT resurrect - tombstone wins
    expect(repo.entries.get("mp-1")?.deletedAt).toBe(2000);
  });

  it("newer entry after tombstone CAN replace it (re-add scenario)", async () => {
    // Apply tombstone
    const tombstone = {
      cursorId: "mp-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      lastReadAt: 2000,
      updatedAt: 2000,
      deletedAt: 2000,
    };
    await applyMangaProgress([tombstone], ZERO_CURSOR, repo);
    expect(repo.entries.get("mp-1")?.deletedAt).toBe(2000);

    // Apply newer non-deleted version
    const newerEntry = {
      cursorId: "mp-1",
      registryId: "aidoku",
      sourceId: "source-1",
      sourceMangaId: "manga-1",
      lastReadAt: 3000,
      lastReadSourceChapterId: "ch-2",
      updatedAt: 3000, // Newer than tombstone
    };
    const result = await applyMangaProgress([newerEntry], ZERO_CURSOR, repo);

    // Entry should be restored (newer wins)
    expect(result.affected).toHaveLength(1);
    const stored = repo.entries.get("mp-1");
    expect(stored?.deletedAt).toBeUndefined();
    expect(stored?.updatedAt).toBe(3000);
  });
});

// ============================================================================
// Cursor advancement tests
// ============================================================================

describe("cursor advancement", () => {
  it("updates cursor to max updatedAt", async () => {
    const repo = new InMemoryLibraryItemRepo();
    const entries: SyncLibraryItemEntry[] = [
      { cursorId: "a", libraryItemId: "a", metadata: { title: "A" }, createdAt: 1000, updatedAt: 1000 },
      { cursorId: "b", libraryItemId: "b", metadata: { title: "B" }, createdAt: 2000, updatedAt: 2000 },
      { cursorId: "c", libraryItemId: "c", metadata: { title: "C" }, createdAt: 1500, updatedAt: 1500 },
    ];

    const result = await applyLibraryItems(entries, ZERO_CURSOR, repo);

    expect(result.nextCursor.updatedAt).toBe(2000);
    expect(result.nextCursor.cursorId).toBe("b");
  });

  it("uses cursorId as tie-breaker when updatedAt is equal", async () => {
    const repo = new InMemoryLibraryItemRepo();
    const entries: SyncLibraryItemEntry[] = [
      { cursorId: "aaa", libraryItemId: "a", metadata: { title: "A" }, createdAt: 1000, updatedAt: 1000 },
      { cursorId: "zzz", libraryItemId: "b", metadata: { title: "B" }, createdAt: 1000, updatedAt: 1000 },
      { cursorId: "mmm", libraryItemId: "c", metadata: { title: "C" }, createdAt: 1000, updatedAt: 1000 },
    ];

    const result = await applyLibraryItems(entries, ZERO_CURSOR, repo);

    expect(result.nextCursor.updatedAt).toBe(1000);
    expect(result.nextCursor.cursorId).toBe("zzz"); // Lexicographically largest
  });

  it("preserves existing cursor when no entries", async () => {
    const repo = new InMemoryLibraryItemRepo();
    const existingCursor: CompositeCursor = { updatedAt: 5000, cursorId: "existing" };

    const result = await applyLibraryItems([], existingCursor, repo);

    expect(result.nextCursor).toEqual(existingCursor);
  });

  it("cursor advances across all apply functions consistently", async () => {
    const sourceLinkRepo = new InMemorySourceLinkRepo();
    const chapterProgressRepo = new InMemoryChapterProgressRepo();
    const mangaProgressRepo = new InMemoryMangaProgressRepo();

    // Source links
    const slResult = await applySourceLinks([
      { cursorId: "sl-1", libraryItemId: "item-1", registryId: "r", sourceId: "s", sourceMangaId: "m", createdAt: 1000, updatedAt: 1000 },
      { cursorId: "sl-2", libraryItemId: "item-1", registryId: "r", sourceId: "s", sourceMangaId: "m2", createdAt: 2000, updatedAt: 2000 },
    ], ZERO_CURSOR, sourceLinkRepo);
    expect(slResult.nextCursor.updatedAt).toBe(2000);

    // Chapter progress
    const cpResult = await applyChapterProgress([
      { cursorId: "cp-1", registryId: "r", sourceId: "s", sourceMangaId: "m", sourceChapterId: "c1", progress: 1, total: 10, completed: false, lastReadAt: 1000, updatedAt: 3000 },
    ], ZERO_CURSOR, chapterProgressRepo);
    expect(cpResult.nextCursor.updatedAt).toBe(3000);

    // Manga progress
    const mpResult = await applyMangaProgress([
      { cursorId: "mp-1", registryId: "r", sourceId: "s", sourceMangaId: "m", lastReadAt: 1000, lastReadSourceChapterId: "c1", updatedAt: 4000 },
    ], ZERO_CURSOR, mangaProgressRepo);
    expect(mpResult.nextCursor.updatedAt).toBe(4000);
  });
});

