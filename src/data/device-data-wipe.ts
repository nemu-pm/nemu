import {
  addCatalogProfileDatabaseNames,
  addPendingCleanupProfileDatabaseNames,
  clearAllObjectStores,
  getKnownDeviceDatabaseNames,
  getNonProfileDeviceDatabaseNames,
  isNemuOwnedDatabaseName,
} from "./device-data-clear";
import { discoverDeviceDataProfiles } from "./device-data-retirement";
import {
  cancelPendingDeviceDataWipe,
  checkpointPendingDeviceDataWipe,
  createDeviceDataWipeClientStorageClearPlan,
  createPendingDeviceDataWipe,
  deletePendingDeviceDataWipe,
  executeDeviceDataWipeClientStorageClearPlan,
  readPendingDeviceDataWipe,
  withDeviceDataWipeLock,
  type PendingDeviceDataWipe,
} from "./device-data-wipe-journal";
import {
  deleteDeviceProfileWipeGuard,
  persistDeviceProfileWipeGuard,
  readDeviceProfileWipeGuard,
  type DeviceProfileWipeGuard,
} from "./device-profile-wipe-guard";
import { IndexedDBUserDataStore } from "./indexeddb";
import { ProfileWriteFence } from "./profile-write-fence";
import { clearSourceSettingsProfile } from "@/stores/source-settings";

export type DeviceDataWipeRunResult =
  | { status: "completed"; operationId: string }
  | { status: "awaiting-remote-confirmation"; operationId: string }
  | { status: "superseded"; operationId: string }
  | { status: "none" };

type DeviceDataWipeStartOptions = {
  activeStore: IndexedDBUserDataStore;
  initiatingProfileId?: string;
  confirmRemoteSignOut?: () => Promise<void>;
};

function sameGuard(
  left: DeviceProfileWipeGuard,
  right: DeviceProfileWipeGuard,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function collectOwnedDatabaseNames(
  activeStore: IndexedDBUserDataStore,
): Promise<Set<string>> {
  const names = getKnownDeviceDatabaseNames(activeStore);
  if (typeof indexedDB.databases === "function") {
    try {
      const databases = await indexedDB.databases();
      for (const database of databases) {
        if (isNemuOwnedDatabaseName(database.name)) names.add(database.name);
      }
    } catch {
      // The durable profile catalog and exact known names are the supported
      // fallback on browsers that cannot enumerate databases.
    }
  }
  addCatalogProfileDatabaseNames(names);
  await addPendingCleanupProfileDatabaseNames(names);
  return names;
}

async function createWipeJournal(
  options: DeviceDataWipeStartOptions,
): Promise<PendingDeviceDataWipe> {
  const databaseNames = await collectOwnedDatabaseNames(options.activeStore);
  const profiles = discoverDeviceDataProfiles(
    databaseNames,
    options.activeStore.profileId || undefined,
  );
  const profileScope = profiles.map((profileId) => ({
    profileId: profileId ?? null,
    expectedEpoch: new ProfileWriteFence(profileId).epoch,
  }));
  const nonProfileDatabases = getNonProfileDeviceDatabaseNames(
    databaseNames,
    profiles,
  );
  return createPendingDeviceDataWipe({
    profiles: profileScope,
    databases: nonProfileDatabases,
    initiatingProfileId: options.initiatingProfileId,
  });
}

function expectedGuard(
  journal: PendingDeviceDataWipe,
  profile: PendingDeviceDataWipe["profiles"][number],
): DeviceProfileWipeGuard {
  return {
    version: 1,
    operationId: journal.operationId,
    profileId: profile.profileId,
    expectedEpoch: profile.expectedEpoch,
    targetEpoch: profile.expectedEpoch + 1,
  };
}

function ensureProfileGuards(journal: PendingDeviceDataWipe): void {
  for (const profile of journal.profiles) {
    if (
      journal.completedProfiles.some(
        (completed) => completed.profileId === profile.profileId,
      )
    ) {
      continue;
    }
    persistDeviceProfileWipeGuard({
      operationId: journal.operationId,
      profileId: profile.profileId ?? undefined,
      expectedEpoch: profile.expectedEpoch,
    });
  }
}

function removeCompletedProfileGuards(journal: PendingDeviceDataWipe): void {
  for (const profile of journal.completedProfiles) {
    const durable = readDeviceProfileWipeGuard(profile.profileId ?? undefined);
    if (!durable) continue;
    const expected = expectedGuard(journal, profile);
    if (!sameGuard(durable, expected)) {
      throw new Error("A different device-data wipe owns a completed profile.");
    }
    deleteDeviceProfileWipeGuard(durable);
  }
}

async function clearProfile(
  profileId: string | null,
  guard: DeviceProfileWipeGuard,
): Promise<void> {
  const normalizedProfileId = profileId ?? undefined;
  const fence = new ProfileWriteFence(normalizedProfileId);
  await fence.runDeviceDataWipe(guard, async (lease) => {
    const store = new IndexedDBUserDataStore(normalizedProfileId);
    const results = await Promise.allSettled([
      store.clearAllLocalData(undefined, lease),
      clearSourceSettingsProfile(normalizedProfileId, undefined, lease),
    ]);
    const failures = results
      .map((result, index) => ({ result, index }))
      .filter(
        (entry): entry is { result: PromiseRejectedResult; index: number } =>
          entry.result.status === "rejected",
      )
      .map(
        ({ result, index }) =>
          new Error(
            `Failed to clear ${index === 0 ? "user data" : "source settings"} for ${profileId ?? "the local profile"}.`,
            { cause: result.reason },
          ),
      );
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `Failed to clear all data for ${profileId ?? "the local profile"}.`,
      );
    }
  });
}

function completedProfilesThrough(
  journal: PendingDeviceDataWipe,
  profileId: string | null,
): PendingDeviceDataWipe["completedProfiles"] {
  const completed = new Set(
    journal.completedProfiles.map((profile) => profile.profileId),
  );
  completed.add(profileId);
  return journal.profiles.filter((profile) => completed.has(profile.profileId));
}

function completedDatabasesThrough(
  journal: PendingDeviceDataWipe,
  databaseName: string,
): string[] {
  const completed = new Set(journal.completedDatabases);
  completed.add(databaseName);
  return journal.databases.filter((name) => completed.has(name));
}

async function executeWipe(
  initialJournal: PendingDeviceDataWipe,
): Promise<PendingDeviceDataWipe> {
  let journal = initialJournal;
  if (!journal.remoteSignOutConfirmed) {
    throw new Error("Remote sign-out is not confirmed for this device-data wipe.");
  }

  removeCompletedProfileGuards(journal);
  ensureProfileGuards(journal);

  for (const profile of journal.profiles) {
    if (
      journal.completedProfiles.some(
        (completed) => completed.profileId === profile.profileId,
      )
    ) {
      continue;
    }
    const guard = readDeviceProfileWipeGuard(profile.profileId ?? undefined);
    const expected = expectedGuard(journal, profile);
    if (!guard || !sameGuard(guard, expected)) {
      throw new Error("The durable profile wipe guard changed before cleanup.");
    }
    await clearProfile(profile.profileId, guard);
    journal = checkpointPendingDeviceDataWipe(journal, {
      ...journal,
      completedProfiles: completedProfilesThrough(journal, profile.profileId),
    });
    deleteDeviceProfileWipeGuard(guard);
  }

  for (const databaseName of journal.databases) {
    if (journal.completedDatabases.includes(databaseName)) continue;
    await clearAllObjectStores(databaseName);
    journal = checkpointPendingDeviceDataWipe(journal, {
      ...journal,
      completedDatabases: completedDatabasesThrough(journal, databaseName),
    });
  }

  const storagePlan = await createDeviceDataWipeClientStorageClearPlan(journal);
  executeDeviceDataWipeClientStorageClearPlan(storagePlan);
  deletePendingDeviceDataWipe(journal);
  return journal;
}

function cancelWipeAndGuards(journal: PendingDeviceDataWipe): void {
  for (const profile of journal.profiles) {
    const guard = readDeviceProfileWipeGuard(profile.profileId ?? undefined);
    if (!guard) continue;
    const expected = expectedGuard(journal, profile);
    if (!sameGuard(guard, expected)) {
      throw new Error("A different device-data wipe owns this profile.");
    }
    deleteDeviceProfileWipeGuard(guard);
  }
  cancelPendingDeviceDataWipe(journal);
}

/** Start or explicitly resume the user-requested Clear All Data operation. */
export function startDeviceDataWipe(
  options: DeviceDataWipeStartOptions,
): Promise<DeviceDataWipeRunResult> {
  return withDeviceDataWipeLock(async () => {
    let journal = readPendingDeviceDataWipe();
    if (
      journal &&
      options.initiatingProfileId &&
      journal.initiatingProfileId !== options.initiatingProfileId
    ) {
      // An explicit retry under a newer account replaces the stale scope with
      // a fresh snapshot that includes that account's current profile.
      cancelWipeAndGuards(journal);
      journal = null;
    }
    journal ??= await createWipeJournal(options);
    ensureProfileGuards(journal);

    if (!journal.remoteSignOutConfirmed) {
      if (!options.confirmRemoteSignOut) {
        return {
          status: "awaiting-remote-confirmation",
          operationId: journal.operationId,
        };
      }
      await options.confirmRemoteSignOut();
      journal = checkpointPendingDeviceDataWipe(journal, {
        ...journal,
        remoteSignOutConfirmed: true,
      });
    }

    const completed = await executeWipe(journal);
    return { status: "completed", operationId: completed.operationId };
  });
}

/**
 * Resume a remote-confirmed crash recovery once authentication has settled.
 * Any newer authenticated session supersedes the old destructive intent.
 */
export function recoverPendingDeviceDataWipe(
  activeAuthenticatedProfileId?: string,
): Promise<DeviceDataWipeRunResult> {
  return withDeviceDataWipeLock(async () => {
    const journal = readPendingDeviceDataWipe();
    if (!journal) return { status: "none" };
    if (!journal.remoteSignOutConfirmed) {
      return {
        status: "awaiting-remote-confirmation",
        operationId: journal.operationId,
      };
    }
    if (activeAuthenticatedProfileId) {
      cancelWipeAndGuards(journal);
      return { status: "superseded", operationId: journal.operationId };
    }
    ensureProfileGuards(journal);
    const completed = await executeWipe(journal);
    return { status: "completed", operationId: completed.operationId };
  });
}
