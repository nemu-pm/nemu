import { describe, expect, test } from "bun:test";
import type { LibraryEntry } from "@/data/view";
import { createLibraryStore, type CanonicalLibraryOps } from "./library";

function entry(id: string, mangaId: string): LibraryEntry {
  return {
    item: {
      libraryItemId: id,
      metadata: { title: id },
      inLibrary: true,
      createdAt: 1,
      updatedAt: 1,
    },
    sources: [
      {
        id: `registry:source:${mangaId}`,
        libraryItemId: id,
        registryId: "registry",
        sourceId: "source",
        sourceMangaId: mangaId,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  };
}

function baseOps(overrides: Partial<CanonicalLibraryOps>): CanonicalLibraryOps {
  return {
    getLibraryEntries: async () => [],
    getLibraryItem: async () => null,
    getSourceLinksForItem: async () => [],
    saveLibraryItem: async () => {},
    removeLibraryItem: async () => {},
    saveSourceLink: async () => {},
    removeSourceLink: async () => {},
    mergeLibraryItems: async () => false,
    ...overrides,
  };
}

describe("LibraryStore merge convergence", () => {
  test("delegates one semantic merge and reloads the canonical joined result", async () => {
    const target = entry("target", "target-manga");
    const source = entry("source", "source-manga");
    let entries = [target, source];
    let mergeCount = 0;
    let primitiveWriteCount = 0;
    const store = createLibraryStore(
      baseOps({
        getLibraryEntries: async () => entries,
        saveLibraryItem: async () => { primitiveWriteCount += 1; },
        removeLibraryItem: async () => { primitiveWriteCount += 1; },
        saveSourceLink: async () => { primitiveWriteCount += 1; },
        removeSourceLink: async () => { primitiveWriteCount += 1; },
        mergeLibraryItems: async (targetId, sourceId) => {
          expect([targetId, sourceId]).toEqual(["target", "source"]);
          mergeCount += 1;
          entries = [
            {
              ...target,
              sources: [
                target.sources[0]!,
                { ...source.sources[0]!, libraryItemId: "target", updatedAt: 2 },
              ],
            },
          ];
          return true;
        },
      }),
    );

    await store.getState().load();
    await store.getState().mergeManga("target", "source");

    expect(mergeCount).toBe(1);
    expect(primitiveWriteCount).toBe(0);
    expect(store.getState().entries).toHaveLength(1);
    expect(store.getState().entries[0]?.sources).toHaveLength(2);
  });

  test("does not reload a committed old-generation result after reset wins", async () => {
    const target = entry("target", "target-manga");
    const source = entry("source", "source-manga");
    let markStarted!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const paused = new Promise<void>((resolve) => { release = resolve; });
    const store = createLibraryStore(
      baseOps({
        getLibraryEntries: async () => [target, source],
        mergeLibraryItems: async () => {
          markStarted();
          await paused;
          return true;
        },
      }),
    );
    await store.getState().load();

    const merge = store.getState().mergeManga("target", "source");
    await started;
    store.getState().prepareSyncGeneration(2, Promise.resolve());
    release();
    await merge;

    expect(store.getState().syncGeneration).toBe(2);
    expect(store.getState().entries).toEqual([]);
  });
});
