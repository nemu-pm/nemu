/**
 * Sign-out "keep data" flow tests
 * 
 * When signing out with "keep data":
 * 1. Copy user:<id> profile data → local profile
 * 2. Delete user:<id> profile
 * 3. After sign out, local profile should have all the data
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { IndexedDBUserDataStore } from "@/data/indexeddb";
import type { LocalLibraryItem, LocalSourceLink, LocalChapterProgress, LocalMangaProgress } from "@/data/schema";

// Mock IndexedDB for testing
import "fake-indexeddb/auto";

/**
 * Simulates the exact signOut logic from provider.tsx
 */
async function simulateSignOut(
  userStore: IndexedDBUserDataStore,
  keepData: boolean
): Promise<void> {
  if (keepData) {
    // Copy user profile data → local profile (exactly as provider.tsx does)
    const localProfile = new IndexedDBUserDataStore(); // No profileId = local
    
    // Copy library items
    const items = await userStore.getAllLibraryItems({ includeRemoved: true });
    for (const item of items) {
      await localProfile.saveLibraryItem(item);
    }
    
    // Copy source links
    const links = await userStore.getAllSourceLinks({ includeDeleted: true });
    for (const link of links) {
      await localProfile.saveSourceLink(link);
    }
    
    // Copy chapter progress
    const chapters = await userStore.getAllChapterProgress();
    for (const ch of chapters) {
      await localProfile.saveChapterProgressEntry(ch);
    }
    
    // Copy manga progress
    const mangas = await userStore.getAllMangaProgress();
    for (const m of mangas) {
      await localProfile.saveMangaProgressEntry(m);
    }
    
    // Copy settings
    const settings = await userStore.getSettings();
    await localProfile.saveSettings(settings);
  }
  
  // ALWAYS delete the cloud profile's local data
  await userStore.clearAccountData();
}

describe("Sign-out keep data flow", () => {
  const userId = "test-user-123";
  const userProfileId = `user:${userId}`;
  
  let userStore: IndexedDBUserDataStore;
  let localStore: IndexedDBUserDataStore;
  
  // Test data
  const testItem: LocalLibraryItem = {
    libraryItemId: "test-manga-1",
    metadata: { title: "Test Manga" },
    inLibrary: true,
    createdAt: 1000,
    updatedAt: 2000,
  };
  
  const testLink: LocalSourceLink = {
    cursorId: "test:source:manga1",
    libraryItemId: "test-manga-1",
    registryId: "test",
    sourceId: "source",
    sourceMangaId: "manga1",
    createdAt: 1000,
    updatedAt: 2000,
  };
  
  const testChapterProgress: LocalChapterProgress = {
    cursorId: "test:source:manga1:ch1",
    registryId: "test",
    sourceId: "source",
    sourceMangaId: "manga1",
    sourceChapterId: "ch1",
    progress: 50,
    total: 100,
    completed: false,
    lastReadAt: 3000,
    updatedAt: 3000,
  };
  
  const testMangaProgress: LocalMangaProgress = {
    cursorId: "test:source:manga1",
    registryId: "test",
    sourceId: "source",
    sourceMangaId: "manga1",
    lastReadAt: 3000,
    updatedAt: 3000,
  };

  beforeEach(async () => {
    // Create stores
    userStore = new IndexedDBUserDataStore(userProfileId);
    localStore = new IndexedDBUserDataStore(); // No profileId = local
    
    // Clear both stores
    await userStore.clearAccountData();
    await localStore.clearAccountData();
  });

  afterEach(async () => {
    // Clean up
    await userStore.clearAccountData();
    await localStore.clearAccountData();
  });

  it("copies library items from user profile to local profile", async () => {
    // Setup: user profile has data
    await userStore.saveLibraryItem(testItem);
    
    // Verify user profile has the item
    const userItems = await userStore.getAllLibraryItems();
    expect(userItems.length).toBe(1);
    expect(userItems[0].libraryItemId).toBe("test-manga-1");
    
    // Verify local profile is empty
    const localItemsBefore = await localStore.getAllLibraryItems();
    expect(localItemsBefore.length).toBe(0);
    
    // Execute: "keep data" flow - copy to local
    const items = await userStore.getAllLibraryItems();
    for (const item of items) {
      await localStore.saveLibraryItem(item);
    }
    
    // Verify local profile now has the item
    const localItemsAfter = await localStore.getAllLibraryItems();
    expect(localItemsAfter.length).toBe(1);
    expect(localItemsAfter[0].libraryItemId).toBe("test-manga-1");
    expect(localItemsAfter[0].metadata.title).toBe("Test Manga");
  });

  it("copies source links from user profile to local profile", async () => {
    await userStore.saveSourceLink(testLink);
    
    const userLinks = await userStore.getAllSourceLinks();
    expect(userLinks.length).toBe(1);
    
    const links = await userStore.getAllSourceLinks();
    for (const link of links) {
      await localStore.saveSourceLink(link);
    }
    
    const localLinks = await localStore.getAllSourceLinks();
    expect(localLinks.length).toBe(1);
    expect(localLinks[0].cursorId).toBe("test:source:manga1");
  });

  it("copies chapter progress from user profile to local profile", async () => {
    await userStore.saveChapterProgressEntry(testChapterProgress);
    
    const chapters = await userStore.getAllChapterProgress();
    expect(chapters.length).toBe(1);
    
    for (const ch of chapters) {
      await localStore.saveChapterProgressEntry(ch);
    }
    
    const localChapters = await localStore.getAllChapterProgress();
    expect(localChapters.length).toBe(1);
    expect(localChapters[0].progress).toBe(50);
  });

  it("copies manga progress from user profile to local profile", async () => {
    await userStore.saveMangaProgressEntry(testMangaProgress);
    
    const mangas = await userStore.getAllMangaProgress();
    expect(mangas.length).toBe(1);
    
    for (const m of mangas) {
      await localStore.saveMangaProgressEntry(m);
    }
    
    const localMangas = await localStore.getAllMangaProgress();
    expect(localMangas.length).toBe(1);
    expect(localMangas[0].lastReadAt).toBe(3000);
  });

  it("full keep data flow: copy all then delete user profile", async () => {
    // Setup: user profile has all types of data
    await userStore.saveLibraryItem(testItem);
    await userStore.saveSourceLink(testLink);
    await userStore.saveChapterProgressEntry(testChapterProgress);
    await userStore.saveMangaProgressEntry(testMangaProgress);
    
    // Verify user profile has data
    expect((await userStore.getAllLibraryItems()).length).toBe(1);
    expect((await userStore.getAllSourceLinks()).length).toBe(1);
    expect((await userStore.getAllChapterProgress()).length).toBe(1);
    expect((await userStore.getAllMangaProgress()).length).toBe(1);
    
    // Execute: copy all to local profile
    const items = await userStore.getAllLibraryItems({ includeRemoved: true });
    for (const item of items) {
      await localStore.saveLibraryItem(item);
    }
    
    const links = await userStore.getAllSourceLinks({ includeDeleted: true });
    for (const link of links) {
      await localStore.saveSourceLink(link);
    }
    
    const chapters = await userStore.getAllChapterProgress();
    for (const ch of chapters) {
      await localStore.saveChapterProgressEntry(ch);
    }
    
    const mangas = await userStore.getAllMangaProgress();
    for (const m of mangas) {
      await localStore.saveMangaProgressEntry(m);
    }
    
    // Then delete user profile
    await userStore.clearAccountData();
    
    // Verify user profile is empty
    expect((await userStore.getAllLibraryItems()).length).toBe(0);
    expect((await userStore.getAllSourceLinks()).length).toBe(0);
    expect((await userStore.getAllChapterProgress()).length).toBe(0);
    expect((await userStore.getAllMangaProgress()).length).toBe(0);
    
    // Verify local profile still has all data
    expect((await localStore.getAllLibraryItems()).length).toBe(1);
    expect((await localStore.getAllSourceLinks()).length).toBe(1);
    expect((await localStore.getAllChapterProgress()).length).toBe(1);
    expect((await localStore.getAllMangaProgress()).length).toBe(1);
  });

  it("new local store instance can read copied data", async () => {
    // Setup: user profile has data
    await userStore.saveLibraryItem(testItem);
    
    // Copy to local
    const items = await userStore.getAllLibraryItems({ includeRemoved: true });
    for (const item of items) {
      await localStore.saveLibraryItem(item);
    }
    
    // Create a NEW local store instance (simulates React re-render after sign out)
    const newLocalStore = new IndexedDBUserDataStore();
    
    // Verify new instance can read the data
    const newItems = await newLocalStore.getAllLibraryItems();
    expect(newItems.length).toBe(1);
    expect(newItems[0].libraryItemId).toBe("test-manga-1");
  });

  it("simulateSignOut with keepData=true preserves data in local profile", async () => {
    // Setup: user profile has all data
    await userStore.saveLibraryItem(testItem);
    await userStore.saveSourceLink(testLink);
    await userStore.saveChapterProgressEntry(testChapterProgress);
    await userStore.saveMangaProgressEntry(testMangaProgress);
    await userStore.saveSettings({ installedSources: [{ id: "test:src", registryId: "test", version: 1 }] });
    
    // Verify user profile has data
    expect((await userStore.getAllLibraryItems()).length).toBe(1);
    
    // Execute: sign out with keep data
    await simulateSignOut(userStore, true);
    
    // Verify user profile is wiped
    expect((await userStore.getAllLibraryItems()).length).toBe(0);
    
    // Simulate React re-render: create a fresh local store instance
    // This is what happens when effectiveProfileId changes to undefined
    const freshLocalStore = new IndexedDBUserDataStore();
    
    // Verify the fresh local store has the data
    const items = await freshLocalStore.getAllLibraryItems();
    expect(items.length).toBe(1);
    expect(items[0].libraryItemId).toBe("test-manga-1");
    
    const links = await freshLocalStore.getAllSourceLinks();
    expect(links.length).toBe(1);
    
    const chapters = await freshLocalStore.getAllChapterProgress();
    expect(chapters.length).toBe(1);
    
    const mangas = await freshLocalStore.getAllMangaProgress();
    expect(mangas.length).toBe(1);
    
    const settings = await freshLocalStore.getSettings();
    expect(settings.installedSources.length).toBe(1);
  });

  it("simulateSignOut with keepData=false wipes data (no copy)", async () => {
    // Setup: user profile has data
    await userStore.saveLibraryItem(testItem);
    
    // Verify user profile has data
    expect((await userStore.getAllLibraryItems()).length).toBe(1);
    
    // Also ensure local profile is empty
    expect((await localStore.getAllLibraryItems()).length).toBe(0);
    
    // Execute: sign out WITHOUT keep data
    await simulateSignOut(userStore, false);
    
    // Verify user profile is wiped
    expect((await userStore.getAllLibraryItems()).length).toBe(0);
    
    // Verify local profile is STILL empty (no copy happened)
    const freshLocalStore = new IndexedDBUserDataStore();
    const items = await freshLocalStore.getAllLibraryItems();
    expect(items.length).toBe(0);
  });

  it("getLibraryEntries returns copied data with sources", async () => {
    // Setup: user profile has item with source link
    await userStore.saveLibraryItem(testItem);
    await userStore.saveSourceLink(testLink);
    
    // Verify user can get entries with sources
    const userEntries = await userStore.getLibraryEntries();
    expect(userEntries.length).toBe(1);
    expect(userEntries[0].sources.length).toBe(1);
    
    // Sign out with keep data
    await simulateSignOut(userStore, true);
    
    // Create fresh local store (simulates React re-render)
    const freshLocalStore = new IndexedDBUserDataStore();
    
    // Verify getLibraryEntries works on the fresh local store
    const localEntries = await freshLocalStore.getLibraryEntries();
    expect(localEntries.length).toBe(1);
    expect(localEntries[0].item.libraryItemId).toBe("test-manga-1");
    expect(localEntries[0].sources.length).toBe(1);
    expect(localEntries[0].sources[0].cursorId).toBe("test:source:manga1");
  });
});

