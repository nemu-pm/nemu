import "fake-indexeddb/auto";
import { afterEach, describe, expect, test } from "bun:test";
import type { ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
import {
  clearSyncServerTimeObservation,
  observeSyncServerTime,
} from "@nemu/core";
import type {
  LocalChapterProgress,
  LocalLibraryItem,
  LocalMangaProgress,
  LocalSourceLink,
} from "@/data/schema";
import {
  convexRef,
  createServicesContainer,
  drainPendingLibraryMergesBeforeSignOut,
  effectiveProfileIdRef,
  isAuthenticatedRef,
  sessionUserIdRef,
} from "./services";
import { setSyncSubscriptionsStopped } from "./subscription-gate";

let sequence = 0;

afterEach(() => {
  isAuthenticatedRef.current = false;
  convexRef.current = null;
  effectiveProfileIdRef.current = undefined;
  sessionUserIdRef.current = undefined;
  setSyncSubscriptionsStopped(false);
  clearSyncServerTimeObservation();
});

function libraryItem(id: string, updatedAt: number): LocalLibraryItem {
  return {
    libraryItemId: id,
    metadata: { title: id },
    inLibrary: true,
    createdAt: updatedAt,
    updatedAt,
  };
}

function sourceLink(itemId: string, mangaId: string): LocalSourceLink {
  return {
    id: `registry:source:${mangaId}`,
    libraryItemId: itemId,
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: mangaId,
    createdAt: 2,
    updatedAt: 2,
  };
}

function chapterProgress(): LocalChapterProgress {
  return {
    id: "registry:source:source-manga:chapter",
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "source-manga",
    sourceChapterId: "chapter",
    libraryItemId: "source",
    progress: 25,
    total: 100,
    completed: false,
    lastReadAt: 4,
    updatedAt: 4,
  };
}

function mangaProgress(): LocalMangaProgress {
  return {
    id: "registry:source:source-manga",
    registryId: "registry",
    sourceId: "source",
    sourceMangaId: "source-manga",
    libraryItemId: "source",
    lastReadAt: 4,
    lastReadSourceChapterId: "chapter",
    updatedAt: 4,
  };
}

async function setupService() {
  sequence += 1;
  const userId = `merge-service-${sequence}`;
  const services = createServicesContainer(`user:${userId}`);
  const local = services.localStore;
  await local.prepareSyncGeneration(7);
  const ready = Promise.resolve();
  services.stores.useLibraryStore.getState().prepareSyncGeneration(7, ready);
  services.stores.useCollectionsStore.getState().prepareSyncGeneration(7, ready);
  services.useProgressStore.getState().prepareSyncGeneration(7, ready);
  services.stores.useHistoryStore.getState().prepareSyncGeneration(7, ready);

  await local.saveLibraryItemsBatch([
    libraryItem("target", 1),
    libraryItem("source", 2),
  ]);
  await local.saveSourceLinksBatch([
    sourceLink("target", "target-manga"),
    sourceLink("source", "source-manga"),
  ]);
  await local.saveCollection({
    collectionId: "favorites",
    name: "Favorites",
    createdAt: 1,
    updatedAt: 1,
  });
  await local.addCollectionItems("favorites", ["source"], 3);
  await local.saveChapterProgressEntry(chapterProgress());
  await local.saveMangaProgressEntry(mangaProgress());
  await Promise.all([
    services.stores.useLibraryStore.getState().load(),
    services.stores.useCollectionsStore.getState().load(),
    services.useProgressStore.getState().load(),
  ]);
  await services.stores.useHistoryStore.getState().getProgress(
    "registry",
    "source",
    "source-manga",
    "chapter",
  );
  observeSyncServerTime(Date.now());
  isAuthenticatedRef.current = true;
  sessionUserIdRef.current = userId;
  effectiveProfileIdRef.current = `user:${userId}`;
  return services;
}

describe("web library merge service", () => {
  test("converges local stores and runs cloud relationship phases before source removal", async () => {
    const services = await setupService();
    const calls: string[] = [];
    convexRef.current = {
      mutation: async (mutation: unknown) => {
        calls.push(getFunctionName(mutation as never));
        return null;
      },
    } as unknown as ConvexReactClient;

    try {
      await services.stores.useLibraryStore.getState().mergeManga(
        "target",
        "source",
      );

      expect(calls).toEqual([
        "library:save",
        "collections:save",
        "collections:addItems",
        "history:retargetLibraryItem",
        "library:remove",
      ]);
      expect(await services.localStore.getPendingLibraryItemMerges()).toEqual([]);
      expect(services.stores.useLibraryStore.getState().entries).toHaveLength(1);
      expect(services.stores.useLibraryStore.getState().entries[0]?.sources)
        .toHaveLength(2);
      expect(
        services.stores.useCollectionsStore
          .getState()
          .getItemsInCollection("favorites"),
      ).toEqual(["target"]);
      expect(
        services.useProgressStore
          .getState()
          .get("registry:source:source-manga"),
      ).toMatchObject({ libraryItemId: "target" });
      expect(
        services.stores.useHistoryStore.getState().entries.get(
          "registry:source:source-manga:chapter",
        ),
      ).toMatchObject({ libraryItemId: "target" });

      // Even a stale warm cache cannot restore the merged-away id on the next
      // reader write; the service resolves linkage from the moved source link.
      services.stores.useHistoryStore.setState((state) => {
        const entries = new Map(state.entries);
        const cached = entries.get("registry:source:source-manga:chapter")!;
        entries.set(cached.id, { ...cached, libraryItemId: "source" });
        return { entries };
      });
      await services.stores.useHistoryStore.getState().saveProgress(
        "registry",
        "source",
        "source-manga",
        "chapter",
        50,
        100,
      );
      expect(
        await services.localStore.getChapterProgressEntry(
          "registry:source:source-manga:chapter",
        ),
      ).toMatchObject({ libraryItemId: "target" });
    } finally {
      services.dispose();
    }
  });

  test("keeps a locally coherent outbox when account identity changes mid-replay", async () => {
    const services = await setupService();
    const calls: string[] = [];
    convexRef.current = {
      mutation: async (mutation: unknown) => {
        const name = getFunctionName(mutation as never);
        calls.push(name);
        if (name === "library:save") {
          sessionUserIdRef.current = "different-user";
          effectiveProfileIdRef.current = "user:different-user";
        }
        return null;
      },
    } as unknown as ConvexReactClient;

    try {
      await services.stores.useLibraryStore.getState().mergeManga(
        "target",
        "source",
      );

      expect(calls).toEqual(["library:save"]);
      expect(await services.localStore.getPendingLibraryItemMerges()).toHaveLength(1);
      expect((await services.localStore.getLibraryItem("source"))?.inLibrary)
        .toBe(false);
      expect(await services.localStore.getSourceLink("registry:source:source-manga"))
        .toMatchObject({ libraryItemId: "target" });
    } finally {
      services.dispose();
    }
  });

  test("redirects stale-tab writes to the survivor without resurrecting the source", async () => {
    const services = await setupService();
    const staleTab = createServicesContainer(services.profileId);
    const ready = Promise.resolve();
    staleTab.stores.useLibraryStore.getState().prepareSyncGeneration(7, ready);
    staleTab.stores.useCollectionsStore.getState().prepareSyncGeneration(7, ready);
    await Promise.all([
      staleTab.stores.useLibraryStore.getState().load(),
      staleTab.stores.useCollectionsStore.getState().load(),
    ]);
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    convexRef.current = {
      mutation: async (mutation: unknown, args: Record<string, unknown>) => {
        calls.push({ name: getFunctionName(mutation as never), args });
        return null;
      },
    } as unknown as ConvexReactClient;

    try {
      await services.stores.useLibraryStore.getState().mergeManga(
        "target",
        "source",
      );
      calls.length = 0;

      // This tab still has the pre-merge source entry in memory. A later
      // metadata clock must not turn the permanent alias back into an item.
      await staleTab.stores.useLibraryStore.getState().updateMetadata(
        "source",
        { title: "stale offline title" },
      );
      expect(await staleTab.localStore.getLibraryItem("source")).toMatchObject({
        inLibrary: false,
        mergedIntoLibraryItemId: "target",
        metadata: { title: "source" },
      });
      expect(calls).toEqual([]);

      // A source-link save through that same stale entry follows the alias in
      // both IndexedDB and the outgoing cloud mutation.
      await staleTab.stores.useLibraryStore.getState().addSource("source", {
        registryId: "registry",
        sourceId: "source",
        sourceMangaId: "late-source",
      });
      expect(
        await staleTab.localStore.getSourceLink("registry:source:late-source"),
      ).toMatchObject({ libraryItemId: "target" });
      expect(calls.at(-1)).toMatchObject({
        name: "library:save",
        args: { libraryItemId: "target" },
      });

      // Collection actions using the retired id are likewise canonicalized.
      calls.length = 0;
      await staleTab.stores.useCollectionsStore
        .getState()
        .removeBooksFrom("favorites", ["source"]);
      expect(calls).toEqual([
        {
          name: "collections:removeItems",
          args: expect.objectContaining({ libraryItemIds: ["target"] }),
        },
      ]);
      expect(
        (await staleTab.localStore.getCollectionItems()).find(
          (item) =>
            item.collectionId === "favorites" &&
            item.libraryItemId === "target",
        ),
      ).toMatchObject({ removed: true });

      calls.length = 0;
      await staleTab.stores.useCollectionsStore
        .getState()
        .addBooksTo("favorites", ["source"]);
      expect(calls).toEqual([
        {
          name: "collections:addItems",
          args: expect.objectContaining({ libraryItemIds: ["target"] }),
        },
      ]);
      expect(
        (await staleTab.localStore.getCollectionItems()).find(
          (item) =>
            item.collectionId === "favorites" &&
            item.libraryItemId === "target",
        ),
      ).toMatchObject({ removed: false });

      // The next canonical reload removes the stale in-memory source and
      // displays every relationship under the survivor.
      await Promise.all([
        staleTab.stores.useLibraryStore.getState().load(),
        staleTab.stores.useCollectionsStore.getState().load(),
      ]);
      expect(staleTab.stores.useLibraryStore.getState().entries).toHaveLength(1);
      expect(
        staleTab.stores.useLibraryStore
          .getState()
          .get("target")
          ?.sources.some((source) => source.sourceMangaId === "late-source"),
      ).toBe(true);
      expect(
        staleTab.stores.useCollectionsStore
          .getState()
          .getItemsInCollection("favorites"),
      ).toEqual(["target"]);
    } finally {
      staleTab.dispose();
      services.dispose();
    }
  });

  test("drains pending merges while ordinary sync is paused for sign-out", async () => {
    const services = await setupService();
    const calls: string[] = [];
    convexRef.current = {
      mutation: async (mutation: unknown) => {
        calls.push(getFunctionName(mutation as never));
        return null;
      },
    } as unknown as ConvexReactClient;

    try {
      await services.localStore.mergeLibraryItems("target", "source");
      setSyncSubscriptionsStopped(true);

      await services.localStore.runWithSyncWrite((lease) =>
        drainPendingLibraryMergesBeforeSignOut(
          services.localStore,
          undefined,
          lease,
        ),
      );

      expect(calls).toEqual([
        "library:save",
        "collections:save",
        "collections:addItems",
        "history:retargetLibraryItem",
        "library:remove",
      ]);
      expect(await services.localStore.getPendingLibraryItemMerges()).toEqual([]);
    } finally {
      services.dispose();
    }
  });

  test("refuses sign-out when account identity changes during the drain", async () => {
    const services = await setupService();
    const calls: string[] = [];
    convexRef.current = {
      mutation: async (mutation: unknown) => {
        calls.push(getFunctionName(mutation as never));
        sessionUserIdRef.current = "different-user";
        effectiveProfileIdRef.current = "user:different-user";
        return null;
      },
    } as unknown as ConvexReactClient;

    try {
      await services.localStore.mergeLibraryItems("target", "source");
      setSyncSubscriptionsStopped(true);

      await expect(
        drainPendingLibraryMergesBeforeSignOut(services.localStore),
      ).rejects.toThrow("sign-out was cancelled");
      expect(calls).toEqual(["library:save"]);
      expect(await services.localStore.getPendingLibraryItemMerges()).toHaveLength(1);
    } finally {
      services.dispose();
    }
  });
});
