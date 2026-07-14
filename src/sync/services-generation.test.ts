import "fake-indexeddb/auto";
import { afterEach, describe, expect, test } from "bun:test";
import type { ConvexReactClient } from "convex/react";
import { getFunctionName } from "convex/server";
import { IndexedDBUserDataStore } from "@/data/indexeddb";
import {
  clearCloudData,
  convexRef,
  createServicesContainer,
  effectiveProfileIdRef,
  isAuthenticatedRef,
  sessionUserIdRef,
} from "./services";

let sequence = 0;

afterEach(() => {
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

describe("web cloud reset generation", () => {
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
    expect(await store.getAllLibraryItems({ includeRemoved: true })).toEqual([]);
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

    const originalSave = store.saveChapterProgressEntry.bind(store);
    let markStarted!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const paused = new Promise<void>((resolve) => { release = resolve; });
    store.saveChapterProgressEntry = async (entry) => {
      markStarted();
      await paused;
      return originalSave(entry);
    };

    const userWrite = services.stores.useHistoryStore.getState().saveProgress(
      "registry",
      "source",
      "manga",
      "chapter",
      50,
      100,
    );
    await started;
    const reset = store.prepareSyncGeneration(2);
    release();
    await Promise.all([userWrite, reset]);

    expect(await store.getAllChapterProgress()).toEqual([]);
    expect(await store.getAllMangaProgress()).toEqual([]);
    expect(await store.getSyncGeneration()).toBe(2);
    services.dispose();
  });

  test("a history user write started after reset observes and survives the new generation", async () => {
    sequence += 1;
    const services = createServicesContainer(`user:history-after-reset:${sequence}`);
    const store = services.localStore;
    await store.prepareSyncGeneration(1);
    await store.prepareSyncGeneration(2);

    await services.stores.useHistoryStore.getState().saveProgress(
      "registry",
      "source",
      "manga",
      "chapter",
      75,
      100,
    );

    expect(await store.getAllChapterProgress()).toHaveLength(1);
    expect(await store.getAllMangaProgress()).toHaveLength(1);
    expect(await store.getSyncGeneration()).toBe(2);
    services.dispose();
  });
});
