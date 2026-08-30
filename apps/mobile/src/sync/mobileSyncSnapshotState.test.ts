import { afterEach, describe, expect, test } from "bun:test";
import { subscribeMobileDataChanges } from "@/data/mobileDataEvents";
import type { MobileDataStore } from "@/data/storeTypes";
import {
  createMobileSyncBudgetExceededState,
  createMobileSyncHealthyState,
  recordMobileSyncSnapshotState,
  runMobileForegroundSyncNow,
} from "./mobileSyncSnapshotState";
import {
  mobileConvexRef,
  mobileIsAuthenticatedRef,
  mobileSessionUserIdRef,
  setActiveMobileSyncStore,
} from "./mobileSyncRuntime";

afterEach(() => {
  mobileConvexRef.current = null;
  mobileIsAuthenticatedRef.current = false;
  mobileSessionUserIdRef.current = undefined;
  setActiveMobileSyncStore(null);
});

describe("mobile sync snapshot state", () => {
  test("constructs bounded public states without an account identifier", () => {
    expect(
      createMobileSyncBudgetExceededState({
        generation: 7,
        origin: "foreground",
        resourceKey: "chapterProgress",
        totalRows: 40_000,
        observedAt: 100,
      }),
    ).toEqual({
      status: "budget-exceeded",
      generation: 7,
      origin: "foreground",
      resourceKey: "chapterProgress",
      totalRows: 40_000,
      observedAt: 100,
    });
    expect(
      createMobileSyncHealthyState({
        generation: 7,
        origin: "background",
        observedAt: 200,
      }),
    ).toEqual({
      status: "healthy",
      generation: 7,
      origin: "background",
      observedAt: 200,
    });
  });

  test("publishes only accepted durable transitions and never event payload data", async () => {
    const scopes: string[] = [];
    const unsubscribe = subscribeMobileDataChanges((scope) =>
      scopes.push(scope),
    );
    const accepted: boolean[] = [true, false];
    const store = {
      recordSyncSnapshotState: async () => accepted.shift() ?? false,
    } as unknown as MobileDataStore;
    const state = createMobileSyncHealthyState({
      generation: 2,
      origin: "foreground",
      observedAt: 100,
    });

    try {
      await expect(recordMobileSyncSnapshotState(store, state)).resolves.toBe(
        true,
      );
      await expect(recordMobileSyncSnapshotState(store, state)).resolves.toBe(
        false,
      );
    } finally {
      unsubscribe();
    }
    expect(scopes).toEqual(["syncStatus"]);
  });

  test("publishes a refresh signal when persistence rejects so a volatile fail-closed warning becomes visible", async () => {
    const scopes: string[] = [];
    const unsubscribe = subscribeMobileDataChanges((scope) =>
      scopes.push(scope),
    );
    const store = {
      recordSyncSnapshotState: async () => {
        throw new Error("quota exceeded");
      },
    } as unknown as MobileDataStore;

    try {
      await expect(
        recordMobileSyncSnapshotState(
          store,
          createMobileSyncBudgetExceededState({
            generation: 2,
            origin: "foreground",
          }),
        ),
      ).rejects.toThrow("quota exceeded");
    } finally {
      unsubscribe();
    }
    expect(scopes).toEqual(["syncStatus"]);
  });

  test("rejects a retry when the fixed Convex transport belongs to another account", async () => {
    const store = {} as MobileDataStore;
    mobileIsAuthenticatedRef.current = true;
    mobileSessionUserIdRef.current = "account-a";
    mobileConvexRef.current = {
      query: async () => "account-b",
    } as never;
    setActiveMobileSyncStore(store);

    await expect(runMobileForegroundSyncNow(store)).resolves.toMatchObject({
      ran: false,
      reason: "account-mismatch",
    });
  });
});
