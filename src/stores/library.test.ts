import { describe, it, expect } from "bun:test";
import { createLibraryStore } from "./library";
import type { LocalLibraryItem } from "@/data/schema";

describe("LibraryStore.load", () => {
  it("foreground load flips loading true -> false", async () => {
    let entries: any[] = [];
    const removed: string[] = [];
    const store = createLibraryStore({
      getLibraryEntries: async () => entries,
      getLibraryItem: async () => null,
      getSourceLinksForItem: async () => [],
      saveLibraryItem: async () => {},
      removeLibraryItem: async (id: string) => { removed.push(id); },
      saveSourceLink: async () => {},
      removeSourceLink: async () => {},
    });

    expect(store.getState().loading).toBe(true);
    await store.getState().load(false);
    expect(store.getState().loading).toBe(false);

    entries = [{ item: { libraryItemId: "x" }, sources: [] }];
    await store.getState().load(false);
    expect(store.getState().loading).toBe(false);
    expect(store.getState().entries).toEqual([]);
    // Missing sources can be transient; load should NOT auto-remove.
    expect(removed).toEqual([]);
  });

  it("background refresh does not change loading state", async () => {
    let entries: any[] = [];
    const removed: string[] = [];
    const store = createLibraryStore({
      getLibraryEntries: async () => entries,
      getLibraryItem: async () => null,
      getSourceLinksForItem: async () => [],
      saveLibraryItem: async () => {},
      removeLibraryItem: async (id: string) => { removed.push(id); },
      saveSourceLink: async () => {},
      removeSourceLink: async () => {},
    });

    // Start from a loaded state.
    await store.getState().load(false);
    expect(store.getState().loading).toBe(false);

    entries = [{ item: { libraryItemId: "y" }, sources: [] }];
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
      });
      await store.getState().load();
      await store.getState().updateMetadata("future", { title: "After" });
      expect(saved[0]?.updatedAt).toBe(501);
    } finally {
      Date.now = originalNow;
    }
  });
});
