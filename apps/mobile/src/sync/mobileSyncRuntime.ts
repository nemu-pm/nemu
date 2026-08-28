import type { ConvexReactClient } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { MobileDataStore } from "@/data/storeTypes";
import {
  areSyncAccountIdentitiesAligned,
  CHAPTER_PROGRESS_INTRA_PAGE_SYNC_VERSION,
} from "@nemu/core";

export const mobileConvexRef: { current: ConvexReactClient | null } = {
  current: null,
};

export const mobileIsAuthenticatedRef: { current: boolean } = {
  current: false,
};

export const mobileSessionUserIdRef: { current: string | undefined } = {
  current: undefined,
};

/**
 * Fail-closed rollout gate for the optional reader-position mutation fields.
 * Older Convex deployments reject unknown keys at `v.object` validation, so
 * mobile only sends them after the generation query advertises support.
 */
export const mobileChapterProgressIntraPageSyncSupportedRef: {
  current: boolean;
} = { current: false };

export function setMobileChapterProgressIntraPageSyncVersion(
  version: unknown,
): void {
  mobileChapterProgressIntraPageSyncSupportedRef.current =
    Number.isSafeInteger(version) &&
    (version as number) >= CHAPTER_PROGRESS_INTRA_PAGE_SYNC_VERSION;
}

let remoteApplyDepth = 0;
let syncSuspendedDepth = 0;
let syncWriteQueue: Promise<unknown> = Promise.resolve();
let syncEpoch = 0;
let activeSyncStore: object | null = null;

/**
 * A monotonically increasing identity for the currently active sync session.
 * Long-running work captures this before its first await and must stop when it
 * changes. Unlike the suspension depth, an epoch invalidation remains visible
 * after a clear/sign-out window has finished, so stale network responses cannot
 * repopulate a database that was just cleared or write into a later account.
 */
export function getMobileSyncEpoch(): number {
  return syncEpoch;
}

export function isMobileSyncEpochCurrent(epoch: number): boolean {
  return epoch === syncEpoch;
}

export function invalidateMobileSyncEpoch(): number {
  syncEpoch += 1;
  mobileChapterProgressIntraPageSyncSupportedRef.current = false;
  return syncEpoch;
}

export function setActiveMobileSyncStore(store: object | null): void {
  activeSyncStore = store;
}

export function isActiveMobileSyncStore(store: object): boolean {
  return activeSyncStore === null || activeSyncStore === store;
}

export function isApplyingMobileRemoteSnapshot(): boolean {
  return remoteApplyDepth > 0;
}

/**
 * The one fencing predicate for long-running sync work. A run may proceed only
 * while its owning effect is alive, the session is still authenticated as the
 * user it started for, sync is not suspended, and its epoch is still current.
 */
export function makeMobileSyncRunGuard(input: {
  isCancelled: () => boolean;
  expectedUserId: string;
  convexUserId: string | null | undefined;
  syncEpoch: number;
}): () => boolean {
  return () =>
    !input.isCancelled() &&
    mobileIsAuthenticatedRef.current &&
    mobileSessionUserIdRef.current === input.expectedUserId &&
    areSyncAccountIdentitiesAligned(input.expectedUserId, input.convexUserId) &&
    !isMobileSyncSuspended() &&
    isMobileSyncEpochCurrent(input.syncEpoch);
}

export function isMobileSyncSuspended(): boolean {
  return syncSuspendedDepth > 0;
}

async function runMobileRemoteSnapshotOperation<T>(
  operation: () => Promise<T>,
): Promise<T> {
  remoteApplyDepth += 1;
  try {
    return await operation();
  } finally {
    remoteApplyDepth -= 1;
  }
}

export async function runWithMobileSyncWrite<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const task = syncWriteQueue.then(operation);
  syncWriteQueue = task.catch(() => undefined);
  return task;
}

export async function runWithMobileRemoteSnapshot<T>(
  operation: () => Promise<T>,
): Promise<T> {
  return runWithMobileSyncWrite(() =>
    runMobileRemoteSnapshotOperation(operation)
  );
}

export async function runWithMobileSyncSuspended<T>(operation: () => Promise<T>): Promise<T> {
  // Only the outer suspension needs to invalidate existing work. Nested clear
  // helpers share the already-invalidated epoch.
  if (syncSuspendedDepth === 0) invalidateMobileSyncEpoch();
  syncSuspendedDepth += 1;
  try {
    return await operation();
  } finally {
    syncSuspendedDepth -= 1;
  }
}

export async function clearMobileCloudData(store: MobileDataStore): Promise<boolean> {
  if (
    !mobileIsAuthenticatedRef.current ||
    !mobileConvexRef.current ||
    !mobileSessionUserIdRef.current
  ) {
    return false;
  }

  const expectedEpoch = getMobileSyncEpoch();
  const convex = mobileConvexRef.current;
  const expectedUserId = mobileSessionUserIdRef.current;
  const operationIsCurrent = () =>
    mobileIsAuthenticatedRef.current &&
    mobileSessionUserIdRef.current === expectedUserId &&
    mobileConvexRef.current === convex &&
    isMobileSyncEpochCurrent(expectedEpoch) &&
    isActiveMobileSyncStore(store);
  const assertOperationIsCurrent = () => {
    if (!operationIsCurrent()) {
      throw new Error("Cloud clear cancelled because the active account changed.");
    }
  };
  assertOperationIsCurrent();
  let expectedGeneration = await runWithMobileSyncWrite(() =>
    store.getSyncGeneration()
  );
  assertOperationIsCurrent();
  if (expectedGeneration === null) {
    const remote = await convex.query(api.sync.generation, {});
    assertOperationIsCurrent();
    if (
      !Number.isSafeInteger(remote.generation) ||
      remote.generation < 0
    ) {
      throw new Error("Cloud returned an invalid sync generation.");
    }
    await runWithMobileSyncWrite(() =>
      store.applySyncGeneration(remote.generation)
    );
    assertOperationIsCurrent();
    expectedGeneration = await runWithMobileSyncWrite(() =>
      store.getSyncGeneration()
    );
    assertOperationIsCurrent();
    if (expectedGeneration === null) {
      throw new Error("Failed to initialize the local sync generation.");
    }
  }
  // Exactly one clear mutation is issued. A generation mismatch is surfaced
  // to the caller; it is never retried after an ambiguous/lost response.
  assertOperationIsCurrent();
  const result = await convex.mutation(api.sync.clearAll, {
    expectedUserId,
    expectedGeneration,
  });
  assertOperationIsCurrent();
  if (
    !result ||
    typeof result.generation !== "number" ||
    !Number.isSafeInteger(result.generation) ||
    result.generation < 0
  ) {
    throw new Error("Cloud reset returned an invalid sync generation.");
  }
  // A response can arrive after a newer reset was already observed. The
  // store's monotonic generation decision makes that response a no-op instead
  // of rolling local state back.
  await runWithMobileSyncWrite(() =>
    store.applySyncGeneration(result.generation)
  );
  // The generation transition is immediately authoritative locally. The
  // backend scheduled its durable bounded cleanup in the same transaction, so
  // waiting on a second client-driven chain only slows Clear All/sign-out.
  return true;
}
