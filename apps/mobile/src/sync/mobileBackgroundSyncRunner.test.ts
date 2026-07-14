import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { getFunctionName } from "convex/server";
import type { ConvexReactClient } from "convex/react";
import type { MobileDataStore } from "@/data/storeTypes";
import {
  isMobileBackgroundSyncRunning,
  getLastMobileBackgroundSyncAt,
  resetMobileBackgroundSyncStateForTesting,
  runMobileBackgroundSyncOnce as runMobileBackgroundSyncOnceImpl,
  type MobileBackgroundSyncDeps,
} from "./mobileBackgroundSyncRunner";
import { MOBILE_BACKGROUND_SYNC_DEBOUNCE_MS } from "./mobileBackgroundSyncConfig";
import {
  runWithMobileSyncSuspended,
  runWithMobileSyncWrite,
} from "./mobileSyncRuntime";

function runMobileBackgroundSyncOnce(
  deps: Omit<MobileBackgroundSyncDeps, "expectedUserId">,
) {
  return runMobileBackgroundSyncOnceImpl({
    ...deps,
    expectedUserId: "account-a",
  });
}

// Minimal store mock: records calls and returns canned data. Only the methods
// the runner touches are implemented.
function makeStore(overrides: Partial<MobileDataStore> = {}): MobileDataStore {
  const base: MobileDataStore = {
    getSyncGeneration: async () => 0,
    applySyncGeneration: async () => "current",
    getSyncSnapshotState: async () => null,
    recordSyncSnapshotState: async () => true,
    getSettings: async () => ({ installedSources: [] }) as never,
    getSyncSettings: async () => ({ installedSources: [] }) as never,
    saveSettings: async () => undefined,
    clearPackageCacheReferences: async () => undefined,
    clearAllUserData: async () => undefined,
    getInstalledSources: async () => [],
    getInstalledSource: async () => null,
    saveInstalledSource: async () => undefined,
    removeInstalledSource: async () => undefined,
    getSourceSettings: async () => null,
    saveSourceSettings: async () => undefined,
    resetSourceSettings: async () => undefined,
    getRegistries: async () => [],
    getRegistry: async () => null,
    saveRegistry: async () => undefined,
    removeRegistry: async () => undefined,
    getLibraryEntries: async () => [],
    getLibraryItem: async () => null,
    getAllLibraryItems: async () => [],
    getSourceLinksForItem: async () => [],
    getSourceLink: async () => null,
    getAllSourceLinks: async () => [],
    saveLibraryItem: async () => undefined,
    saveLibrarySnapshot: async () => undefined,
    removeLibraryItem: async () => undefined,
    saveSourceLink: async () => undefined,
    removeSourceLink: async () => undefined,
    getChapterProgress: async () => null,
    getMangaChapterProgress: async () => ({}),
    getAllChapterProgress: async () => [],
    saveChapterProgress: async () => undefined,
    saveChapterProgressBatch: async () => undefined,
    getMangaProgress: async () => [],
    getAllMangaProgress: async () => [],
    saveMangaProgress: async () => undefined,
    saveMangaProgressBatch: async () => undefined,
    getCollections: async () => [],
    getCollectionItems: async () => [],
    saveCollectionsSnapshot: async () => undefined,
    saveCollection: async () => undefined,
    removeCollection: async () => undefined,
    addCollectionItems: async () => undefined,
    removeCollectionItems: async () => undefined,
    clearAccountData: async () => undefined,
    hasSyncedData: async () => false,
    ...overrides,
  } as MobileDataStore;
  return base;
}

// Minimal convex client mock: `query` returns canned snapshots. The runner
// only calls `query`, never `mutation`, in the background path.
function makeConvex(
  snapshots: {
    generation?: number;
    generations?: Partial<
      Record<
        | "libraryItems"
        | "sourceLinks"
        | "collections"
        | "collectionItems"
        | "chapterProgress"
        | "mangaProgress"
        | "settings",
        number
      >
    >;
    libraryItems?: unknown[];
    sourceLinks?: unknown[];
    collections?: unknown[];
    collectionItems?: unknown[];
    chapterProgress?: unknown[];
    mangaProgress?: unknown[];
    settings?: { installedSources?: unknown[]; updatedAt?: number };
    pageSize?: number;
  } = {},
): ConvexReactClient {
  const generation = (key: keyof NonNullable<typeof snapshots.generations>) =>
    snapshots.generations?.[key] ?? snapshots.generation ?? 0;
  const page = (
    pageGeneration: number,
    rows: unknown[],
    args?: { paginationOpts?: { cursor?: string | null } },
  ) => {
    const offset = Number(args?.paginationOpts?.cursor ?? 0);
    const pageSize = snapshots.pageSize ?? Math.max(1, rows.length);
    const nextOffset = Math.min(rows.length, offset + pageSize);
    const pageRows = rows.slice(offset, nextOffset);
    return {
      generation: pageGeneration,
      page: [
        { kind: "generation", generation: pageGeneration },
        ...pageRows.map((row) => ({
          kind: "row",
          generation: pageGeneration,
          row,
        })),
      ],
      continueCursor: String(nextOffset),
      isDone: nextOffset >= rows.length,
    };
  };
  const query = async (
    name: unknown,
    args?: { paginationOpts?: { cursor?: string | null } },
  ): Promise<unknown> => {
    const fnName = getFunctionName(name as never);
    switch (fnName) {
      case "sync:generation":
        return { generation: snapshots.generation ?? 0 };
      case "sync:libraryItemsAllV2":
        return page(
          generation("libraryItems"),
          snapshots.libraryItems ?? [],
          args,
        );
      case "sync:sourceLinksAllV2":
        return page(
          generation("sourceLinks"),
          snapshots.sourceLinks ?? [],
          args,
        );
      case "sync:collectionsAllV2":
        return page(
          generation("collections"),
          snapshots.collections ?? [],
          args,
        );
      case "sync:collectionItemsAllV2":
        return page(
          generation("collectionItems"),
          snapshots.collectionItems ?? [],
          args,
        );
      case "sync:chapterProgressAllV2":
        return page(
          generation("chapterProgress"),
          snapshots.chapterProgress ?? [],
          args,
        );
      case "sync:mangaProgressAllV2":
        return page(
          generation("mangaProgress"),
          snapshots.mangaProgress ?? [],
          args,
        );
      case "settings:getV2":
        return page(
          generation("settings"),
          [
            {
              installedSources: snapshots.settings?.installedSources ?? [],
              updatedAt: snapshots.settings?.updatedAt ?? 0,
            },
          ],
          args,
        );
      default:
        throw new Error(`unexpected query ${fnName}`);
    }
  };
  return { query } as unknown as ConvexReactClient;
}

describe("mobileBackgroundSyncRunner", () => {
  beforeEach(() => {
    resetMobileBackgroundSyncStateForTesting();
  });

  afterEach(() => {
    resetMobileBackgroundSyncStateForTesting();
  });

  test("completes a full sync pass with empty snapshots and reports completed", async () => {
    const states: Parameters<MobileDataStore["recordSyncSnapshotState"]>[0][] =
      [];
    const store = makeStore({
      recordSyncSnapshotState: async (state) => {
        states.push(state);
        return true;
      },
    });
    const convex = makeConvex();
    const result = await runMobileBackgroundSyncOnce({
      store,
      convex,
      now: () => 1_000_000,
    });
    expect(result.ran).toBe(true);
    expect(result.reason).toBe("completed");
    expect(getLastMobileBackgroundSyncAt()).toBe(1_000_000);
    expect(isMobileBackgroundSyncRunning()).toBe(false);
    expect(states).toEqual([
      {
        status: "healthy",
        generation: 0,
        origin: "background",
        observedAt: 1_000_000,
      },
    ]);
  });

  test("fetches every page before applying a foreground-compatible snapshot", async () => {
    const received: unknown[][] = [];
    const store = makeStore({
      applyLibrarySnapshot: async (items) => {
        received.push(items);
        return { localItemsToPush: [], localLinksToPush: [] };
      },
    });
    const libraryItems = ["a", "b", "c"].map((id, index) => ({
      id,
      libraryItemId: id,
      metadata: { title: id },
      inLibrary: true,
      createdAt: index,
      updatedAt: index,
    }));
    const result = await runMobileBackgroundSyncOnce({
      store,
      convex: makeConvex({ libraryItems, pageSize: 1 }),
      now: () => 1_250_000,
    });
    expect(result.reason).toBe("completed");
    expect(received).toHaveLength(1);
    expect(
      received[0]?.map(
        (row) => (row as { libraryItemId: string }).libraryItemId,
      ),
    ).toEqual(["a", "b", "c"]);
  });

  test("rejects a mixed-generation seven-resource bundle before any local apply", async () => {
    const writes: string[] = [];
    const store = makeStore({
      applySyncGeneration: async () => {
        writes.push("generation");
        return "current";
      },
      applyLibrarySnapshot: async () => {
        writes.push("library");
        return { localItemsToPush: [], localLinksToPush: [] };
      },
    });
    const result = await runMobileBackgroundSyncOnce({
      store,
      convex: makeConvex({
        generation: 2,
        generations: { settings: 3 },
      }),
      now: () => 1_500_000,
    });

    expect(result.reason).toBe("completed");
    expect(writes).toEqual([]);
  });

  test("re-confirms a mutable foreground transport before applying its pull", async () => {
    const writes: string[] = [];
    const store = makeStore({
      applySyncGeneration: async () => {
        writes.push("generation");
        return "current";
      },
      applyLibrarySnapshot: async () => {
        writes.push("library");
        return { localItemsToPush: [], localLinksToPush: [] };
      },
    });
    let confirmations = 0;

    const result = await runMobileBackgroundSyncOnce({
      store,
      convex: makeConvex(),
      confirmExpectedUser: async () => {
        confirmations += 1;
        return false;
      },
      now: () => 1_625_000,
    });

    expect(result.reason).toBe("completed");
    expect(confirmations).toBe(1);
    expect(writes).toEqual([]);
  });

  test("re-confirms a mutable foreground transport before persisting a budget gate", async () => {
    const states: Parameters<MobileDataStore["recordSyncSnapshotState"]>[0][] =
      [];
    const store = makeStore({
      recordSyncSnapshotState: async (state) => {
        states.push(state);
        return true;
      },
    });
    let confirmations = 0;

    const result = await runMobileBackgroundSyncOnce({
      store,
      convex: makeConvex({
        libraryItems: [
          {
            libraryItemId: "oversized",
            payload: "x".repeat(7 * 1024 * 1024),
          },
        ],
      }),
      confirmExpectedUser: async () => {
        confirmations += 1;
        return false;
      },
      now: () => 1_700_000,
    });

    expect(result.reason).toBe("completed");
    expect(confirmations).toBe(1);
    expect(states).toEqual([]);
  });

  test("does not start account confirmation after a pull is cancelled", async () => {
    const baseConvex = makeConvex();
    let generationQueries = 0;
    let expiring = false;
    let confirmations = 0;
    const convex = {
      query: async (name: unknown, args: unknown) => {
        const result = await baseConvex.query(name as never, args as never);
        if (getFunctionName(name as never) === "sync:generation") {
          generationQueries += 1;
          if (generationQueries === 2) expiring = true;
        }
        return result;
      },
    } as unknown as ConvexReactClient;

    const result = await runMobileBackgroundSyncOnce({
      store: makeStore(),
      convex,
      isExpiring: () => expiring,
      confirmExpectedUser: async () => {
        confirmations += 1;
        return true;
      },
      now: () => 1_750_000,
    });

    expect(result.reason).toBe("completed");
    expect(confirmations).toBe(0);
  });

  test("fails closed without local writes when one resource exceeds its row budget", async () => {
    const totalChapterRows = 40_001;
    const query = async (
      name: unknown,
      args?: { paginationOpts?: { cursor?: string | null; numItems?: number } },
    ): Promise<unknown> => {
      const fnName = getFunctionName(name as never);
      if (fnName === "sync:generation") return { generation: 6 };
      const offset = Number(args?.paginationOpts?.cursor ?? 0);
      const requested = args?.paginationOpts?.numItems ?? 128;
      const rowCount =
        fnName === "sync:chapterProgressAllV2"
          ? Math.min(requested, totalChapterRows - offset)
          : 0;
      const nextOffset = offset + rowCount;
      return {
        generation: 6,
        page: [
          { kind: "generation", generation: 6 },
          ...Array.from({ length: rowCount }, (_, index) => ({
            kind: "row",
            generation: 6,
            row: { id: `row-${offset + index}` },
          })),
        ],
        continueCursor: String(nextOffset),
        isDone:
          fnName === "sync:chapterProgressAllV2"
            ? nextOffset >= totalChapterRows
            : true,
      };
    };
    const writes: string[] = [];
    const states: Parameters<MobileDataStore["recordSyncSnapshotState"]>[0][] =
      [];
    const store = makeStore({
      applySyncGeneration: async () => {
        writes.push("generation");
        return "current";
      },
      applyChapterProgressSnapshot: async () => {
        writes.push("progress");
        return { progress: [], changed: [], localWinners: [] };
      },
      recordSyncSnapshotState: async (state) => {
        states.push(state);
        return true;
      },
    });

    const result = await runMobileBackgroundSyncOnce({
      store,
      convex: { query } as unknown as ConvexReactClient,
      now: () => 1_750_000,
    });

    expect(result.reason).toBe("budget-exceeded");
    expect(writes).toEqual([]);
    expect(states).toEqual([
      {
        status: "budget-exceeded",
        generation: 6,
        origin: "background",
        resourceKey: "chapterProgress",
        totalRows: 40_000,
        totalEstimatedBytes: expect.any(Number),
        observedAt: 1_750_000,
      },
    ]);
  });

  test("fails closed without local writes when large rows exceed the byte budget", async () => {
    const sharedLargePayload = "x".repeat(50 * 1024);
    const libraryItems = Array.from({ length: 128 }, (_, index) => ({
      libraryItemId: `item-${index}`,
      payload: sharedLargePayload,
    }));
    const writes: string[] = [];
    const states: Parameters<MobileDataStore["recordSyncSnapshotState"]>[0][] =
      [];
    const store = makeStore({
      applySyncGeneration: async () => {
        writes.push("generation");
        return "current";
      },
      applyLibrarySnapshot: async () => {
        writes.push("library");
        return { localItemsToPush: [], localLinksToPush: [] };
      },
      recordSyncSnapshotState: async (state) => {
        states.push(state);
        return true;
      },
    });

    const result = await runMobileBackgroundSyncOnce({
      store,
      convex: makeConvex({ generation: 6, libraryItems }),
      now: () => 1_760_000,
    });

    expect(result.reason).toBe("budget-exceeded");
    expect(writes).toEqual([]);
    expect(states).toEqual([
      expect.objectContaining({
        status: "budget-exceeded",
        generation: 6,
        origin: "background",
        resourceKey: "libraryItems",
        observedAt: 1_760_000,
      }),
    ]);
  });

  test("does not resume generation-2 phases after a queued generation-3 reset", async () => {
    let generation = 1;
    const rows: string[] = [];
    let markLibraryEntered!: () => void;
    let releaseLibrary!: () => void;
    const libraryEntered = new Promise<void>((resolve) => {
      markLibraryEntered = resolve;
    });
    const libraryGate = new Promise<void>((resolve) => {
      releaseLibrary = resolve;
    });
    const store = makeStore({
      getSyncGeneration: async () => generation,
      applySyncGeneration: async (incoming) => {
        if (incoming < generation) return "stale";
        if (incoming === generation) return "current";
        generation = incoming;
        rows.length = 0;
        return "reset";
      },
      applyLibrarySnapshot: async () => {
        markLibraryEntered();
        await libraryGate;
        rows.push("library-generation-2");
        return { localItemsToPush: [], localLinksToPush: [] };
      },
      applyCollectionsSnapshot: async () => {
        rows.push("stale-collections-generation-2");
        return {
          localCollectionsToPush: [],
          localCollectionItemsToPush: [],
        };
      },
      applyChapterProgressSnapshot: async () => {
        rows.push("stale-progress-generation-2");
        return { progress: [], changed: [], localWinners: [] };
      },
      applyMangaProgressSnapshot: async () => {
        rows.push("stale-manga-generation-2");
        return { progress: [], changed: [], localWinners: [] };
      },
      applyInstalledSourcesSnapshot: async () => {
        rows.push("stale-settings-generation-2");
      },
    });

    const running = runMobileBackgroundSyncOnce({
      store,
      convex: makeConvex({ generation: 2 }),
      now: () => 1_600_000,
    });
    await libraryEntered;
    const newerReset = runWithMobileSyncWrite(() =>
      store.applySyncGeneration(3),
    );
    releaseLibrary();
    await Promise.all([newerReset, running]);

    expect(generation).toBe(3);
    expect(rows).toEqual([]);
  });

  test("is not re-entrant: a second call while the first is in flight is skipped", async () => {
    let releaseLibrary!: () => void;
    const libraryPromise = new Promise<void>((resolve) => {
      releaseLibrary = resolve;
    });
    const store = makeStore({
      getAllLibraryItems: async () => {
        await libraryPromise;
        return [];
      },
    });
    const convex = makeConvex();

    const first = runMobileBackgroundSyncOnce({
      store,
      convex,
      now: () => 5_000,
    });
    // Let the first call enter the library phase.
    await Promise.resolve();
    expect(isMobileBackgroundSyncRunning()).toBe(true);

    const second = runMobileBackgroundSyncOnce({
      store,
      convex,
      now: () => 5_000,
    });
    const secondResult = await second;
    expect(secondResult.ran).toBe(false);
    expect(secondResult.reason).toBe("already-running");

    releaseLibrary();
    const firstResult = await first;
    expect(firstResult.ran).toBe(true);
  });

  test("respects the debounce window after a completed run", async () => {
    const store = makeStore();
    const convex = makeConvex();
    const first = await runMobileBackgroundSyncOnce({
      store,
      convex,
      now: () => 10_000,
    });
    expect(first.ran).toBe(true);

    const second = await runMobileBackgroundSyncOnce({
      store,
      convex,
      now: () => 10_000 + MOBILE_BACKGROUND_SYNC_DEBOUNCE_MS - 1,
    });
    expect(second.ran).toBe(false);
    expect(second.reason).toBe("debounced");
  });

  test("force bypasses debounce but never bypasses the re-entrancy guard", async () => {
    const store = makeStore();
    const convex = makeConvex();
    await runMobileBackgroundSyncOnce({
      store,
      convex,
      now: () => 20_000,
    });

    const forced = await runMobileBackgroundSyncOnce({
      store,
      convex,
      force: true,
      now: () => 20_001,
    });
    expect(forced.reason).toBe("completed");

    let releaseLibrary!: () => void;
    const libraryGate = new Promise<void>((resolve) => {
      releaseLibrary = resolve;
    });
    const blockingStore = makeStore({
      getAllLibraryItems: async () => {
        await libraryGate;
        return [];
      },
    });
    const running = runMobileBackgroundSyncOnce({
      store: blockingStore,
      convex,
      force: true,
      now: () => 20_002,
    });
    await Promise.resolve();
    const overlapping = await runMobileBackgroundSyncOnce({
      store: blockingStore,
      convex,
      force: true,
      now: () => 20_002,
    });
    expect(overlapping.reason).toBe("already-running");
    releaseLibrary();
    await running;
  });

  test("stops starting new phases when isExpiring returns true", async () => {
    const calls: string[] = [];
    const store = makeStore({
      saveLibrarySnapshot: async () => {
        calls.push("library-saved");
      },
      saveCollectionsSnapshot: async () => {
        calls.push("collections-saved");
      },
      saveChapterProgressBatch: async () => {
        calls.push("chapter-progress-saved");
      },
      saveMangaProgressBatch: async () => {
        calls.push("manga-progress-saved");
      },
      saveSettings: async () => {
        calls.push("settings-saved");
      },
    });
    const convex = makeConvex();
    // Flip expiring to true after the library phase commits, so the
    // collections/progress/settings phases must be skipped.
    let expiring = false;
    const result = await runMobileBackgroundSyncOnce({
      store,
      convex,
      isExpiring: () => expiring,
      now: () => 42_000,
    });
    // Library always runs; the guard is between phases. Mark expiring now and
    // re-run to confirm subsequent phases stop.
    expect(calls).toContain("library-saved");

    expiring = true;
    resetMobileBackgroundSyncStateForTesting();
    const callsAfterExpiry: string[] = [];
    const store2 = makeStore({
      saveLibrarySnapshot: async () => {
        callsAfterExpiry.push("library-saved");
      },
      saveCollectionsSnapshot: async () => {
        callsAfterExpiry.push("collections-saved");
      },
      saveChapterProgressBatch: async () => {
        callsAfterExpiry.push("chapter-progress-saved");
      },
      saveMangaProgressBatch: async () => {
        callsAfterExpiry.push("manga-progress-saved");
      },
      saveSettings: async () => {
        callsAfterExpiry.push("settings-saved");
      },
    });
    const result2 = await runMobileBackgroundSyncOnce({
      store: store2,
      convex,
      isExpiring: () => expiring,
      now: () => 100_000,
    });
    expect(result2.ran).toBe(true);
    // With expiring true from the start, every phase's first guard bails out
    // before saving.
    expect(callsAfterExpiry).toEqual([]);
    void result;
  });

  test("self-imposes a timeout that does not exceed the configured ceiling", async () => {
    let releaseLibrary!: () => void;
    const libraryPromise = new Promise<void>((resolve) => {
      releaseLibrary = resolve;
    });
    const lateWrites: string[] = [];
    const states: Parameters<MobileDataStore["recordSyncSnapshotState"]>[0][] =
      [];
    const store = makeStore({
      getAllLibraryItems: async () => {
        await libraryPromise;
        return [];
      },
      saveLibrarySnapshot: async () => {
        lateWrites.push("library");
      },
      recordSyncSnapshotState: async (state) => {
        states.push(state);
        return true;
      },
    });
    const convex = makeConvex();
    let cancelled = false;
    const startedAt = Date.now();
    const result = await runMobileBackgroundSyncOnce({
      store,
      convex,
      timeoutMs: 50,
      now: () => 7_000,
      onTimeout: () => {
        cancelled = true;
      },
    });
    expect(Date.now() - startedAt).toBeLessThan(250);
    expect(result.ran).toBe(true);
    expect(result.reason).toBe("timed-out");
    expect(cancelled).toBe(true);
    expect(isMobileBackgroundSyncRunning()).toBe(false);

    const next = await runMobileBackgroundSyncOnce({
      store: makeStore(),
      convex,
      now: () => 7_000 + MOBILE_BACKGROUND_SYNC_DEBOUNCE_MS + 1,
    });
    expect(next.reason).toBe("completed");

    releaseLibrary();
    await result.completion;
    expect(isMobileBackgroundSyncRunning()).toBe(false);
    expect(lateWrites).toEqual([]);
    expect(states).toEqual([]);
  });

  test("an error preserves an existing budget state instead of marking healthy", async () => {
    const states: Parameters<MobileDataStore["recordSyncSnapshotState"]>[0][] =
      [];
    const store = makeStore({
      recordSyncSnapshotState: async (state) => {
        states.push(state);
        return true;
      },
    });
    const convex = {
      query: async () => {
        throw new Error("offline");
      },
    } as unknown as ConvexReactClient;

    const result = await runMobileBackgroundSyncOnce({
      store,
      convex,
      now: () => 8_000,
    });

    expect(result.reason).toBe("error");
    expect(states).toEqual([]);
  });

  test("a timeout while health persistence is queued cannot clear the prior warning", async () => {
    let markRecordStarted!: () => void;
    let releaseRecord!: () => void;
    const recordStarted = new Promise<void>((resolve) => {
      markRecordStarted = resolve;
    });
    const recordGate = new Promise<void>((resolve) => {
      releaseRecord = resolve;
    });
    const states: Parameters<MobileDataStore["recordSyncSnapshotState"]>[0][] =
      [];
    const store = makeStore({
      recordSyncSnapshotState: async (state, shouldContinue) => {
        markRecordStarted();
        await recordGate;
        if (shouldContinue?.() === false) return false;
        states.push(state);
        return true;
      },
    });

    const running = runMobileBackgroundSyncOnce({
      store,
      convex: makeConvex(),
      timeoutMs: 30,
      now: () => 9_000,
    });
    await recordStarted;
    const result = await running;
    expect(result.reason).toBe("timed-out");
    releaseRecord();
    await result.completion;
    expect(states).toEqual([]);
  });

  test("does not apply a response that returns after a clear invalidates its epoch", async () => {
    let releaseQuery!: () => void;
    let markQueryStarted!: () => void;
    const queryStarted = new Promise<void>((resolve) => {
      markQueryStarted = resolve;
    });
    const queryGate = new Promise<void>((resolve) => {
      releaseQuery = resolve;
    });
    let firstQuery = true;
    const convex = {
      query: async () => {
        if (firstQuery) {
          firstQuery = false;
          markQueryStarted();
          await queryGate;
        }
        return [];
      },
      mutation: async () => null,
    } as unknown as ConvexReactClient;
    const writes: string[] = [];
    const store = makeStore({
      applyLibrarySnapshot: async () => {
        writes.push("library");
        return { localItemsToPush: [], localLinksToPush: [] };
      },
    });

    const running = runMobileBackgroundSyncOnce({
      store,
      convex,
      now: () => 250_000,
    });
    await queryStarted;
    await runWithMobileSyncSuspended(async () => {
      writes.push("cleared");
    });
    releaseQuery();
    const result = await running;

    expect(result.reason).toBe("completed");
    expect(writes).toEqual(["cleared"]);
  });

  test("re-checks timeout after a queued atomic snapshot apply is released", async () => {
    let releaseQueue!: () => void;
    let markQueueEntered!: () => void;
    const queueEntered = new Promise<void>((resolve) => {
      markQueueEntered = resolve;
    });
    const queueGate = new Promise<void>((resolve) => {
      releaseQueue = resolve;
    });
    const queueBlocker = runWithMobileSyncWrite(async () => {
      markQueueEntered();
      await queueGate;
    });
    await queueEntered;

    const lateWrites: string[] = [];
    const store = makeStore({
      applyLibrarySnapshot: async () => {
        lateWrites.push("late-library-apply");
        return { localItemsToPush: [], localLinksToPush: [] };
      },
    });
    const result = await runMobileBackgroundSyncOnce({
      store,
      convex: makeConvex(),
      timeoutMs: 20,
      now: () => 300_000,
    });

    expect(result.reason).toBe("timed-out");
    expect(isMobileBackgroundSyncRunning()).toBe(false);
    releaseQueue();
    await queueBlocker;
    await result.completion;
    expect(lateWrites).toEqual([]);
  });

  test("aborts a deferred synced-package hydration at the background deadline", async () => {
    const controller = new AbortController();
    let markHydrationStarted!: () => void;
    const hydrationStarted = new Promise<void>((resolve) => {
      markHydrationStarted = resolve;
    });
    let receivedSignal: AbortSignal | undefined;
    const settingsWrites: string[] = [];
    const store = makeStore({
      applyInstalledSourcesSnapshot: async () => {
        settingsWrites.push("settings");
      },
    });
    const syncedSource = {
      id: "aidoku-community:en.example",
      registryId: "aidoku-community",
      sourceKind: "aidoku",
      sourceId: "en.example",
      name: "Example",
      version: 1,
      updatedAt: 1,
      removed: false,
      downloadUrl: "https://example.test/source.aix",
    };

    const running = runMobileBackgroundSyncOnce({
      store,
      convex: makeConvex({
        settings: { installedSources: [syncedSource], updatedAt: 1 },
      }),
      signal: controller.signal,
      timeoutMs: 50,
      now: () => 400_000,
      onTimeout: () => controller.abort(),
      hydrateSourcePackages: async (sources, options) => {
        receivedSignal = options?.signal;
        markHydrationStarted();
        await new Promise<void>((resolve) => {
          if (options?.signal?.aborted) resolve();
          else
            options?.signal?.addEventListener("abort", () => resolve(), {
              once: true,
            });
        });
        return sources;
      },
    });

    await hydrationStarted;
    const result = await running;

    expect(result.reason).toBe("timed-out");
    expect(receivedSignal).toBe(controller.signal);
    expect(receivedSignal?.aborted).toBe(true);
    expect(settingsWrites).toEqual([]);
    await result.completion;
  });
});
