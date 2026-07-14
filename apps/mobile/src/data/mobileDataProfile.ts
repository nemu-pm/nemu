import { SecureNativeKVStore } from "./nativeKV";
import {
  MOBILE_ANONYMOUS_DATABASE_NAME,
  MOBILE_DATABASE_NAME,
} from "./nativeDatabase";
import { sha256Bytes } from "@nemu/core";
import type { NativeKVStore } from "./contracts";

const LAST_PROFILE_ID_KEY = "nemu.mobile.last-profile-id";
const LEGACY_DATABASE_OWNER_KEY = "nemu.mobile.legacy-database-owner";

export type MobileDataProfileSnapshot = {
  loaded: boolean;
  retainedProfileId: string | null;
  legacyDatabaseOwner: string | null;
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
  if (sessionProfileId && state.retainedProfileId !== sessionProfileId) {
    return null;
  }

  const profileId = sessionProfileId ?? state.retainedProfileId;
  return {
    profileId,
    databaseName: getMobileProfileDatabaseName(
      profileId,
      state.legacyDatabaseOwner ?? sessionProfileId,
    ),
  };
}

export async function loadMobileDataProfile(): Promise<MobileDataProfileSnapshot> {
  if (snapshot.loaded) return snapshot;
  if (!loadPromise) {
    loadPromise = Promise.all([
      storage.getString(LAST_PROFILE_ID_KEY),
      storage.getString(LEGACY_DATABASE_OWNER_KEY),
    ])
      .then(async ([retainedProfileId, storedLegacyDatabaseOwner]) => {
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
        return publish({ loaded: true, ...normalized });
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

export async function clearRetainedMobileDataProfile(): Promise<MobileDataProfileSnapshot> {
  const task = profileMutationQueue.then(async () => {
    const current = await loadMobileDataProfile();
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

export async function resolveMobileDataProfileForUser(
  userId: string,
  options: { retain?: boolean } = {},
): Promise<{ profileId: string; databaseName: string }> {
  const profileId = makeMobileProfileId(userId);
  if (!profileId) throw new Error("A user id is required to resolve a mobile data profile.");
  const state = options.retain === false
    ? await loadMobileDataProfile()
    : await retainMobileDataProfile(profileId);
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
  ]);
  loadPromise = null;
  profileMutationQueue = Promise.resolve();
  publish({
    loaded: false,
    retainedProfileId: null,
    legacyDatabaseOwner: null,
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
  });
}
