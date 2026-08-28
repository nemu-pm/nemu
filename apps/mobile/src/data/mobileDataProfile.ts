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
const PENDING_PROFILE_CLEANUP_VERSION = 1;
export const MOBILE_DATA_PROFILE_CLEANUP_PENDING =
  "MOBILE_DATA_PROFILE_CLEANUP_PENDING";
export const MOBILE_LOCAL_FULL_RESET_PROFILE_ID = "local";

export type MobileDataProfileCleanupMode = "account" | "all";

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
  /** The exact user-approved scope for an interrupted cleanup. */
  pendingCleanupMode?: MobileDataProfileCleanupMode | null;
  /** False only while a prepared authenticated reset still awaits sign-out. */
  pendingCleanupRemoteSignOutConfirmed?: boolean | null;
  /** Volatile ownership that prevents startup recovery racing a live request. */
  pendingCleanupLocallyOwned?: boolean;
};

export type MobileDataProfileSelection = {
  profileId: string | null;
  databaseName: string;
};

export type MobileDataProfileCleanupStartupAction =
  | "none"
  | "wait"
  | "cancel"
  | "confirm"
  | "continue";

/** Decide an unconfirmed crash marker only after native auth has settled. */
export function getMobileDataProfileCleanupStartupAction(
  state: MobileDataProfileSnapshot,
  auth: {
    settled: boolean;
    authenticatedProfileId: string | null;
  },
): MobileDataProfileCleanupStartupAction {
  if (!state.pendingCleanupProfileId) return "none";
  if (state.pendingCleanupRemoteSignOutConfirmed !== false) return "continue";
  if (state.pendingCleanupLocallyOwned || !auth.settled) return "wait";
  return auth.authenticatedProfileId ? "cancel" : "confirm";
}

let storage: NativeKVStore = new SecureNativeKVStore();
const listeners = new Set<() => void>();
let snapshot: MobileDataProfileSnapshot = {
  loaded: false,
  retainedProfileId: null,
  legacyDatabaseOwner: null,
  pendingCleanupProfileId: null,
  pendingCleanupMode: null,
  pendingCleanupRemoteSignOutConfirmed: null,
  pendingCleanupLocallyOwned: false,
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

function decodePendingCleanup(value: string | null): {
  profileId: string | null;
  mode: MobileDataProfileCleanupMode | null;
  remoteSignOutConfirmed: boolean | null;
} {
  if (!value) {
    return {
      profileId: null,
      mode: null,
      remoteSignOutConfirmed: null,
    };
  }
  // Older builds stored only the profile id. Preserve that exact account-only
  // recovery contract when upgrading with an interrupted sign-out.
  if (!value.startsWith("{")) {
    return {
      profileId: value,
      mode: "account",
      remoteSignOutConfirmed: true,
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw dataProfileCleanupPendingError();
  }
  const record = parsed as Record<string, unknown> | null;
  if (
    !record ||
    Object.keys(record).sort().join(",") !==
      "mode,profileId,remoteSignOutConfirmed,version" ||
    record.version !== PENDING_PROFILE_CLEANUP_VERSION ||
    typeof record.profileId !== "string" ||
    !record.profileId.trim() ||
    (record.mode !== "account" && record.mode !== "all") ||
    typeof record.remoteSignOutConfirmed !== "boolean"
  ) {
    throw dataProfileCleanupPendingError();
  }
  return {
    profileId: record.profileId,
    mode: record.mode,
    remoteSignOutConfirmed: record.remoteSignOutConfirmed,
  };
}

function encodePendingCleanup(
  profileId: string,
  mode: MobileDataProfileCleanupMode,
  remoteSignOutConfirmed: boolean,
): string {
  return mode === "account" && remoteSignOutConfirmed
    ? profileId
    : JSON.stringify({
        version: PENDING_PROFILE_CLEANUP_VERSION,
        profileId,
        mode,
        remoteSignOutConfirmed,
      });
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
        storedPendingCleanup,
      ]) => {
        const pendingCleanup = decodePendingCleanup(storedPendingCleanup);
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
          pendingCleanupProfileId: pendingCleanup.profileId,
          pendingCleanupMode: pendingCleanup.mode,
          pendingCleanupRemoteSignOutConfirmed:
            pendingCleanup.remoteSignOutConfirmed,
          pendingCleanupLocallyOwned: false,
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
  mode: MobileDataProfileCleanupMode = "account",
  remoteSignOutConfirmed = true,
  locallyOwned = false,
): Promise<MobileDataProfileSnapshot> {
  return persistMobileDataProfileCleanupPending(
    profileId,
    false,
    mode,
    remoteSignOutConfirmed,
    locallyOwned,
  );
}

/**
 * Re-persists an existing in-memory/durable cleanup fence before any
 * destructive retry. This is intentionally valid after the retained profile
 * has already been cleared: a prior run may have completed data removal and
 * failed only while deleting the final marker.
 */
export async function ensureMobileDataProfileCleanupPendingPersisted(
  profileId: string,
  mode?: MobileDataProfileCleanupMode,
): Promise<MobileDataProfileSnapshot> {
  return persistMobileDataProfileCleanupPending(profileId, true, mode);
}

function persistMobileDataProfileCleanupPending(
  profileId: string,
  allowClearedRetainedProfile: boolean,
  requestedMode?: MobileDataProfileCleanupMode,
  requestedRemoteSignOutConfirmed?: boolean,
  requestedLocallyOwned?: boolean,
): Promise<MobileDataProfileSnapshot> {
  if (!profileId.trim()) throw new Error("A mobile data profile is required.");
  const task = profileMutationQueue.then(async () => {
    const current = await loadMobileDataProfile();
    const currentMode = current.pendingCleanupMode ?? "account";
    if (
      current.pendingCleanupProfileId &&
      requestedMode &&
      currentMode !== requestedMode
    ) {
      throw new Error("The pending mobile data removal scope changed.");
    }
    const currentRemoteSignOutConfirmed =
      current.pendingCleanupRemoteSignOutConfirmed ?? true;
    if (
      current.pendingCleanupProfileId &&
      requestedRemoteSignOutConfirmed !== undefined &&
      currentRemoteSignOutConfirmed !== requestedRemoteSignOutConfirmed
    ) {
      throw new Error("The pending mobile sign-out phase changed.");
    }
    const mode = current.pendingCleanupProfileId
      ? currentMode
      : requestedMode ?? "account";
    const remoteSignOutConfirmed = current.pendingCleanupProfileId
      ? currentRemoteSignOutConfirmed
      : requestedRemoteSignOutConfirmed ?? true;
    const locallyOwned = current.pendingCleanupProfileId
      ? current.pendingCleanupLocallyOwned === true
      : requestedLocallyOwned === true;
    const isLocalFullReset =
      profileId === MOBILE_LOCAL_FULL_RESET_PROFILE_ID &&
      mode === "all" &&
      current.retainedProfileId === null;
    const isMarkerOnlyRetry =
      allowClearedRetainedProfile &&
      current.retainedProfileId === null &&
      current.pendingCleanupProfileId === profileId &&
      !isLocalFullReset;
    if (
      current.retainedProfileId !== profileId &&
      !isMarkerOnlyRetry &&
      !isLocalFullReset
    ) {
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
      pendingCleanupMode: mode,
      pendingCleanupRemoteSignOutConfirmed: remoteSignOutConfirmed,
      pendingCleanupLocallyOwned: locallyOwned,
    });
    await storage.setString(
      PENDING_PROFILE_CLEANUP_KEY,
      encodePendingCleanup(profileId, mode, remoteSignOutConfirmed),
    );
    return pending;
  });
  profileMutationQueue = task.catch(() => undefined);
  return task;
}

/** Checkpoint the exact prepared reset after the server revokes its session. */
export async function confirmMobileDataProfileCleanupSignOut(
  expectedProfileId: string,
): Promise<MobileDataProfileSnapshot> {
  const task = profileMutationQueue.then(async () => {
    const current = await loadMobileDataProfile();
    if (
      current.pendingCleanupProfileId !== expectedProfileId ||
      !current.pendingCleanupMode
    ) {
      throw new Error("The prepared mobile data reset changed.");
    }
    if (current.pendingCleanupRemoteSignOutConfirmed === true) return current;
    const confirmed = {
      ...current,
      pendingCleanupRemoteSignOutConfirmed: true,
    };
    await storage.setString(
      PENDING_PROFILE_CLEANUP_KEY,
      encodePendingCleanup(
        expectedProfileId,
        current.pendingCleanupMode,
        true,
      ),
    );
    return publish(confirmed);
  });
  profileMutationQueue = task.catch(() => undefined);
  return task;
}

/** Cancel only a still-unconfirmed reset when the original session survived. */
export async function cancelPreparedMobileDataProfileCleanup(
  expectedProfileId: string,
): Promise<MobileDataProfileSnapshot> {
  const task = profileMutationQueue.then(async () => {
    const current = await loadMobileDataProfile();
    if (current.pendingCleanupProfileId !== expectedProfileId) return current;
    if (current.pendingCleanupRemoteSignOutConfirmed !== false) {
      throw new Error("A confirmed mobile data cleanup cannot be cancelled.");
    }
    await storage.remove(PENDING_PROFILE_CLEANUP_KEY);
    return publish({
      ...current,
      pendingCleanupProfileId: null,
      pendingCleanupMode: null,
      pendingCleanupRemoteSignOutConfirmed: null,
      pendingCleanupLocallyOwned: false,
    });
  });
  profileMutationQueue = task.catch(() => undefined);
  return task;
}

/** Release volatile ownership so the mounted recovery boundary can decide. */
export async function releaseMobileDataProfileCleanupOwnership(
  expectedProfileId: string,
): Promise<MobileDataProfileSnapshot> {
  const task = profileMutationQueue.then(async () => {
    const current = await loadMobileDataProfile();
    if (
      current.pendingCleanupProfileId !== expectedProfileId ||
      !current.pendingCleanupLocallyOwned
    ) {
      return current;
    }
    return publish({
      ...current,
      pendingCleanupLocallyOwned: false,
    });
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
      pendingCleanupMode: null,
      pendingCleanupRemoteSignOutConfirmed: null,
      pendingCleanupLocallyOwned: false,
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
    pendingCleanupMode: null,
    pendingCleanupRemoteSignOutConfirmed: null,
    pendingCleanupLocallyOwned: false,
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
    pendingCleanupMode: null,
    pendingCleanupRemoteSignOutConfirmed: null,
    pendingCleanupLocallyOwned: false,
  });
}
