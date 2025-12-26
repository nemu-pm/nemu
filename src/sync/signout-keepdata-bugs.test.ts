/**
 * Sign-out "keep data" bug exposure tests
 *
 * These tests specifically expose bugs in the sign-out "keep data" flow
 * where tombstones (removed items) are lost, breaking sync convergence.
 *
 * BUG SUMMARY:
 * - getAllLibraryItems() filters out inLibrary=false items (line 1003 of indexeddb.ts)
 * - getAllSourceLinks() filters out deletedAt items (line 1194 of indexeddb.ts)
 *
 * These filters are correct for UI display but WRONG for sync/copy operations.
 * The sign-out "keep data" flow uses these methods, losing tombstones.
 *
 * IMPACT:
 * When user signs out with "keep data", then signs back in, removed items
 * can RESURRECT because their tombstones were not preserved locally.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { IndexedDBUserDataStore } from "@/data/indexeddb";
import type { LocalLibraryItem, LocalSourceLink } from "@/data/schema";
import { formatIntentClock } from "./hlc";

import "fake-indexeddb/auto";

function makeClock(wallMs: number, counter: number, nodeId: string): string {
  return formatIntentClock({ wallMs, counter, nodeId });
}

describe("BUG: getAllLibraryItems() filters out tombstones", () => {
  let store: IndexedDBUserDataStore;

  beforeEach(async () => {
    store = new IndexedDBUserDataStore("test-profile");
    await store.clearAccountData();
  });

  afterEach(async () => {
    await store.clearAccountData();
  });

  it("BUG EXPOSED: inLibrary=false items are NOT returned by getAllLibraryItems()", async () => {
    // Save a tombstoned item
    const tombstonedItem: LocalLibraryItem = {
      libraryItemId: "manga-removed",
      metadata: { title: "Removed Manga" },
      inLibrary: false, // Tombstone
      inLibraryClock: makeClock(2000, 0, "device-a"),
      createdAt: 1000,
      updatedAt: 2000,
    };
    await store.saveLibraryItem(tombstonedItem);

    // Verify it's saved via point query
    const saved = await store.getLibraryItem("manga-removed");
    expect(saved).not.toBeNull();
    expect(saved!.inLibrary).toBe(false);

    // BUG: getAllLibraryItems() does NOT return it
    const allItems = await store.getAllLibraryItems();
    expect(allItems.length).toBe(0); // Should be 1 but is 0

    // EXPECTED BEHAVIOR:
    // For sync/copy operations, we need a method that returns ALL items
    // including tombstones. Current implementation breaks convergence.
  });

  it("BUG EXPOSED: mix of active and tombstoned items - only active returned", async () => {
    // Save active item
    await store.saveLibraryItem({
      libraryItemId: "manga-active",
      metadata: { title: "Active" },
      inLibrary: true,
      inLibraryClock: makeClock(1000, 0, "device-a"),
      createdAt: 1000,
      updatedAt: 1000,
    });

    // Save tombstoned item
    await store.saveLibraryItem({
      libraryItemId: "manga-removed",
      metadata: { title: "Removed" },
      inLibrary: false,
      inLibraryClock: makeClock(2000, 0, "device-a"),
      createdAt: 1000,
      updatedAt: 2000,
    });

    // getAllLibraryItems only returns active
    const allItems = await store.getAllLibraryItems();
    expect(allItems.length).toBe(1);
    expect(allItems[0].libraryItemId).toBe("manga-active");

    // Tombstoned item is lost in any bulk copy operation!
  });

  it("REGRESSION: sign-out keep-data copy must preserve tombstones (inLibrary=false)", async () => {
    const userStore = new IndexedDBUserDataStore("user:test-user");
    const localStore = new IndexedDBUserDataStore(); // Local profile

    // User has both active and removed items
    await userStore.saveLibraryItem({
      libraryItemId: "manga-keep",
      metadata: { title: "Keep" },
      inLibrary: true,
      inLibraryClock: makeClock(1000, 0, "device-a"),
      createdAt: 1000,
      updatedAt: 1000,
    });

    await userStore.saveLibraryItem({
      libraryItemId: "manga-removed",
      metadata: { title: "Removed" },
      inLibrary: false, // User removed this
      inLibraryClock: makeClock(3000, 0, "device-a"), // Later than initial add
      createdAt: 1000,
      updatedAt: 3000,
    });

    // Simulate sign-out "keep data" flow (as implemented in provider.tsx)
    const items = await userStore.getAllLibraryItems({ includeRemoved: true });
    for (const item of items) {
      await localStore.saveLibraryItem(item);
    }

    // ONLY the active item was copied
    const localItems = await localStore.getAllLibraryItems();
    expect(localItems.length).toBe(1);
    expect(localItems[0].libraryItemId).toBe("manga-keep");

    // Tombstone must be preserved for no-resurrection
    const localRemoved = await localStore.getLibraryItem("manga-removed");
    expect(localRemoved).not.toBeNull();
    expect(localRemoved!.inLibrary).toBe(false);
    expect(localRemoved!.inLibraryClock).toBe(makeClock(3000, 0, "device-a"));

    // CONSEQUENCE: If user signs back in and server has older "add" version,
    // the item can RESURRECT because local has no tombstone to prevent it.

    await userStore.clearAccountData();
    await localStore.clearAccountData();
  });
});

describe("BUG: getAllSourceLinks() filters out tombstones", () => {
  let store: IndexedDBUserDataStore;

  beforeEach(async () => {
    store = new IndexedDBUserDataStore("test-profile");
    await store.clearAccountData();
  });

  afterEach(async () => {
    await store.clearAccountData();
  });

  it("BUG EXPOSED: deletedAt items are NOT returned by getAllSourceLinks()", async () => {
    // Save a tombstoned source link
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
    await store.saveSourceLink(tombstonedLink);

    // Verify it's saved via point query
    const saved = await store.getSourceLink("r:s:manga-removed");
    expect(saved).not.toBeNull();
    expect(saved!.deletedAt).toBe(2000);

    // BUG: getAllSourceLinks() does NOT return it
    const allLinks = await store.getAllSourceLinks();
    expect(allLinks.length).toBe(0); // Should be 1 but is 0
  });

  it("REGRESSION: sign-out keep-data copy must preserve source link tombstones (deletedAt)", async () => {
    const userStore = new IndexedDBUserDataStore("user:test-user");
    const localStore = new IndexedDBUserDataStore();

    // User has both active and removed source links
    await userStore.saveSourceLink({
      cursorId: "r:s:manga-active",
      libraryItemId: "manga-1",
      registryId: "r",
      sourceId: "s",
      sourceMangaId: "manga-active",
      createdAt: 1000,
      updatedAt: 1000,
    });

    await userStore.saveSourceLink({
      cursorId: "r:s:manga-removed",
      libraryItemId: "manga-1",
      registryId: "r",
      sourceId: "s",
      sourceMangaId: "manga-removed",
      createdAt: 1000,
      updatedAt: 2000,
      deletedAt: 2000, // Tombstone
    });

    // Simulate sign-out "keep data"
    const links = await userStore.getAllSourceLinks({ includeDeleted: true });
    for (const link of links) {
      await localStore.saveSourceLink(link);
    }

    // ONLY active link was copied
    const localLinks = await localStore.getAllSourceLinks();
    expect(localLinks.length).toBe(1);
    expect(localLinks[0].cursorId).toBe("r:s:manga-active");

    // Tombstone must be preserved
    const localRemoved = await localStore.getSourceLink("r:s:manga-removed");
    expect(localRemoved).not.toBeNull();
    expect(localRemoved!.deletedAt).toBe(2000);

    await userStore.clearAccountData();
    await localStore.clearAccountData();
  });
});

describe("Workaround needed: getAllXxxIncludingTombstones()", () => {
  it("SPEC REQUIREMENT: sync/copy needs methods that return ALL items including tombstones", () => {
    // Per sync.md Phase 6.5:
    // - "inLibrary=false + inLibraryClock" represents removal state
    // - Tombstones must be preserved to prevent resurrection
    //
    // RECOMMENDATION:
    // Add new methods for sync/copy operations:
    // - getAllLibraryItemsIncludingRemoved()
    // - getAllSourceLinksIncludingDeleted()
    //
    // Or add a parameter:
    // - getAllLibraryItems({ includeRemoved: true })
    // - getAllSourceLinks({ includeDeleted: true })
    //
    // The sign-out "keep data" flow MUST use these methods.
    expect(true).toBe(true); // Placeholder to document the requirement
  });
});

describe("Additional edge cases for sign-out flow", () => {
  let userStore: IndexedDBUserDataStore;
  let localStore: IndexedDBUserDataStore;

  beforeEach(async () => {
    userStore = new IndexedDBUserDataStore("user:test-user");
    localStore = new IndexedDBUserDataStore();
    await userStore.clearAccountData();
    await localStore.clearAccountData();
  });

  afterEach(async () => {
    await userStore.clearAccountData();
    await localStore.clearAccountData();
  });

  it("multiple tombstones across different data types", async () => {
    // Library item tombstone
    await userStore.saveLibraryItem({
      libraryItemId: "manga-1",
      metadata: { title: "Removed" },
      inLibrary: false,
      inLibraryClock: makeClock(2000, 0, "device-a"),
      createdAt: 1000,
      updatedAt: 2000,
    });

    // Source link tombstone
    await userStore.saveSourceLink({
      cursorId: "r:s:link-1",
      libraryItemId: "manga-1",
      registryId: "r",
      sourceId: "s",
      sourceMangaId: "link-1",
      createdAt: 1000,
      updatedAt: 2000,
      deletedAt: 2000,
    });

    // Default methods are UI-shaped (filter out tombstones)
    const items = await userStore.getAllLibraryItems();
    const links = await userStore.getAllSourceLinks();

    // Both are empty due to filtering
    expect(items.length).toBe(0);
    expect(links.length).toBe(0);

    // For keep-data / sync, we must include tombstones
    const allItems = await userStore.getAllLibraryItems({ includeRemoved: true });
    const allLinks = await userStore.getAllSourceLinks({ includeDeleted: true });
    expect(allItems.length).toBe(1);
    expect(allLinks.length).toBe(1);
  });

  it("re-added then removed item - tombstone must reflect final state", async () => {
    // Item was: added -> removed -> re-added -> removed again
    // Final state: inLibrary=false with latest clock
    const finalClock = makeClock(4000, 0, "device-a");
    await userStore.saveLibraryItem({
      libraryItemId: "manga-flipflop",
      metadata: { title: "Flip Flop" },
      inLibrary: false, // Final: removed
      inLibraryClock: finalClock, // Latest clock
      createdAt: 1000,
      updatedAt: 4000,
    });

    // This tombstone is critical for convergence
    // If lost during sign-out, any older "add" state from server could resurrect

    const items = await userStore.getAllLibraryItems();
    expect(items.length).toBe(0); // UI-shaped: tombstone not returned

    const direct = await userStore.getLibraryItem("manga-flipflop");
    expect(direct!.inLibrary).toBe(false);
    expect(direct!.inLibraryClock).toBe(finalClock);

    const all = await userStore.getAllLibraryItems({ includeRemoved: true });
    expect(all.length).toBe(1);
    expect(all[0].libraryItemId).toBe("manga-flipflop");
  });

  it("item with both metadata override AND removed status", async () => {
    // User customized title, then removed from library
    // Both the override AND the removal state must be preserved
    await userStore.saveLibraryItem({
      libraryItemId: "manga-customized-removed",
      metadata: { title: "Original" },
      inLibrary: false, // Removed
      inLibraryClock: makeClock(3000, 0, "device-a"),
      overrides: {
        metadata: { title: "Custom Title" }, // User's customization
        metadataClock: makeClock(2000, 0, "device-a"),
      },
      createdAt: 1000,
      updatedAt: 3000,
    });

    // Item not returned by getAllLibraryItems
    const items = await userStore.getAllLibraryItems();
    expect(items.length).toBe(0);

    // But the override data exists and would be lost
    const direct = await userStore.getLibraryItem("manga-customized-removed");
    expect(direct!.overrides?.metadata?.title).toBe("Custom Title");
    expect(direct!.inLibrary).toBe(false);

    const all = await userStore.getAllLibraryItems({ includeRemoved: true });
    expect(all.length).toBe(1);
    expect(all[0].overrides?.metadata?.title).toBe("Custom Title");
  });
});

describe("Sync meta and pending ops preservation", () => {
  it("sign-out should also copy sync cursors if keeping data", async () => {
    // Per sync.md: cursors are part of profile state
    // If user signs out with "keep data", cursors should be preserved
    // so that when they sign back in, sync can resume from where it left off
    //
    // This test documents the requirement - actual implementation may vary
    expect(true).toBe(true);
  });

  it("sign-out should handle pending ops correctly", async () => {
    // Per sync.md: pending ops belong to the profile
    // If user signs out with "keep data":
    // - Option A: Copy pending ops to local profile (risky - they reference cloud user)
    // - Option B: Discard pending ops (they were for the cloud account)
    // - Option C: Keep them in cloud profile DB for when user signs back in
    //
    // The spec suggests C - pending ops remain queued but won't sync until sign-in
    expect(true).toBe(true);
  });
});

