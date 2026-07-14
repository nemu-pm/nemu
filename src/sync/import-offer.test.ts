import { describe, expect, test } from "bun:test";
import {
  isWebImportOfferActionCurrent,
  isWebImportOfferEligible,
} from "./import-offer";
import type { WebSyncRunIdentity } from "./web-snapshot-sync";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function identity(
  generation: number,
  userId: string,
  localStore: object,
): WebSyncRunIdentity {
  return {
    generation,
    profileId: `user:${userId}`,
    userId,
    authenticated: true,
    localStore,
  };
}

function eligibilityOptions(
  expectedIdentity: WebSyncRunIdentity,
  getCurrentIdentity: () => WebSyncRunIdentity,
) {
  return {
    expectedIdentity,
    getCurrentIdentity,
    isCancelled: () => false,
    getSubscriptionsStopped: () => false,
    hasLegacyLibraryData: async () => true,
    loadRemoteUserId: async () => expectedIdentity.userId ?? null,
    loadRemoteGeneration: async () => 4,
    loadFirstRemoteLibraryPage: async (generation: number) => ({
      generation,
      items: [],
    }),
    hasProfileLibraryData: async () => false,
  };
}

describe("web legacy import offer identity", () => {
  test("offers only while the captured account remains current", async () => {
    const store = {};
    const accountA = identity(1, "a", store);
    const current = accountA;

    await expect(
      isWebImportOfferEligible(
        eligibilityOptions(accountA, () => current),
      ),
    ).resolves.toBeTrue();
  });

  test("a switch while the legacy probe is pending cannot offer A to B", async () => {
    const accountA = identity(1, "a", {});
    const accountB = identity(2, "b", {});
    let current = accountA;
    const legacyProbe = deferred<boolean>();
    let remoteCalls = 0;

    const run = isWebImportOfferEligible({
      ...eligibilityOptions(accountA, () => current),
      hasLegacyLibraryData: () => legacyProbe.promise,
      loadRemoteGeneration: async () => {
        remoteCalls += 1;
        return 4;
      },
    });
    current = accountB;
    legacyProbe.resolve(true);

    await expect(run).resolves.toBeFalse();
    expect(remoteCalls).toBe(0);
  });

  test("a switch while the cloud emptiness probe is pending cannot confirm A as B", async () => {
    const accountA = identity(1, "a", {});
    const accountB = identity(2, "b", {});
    let current = accountA;
    const cloudProbe = deferred<{ generation: number; items: unknown[] }>();
    const cloudProbeStarted = deferred<void>();
    let profileReads = 0;

    const run = isWebImportOfferEligible({
      ...eligibilityOptions(accountA, () => current),
      loadFirstRemoteLibraryPage: () => {
        cloudProbeStarted.resolve();
        return cloudProbe.promise;
      },
      hasProfileLibraryData: async () => {
        profileReads += 1;
        return false;
      },
    });
    await cloudProbeStarted.promise;
    current = accountB;
    cloudProbe.resolve({ generation: 4, items: [] });

    await expect(run).resolves.toBeFalse();
    expect(profileReads).toBe(0);
  });

  test("rejects a cloud transport authenticated as a different user", async () => {
    const accountA = identity(1, "a", {});
    let generationCalls = 0;

    await expect(
      isWebImportOfferEligible({
        ...eligibilityOptions(accountA, () => accountA),
        loadRemoteUserId: async () => "b",
        loadRemoteGeneration: async () => {
          generationCalls += 1;
          return 4;
        },
      }),
    ).resolves.toBeFalse();
    expect(generationCalls).toBe(0);
  });

  test("rechecks server identity after a pending cloud page before confirming", async () => {
    const accountA = identity(1, "a", {});
    let remoteUserId = "a";
    let remoteIdentityReads = 0;
    const cloudProbe = deferred<{ generation: number; items: unknown[] }>();
    const cloudProbeStarted = deferred<void>();

    const run = isWebImportOfferEligible({
      ...eligibilityOptions(accountA, () => accountA),
      loadRemoteUserId: async () => {
        remoteIdentityReads += 1;
        return remoteUserId;
      },
      loadFirstRemoteLibraryPage: () => {
        cloudProbeStarted.resolve();
        return cloudProbe.promise;
      },
    });
    await cloudProbeStarted.promise;
    remoteUserId = "b";
    cloudProbe.resolve({ generation: 4, items: [] });

    await expect(run).resolves.toBeFalse();
    expect(remoteIdentityReads).toBe(2);
  });

  test("does not confirm after the captured cloud library becomes non-empty", async () => {
    const accountA = identity(1, "a", {});
    let profileReads = 0;

    await expect(
      isWebImportOfferEligible({
        ...eligibilityOptions(accountA, () => accountA),
        loadFirstRemoteLibraryPage: async (generation) => ({
          generation,
          items: [{ libraryItemId: "cloud-winner" }],
        }),
        hasProfileLibraryData: async () => {
          profileReads += 1;
          return false;
        },
      }),
    ).resolves.toBeFalse();
    expect(profileReads).toBe(0);
  });

  test("does not confirm after the captured profile gains local library data", async () => {
    const accountA = identity(1, "a", {});
    let remoteIdentityReads = 0;

    await expect(
      isWebImportOfferEligible({
        ...eligibilityOptions(accountA, () => accountA),
        loadRemoteUserId: async () => {
          remoteIdentityReads += 1;
          return "a";
        },
        hasProfileLibraryData: async () => true,
      }),
    ).resolves.toBeFalse();
    expect(remoteIdentityReads).toBe(1);
  });

  test("a stale rendered offer cannot confirm or skip the current account", () => {
    const accountA = identity(1, "a", {});
    const accountB = identity(2, "b", {});

    expect(
      isWebImportOfferActionCurrent(accountA, accountB, accountB, false, false),
    ).toBeFalse();
    expect(
      isWebImportOfferActionCurrent(accountA, accountA, accountB, false, false),
    ).toBeFalse();
    expect(
      isWebImportOfferActionCurrent(accountB, accountB, accountB, false, false),
    ).toBeTrue();
  });

  test("cancellation after the last local probe prevents an offer", async () => {
    const accountA = identity(1, "a", {});
    let cancelled = false;
    const localProbe = deferred<boolean>();
    const localProbeStarted = deferred<void>();
    const options = eligibilityOptions(accountA, () => accountA);

    const run = isWebImportOfferEligible({
      ...options,
      isCancelled: () => cancelled,
      hasProfileLibraryData: () => {
        localProbeStarted.resolve();
        return localProbe.promise;
      },
    });
    await localProbeStarted.promise;
    cancelled = true;
    localProbe.resolve(false);

    await expect(run).resolves.toBeFalse();
  });
});
