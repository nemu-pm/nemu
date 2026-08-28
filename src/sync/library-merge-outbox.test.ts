import { describe, expect, test } from "bun:test";
import { getFunctionName } from "convex/server";
import type { PendingLibraryItemMerge } from "@/data/indexeddb";
import type {
  LocalCollection,
  LocalCollectionItem,
  LocalLibraryItem,
  LocalSourceLink,
} from "@/data/schema";
import { flushPendingLibraryItemMerges } from "./library-merge-outbox";

const pending: PendingLibraryItemMerge = {
  id: "pending-library-item-merge:source",
  kind: "pending-library-item-merge",
  operationId: "merge-op",
  sourceLibraryItemId: "source",
  targetLibraryItemId: "target",
  generation: 7,
  updatedAt: 50,
};

const target: LocalLibraryItem = {
  libraryItemId: "target",
  metadata: { title: "Target" },
  inLibrary: true,
  createdAt: 1,
  updatedAt: 50,
};

const links: LocalSourceLink[] = [
  {
    id: "registry:source:a",
    libraryItemId: "target",
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "a",
    createdAt: 1,
    updatedAt: 50,
  },
  {
    id: "registry:source:b",
    libraryItemId: "target",
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "b",
    createdAt: 2,
    updatedAt: 50,
  },
  {
    id: "registry:source:removed",
    libraryItemId: "target",
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "removed",
    createdAt: 3,
    updatedAt: 50,
    removed: true,
  },
];

const collection: LocalCollection = {
  collectionId: "favorites",
  name: "Favorites",
  createdAt: 1,
  updatedAt: 10,
};

const membership: LocalCollectionItem = {
  collectionId: collection.collectionId,
  libraryItemId: target.libraryItemId,
  addedAt: 2,
  updatedAt: 50,
  removed: false,
};

function createStore(options?: {
  generation?: number | null;
  collections?: LocalCollection[];
  collectionItems?: LocalCollectionItem[];
}) {
  const completed: PendingLibraryItemMerge[] = [];
  return {
    completed,
    store: {
      getPendingLibraryItemMerges: async () => [pending],
      completePendingLibraryItemMerge: async (entry: PendingLibraryItemMerge) => {
        completed.push(entry);
        return true;
      },
      getSyncGeneration: async () => options?.generation ?? 7,
      getLibraryItem: async () => target,
      getSourceLinksForLibraryItem: async () => links,
      getCollections: async () => options?.collections ?? [collection],
      getCollectionItems: async () => options?.collectionItems ?? [membership],
    },
  };
}

describe("library merge cloud outbox", () => {
  test("moves links, restores target memberships, retargets history, then removes source", async () => {
    const { store, completed } = createStore();
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];

    const result = await flushPendingLibraryItemMerges({
      localStore: store,
      runMutation: async (_entry, mutation, args) => {
        calls.push({
          name: getFunctionName(mutation as never),
          args,
        });
        return true;
      },
    });

    expect(result).toEqual({ completed: 1, deferred: false });
    expect(calls.map((call) => call.name)).toEqual([
      "library:save",
      "collections:save",
      "collections:addItems",
      "history:retargetLibraryItem",
      "library:remove",
    ]);
    expect(
      (calls[0]?.args.sources as LocalSourceLink[]).map((link) => link.removed),
    ).toEqual([undefined, undefined, true]);
    expect(calls[2]?.args).toMatchObject({
      collectionId: "favorites",
      libraryItemIds: ["target"],
      updatedAt: 50,
      generation: 7,
    });
    expect(calls[3]?.args).toMatchObject({
      sourceLibraryItemId: "source",
      targetLibraryItemId: "target",
      updatedAt: 50,
      generation: 7,
    });
    expect(calls[4]?.args).toMatchObject({
      libraryItemId: "source",
      mergeTargetLibraryItemId: "target",
      updatedAt: 50,
      generation: 7,
    });
    expect(completed).toEqual([pending]);
  });

  test("keeps the operation durable when a middle phase is interrupted and resumes idempotently", async () => {
    const { store, completed } = createStore();
    const firstCalls: string[] = [];

    const first = await flushPendingLibraryItemMerges({
      localStore: store,
      runMutation: async (_entry, mutation) => {
        const name = getFunctionName(mutation as never);
        firstCalls.push(name);
        return name !== "history:retargetLibraryItem";
      },
    });

    expect(first).toEqual({ completed: 0, deferred: true });
    expect(firstCalls).toEqual([
      "library:save",
      "collections:save",
      "collections:addItems",
      "history:retargetLibraryItem",
    ]);
    expect(completed).toEqual([]);

    const retryCalls: string[] = [];
    const retry = await flushPendingLibraryItemMerges({
      localStore: store,
      runMutation: async (_entry, mutation) => {
        retryCalls.push(getFunctionName(mutation as never));
        return true;
      },
    });
    expect(retry).toEqual({ completed: 1, deferred: false });
    expect(retryCalls.at(-1)).toBe("library:remove");
    expect(completed).toEqual([pending]);
  });

  test("never replays an outbox entry across a generation reset", async () => {
    const { store, completed } = createStore({ generation: 8 });
    let mutationCount = 0;

    const result = await flushPendingLibraryItemMerges({
      localStore: store,
      runMutation: async () => {
        mutationCount += 1;
        return true;
      },
    });

    expect(result).toEqual({ completed: 0, deferred: true });
    expect(mutationCount).toBe(0);
    expect(completed).toEqual([]);
  });

  test("does not resurrect a target membership removed after the merge commit", async () => {
    const { store } = createStore({
      collectionItems: [{ ...membership, removed: true, updatedAt: 60 }],
    });
    const calls: string[] = [];

    await flushPendingLibraryItemMerges({
      localStore: store,
      runMutation: async (_entry, mutation) => {
        calls.push(getFunctionName(mutation as never));
        return true;
      },
    });

    expect(calls).not.toContain("collections:addItems");
    expect(calls).not.toContain("collections:save");
    expect(calls.at(-1)).toBe("library:remove");
  });
});
