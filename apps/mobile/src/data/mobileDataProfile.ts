import { SecureNativeKVStore } from "./nativeKV";
import {
  MOBILE_ANONYMOUS_DATABASE_NAME,
  MOBILE_DATABASE_NAME,
} from "./nativeDatabase";
import { sha256Bytes } from "@nemu/core";
import type { NativeKVStore } from "./contracts";

const LAST_PROFILE_ID_KEY = "nemu.mobile.last-profile-id";
const LEGACY_DATABASE_OWNER_KEY = "nemu.mobile.legacy-database-owner";
// The key is deliberately identity-free. Its raw profile-id value is stored
// only inside SecureStore (alongside the existing retained/legacy profile
// records); filenames, native scopes, UI, errors, and logs use no account PII.
const PENDING_PROFILE_CLEANUP_KEY = "nemu.mobile.pending-profile-cleanup";
export const MOBILE_DATA_PROFILE_CLEANUP_PENDING =
  "MOBILE_DATA_PROFILE_CLEANUP_PENDING";

function dataProfileCleanupPendingError(): Error {
  return new Error(MOBILE_DATA_PROFILE_CLEANUP_PENDING);
}

export function isMobileDataProfileCleanupPendingError(
  error: unknown,
): boolean {
  return (
    error instanceof Error &&
    error.message === MOBILE_DATA_PROFILE_CLEANUP_PENDING
  );
}

export type MobileDataProfileSnapshot = {
  loaded: boolean;
  retainedProfileId: string | null;
  legacyDatabaseOwner: string | null;
  /**
   * Account profile whose explicit "remove from device" cleanup must finish
   * before its database can be exposed again. Optional keeps older test/data
   * snapshots source-compatible while every runtime snapshot publishes it.
   */
  pendingCleanupProfileId?: string | null;
};

export type MobileDataProfileSelection = {
  profileId: string | null;
  databaseName: string;
};

let storage: NativeKVStore = new SecureNativeKVStore();
const listeners = new Set<() => void>();
let snapshot: MobileDataProfileSnapshot = {
  loaded: false,
  retainedProfileId: null,
  legacyDatabaseOwner: null,
  pendingCleanupProfileId: null,
};
let loadPromise: Promise<MobileDataProfileSnapshot> | null = null;
let profileMutationQueue: Promise<unknown> = Promise.resolve();

function publish(next: MobileDataProfileSnapshot): MobileDataProfileSnapshot {
  snapshot = next;
  for (const listener of listeners) listener();
  return snapshot;
}

export function subscribeMobileDataProfile(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMobileDataProfileSnapshot(): MobileDataProfileSnapshot {
  return snapshot;
}

export function normalizeStoredMobileDataProfile(
  retainedProfileId: string | null,
  legacyDatabaseOwner: string | null,
): Pick<MobileDataProfileSnapshot, "retainedProfileId" | "legacyDatabaseOwner"> {
  return {
    retainedProfileId,
    // A crash from an older build could persist the retained profile before
    // its legacy owner. Treating that profile as the owner is the only
    // fail-closed recovery: assigning the legacy database to a new account
    // could expose the retained account's local data.
    legacyDatabaseOwner: legacyDatabaseOwner ?? retainedProfileId,
  };
}

export function makeMobileProfileId(userId: string | null | undefined): string | null {
  const normalized = userId?.trim();
  return normalized ? `user:${normalized}` : null;
}

function stableProfileHash(value: string): string {
  return Array.from(sha256Bytes(new TextEncoder().encode(value)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/**
 * Opaque process-local namespace for source runtimes and user-content caches.
 * Never place the raw auth subject in native session ids, cache keys, logs, or
 * filenames: those surfaces are much easier to inspect than the encrypted
 * profile-selection record.
 */
export function getMobileDataProfileRuntimeScope(
  profileId: string | null | undefined,
): string {
  return profileId ? `profile:${stableProfileHash(profileId)}` : "local";
}

export function getMobileProfileDatabaseName(
  profileId: string | null,
  legacyDatabaseOwner: string | null,
): string {
  if (!profileId) {
    return legacyDatabaseOwner ? MOBILE_ANONYMOUS_DATABASE_NAME : MOBILE_DATABASE_NAME;
  }
  if (!legacyDatabaseOwner || legacyDatabaseOwner === profileId) {
    return MOBILE_DATABASE_NAME;
  }
  return `nemu-mobile-profile-${stableProfileHash(profileId)}.db`;
}

/**
 * Select the only local database that is safe to expose for the current auth
 * observation. A retained profile is durable device state, so it can render
 * immediately while the network session is still pending. If auth later
 * resolves to another account, fail closed until that account has itself been
 * durably retained; this prevents a cross-account database flash.
 */
export function resolveMobileDataProfileSelection(
  state: MobileDataProfileSnapshot,
  sessionProfileId: string | null,
): MobileDataProfileSelection | null {
  if (!state.loaded) return null;
  // A confirmed removal fence owns profile selection until cleanup completes.
  // A concurrently observed/new auth session must wait rather than replacing
  // the only database connection capable of finishing the old profile's wipe.
  const selectableSessionProfileId = state.pendingCleanupProfileId
    ? null
    : sessionProfileId;
  if (
    selectableSessionProfileId &&
    state.retainedProfileId !== selectableSessionProfileId
  ) {
    return null;
  }

  const profileId = selectableSessionProfileId ?? state.retainedProfileId;
  return {
    profileId,
    databaseName: getMobileProfileDatabaseName(
      profileId,
      state.legacyDatabaseOwner ?? selectableSessionProfileId,
    ),
  };
}

export async function loadMobileDataProfile(): Promise<MobileDataProfileSnapshot> {
  if (snapshot.loaded) return snapshot;
  if (!loadPromise) {
    loadPromise = Promise.all([
      storage.getString(LAST_PROFILE_ID_KEY),
      storage.getString(LEGACY_DATABASE_OWNER_KEY),
      storage.getString(PENDING_PROFILE_CLEANUP_KEY),
    ])
      .then(async ([
        retainedProfileId,
        storedLegacyDatabaseOwner,
        pendingCleanupProfileId,
      ]) => {
        const normalized = normalizeStoredMobileDataProfile(
          retainedProfileId,
          storedLegacyDatabaseOwner,
        );
        if (!storedLegacyDatabaseOwner && normalized.legacyDatabaseOwner) {
          await storage.setString(
            LEGACY_DATABASE_OWNER_KEY,
            normalized.legacyDatabaseOwner,
          );
        }
        return publish({
          loaded: true,
          ...normalized,
          pendingCleanupProfileId: pendingCleanupProfileId || null,
        });
      })
      .catch((error) => {
        // SecureStore can fail transiently. Let the next caller retry instead
        // of caching a rejected promise for the lifetime of the JS runtime.
        loadPromise = null;
        throw error;
      });
  }
  return loadPromise;
}

export async function retainMobileDataProfile(
  profileId: string,
): Promise<MobileDataProfileSnapshot> {
  const task = profileMutationQueue.then(async () => {
    const current = await loadMobileDataProfile();
    if (current.pendingCleanupProfileId) {
      throw dataProfileCleanupPendingError();
    }
    const legacyDatabaseOwner = current.legacyDatabaseOwner ?? profileId;
    // Persist ownership first. If the process dies between these writes, an
    // owner without a retained profile routes signed-out state to the
    // anonymous DB; the reverse ordering could hand legacy data to a new user.
    if (!current.legacyDatabaseOwner) {
      await storage.setString(LEGACY_DATABASE_OWNER_KEY, legacyDatabaseOwner);
      // The owner write is already durable even if the following retained
      // profile write fails. Reflect it in memory immediately so a retry for a
      // different account cannot overwrite the persisted owner from a stale
      // cached snapshot.
      publish({
        ...current,
        loaded: true,
        legacyDatabaseOwner,
      });
    }
    await storage.setString(LAST_PROFILE_ID_KEY, profileId);
    return publish({
      loaded: true,
      retainedProfileId: profileId,
      legacyDatabaseOwner,
    });
  });
  profileMutationQueue = task.catch(() => undefined);
  return task;
}

export async function clearRetainedMobileDataProfile(
  expectedProfileId?: string,
): Promise<MobileDataProfileSnapshot> {
  const task = profileMutationQueue.then(async () => {
    const current = await loadMobileDataProfile();
    if (
      expectedProfileId &&
      current.retainedProfileId !== null &&
      current.retainedProfileId !== expectedProfileId
    ) {
      throw new Error("The active mobile data profile changed during cleanup.");
    }
    await storage.remove(LAST_PROFILE_ID_KEY);
    return publish({
      ...current,
      loaded: true,
      retainedProfileId: null,
    });
  });
  profileMutationQueue = task.catch(() => undefined);
  return task;
}

/**
 * Durably fences an explicit account-data removal after remote sign-out has
 * been confirmed. Publish first so even a transient SecureStore write failure
 * hides the profile for the rest of this process while cleanup is attempted.
 */
export async function markMobileDataProfileCleanupPending(
  profileId: string,
): Promise<MobileDataProfileSnapshot> {
  return persistMobileDataProfileCleanupPending(profileId, false);
}

/**
 * Re-persists an existing in-memory/durable cleanup fence before any
 * destructive retry. This is intentionally valid after the retained profile
 * has already been cleared: a prior run may have completed data removal and
 * failed only while deleting the final marker.
 */
export async function ensureMobileDataProfileCleanupPendingPersisted(
  profileId: string,
): Promise<MobileDataProfileSnapshot> {
  return persistMobileDataProfileCleanupPending(profileId, true);
}

function persistMobileDataProfileCleanupPending(
  profileId: string,
  allowClearedRetainedProfile: boolean,
): Promise<MobileDataProfileSnapshot> {
  if (!profileId.trim()) throw new Error("A mobile data profile is required.");
  const task = profileMutationQueue.then(async () => {
    const current = await loadMobileDataProfile();
    const isMarkerOnlyRetry =
      allowClearedRetainedProfile &&
      current.retainedProfileId === null &&
      current.pendingCleanupProfileId === profileId;
    if (current.retainedProfileId !== profileId && !isMarkerOnlyRetry) {
      throw new Error("The active mobile data profile changed during cleanup.");
    }
    if (
      current.pendingCleanupProfileId &&
      current.pendingCleanupProfileId !== profileId
    ) {
      throw new Error("Another mobile account data removal is still pending.");
    }
    const pending = publish({
      ...current,
      loaded: true,
      pendingCleanupProfileId: profileId,
    });
    await storage.setString(PENDING_PROFILE_CLEANUP_KEY, profileId);
    return pending;
  });
  profileMutationQueue = task.catch(() => undefined);
  return task;
}

/** Clears only the matching cleanup fence so a stale task cannot unblock a
 * different account's removal. */
export async function clearMobileDataProfileCleanupPending(
  expectedProfileId: string,
): Promise<MobileDataProfileSnapshot> {
  const task = profileMutationQueue.then(async () => {
    const current = await loadMobileDataProfile();
    if (current.pendingCleanupProfileId !== expectedProfileId) return current;
    await storage.remove(PENDING_PROFILE_CLEANUP_KEY);
    return publish({
      ...current,
      loaded: true,
      pendingCleanupProfileId: null,
    });
  });
  profileMutationQueue = task.catch(() => undefined);
  return task;
}

export async function resolveMobileDataProfileForUser(
  userId: string,
  options: { retain?: boolean } = {},
): Promise<{ profileId: string; databaseName: string }> {
  const profileId = makeMobileProfileId(userId);
  if (!profileId) throw new Error("A user id is required to resolve a mobile data profile.");
  const state = options.retain === false
    ? await loadMobileDataProfile()
    : await retainMobileDataProfile(profileId);
  if (state.pendingCleanupProfileId) {
    throw dataProfileCleanupPendingError();
  }
  if (!state.legacyDatabaseOwner && state.retainedProfileId !== profileId) {
    throw new Error("The mobile data profile has not been durably assigned yet.");
  }
  return {
    profileId,
    databaseName: getMobileProfileDatabaseName(profileId, state.legacyDatabaseOwner),
  };
}

export async function resetMobileDataProfileForTesting(): Promise<void> {
  await profileMutationQueue;
  await Promise.all([
    storage.remove(LAST_PROFILE_ID_KEY),
    storage.remove(LEGACY_DATABASE_OWNER_KEY),
    storage.remove(PENDING_PROFILE_CLEANUP_KEY),
  ]);
  loadPromise = null;
  profileMutationQueue = Promise.resolve();
  publish({
    loaded: false,
    retainedProfileId: null,
    legacyDatabaseOwner: null,
    pendingCleanupProfileId: null,
  });
}

export async function setMobileDataProfileStorageForTesting(
  nextStorage: NativeKVStore,
): Promise<void> {
  await profileMutationQueue;
  storage = nextStorage;
  loadPromise = null;
  profileMutationQueue = Promise.resolve();
  publish({
    loaded: false,
    retainedProfileId: null,
    legacyDatabaseOwner: null,
    pendingCleanupProfileId: null,
  });
}
