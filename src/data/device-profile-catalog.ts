/**
 * Small durable catalog of authenticated profiles that have owned local data.
 *
 * `IDBFactory.databases()` is not available in every supported browser. One
 * append-only localStorage key per profile epoch avoids a read/modify/write
 * race between tabs: a delayed old registration can never overwrite a newer
 * lifetime. The highest recorded fence epoch lets destructive cleanup
 * distinguish an old catalog lifetime from a profile reopened after it was
 * retired.
 */

import {
  captureStableDurableStorageSnapshot,
  DurableStorageSnapshotChangedError,
} from "./durable-storage-snapshot";

const CATALOG_KEY_PREFIX = "nemu:device-profile-catalog:";
const CATALOG_VERSION = 1;
const MAX_PROFILE_ID_LENGTH = 512;
const MAX_CATALOG_PROFILES = 128;
const MAX_CATALOG_RECORDS = 1_024;
const MAX_STORAGE_KEYS_TO_SCAN = 4_096;
const MAX_STORAGE_KEY_LENGTH = 4_096;
const MAX_CATALOG_RECORD_LENGTH = 4_096;

export type DeviceProfileCatalogEntry = {
  profileId: string;
  epoch: number;
};

export class DeviceProfileCatalogUnavailableError extends Error {
  constructor(
    cause?: unknown,
    message = "Cannot safely enumerate the durable local profile catalog.",
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "DeviceProfileCatalogUnavailableError";
  }
}

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

type StoredDeviceProfileCatalogEntry = DeviceProfileCatalogEntry & {
  version: 1;
};

export function isDeviceDataProfileId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.startsWith("user:") &&
    value.length > "user:".length &&
    value.length <= MAX_PROFILE_ID_LENGTH &&
    !hasControlCharacters(value)
  );
}

function isFenceEpoch(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value < Number.MAX_SAFE_INTEGER
  );
}

function catalogKey(profileId: string, epoch: number): string {
  return `${CATALOG_KEY_PREFIX}${encodeURIComponent(profileId)}:${epoch}`;
}

function catalogStorage(): Storage {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch (error) {
    throw new DeviceProfileCatalogUnavailableError(
      error,
      "Cannot safely access the durable local profile catalog.",
    );
  }
  throw new DeviceProfileCatalogUnavailableError(
    undefined,
    "Cannot safely access the durable local profile catalog.",
  );
}

function parseCatalogEntry(
  key: string,
  raw: string | null,
): StoredDeviceProfileCatalogEntry | null {
  if (!key.startsWith(CATALOG_KEY_PREFIX) || raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredDeviceProfileCatalogEntry>;
    if (
      Object.keys(value).length !== 3 ||
      !["version", "profileId", "epoch"].every((property) =>
        Object.hasOwn(value, property),
      ) ||
      value.version !== CATALOG_VERSION ||
      !isDeviceDataProfileId(value.profileId) ||
      !isFenceEpoch(value.epoch) ||
      catalogKey(value.profileId, value.epoch) !== key
    ) {
      return null;
    }
    return value as StoredDeviceProfileCatalogEntry;
  } catch {
    return null;
  }
}

export function isDeviceProfileCatalogStorageKey(key: string): boolean {
  return key.startsWith(CATALOG_KEY_PREFIX);
}

/**
 * Register a profile synchronously when its write fence is constructed.
 *
 * A profile that is accepted for IndexedDB persistence must also be present in
 * the durable catalog: browsers without `indexedDB.databases()` otherwise have
 * no complete erase path. Epochs use separate append-only keys so concurrent
 * old and new writers cannot regress the durable maximum. Verify both the
 * exact inserted record and a stable catalog view before returning.
 */
export function registerDeviceProfile(
  profileId: string,
  epoch: number,
): DeviceProfileCatalogEntry {
  if (!isDeviceDataProfileId(profileId) || !isFenceEpoch(epoch)) {
    throw new Error(
      "Refusing to register an invalid device profile catalog entry.",
    );
  }
  const key = catalogKey(profileId, epoch);
  try {
    const storage = catalogStorage();
    const before = captureCatalogSnapshot(storage);
    const existing = before.entries.find(
      (entry) => entry.profileId === profileId,
    );
    if (existing && existing.epoch >= epoch) {
      return existing;
    }
    if (!existing && before.entries.length >= MAX_CATALOG_PROFILES) {
      throw new DeviceProfileCatalogUnavailableError(
        undefined,
        "Cannot safely persist the durable local profile catalog because it exceeds its supported profile limit.",
      );
    }
    if (before.recordCount >= MAX_CATALOG_RECORDS) {
      throw new Error(
        "The durable local profile catalog has no safe record capacity remaining.",
      );
    }
    const entry: StoredDeviceProfileCatalogEntry = {
      version: CATALOG_VERSION,
      profileId,
      epoch,
    };
    const serialized = JSON.stringify(entry);
    const priorRaw = storage.getItem(key);
    const prior = parseCatalogEntry(key, priorRaw);
    if (priorRaw !== null && !prior) {
      throw new Error("The durable local profile catalog is invalid.");
    }
    if (priorRaw === null) storage.setItem(key, serialized);
    const durableRaw = storage.getItem(key);
    const durable = parseCatalogEntry(key, durableRaw);
    if (!durable || durable.epoch !== epoch) {
      throw new Error("Device profile catalog write verification failed.");
    }
    const after = captureCatalogSnapshot(storage);
    const durableMaximum = after.entries.find(
      (candidate) => candidate.profileId === profileId,
    );
    if (!durableMaximum || durableMaximum.epoch < epoch) {
      throw new Error("Device profile catalog write verification failed.");
    }
    return durableMaximum;
  } catch (error) {
    if (error instanceof DeviceProfileCatalogUnavailableError) throw error;
    throw new DeviceProfileCatalogUnavailableError(
      error,
      "Cannot safely persist the durable local profile catalog.",
    );
  }
}

type CatalogSnapshot = {
  entries: DeviceProfileCatalogEntry[];
  recordCount: number;
};

function captureCatalogSnapshot(storage: Storage): CatalogSnapshot {
  let snapshot;
  try {
    snapshot = captureStableDurableStorageSnapshot(storage, {
      maximumKeys: MAX_STORAGE_KEYS_TO_SCAN,
      maximumKeyLength: MAX_STORAGE_KEY_LENGTH,
      maximumSelectedEntries: MAX_CATALOG_RECORDS,
      maximumSelectedValueLength: MAX_CATALOG_RECORD_LENGTH,
      select: isDeviceProfileCatalogStorageKey,
    });
  } catch (error) {
    if (error instanceof DurableStorageSnapshotChangedError) {
      throw new DeviceProfileCatalogUnavailableError(
        error,
        "Cannot safely enumerate the durable local profile catalog because device storage did not stabilize.",
      );
    }
    throw new DeviceProfileCatalogUnavailableError(error);
  }

  const byProfile = new Map<string, DeviceProfileCatalogEntry>();
  for (const { key, value } of snapshot.entries) {
    const entry = parseCatalogEntry(key, value);
    if (!entry) {
      throw new Error(
        "Cannot safely clear device data because the local profile catalog is invalid.",
      );
    }
    const current = byProfile.get(entry.profileId);
    if (!current || entry.epoch > current.epoch) {
      byProfile.set(entry.profileId, {
        profileId: entry.profileId,
        epoch: entry.epoch,
      });
    }
    if (byProfile.size > MAX_CATALOG_PROFILES) {
      throw new Error(
        "Cannot safely clear device data because the local profile catalog exceeds its supported limit.",
      );
    }
  }
  const entries = [...byProfile.values()];
  entries.sort((left, right) => left.profileId.localeCompare(right.profileId));
  return {
    entries,
    recordCount: snapshot.entries.length,
  };
}

/**
 * Return only fully validated catalog records and refuse a truncated view.
 * A destructive caller must fail closed instead of silently omitting profiles.
 */
export function listDeviceProfileCatalog(): DeviceProfileCatalogEntry[] {
  return captureCatalogSnapshot(catalogStorage()).entries;
}
