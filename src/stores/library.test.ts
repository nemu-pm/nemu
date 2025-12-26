import { describe, it, expect } from "bun:test";
import { createLibraryStore } from "./library";

describe("LibraryStore.load", () => {
  it("foreground load flips loading true -> false", async () => {
    let entries: any[] = [];
    const store = createLibraryStore({
      getLibraryEntries: async () => entries,
      getLibraryItem: async () => null,
      getSourceLinksForItem: async () => [],
      saveLibraryItem: async () => {},
      removeLibraryItem: async () => {},
      saveSourceLink: async () => {},
      removeSourceLink: async () => {},
    });

    expect(store.getState().loading).toBe(true);
    await store.getState().load(false);
    expect(store.getState().loading).toBe(false);

    entries = [{ item: { libraryItemId: "x" }, sources: [] }];
    await store.getState().load(false);
    expect(store.getState().loading).toBe(false);
    expect(store.getState().entries).toEqual(entries);
  });

  it("background refresh does not change loading state", async () => {
    let entries: any[] = [];
    const store = createLibraryStore({
      getLibraryEntries: async () => entries,
      getLibraryItem: async () => null,
      getSourceLinksForItem: async () => [],
      saveLibraryItem: async () => {},
      removeLibraryItem: async () => {},
      saveSourceLink: async () => {},
      removeSourceLink: async () => {},
    });

    // Start from a loaded state.
    await store.getState().load(false);
    expect(store.getState().loading).toBe(false);

    entries = [{ item: { libraryItemId: "y" }, sources: [] }];
    await store.getState().load(true);
    expect(store.getState().loading).toBe(false);
    expect(store.getState().entries).toEqual(entries);

    // If something else sets loading=true, background refresh should not "unstick" it either.
    store.setState({ loading: true });
    await store.getState().load(true);
    expect(store.getState().loading).toBe(true);
  });
});


