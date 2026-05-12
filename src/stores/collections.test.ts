import { describe, expect, it } from "bun:test";
import { createCollectionsStore } from "./collections";
import type { LocalCollection } from "@/data/schema";

describe("CollectionsStore", () => {
  it("creates collections and tracks membership", async () => {
    const savedCollections: LocalCollection[] = [];
    const savedAdds: Array<{ collectionId: string; libraryItemIds: string[] }> = [];
    const savedRemoves: Array<{ collectionId: string; libraryItemIds: string[] }> = [];

    const store = createCollectionsStore({
      getCollections: async () => [],
      getCollectionItems: async () => [],
      saveCollection: async (collection) => {
        savedCollections.push(collection);
      },
      removeCollection: async () => {},
      addCollectionItems: async (collectionId, libraryItemIds) => {
        savedAdds.push({ collectionId, libraryItemIds });
      },
      removeCollectionItems: async (collectionId, libraryItemIds) => {
        savedRemoves.push({ collectionId, libraryItemIds });
      },
    });

    await store.getState().load();
    const created = await store.getState().create("Favorites");

    expect(created.name).toBe("Favorites");
    expect(savedCollections).toHaveLength(1);
    expect(store.getState().collections.map((collection) => collection.name)).toEqual(["Favorites"]);

    await store.getState().addBooksTo(created.collectionId, ["lib-1", "lib-2"]);
    expect(savedAdds).toEqual([{ collectionId: created.collectionId, libraryItemIds: ["lib-1", "lib-2"] }]);
    expect(store.getState().getItemsInCollection(created.collectionId)).toEqual(["lib-1", "lib-2"]);
    expect(store.getState().getCollectionsForItem("lib-1").map((collection) => collection.collectionId)).toEqual([
      created.collectionId,
    ]);

    await store.getState().removeBooksFrom(created.collectionId, ["lib-2"]);
    expect(savedRemoves).toEqual([{ collectionId: created.collectionId, libraryItemIds: ["lib-2"] }]);
    expect(store.getState().getItemsInCollection(created.collectionId)).toEqual(["lib-1"]);
  });

  it("renames and removes collections from local state", async () => {
    const removedIds: string[] = [];
    const store = createCollectionsStore({
      getCollections: async () => [],
      getCollectionItems: async () => [],
      saveCollection: async () => {},
      removeCollection: async (collectionId) => {
        removedIds.push(collectionId);
      },
      addCollectionItems: async () => {},
      removeCollectionItems: async () => {},
    });

    const created = await store.getState().create("To Read");
    await store.getState().rename(created.collectionId, "Reading");
    expect(store.getState().collections[0]?.name).toBe("Reading");

    await store.getState().addBooksTo(created.collectionId, ["lib-9"]);
    await store.getState().remove(created.collectionId);

    expect(removedIds).toEqual([created.collectionId]);
    expect(store.getState().collections).toEqual([]);
    expect(store.getState().getItemsInCollection(created.collectionId)).toEqual([]);
    expect(store.getState().getCollectionsForItem("lib-9")).toEqual([]);
  });

  it("does not add membership for a missing collection", async () => {
    const savedAdds: Array<{ collectionId: string; libraryItemIds: string[] }> = [];
    const store = createCollectionsStore({
      getCollections: async () => [],
      getCollectionItems: async () => [],
      saveCollection: async () => {},
      removeCollection: async () => {},
      addCollectionItems: async (collectionId, libraryItemIds) => {
        savedAdds.push({ collectionId, libraryItemIds });
      },
      removeCollectionItems: async () => {},
    });

    await store.getState().load();
    await store.getState().addBooksTo("missing", ["lib-1"]);

    expect(savedAdds).toEqual([]);
    expect(store.getState().getItemsInCollection("missing")).toEqual([]);
  });
});
