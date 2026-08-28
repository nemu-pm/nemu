import { getMobileDataProfileRuntimeScope } from "./mobileDataProfile";
import {
  clearMobileDataProfileCleanupPending,
  clearRetainedMobileDataProfile,
  ensureMobileDataProfileCleanupPendingPersisted,
  getMobileDataProfileSnapshot,
  markMobileDataProfileCleanupPending,
} from "./mobileDataProfile";

export const MOBILE_LOCAL_DATA_CLEANUP_UNAVAILABLE =
  "MOBILE_LOCAL_DATA_CLEANUP_UNAVAILABLE";

type MobileDataProfileCleanupDependencies = {
  clearAccountData: () => Promise<void>;
  clearSandboxData: (profileScope: string) => Promise<void>;
};

let activeCleanup:
  | {
      profileId: string;
      task: Promise<void>;
    }
  | null = null;

function cleanupUnavailable(): Error {
  return new Error(MOBILE_LOCAL_DATA_CLEANUP_UNAVAILABLE);
}

/**
 * Completes one identity-bound, idempotent local-account removal. A retained
 * profile is cleared only after its sandbox and SQLite data have both been
 * removed. The durable pending marker is cleared last, so process death at any
 * earlier point resumes behind the privacy boundary on the next launch.
 */
export async function completePendingMobileDataProfileCleanup({
  profileId,
  clearAccountData,
  clearSandboxData,
}: MobileDataProfileCleanupDependencies & {
  profileId: string;
}): Promise<void> {
  if (activeCleanup?.profileId === profileId) return activeCleanup.task;
  if (activeCleanup) throw cleanupUnavailable();

  const task = (async () => {
    // The in-memory fence is published before its SecureStore write so the UI
    // fails closed immediately. Never interpret that publication alone as
    // permission to destroy data, though: process death could otherwise lose
    // the fence and expose a partially-cleared retained profile next launch.
    await ensureMobileDataProfileCleanupPendingPersisted(profileId);
    const current = getMobileDataProfileSnapshot();
    if (current.pendingCleanupProfileId !== profileId) {
      throw cleanupUnavailable();
    }

    // If data/profile clearing completed but the final SecureStore marker
    // removal failed, the old database is already disconnected. A retry only
    // needs to retire the matching fence; never clear the anonymous/new store.
    if (current.retainedProfileId === null) {
      await clearMobileDataProfileCleanupPending(profileId);
      return;
    }
    if (current.retainedProfileId !== profileId) throw cleanupUnavailable();

    await clearSandboxData(getMobileDataProfileRuntimeScope(profileId));
    await clearAccountData();
    await clearRetainedMobileDataProfile(profileId);
    await clearMobileDataProfileCleanupPending(profileId);
  })().catch(() => {
    // Never expose native/SQLite/SecureStore details from this root-level
    // recovery path. The durable marker carries all state needed for retry.
    throw cleanupUnavailable();
  });

  activeCleanup = { profileId, task };
  try {
    await task;
  } finally {
    if (activeCleanup?.task === task) activeCleanup = null;
  }
}

/**
 * Starts the post-sign-out removal transaction. Marker persistence is best
 * effort only in the narrow sense that cleanup still proceeds if SecureStore
 * reports a transient write failure: markMobileDataProfileCleanupPending has
 * already published the in-memory privacy fence before that write.
 */
export async function removeMobileDataProfileAfterSignOut({
  profileId,
  clearAccountData,
  clearSandboxData,
}: MobileDataProfileCleanupDependencies & {
  profileId: string;
}): Promise<void> {
  try {
    await markMobileDataProfileCleanupPending(profileId);
  } catch {
    // Keep the already-published in-memory privacy fence, but do not begin a
    // destructive phase until a retry has durably written the marker.
    throw cleanupUnavailable();
  }
  await completePendingMobileDataProfileCleanup({
    profileId,
    clearAccountData,
    clearSandboxData,
  });
}

export function resetMobileDataProfileCleanupForTesting(): void {
  activeCleanup = null;
}
