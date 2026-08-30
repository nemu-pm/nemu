import { isDeviceDataProfileId } from "./device-profile-catalog";
import {
  captureStableDurableStorageSnapshot,
  DurableStorageSnapshotChangedError,
} from "./durable-storage-snapshot";

const GUARD_KEY_PREFIX = "nemu:device-profile-wipe-guard:";
const GUARD_VERSION = 1;
const MAX_OPERATION_ID_LENGTH = 128;
const MAX_STORAGE_KEYS_TO_SCAN = 4_096;
const MAX_STORAGE_KEY_LENGTH = 4_096;
const MAX_GUARD_CLAIMS_PER_PROFILE = 16;
const MAX_GUARD_RECORD_LENGTH = 4_096;

export type DeviceProfileWipeGuard = {
  version: 1;
  operationId: string;
  profileId: string | null;
  expectedEpoch: number;
  targetEpoch: number;
};

export class DeviceProfileWipeGuardUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "DeviceProfileWipeGuardUnavailableError";
  }
}

function isEpoch(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value < Number.MAX_SAFE_INTEGER
  );
}

function isStoredProfileId(value: unknown): value is string | null {
  return value === null || isDeviceDataProfileId(value);
}

function profileKey(profileId?: string): string {
  return profileId ?? "local";
}

function guardProfileKey(profileId?: string): string {
  return `${GUARD_KEY_PREFIX}${encodeURIComponent(profileKey(profileId))}`;
}

function guardClaimKey(guard: DeviceProfileWipeGuard): string {
  return `${guardProfileKey(guard.profileId ?? undefined)}:${encodeURIComponent(guard.operationId)}`;
}

function isGuardKeyForProfile(key: string, profileId?: string): boolean {
  const profilePrefix = guardProfileKey(profileId);
  return key === profilePrefix || key.startsWith(`${profilePrefix}:`);
}

function guardStorage(): Storage {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
  } catch (error) {
    throw new DeviceProfileWipeGuardUnavailableError(
      "Cannot safely access the durable profile wipe guard.",
      error,
    );
  }
  throw new DeviceProfileWipeGuardUnavailableError(
    "Cannot safely access the durable profile wipe guard.",
  );
}

export function isDeviceProfileWipeGuardStorageKey(key: string): boolean {
  return key.startsWith(GUARD_KEY_PREFIX);
}

export function isDeviceProfileWipeGuard(
  value: unknown,
): value is DeviceProfileWipeGuard {
  const guard = value as Partial<DeviceProfileWipeGuard> | null;
  return Boolean(
    guard &&
    Object.keys(guard).length === 5 &&
    [
      "version",
      "operationId",
      "profileId",
      "expectedEpoch",
      "targetEpoch",
    ].every((key) => Object.hasOwn(guard, key)) &&
    guard.version === GUARD_VERSION &&
    typeof guard.operationId === "string" &&
    guard.operationId.length > 0 &&
    guard.operationId.length <= MAX_OPERATION_ID_LENGTH &&
    isStoredProfileId(guard.profileId) &&
    isEpoch(guard.expectedEpoch) &&
    guard.targetEpoch === guard.expectedEpoch + 1,
  );
}

function parseGuardClaim(
  key: string,
  raw: string,
): DeviceProfileWipeGuard | null {
  try {
    const value = JSON.parse(raw) as unknown;
    return isDeviceProfileWipeGuard(value) && guardClaimKey(value) === key
      ? value
      : null;
  } catch {
    return null;
  }
}

export function readDeviceProfileWipeGuard(
  profileId?: string,
): DeviceProfileWipeGuard | null {
  if (profileId !== undefined && !isDeviceDataProfileId(profileId)) {
    throw new DeviceProfileWipeGuardUnavailableError(
      "Refusing to read an invalid durable profile wipe guard scope.",
    );
  }

  let snapshot;
  try {
    snapshot = captureStableDurableStorageSnapshot(guardStorage(), {
      maximumKeys: MAX_STORAGE_KEYS_TO_SCAN,
      maximumKeyLength: MAX_STORAGE_KEY_LENGTH,
      maximumSelectedEntries: MAX_GUARD_CLAIMS_PER_PROFILE,
      maximumSelectedValueLength: MAX_GUARD_RECORD_LENGTH,
      select: (key) => isGuardKeyForProfile(key, profileId),
    });
  } catch (error) {
    if (error instanceof DeviceProfileWipeGuardUnavailableError) throw error;
    if (error instanceof DurableStorageSnapshotChangedError) {
      throw new DeviceProfileWipeGuardUnavailableError(
        "Cannot safely read the durable profile wipe guard because device storage did not stabilize.",
        error,
      );
    }
    throw new DeviceProfileWipeGuardUnavailableError(
      "Cannot safely read the durable profile wipe guard.",
      error,
    );
  }

  const claims = snapshot.entries.map(({ key, value }) => {
    const claim = parseGuardClaim(key, value);
    if (!claim || claim.profileId !== (profileId ?? null)) {
      throw new DeviceProfileWipeGuardUnavailableError(
        "The durable profile wipe guard is invalid.",
      );
    }
    return claim;
  });
  if (claims.length > 1) {
    throw new DeviceProfileWipeGuardUnavailableError(
      "Multiple device-data wipe operations claim the same profile.",
    );
  }
  return claims[0] ?? null;
}

export function persistDeviceProfileWipeGuard(input: {
  operationId: string;
  profileId?: string;
  expectedEpoch: number;
}): DeviceProfileWipeGuard {
  const guard: DeviceProfileWipeGuard = {
    version: GUARD_VERSION,
    operationId: input.operationId,
    profileId: input.profileId ?? null,
    expectedEpoch: input.expectedEpoch,
    targetEpoch: input.expectedEpoch + 1,
  };
  if (!isDeviceProfileWipeGuard(guard)) {
    throw new Error("Refusing to persist an invalid profile wipe guard.");
  }
  const key = guardClaimKey(guard);
  try {
    const existing = readDeviceProfileWipeGuard(input.profileId);
    if (existing) {
      if (JSON.stringify(existing) !== JSON.stringify(guard)) {
        throw new Error(
          "A different device-data wipe already owns this profile.",
        );
      }
      return existing;
    }
    const storage = guardStorage();
    const serialized = JSON.stringify(guard);
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized) {
      throw new Error("Profile wipe guard write verification failed.");
    }
    const durable = readDeviceProfileWipeGuard(input.profileId);
    if (!durable || JSON.stringify(durable) !== JSON.stringify(guard)) {
      throw new Error("Profile wipe guard verification failed.");
    }
    return durable;
  } catch (error) {
    throw new Error(
      "Cannot safely clear this profile because its device-wipe guard could not be persisted.",
      { cause: error },
    );
  }
}

export function deleteDeviceProfileWipeGuard(
  expected: DeviceProfileWipeGuard,
): void {
  const profileId = expected.profileId ?? undefined;
  const durable = readDeviceProfileWipeGuard(profileId);
  if (!durable || JSON.stringify(durable) !== JSON.stringify(expected)) {
    throw new Error("Profile wipe guard changed before completion.");
  }
  try {
    const key = guardClaimKey(expected);
    const storage = guardStorage();
    storage.removeItem(key);
    if (storage.getItem(key) !== null) {
      throw new Error("Profile wipe guard removal failed.");
    }
    if (readDeviceProfileWipeGuard(profileId) !== null) {
      throw new Error("A profile wipe guard remained after completion.");
    }
  } catch (error) {
    throw new Error("Completed profile wipe guard could not be removed.", {
      cause: error,
    });
  }
}
