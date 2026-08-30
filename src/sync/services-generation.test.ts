import "fake-indexeddb/auto";
import { afterEach, describe, expect, test } from "bun:test";
import type { ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
import { IndexedDBUserDataStore } from "@/data/indexeddb";
import type { ProfileWriteFenceLease } from "@/data/profile-write-fence";
import {
  clearSyncServerTimeObservation,
  observeSyncServerTime,
} from "@nemu/core";
import {
  clearCloudData,
  convexRef,
  createServicesContainer,
  effectiveProfileIdRef,
  isAuthenticatedRef,
  sessionUserIdRef,
  updateObservedSyncCapabilities,
} from "./services";

let sequence = 0;

afterEach(() => {
  clearSyncServerTimeObservation();
  updateObservedSyncCapabilities(null);
  isAuthenticatedRef.current = false;
  convexRef.current = null;
  effectiveProfileIdRef.current = undefined;
  sessionUserIdRef.current = undefined;
});

function authenticateStore(
  store: IndexedDBUserDataStore,
  convex: ConvexReactClient,
): void {
  const userId = store.profileId.slice("user:".length);
  isAuthenticatedRef.current = true;
  sessionUserIdRef.current = userId;
  effectiveProfileIdRef.current = store.profileId;
  convexRef.current = convex;
}

const INTRA_PAGE_CONTENT_IDENTITY = `mobile-image:reader-page-state-v1:${"a".repeat(64)}`;

async function captureDirectHistorySave(
  chapterProgressIntraPageVersion?: unknown,
): Promise<Record<string, unknown>> {
  sequence += 1;
  const services = createServicesContainer(
    `user:history-capability:${sequence}`,
  );
  const store = services.localStore;
  const userId = store.profileId.slice("user:".length);
  let mutationArgs: Record<string, unknown> | undefined;
  const convex = {
    mutation: async (mutation: unknown, args: Record<string, unknown>) => {
      expect(getFunctionName(mutation as never)).toBe("history:save");
      mutationArgs = args;
      return null;
    },
  } as unknown as ConvexReactClient;

  try {
    await store.prepareSyncGeneration(1);
    services.stores.useHistoryStore
      .getState()
      .prepareSyncGeneration(1, Promise.resolve());
    await store.saveChapterProgressEntry({
      id: "registry:source:manga:chapter",
      registryId: "registry",
      sourceId: "source",
      sourceMangaId: "manga",
      sourceChapterId: "chapter",
      progress: 1,
      total: 10,
      completed: false,
      lastReadAt: 100,
      intraPageProgress: 0.625,
      intraPageContentIdentity: INTRA_PAGE_CONTENT_IDENTITY,
      updatedAt: 100,
    });
    await services.stores.useHistoryStore
      .getState()
      .getProgress("registry", "source", "manga", "chapter");

    authenticateStore(store, convex);
    observeSyncServerTime(Date.now());
    updateObservedSyncCapabilities({
      convex,
      localStore: store,
      profileId: store.profileId,
      userId,
      generation: 1,
      ...(chapterProgressIntraPageVersion === undefined
        ? {}
        : { chapterProgressIntraPageVersion }),
    });

    await services.stores.useHistoryStore
      .getState()
      .saveProgress("registry", "source", "manga", "chapter", 2, 10);
    expect(mutationArgs).toBeDefined();
    return mutationArgs!;
  } finally {
    services.dispose();
  }
}

describe("web cloud reset generation", () => {
  test("direct history saves omit intra-page state for an old backend response", async () => {
    const args = await captureDirectHistorySave();

    expect(args).not.toHaveProperty("intraPageProgress");
    expect(args).not.toHaveProperty("intraPageContentIdentity");
  });

  test("direct history saves include intra-page state after observing v1", async () => {
    const args = await captureDirectHistorySave(1);

    expect(args).toMatchObject({
      intraPageProgress: 0.625,
      intraPageContentIdentity: INTRA_PAGE_CONTENT_IDENTITY,
    });
  });

  test("aborts before clearing when the account changes during generation lookup", async () => {
    sequence += 1;
    const store = new IndexedDBUserDataStore(`user:clear-switch:${sequence}`);
    let releaseQuery!: () => void;
    const queryPaused = new Promise<void>((resolve) => {
      releaseQuery = resolve;
    });
    let mutationCount = 0;
    authenticateStore(store, {
      query: async () => {
        await queryPaused;
        return { generation: 0 };
      },
      mutation: async () => {
        mutationCount += 1;
        return { generation: 1 };
      },
    } as unknown as ConvexReactClient);

    const clear = clearCloudData(store);
    sessionUserIdRef.current = "another-account";
    effectiveProfileIdRef.current = "user:another-account";
    releaseQuery();

    await expect(clear).rejects.toThrow("active account changed");
    expect(mutationCount).toBe(0);
  });

  test("adopts the committed generation returned by an exactly-once clear", async () => {
    sequence += 1;
    const store = new IndexedDBUserDataStore(`user:clear-retry:${sequence}`);
    await store.prepareSyncGeneration(0);
    await store.saveLibraryItem({
      libraryItemId: "stale",
      metadata: { title: "Stale" },
      inLibrary: true,
      createdAt: 1,
      updatedAt: 1,
    });
    authenticateStore(store, {
      // Convex owns response-loss retries for this one mutation promise; this
      // result is therefore the one committed generation, never a second clear.
      mutation: async () => ({ generation: 2 }),
    } as unknown as ConvexReactClient);

    await clearCloudData(store);

    expect(await store.getSyncGeneration()).toBe(2);
    expect(await store.getAllLibraryItems({ includeRemoved: true })).toEqual(
      [],
    );
  });

  test("returns after one clear while the durable backend cleanup continues", async () => {
    sequence += 1;
    const store = new IndexedDBUserDataStore(`user:clear-pages:${sequence}`);
    await store.prepareSyncGeneration(4);
    const names: string[] = [];
    authenticateStore(store, {
      mutation: async (mutation: unknown) => {
        const name = getFunctionName(mutation as never);
        names.push(name);
        return {
          generation: 5,
          cleanupToken: { table: "library_items" },
        };
      },
    } as unknown as ConvexReactClient);

    await clearCloudData(store);

    expect(names).toEqual(["sync:clearAll"]);
    expect(await store.getSyncGeneration()).toBe(5);
  });

  test("a history user write already in flight is ordered before reset and cannot resurrect", async () => {
    sequence += 1;
    const services = createServicesContainer(`user:history-race:${sequence}`);
    const store = services.localStore;
    await store.prepareSyncGeneration(1);
    services.stores.useHistoryStore
      .getState()
      .prepareSyncGeneration(1, Promise.resolve());

    const originalSave = store.saveChapterProgressEntry.bind(store);
    let markStarted!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const paused = new Promise<void>((resolve) => {
      release = resolve;
    });
    store.saveChapterProgressEntry = async (
      entry,
      lease?: ProfileWriteFenceLease,
    ) => {
      markStarted();
      await paused;
      return originalSave(entry, lease);
    };

    const userWrite = services.stores.useHistoryStore
      .getState()
      .saveProgress("registry", "source", "manga", "chapter", 50, 100);
    await started;
    const reset = store.prepareSyncGeneration(2);
    services.stores.useHistoryStore.getState().prepareSyncGeneration(2, reset);
    release();
    await Promise.all([userWrite, reset]);

    expect(await store.getAllChapterProgress()).toEqual([]);
    expect(await store.getAllMangaProgress()).toEqual([]);
    expect(await store.getSyncGeneration()).toBe(2);
    services.dispose();
  });

  test("a history user write started after reset observes and survives the new generation", async () => {
    sequence += 1;
    const services = createServicesContainer(
      `user:history-after-reset:${sequence}`,
    );
    const store = services.localStore;
    await store.prepareSyncGeneration(1);
    await store.prepareSyncGeneration(2);
    services.stores.useHistoryStore
      .getState()
      .prepareSyncGeneration(2, Promise.resolve());

    await services.stores.useHistoryStore
      .getState()
      .saveProgress("registry", "source", "manga", "chapter", 75, 100);

    expect(await store.getAllChapterProgress()).toHaveLength(1);
    expect(await store.getAllMangaProgress()).toHaveLength(1);
    expect(await store.getSyncGeneration()).toBe(2);
    services.dispose();
  });
});
