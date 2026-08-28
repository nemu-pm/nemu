import { describe, it, expect } from "bun:test";
import { createLibraryStore } from "./library";
import type { LocalLibraryItem, LocalSourceLink } from "@/data/schema";
import type { LibraryEntry } from "@/data/view";

function validEntry(libraryItemId: string) {
  return {
    item: {
      libraryItemId,
      metadata: { title: libraryItemId },
      inLibrary: true,
      createdAt: 1,
      updatedAt: 1,
    },
    sources: [
      {
        id: `registry:source:${libraryItemId}`,
        libraryItemId,
        registryId: "registry",
        sourceId: "source",
        sourceMangaId: libraryItemId,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
}

describe("LibraryStore.load", () => {
  it("foreground load flips loading true -> false", async () => {
    let entries: LibraryEntry[] = [];
    const removed: string[] = [];
    const store = createLibraryStore({
      getLibraryEntries: async () => entries,
      getLibraryItem: async () => null,
      getSourceLinksForItem: async () => [],
      saveLibraryItem: async () => {},
      removeLibraryItem: async (id: string) => { removed.push(id); },
      saveSourceLink: async () => {},
      removeSourceLink: async () => {},
      mergeLibraryItems: async () => false,
    });

    expect(store.getState().loading).toBe(true);
    await store.getState().load(false);
    expect(store.getState().loading).toBe(false);

    entries = [
      { item: { libraryItemId: "x" }, sources: [] } as unknown as LibraryEntry,
    ];
    await store.getState().load(false);
    expect(store.getState().loading).toBe(false);
    expect(store.getState().entries).toEqual([]);
    // Missing sources can be transient; load should NOT auto-remove.
    expect(removed).toEqual([]);
  });

  it("background refresh does not change loading state", async () => {
    let entries: LibraryEntry[] = [];
    const removed: string[] = [];
    const store = createLibraryStore({
      getLibraryEntries: async () => entries,
      getLibraryItem: async () => null,
      getSourceLinksForItem: async () => [],
      saveLibraryItem: async () => {},
      removeLibraryItem: async (id: string) => { removed.push(id); },
      saveSourceLink: async () => {},
      removeSourceLink: async () => {},
      mergeLibraryItems: async () => false,
    });

    // Start from a loaded state.
    await store.getState().load(false);
    expect(store.getState().loading).toBe(false);

    entries = [
      { item: { libraryItemId: "y" }, sources: [] } as unknown as LibraryEntry,
    ];
    await store.getState().load(true);
    expect(store.getState().loading).toBe(false);
    expect(store.getState().entries).toEqual([]);
    // Missing sources can be transient; background load should NOT auto-remove.
    expect(removed).toEqual([]);

    // If something else sets loading=true, background refresh should not "unstick" it either.
    store.setState({ loading: true });
    await store.getState().load(true);
    expect(store.getState().loading).toBe(true);
  });
});

describe("LibraryStore sync clocks", () => {
  it("advances edits beyond a future record clock", async () => {
    const originalNow = Date.now;
    Date.now = () => 100;
    const saved: LocalLibraryItem[] = [];
    const entry = {
      item: {
        libraryItemId: "future",
        metadata: { title: "Before" },
        inLibrary: true,
        createdAt: 1,
        updatedAt: 500,
      },
      sources: [{
        id: "registry:source:manga",
        libraryItemId: "future",
        registryId: "registry",
        sourceId: "source",
        sourceMangaId: "manga",
        createdAt: 1,
        updatedAt: 500,
      }],
    };
    try {
      const store = createLibraryStore({
        getLibraryEntries: async () => [entry],
        getLibraryItem: async () => entry.item,
        getSourceLinksForItem: async () => entry.sources,
        saveLibraryItem: async (item) => { saved.push(item); },
        removeLibraryItem: async () => {},
        saveSourceLink: async () => {},
        removeSourceLink: async () => {},
        mergeLibraryItems: async () => false,
      });
      await store.getState().load();
      await store.getState().updateMetadata("future", { title: "After" });
      expect(saved[0]?.updatedAt).toBe(501);
    } finally {
      Date.now = originalNow;
    }
  });
});

describe("LibraryStore generation transitions", () => {
  it("immediately clears warm state and ignores an inflight old-generation load", async () => {
    let markLoadStarted!: () => void;
    const loadStarted = new Promise<void>((resolve) => {
      markLoadStarted = resolve;
    });
    let resolveLoad!: (entries: ReturnType<typeof validEntry>[]) => void;
    const delayedEntries = new Promise<ReturnType<typeof validEntry>[]>(
      (resolve) => {
        resolveLoad = resolve;
      },
    );
    const store = createLibraryStore({
      getLibraryEntries: async () => {
        markLoadStarted();
        return delayedEntries;
      },
      getLibraryItem: async () => null,
      getSourceLinksForItem: async () => [],
      saveLibraryItem: async () => {},
      removeLibraryItem: async () => {},
      saveSourceLink: async () => {},
      removeSourceLink: async () => {},
      mergeLibraryItems: async () => false,
    });
    store.setState({ entries: [validEntry("warm")] });

    const loading = store.getState().load();
    await loadStarted;
    store.getState().prepareSyncGeneration(2, Promise.resolve());
    expect(store.getState()).toMatchObject({
      entries: [],
      loading: true,
      syncGeneration: 2,
    });
    resolveLoad([validEntry("stale")]);
    await loading;

    expect(store.getState().entries).toEqual([]);
  });

  it("queues a post-reset add until readiness and tags both writes with the new generation", async () => {
    const generations: Array<number | null | undefined> = [];
    const savedItems: LocalLibraryItem[] = [];
    const savedLinks: LocalSourceLink[] = [];
    let markReady!: () => void;
    const readiness = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    const store = createLibraryStore({
      getLibraryEntries: async () => [],
      getLibraryItem: async () => null,
      getSourceLinksForItem: async () => [],
      saveLibraryItem: async (item, generation) => {
        savedItems.push(item);
        generations.push(generation);
      },
      removeLibraryItem: async () => {},
      saveSourceLink: async (link, generation) => {
        savedLinks.push(link);
        generations.push(generation);
      },
      removeSourceLink: async () => {},
      mergeLibraryItems: async () => false,
    });
    store.getState().prepareSyncGeneration(4, readiness);

    const adding = store.getState().add({
      metadata: { title: "After reset" },
      source: {
        registryId: "registry",
        sourceId: "source",
        sourceMangaId: "after-reset",
      },
    });
    await Promise.resolve();
    expect(savedItems).toEqual([]);
    markReady();
    const entry = await adding;

    expect(generations).toEqual([4, 4]);
    expect(savedItems).toHaveLength(1);
    expect(savedLinks).toHaveLength(1);
    expect(store.getState().entries).toEqual([entry]);
  });
});
