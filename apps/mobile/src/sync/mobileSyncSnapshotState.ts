import type { MobileSyncSnapshotState } from "@/data/schema";
import type { MobileDataStore } from "@/data/storeTypes";
import { emitMobileDataChanged } from "@/data/mobileDataEvents";
import { api } from "../../../../convex/_generated/api";
import {
  getMobileSyncEpoch,
  isActiveMobileSyncStore,
  isMobileSyncEpochCurrent,
  mobileConvexRef,
  mobileIsAuthenticatedRef,
  mobileSessionUserIdRef,
} from "./mobileSyncRuntime";
import {
  runMobileBackgroundSyncOnce,
  type MobileBackgroundSyncResult,
} from "./mobileBackgroundSyncRunner";
export {
  createMobileSyncBudgetExceededState,
  createMobileSyncHealthyState,
} from "./mobileSyncSnapshotStatus";

/** Persist first, then publish a payload-free refresh signal. Consumers always
 * re-read their currently mounted profile store, so an old account's late
 * result can never carry account data into the new account's UI. */
export async function recordMobileSyncSnapshotState(
  store: MobileDataStore,
  state: MobileSyncSnapshotState,
  shouldContinue?: () => boolean,
): Promise<boolean> {
  try {
    const accepted = await store.recordSyncSnapshotState(state, shouldContinue);
    if (accepted) emitMobileDataChanged("syncStatus");
    return accepted;
  } catch (error) {
    // Web storage can be unavailable even while its last durable snapshot is
    // readable. The Web store retains a fail-closed volatile warning for this
    // process; notify consumers to re-read it, but still reject because it was
    // not durably committed.
    emitMobileDataChanged("syncStatus");
    throw error;
  }
}

/**
 * Explicit foreground retry for the Settings recovery surface. It reuses the
 * bounded one-shot runner and bypasses only the minimum interval. The runner's
 * re-entrancy guard, timeout, captured account/store identity, and sync epoch
 * fencing remain active.
 */
export async function runMobileForegroundSyncNow(
  store: MobileDataStore,
): Promise<MobileBackgroundSyncResult> {
  const startedAt = Date.now();
  const convex = mobileConvexRef.current;
  const expectedUserId = mobileSessionUserIdRef.current;
  const syncEpoch = getMobileSyncEpoch();
  const runIsCurrent = () =>
    mobileIsAuthenticatedRef.current &&
    mobileConvexRef.current === convex &&
    mobileSessionUserIdRef.current === expectedUserId &&
    isActiveMobileSyncStore(store) &&
    isMobileSyncEpochCurrent(syncEpoch);
  if (
    !mobileIsAuthenticatedRef.current ||
    !convex ||
    !expectedUserId ||
    !isActiveMobileSyncStore(store)
  ) {
    return {
      ran: false,
      reason: "not-authenticated",
      startedAt,
      finishedAt: startedAt,
    };
  }

  const confirmExpectedUser = async () => {
    const convexUserId = await convex.query(api.auth.getCurrentUserId, {});
    return runIsCurrent() && convexUserId === expectedUserId;
  };
  if (!(await confirmExpectedUser())) {
    return {
      ran: false,
      reason: "account-mismatch",
      startedAt,
      finishedAt: Date.now(),
    };
  }

  return runMobileBackgroundSyncOnce({
    store,
    convex,
    expectedUserId,
    force: true,
    origin: "foreground",
    confirmExpectedUser,
    syncEpoch,
  });
}
