import { beforeEach, describe, expect, test } from "bun:test";
import { getFunctionName } from "convex/server";
import { api } from "../../../../convex/_generated/api";
import type { MobileDataStore } from "@/data/storeTypes";
import {
  clearMobileCloudData,
  getMobileSyncEpoch,
  invalidateMobileSyncEpoch,
  isApplyingMobileRemoteSnapshot,
  isMobileSyncSuspended,
  mobileConvexRef,
  mobileIsAuthenticatedRef,
  mobileSessionUserIdRef,
  runWithMobileRemoteSnapshot,
  runWithMobileSyncWrite,
  runWithMobileSyncSuspended,
} from "./mobileSyncRuntime";

function generationStore(initial: number | null = 0) {
  let generation = initial;
  const decisions: string[] = [];
  const store = {
    getSyncGeneration: async () => generation,
    applySyncGeneration: async (incoming: number) => {
      const decision =
        generation === null
          ? incoming === 0 ? "initialize" : "reset"
          : incoming < generation ? "stale" : incoming === generation ? "current" : "reset";
      decisions.push(decision);
      if (decision === "initialize" || decision === "reset") generation = incoming;
      return decision;
    },
  } as unknown as MobileDataStore;
  return { store, decisions, getGeneration: () => generation };
}

describe("mobile sync runtime", () => {
  beforeEach(() => {
    mobileConvexRef.current = null;
    mobileIsAuthenticatedRef.current = false;
    mobileSessionUserIdRef.current = "account-a";
  });

  test("skips cloud clearing when signed out", async () => {
    let called = false;
    mobileConvexRef.current = {
      mutation: async () => {
        called = true;
      },
    } as never;

    await expect(clearMobileCloudData(generationStore().store)).resolves.toBe(false);
    expect(called).toBe(false);
  });

  test("clears cloud data when authenticated", async () => {
    const mutationCalls: unknown[] = [];
    mobileIsAuthenticatedRef.current = true;
    mobileConvexRef.current = {
      mutation: async (mutation: unknown) => {
        mutationCalls.push(mutation);
        return { generation: 1 };
      },
    } as never;

    const local = generationStore();
    await expect(clearMobileCloudData(local.store)).resolves.toBe(true);
    expect(mutationCalls).toHaveLength(1);
    expect(getFunctionName(mutationCalls[0] as never)).toBe("sync:clearAll");
    expect(local.getGeneration()).toBe(1);
  });

  test("returns after one clear while the durable backend cleanup continues", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    mobileIsAuthenticatedRef.current = true;
    mobileConvexRef.current = {
      mutation: async (mutation: unknown, args: Record<string, unknown>) => {
        const name = getFunctionName(mutation as never);
        calls.push({ name, args });
        return {
          generation: 1,
          cleanupToken: { table: "library_items" },
        };
      },
    } as never;

    await expect(clearMobileCloudData(generationStore().store)).resolves.toBe(true);
    expect(calls).toEqual([
      {
        name: "sync:clearAll",
        args: { expectedUserId: "account-a", expectedGeneration: 0 },
      },
    ]);
  });

  test("adopts the single clear response without rolling back a newer observed generation", async () => {
    let markMutationStarted!: () => void;
    let resolveMutation!: (value: { generation: number }) => void;
    const mutationStarted = new Promise<void>((resolve) => {
      markMutationStarted = resolve;
    });
    const mutationResult = new Promise<{ generation: number }>((resolve) => {
      resolveMutation = resolve;
    });
    const calls: Array<Record<string, unknown>> = [];
    mobileIsAuthenticatedRef.current = true;
    mobileConvexRef.current = {
      mutation: async (_mutation: unknown, args: Record<string, unknown>) => {
        calls.push(args);
        markMutationStarted();
        return mutationResult;
      },
    } as never;
    const local = generationStore(1);

    const clearing = clearMobileCloudData(local.store);
    await mutationStarted;
    await local.store.applySyncGeneration(3);
    resolveMutation({ generation: 2 });
    await expect(clearing).resolves.toBe(true);

    expect(calls).toEqual([
      { expectedUserId: "account-a", expectedGeneration: 1 },
    ]);
    expect(local.getGeneration()).toBe(3);
    expect(local.decisions).toEqual(["reset", "stale"]);
  });

  test("initializes an unknown local generation before issuing one clear mutation", async () => {
    const queries: string[] = [];
    const mutations: Array<Record<string, unknown>> = [];
    mobileIsAuthenticatedRef.current = true;
    mobileConvexRef.current = {
      query: async (query: unknown) => {
        queries.push(getFunctionName(query as never));
        return { generation: 5 };
      },
      mutation: async (_mutation: unknown, args: Record<string, unknown>) => {
        mutations.push(args);
        return { generation: 6 };
      },
    } as never;
    const local = generationStore(null);

    await expect(clearMobileCloudData(local.store)).resolves.toBe(true);

    expect(queries).toEqual(["sync:generation"]);
    expect(mutations).toEqual([
      { expectedUserId: "account-a", expectedGeneration: 5 },
    ]);
    expect(local.getGeneration()).toBe(6);
    expect(local.decisions).toEqual(["reset", "reset"]);
  });

  test("does not clear a new account when identity changes during generation lookup", async () => {
    let releaseQuery!: () => void;
    const queryPaused = new Promise<void>((resolve) => {
      releaseQuery = resolve;
    });
    let mutationCount = 0;
    mobileIsAuthenticatedRef.current = true;
    mobileConvexRef.current = {
      query: async () => {
        await queryPaused;
        return { generation: 5 };
      },
      mutation: async () => {
        mutationCount += 1;
        return { generation: 6 };
      },
    } as never;
    const local = generationStore(null);

    const clearing = clearMobileCloudData(local.store);
    invalidateMobileSyncEpoch();
    releaseQuery();

    await expect(clearing).rejects.toThrow("active account changed");
    expect(mutationCount).toBe(0);
  });

  test("does not retry an ambiguous clear failure", async () => {
    let mutationCount = 0;
    mobileIsAuthenticatedRef.current = true;
    mobileConvexRef.current = {
      mutation: async () => {
        mutationCount += 1;
        throw new Error("response lost");
      },
    } as never;
    const local = generationStore(4);

    await expect(clearMobileCloudData(local.store)).rejects.toThrow("response lost");

    expect(mutationCount).toBe(1);
    expect(local.getGeneration()).toBe(4);
    expect(local.decisions).toEqual([]);
  });

  test("tracks nested suspended sync operations", async () => {
    const startingEpoch = getMobileSyncEpoch();
    expect(isMobileSyncSuspended()).toBe(false);

    await runWithMobileSyncSuspended(async () => {
      expect(isMobileSyncSuspended()).toBe(true);

      await runWithMobileSyncSuspended(async () => {
        expect(isMobileSyncSuspended()).toBe(true);
        expect(getMobileSyncEpoch()).toBe(startingEpoch + 1);
      });

      expect(isMobileSyncSuspended()).toBe(true);
    });

    expect(isMobileSyncSuspended()).toBe(false);
    expect(getMobileSyncEpoch()).toBe(startingEpoch + 1);
  });

  test("serializes remote snapshot operations", async () => {
    const entered: string[] = [];
    let resolveFirstEntered!: () => void;
    let releaseFirst!: () => void;
    const firstEntered = new Promise<void>((resolve) => {
      resolveFirstEntered = resolve;
    });
    const firstCanComplete = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = runWithMobileRemoteSnapshot(async () => {
      entered.push("first");
      expect(isApplyingMobileRemoteSnapshot()).toBe(true);
      resolveFirstEntered();
      await firstCanComplete;
      entered.push("first-done");
    });
    const second = runWithMobileRemoteSnapshot(async () => {
      entered.push("second");
      expect(isApplyingMobileRemoteSnapshot()).toBe(true);
    });

    await firstEntered;
    await Promise.resolve();
    expect(entered).toEqual(["first"]);

    releaseFirst();
    await Promise.all([first, second]);

    expect(entered).toEqual(["first", "first-done", "second"]);
    expect(isApplyingMobileRemoteSnapshot()).toBe(false);
  });

  test("continues remote snapshot queue after a failed operation", async () => {
    const entered: string[] = [];

    await expect(
      runWithMobileRemoteSnapshot(async () => {
        entered.push("first");
        throw new Error("snapshot failed");
      }),
    ).rejects.toThrow("snapshot failed");

    await runWithMobileRemoteSnapshot(async () => {
      entered.push("second");
    });

    expect(entered).toEqual(["first", "second"]);
    expect(isApplyingMobileRemoteSnapshot()).toBe(false);
  });

  test("serializes sync writes without marking them as remote snapshots", async () => {
    const entered: string[] = [];
    let resolveSyncEntered!: () => void;
    let releaseSync!: () => void;
    const syncEntered = new Promise<void>((resolve) => {
      resolveSyncEntered = resolve;
    });
    const syncCanComplete = new Promise<void>((resolve) => {
      releaseSync = resolve;
    });

    const syncWrite = runWithMobileSyncWrite(async () => {
      entered.push("sync");
      expect(isApplyingMobileRemoteSnapshot()).toBe(false);
      resolveSyncEntered();
      await syncCanComplete;
    });
    const remoteSnapshot = runWithMobileRemoteSnapshot(async () => {
      entered.push("remote");
      expect(isApplyingMobileRemoteSnapshot()).toBe(true);
    });

    await syncEntered;
    await Promise.resolve();
    expect(entered).toEqual(["sync"]);

    releaseSync();
    await Promise.all([syncWrite, remoteSnapshot]);

    expect(entered).toEqual(["sync", "remote"]);
    expect(isApplyingMobileRemoteSnapshot()).toBe(false);
  });

  test("clears cloud data even while local sync is suspended", async () => {
    const mutationCalls: unknown[] = [];
    mobileIsAuthenticatedRef.current = true;
    mobileConvexRef.current = {
      mutation: async (mutation: unknown) => {
        mutationCalls.push(mutation);
        return { generation: 1 };
      },
    } as never;

    await runWithMobileSyncSuspended(async () => {
      await expect(clearMobileCloudData(generationStore().store)).resolves.toBe(true);
    });

    expect(mutationCalls).toHaveLength(1);
    expect(getFunctionName(mutationCalls[0] as never)).toBe(
      getFunctionName(api.sync.clearAll),
    );
  });
});
