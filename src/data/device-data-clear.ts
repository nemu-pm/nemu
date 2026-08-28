import {
  IndexedDBUserDataStore,
  matchUserDataDatabaseProfile,
} from "./indexeddb";
import {
  retireDeviceDataProfiles,
  type DeviceDataProfileId,
} from "./device-data-retirement";
import {
  clearSourceSettingsProfile,
  getSourceSettingsDatabaseName,
} from "@/stores/source-settings";
import { listPendingSignOutCleanups } from "@/sync/pending-signout-cleanup";
import {
  isDeviceDataProfileId,
  listDeviceProfileCatalog,
} from "./device-profile-catalog";
import { matchSourceSettingsDatabaseProfile } from "@/stores/source-settings";

/** Databases that must be considered even when `indexedDB.databases()` is absent. */
const ESSENTIAL_DEVICE_DATABASE_NAMES = [
  "nemu-cache",
  "nemu-plugins",
  "nemu-security-state",
] as const;

const ESSENTIAL_DEVICE_DATABASE_NAME_SET = new Set<string>(
  ESSENTIAL_DEVICE_DATABASE_NAMES,
);

export function isNemuOwnedDatabaseName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  if (ESSENTIAL_DEVICE_DATABASE_NAME_SET.has(name)) return true;
  const matched =
    matchUserDataDatabaseProfile(name) ??
    matchSourceSettingsDatabaseProfile(name);
  return Boolean(
    matched &&
      (matched.profileId === undefined ||
        isDeviceDataProfileId(matched.profileId)),
  );
}

export function getKnownDeviceDatabaseNames(
  activeStore?: IndexedDBUserDataStore | null,
): Set<string> {
  const names = new Set<string>(ESSENTIAL_DEVICE_DATABASE_NAMES);
  const localStore = new IndexedDBUserDataStore();
  names.add(localStore.dbName);
  names.add(getSourceSettingsDatabaseName());
  if (activeStore) {
    names.add(activeStore.dbName);
    names.add(
      getSourceSettingsDatabaseName(activeStore.profileId || undefined),
    );
  }
  return names;
}

export function getProfileDatabaseNames(
  profiles: Iterable<DeviceDataProfileId>,
): Set<string> {
  const names = new Set<string>();
  for (const profileId of profiles) {
    names.add(new IndexedDBUserDataStore(profileId).dbName);
    names.add(getSourceSettingsDatabaseName(profileId));
  }
  return names;
}

/**
 * Databases that may be cleared/deleted without crossing a released profile
 * retirement fence. Profile stores are cleared in place while their lease is
 * held and must not be deleted afterwards: a new-lifetime user action may
 * already have opened and written to them.
 */
export function getNonProfileDeviceDatabaseNames(
  databaseNames: Iterable<string>,
  retiredProfiles: Iterable<DeviceDataProfileId>,
): Set<string> {
  const profileDatabaseNames = getProfileDatabaseNames(retiredProfiles);
  return new Set(
    [...databaseNames].filter(
      (name) =>
        isNemuOwnedDatabaseName(name) && !profileDatabaseNames.has(name),
    ),
  );
}

/** Include authenticated profiles recorded on browsers without DB listing. */
export function addCatalogProfileDatabaseNames(
  databaseNames: Set<string>,
): void {
  const profileNames = getProfileDatabaseNames(
    listDeviceProfileCatalog().map((entry) => entry.profileId),
  );
  for (const name of profileNames) databaseNames.add(name);
}

/**
 * Include profiles named by durable remote-confirmed cleanup markers.
 * Browsers may omit or reject `indexedDB.databases()`; clearing the recovery
 * database without first including these exact profiles would strand their
 * account/source data and erase the only proof authorizing a later retry.
 */
export async function addPendingCleanupProfileDatabaseNames(
  databaseNames: Set<string>,
): Promise<void> {
  const cleanups = await listPendingSignOutCleanups();
  const profileNames = getProfileDatabaseNames(
    cleanups.map((cleanup) => cleanup.profileId),
  );
  for (const name of profileNames) databaseNames.add(name);
}

/**
 * Clear an arbitrary non-profile IndexedDB database without creating it when
 * it does not already exist. Any store-clear failure rejects the operation;
 * destructive UI must never report success after silently skipping a store.
 */
export function clearAllObjectStores(dbName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let creatingMissingDatabase = false;
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(dbName);
    } catch (error) {
      reject(error);
      return;
    }

    request.onupgradeneeded = () => {
      creatingMissingDatabase = true;
      try {
        request.transaction?.abort();
      } catch {
        // The error handler below owns settlement.
      }
    };
    request.onerror = () => {
      if (creatingMissingDatabase) resolve();
      else reject(request.error ?? new Error(`Failed to open ${dbName}.`));
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      const storeNames = Array.from(db.objectStoreNames);
      if (storeNames.length === 0) {
        db.close();
        resolve();
        return;
      }

      let synchronousError: unknown = null;
      const tx = db.transaction(storeNames, "readwrite");
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(
          synchronousError ??
            tx.error ??
            new Error(`Failed to clear ${dbName}.`),
        );
      };
      tx.onabort = () => {
        db.close();
        reject(
          synchronousError ??
            tx.error ??
            new Error(`Clearing ${dbName} was aborted.`),
        );
      };

      for (const storeName of storeNames) {
        try {
          tx.objectStore(storeName).clear();
        } catch (error) {
          synchronousError = error;
          try {
            tx.abort();
          } catch {
            db.close();
            reject(error);
          }
          break;
        }
      }
    };
  });
}

type ProfileBackendFailure = {
  profileId: DeviceDataProfileId;
  backend: "user data" | "source settings";
  cause: unknown;
};

/**
 * Clear and retire every discovered profile lifetime.
 *
 * Backend failures are collected inside the retirement callback so the
 * future-lifetime barrier still commits after any partial cross-database
 * destruction. The caller then receives an AggregateError and can offer a
 * retry without allowing a suspended tab to resurrect already-erased data.
 */
export async function clearAndRetireDeviceProfiles(
  databaseNames: Iterable<string>,
  activeStore?: IndexedDBUserDataStore | null,
): Promise<DeviceDataProfileId[]> {
  const failures: ProfileBackendFailure[] = [];
  const activeProfileId = activeStore?.profileId || undefined;
  const profiles = await retireDeviceDataProfiles(
    databaseNames,
    activeProfileId,
    async (profileId, lease) => {
      // Always construct the store inside the retirement callback. A previous
      // partial clear may already have retired the provider's captured store;
      // reusing that stale instance on the user's retry would reject the new
      // lifetime's lease forever. Construction here adopts the callback's
      // active retirement lease while still targeting the exact profile.
      const userStore = new IndexedDBUserDataStore(profileId);
      const results = await Promise.allSettled([
        userStore.clearAllLocalData(undefined, lease),
        clearSourceSettingsProfile(profileId, undefined, lease),
      ]);
      const backends = ["user data", "source settings"] as const;
      results.forEach((result, index) => {
        const backend = backends[index];
        if (result.status === "rejected" && backend) {
          failures.push({
            profileId,
            backend,
            cause: result.reason,
          });
        }
      });
    },
  );

  if (failures.length > 0) {
    throw new AggregateError(
      failures.map(
        (failure) =>
          new Error(
            `Failed to clear ${failure.backend} for ${failure.profileId ?? "the local profile"}.`,
            { cause: failure.cause },
          ),
      ),
      "Some profile data could not be cleared safely.",
    );
  }
  return profiles;
}
