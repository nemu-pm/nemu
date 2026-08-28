/**
 * Cross-tab serialization and retirement fence for one local profile.
 *
 * IndexedDB serializes individual transactions, but a sync mutation is usually
 * a larger read -> write -> generation-sample phase. Web Locks keeps that whole
 * phase ordered across tabs. The module queue provides a same-realm guarantee
 * only. Browser window runtimes fail closed when Web Locks are unavailable;
 * non-window SSR/worker callers must remain isolated to their module realm.
 */

import {
  isDeviceDataProfileId,
  registerDeviceProfile,
} from "./device-profile-catalog";
import {
  captureStableDurableStorageSnapshot,
  DurableStorageSnapshotChangedError,
} from "./durable-storage-snapshot";
import {
  readDeviceProfileWipeGuard,
  type DeviceProfileWipeGuard,
} from "./device-profile-wipe-guard";

const EPOCH_STORAGE_PREFIX = "nemu:profile-write-epoch:";
const RETIREMENT_INTENT_STORAGE_PREFIX =
  "nemu:profile-write-retirement-intent:";
const RETIREMENT_OBSERVATION_STORAGE_PREFIX =
  "nemu:profile-write-retirement-observed:";
const RETIREMENT_OBSERVATION_MARKER_PREFIX =
  "nemu:profile-write-retirement-observations-present:";
const WEB_LOCK_PREFIX = "nemu:profile-write:";
const RETIRE_CHANNEL_NAME = "nemu:profile-write-retired";
const MAX_STABLE_EPOCH_READ_ATTEMPTS = 4;
const MAX_OBSERVED_RETIREMENTS_PER_PROFILE = 128;
const MAX_STORAGE_KEYS_TO_SCAN = 4_096;
const MAX_STORAGE_KEY_LENGTH = 4_096;

// Browser globals added later by a DOM test shim do not turn the Bun/SSR
// module realm into a cross-tab browser runtime. In a deployed browser this is
// true at module evaluation, before any profile store can be constructed.
const IS_BROWSER_RUNTIME = typeof window !== "undefined";

const leaseBrand: unique symbol = Symbol("ProfileWriteFenceLease");

export type ProfileWriteFenceLease = {
  readonly key: string;
  readonly epoch: number;
  readonly [leaseBrand]: true;
};

export class StaleProfileWriteError extends Error {
  constructor() {
    super(
      "This local profile was cleared by another session. Reload before saving again.",
    );
    this.name = "StaleProfileWriteError";
  }
}

export class ProfileWriteFenceUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ProfileWriteFenceUnavailableError";
  }
}

export class DeviceDataWipePendingError extends Error {
  constructor() {
    super(
      "This local profile is being cleared from the device. Wait for recovery to finish before saving again.",
    );
    this.name = "DeviceDataWipePendingError";
  }
}

type RetiredListener = (epoch: number) => void;

const sameRealmQueues = new Map<string, Promise<void>>();
const sameRealmEpochs = new Map<string, number>();
const retiredListeners = new Map<string, Set<RetiredListener>>();
const activeWriteLeases = new Map<string, ProfileWriteFenceLease>();
const activeRetirementLeases = new Map<string, ProfileWriteFenceLease>();

function profileKey(profileId?: string): string {
  return profileId || "local";
}

function registerBrowserDeviceProfile(
  profileId: string | undefined,
  epoch: number,
): void {
  if (
    profileId &&
    isDeviceDataProfileId(profileId) &&
    typeof window !== "undefined"
  ) {
    registerDeviceProfile(profileId, epoch);
  }
}

function assertDeviceWipeAccess(
  profileId: string | undefined,
  authorization?: DeviceProfileWipeGuard,
): void {
  if (!getDurableStorage()) return;
  const pending = readDeviceProfileWipeGuard(profileId);
  if (!pending) return;
  if (
    authorization &&
    JSON.stringify(pending) === JSON.stringify(authorization)
  ) {
    return;
  }
  throw new DeviceDataWipePendingError();
}

function epochStorageKey(key: string): string {
  return `${EPOCH_STORAGE_PREFIX}${encodeURIComponent(key)}`;
}

function retirementIntentStorageKey(key: string): string {
  return `${RETIREMENT_INTENT_STORAGE_PREFIX}${encodeURIComponent(key)}`;
}

function retirementObservationStorageKey(key: string, epoch: number): string {
  return `${RETIREMENT_OBSERVATION_STORAGE_PREFIX}${encodeURIComponent(key)}:${epoch}`;
}

function retirementObservationKeyPrefix(key: string): string {
  return `${RETIREMENT_OBSERVATION_STORAGE_PREFIX}${encodeURIComponent(key)}:`;
}

function retirementObservationMarkerKey(key: string): string {
  return `${RETIREMENT_OBSERVATION_MARKER_PREFIX}${encodeURIComponent(key)}`;
}

export function isProfileWriteFenceStorageKey(key: string): boolean {
  return (
    key.startsWith(EPOCH_STORAGE_PREFIX) ||
    key.startsWith(RETIREMENT_INTENT_STORAGE_PREFIX) ||
    key.startsWith(RETIREMENT_OBSERVATION_STORAGE_PREFIX) ||
    key.startsWith(RETIREMENT_OBSERVATION_MARKER_PREFIX)
  );
}

/**
 * Clear application localStorage without erasing profile lifetime barriers.
 * A blanket localStorage.clear() would reset retired profiles to epoch zero and
 * let a suspended tab resume an old queued write after a device-data wipe.
 */
export function clearLocalStoragePreservingProfileWriteFences(): void {
  const storage = getDurableStorage();
  if (!storage) return;
  const keysToRemove: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null && !isProfileWriteFenceStorageKey(key)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) storage.removeItem(key);
}

function parseEpoch(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null;
  const epoch = Number(value);
  return Number.isSafeInteger(epoch) && epoch >= 0 ? epoch : null;
}

function getDurableStorage(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
    if (IS_BROWSER_RUNTIME && window.localStorage) return window.localStorage;
  } catch (error) {
    throw new ProfileWriteFenceUnavailableError(
      "Cannot safely access the durable profile write barrier.",
      error,
    );
  }
  if (IS_BROWSER_RUNTIME) {
    throw new ProfileWriteFenceUnavailableError(
      "Cannot safely access the durable profile write barrier.",
    );
  }
  return null;
}

function parseDurableEpoch(raw: string | null): number | null {
  const epoch = parseEpoch(raw);
  if (raw !== null && epoch === null) {
    throw new ProfileWriteFenceUnavailableError(
      "The durable profile write barrier is invalid.",
    );
  }
  return epoch;
}

type DurableEpochSnapshot = {
  signature: string;
  epoch: number;
  committedEpoch: number;
  retirementIntentEpoch: number;
};

function readObservedRetirementEpoch(
  storage: Storage,
  key: string,
): { epoch: number; signature: string } {
  let snapshot;
  try {
    const prefix = retirementObservationKeyPrefix(key);
    snapshot = captureStableDurableStorageSnapshot(storage, {
      maximumKeys: MAX_STORAGE_KEYS_TO_SCAN,
      maximumKeyLength: MAX_STORAGE_KEY_LENGTH,
      maximumSelectedEntries: MAX_OBSERVED_RETIREMENTS_PER_PROFILE,
      maximumSelectedValueLength: String(Number.MAX_SAFE_INTEGER).length,
      select: (storageKey) => storageKey.startsWith(prefix),
    });
  } catch (error) {
    if (error instanceof DurableStorageSnapshotChangedError) {
      throw new ProfileWriteFenceUnavailableError(
        "Cannot safely read observed profile retirements because device storage did not stabilize.",
        error,
      );
    }
    throw new ProfileWriteFenceUnavailableError(
      "Cannot safely read observed profile retirements.",
      error,
    );
  }

  let epoch = 0;
  for (const entry of snapshot.entries) {
    const observedEpoch = parseDurableEpoch(entry.value);
    if (
      observedEpoch === null ||
      retirementObservationStorageKey(key, observedEpoch) !== entry.key
    ) {
      throw new ProfileWriteFenceUnavailableError(
        "The durable profile retirement observation is invalid.",
      );
    }
    epoch = Math.max(epoch, observedEpoch);
  }
  return { epoch, signature: snapshot.signature };
}

function captureDurableEpoch(
  storage: Storage,
  key: string,
): DurableEpochSnapshot {
  let epochRaw: string | null;
  let intentRaw: string | null;
  let observationMarkerRaw: string | null;
  try {
    epochRaw = storage.getItem(epochStorageKey(key));
    intentRaw = storage.getItem(retirementIntentStorageKey(key));
    observationMarkerRaw = storage.getItem(retirementObservationMarkerKey(key));
  } catch (error) {
    throw new ProfileWriteFenceUnavailableError(
      "Cannot safely read the durable profile write barrier.",
      error,
    );
  }
  if (observationMarkerRaw !== null && observationMarkerRaw !== "1") {
    throw new ProfileWriteFenceUnavailableError(
      "The durable profile retirement observation marker is invalid.",
    );
  }
  const observed =
    observationMarkerRaw === "1"
      ? readObservedRetirementEpoch(storage, key)
      : { epoch: 0, signature: "" };
  const committedEpoch = Math.max(
    parseDurableEpoch(epochRaw) ?? 0,
    observed.epoch,
  );
  const retirementIntentEpoch = parseDurableEpoch(intentRaw) ?? 0;
  return {
    signature: JSON.stringify([
      epochRaw,
      intentRaw,
      observationMarkerRaw,
      observed.signature,
    ]),
    epoch: Math.max(committedEpoch, retirementIntentEpoch),
    committedEpoch,
    retirementIntentEpoch,
  };
}

function promoteObservedRetirementIntent(
  storage: Storage,
  key: string,
  targetEpoch: number,
): number {
  const storageKey = epochStorageKey(key);
  let promotionCause: unknown;
  try {
    const current = parseDurableEpoch(storage.getItem(storageKey)) ?? 0;
    if (current >= targetEpoch) return current;
    storage.setItem(storageKey, String(targetEpoch));
    const durable = parseDurableEpoch(storage.getItem(storageKey));
    if (durable !== null && durable >= targetEpoch) return durable;
  } catch (error) {
    if (error instanceof ProfileWriteFenceUnavailableError) throw error;
    promotionCause = error;
  }

  // If compacting the epoch is temporarily unavailable, durably record that
  // another realm adopted the intent. Its owner must then retain the intent on
  // failure instead of rolling a now-observed lifetime back.
  try {
    const observationKey = retirementObservationStorageKey(key, targetEpoch);
    const existing = storage.getItem(observationKey);
    if (existing !== null && parseDurableEpoch(existing) !== targetEpoch) {
      throw new ProfileWriteFenceUnavailableError(
        "The durable profile retirement observation is invalid.",
      );
    }
    if (existing === null) storage.setItem(observationKey, String(targetEpoch));
    const markerKey = retirementObservationMarkerKey(key);
    storage.setItem(markerKey, "1");
    if (
      parseDurableEpoch(storage.getItem(observationKey)) === targetEpoch &&
      storage.getItem(markerKey) === "1"
    ) {
      return targetEpoch;
    }
  } catch (error) {
    throw new ProfileWriteFenceUnavailableError(
      "Cannot safely adopt the pending profile retirement barrier.",
      new AggregateError(
        [promotionCause, error].filter(
          (entry): entry is NonNullable<typeof entry> => entry != null,
        ),
        "Profile retirement adoption could not be persisted.",
      ),
    );
  }
  throw new ProfileWriteFenceUnavailableError(
    "Cannot safely adopt the pending profile retirement barrier.",
    promotionCause,
  );
}

function hasRetirementObservation(key: string, epoch: number): boolean {
  const storage = getDurableStorage();
  if (!storage) return false;
  const raw = storage.getItem(retirementObservationStorageKey(key, epoch));
  if (raw === null) return false;
  if (parseDurableEpoch(raw) !== epoch) {
    throw new ProfileWriteFenceUnavailableError(
      "The durable profile retirement observation is invalid.",
    );
  }
  return true;
}

function clearRetirementObservation(key: string, epoch: number): void {
  try {
    const storage = getDurableStorage();
    if (!storage) return;
    const storageKey = retirementObservationStorageKey(key, epoch);
    if (parseDurableEpoch(storage.getItem(storageKey)) === epoch) {
      storage.removeItem(storageKey);
    }
  } catch {
    // A stale observation is conservative and remains within the fence scope.
  }
}

function readDurableEpoch(key: string): number {
  const storage = getDurableStorage();
  if (!storage) return 0;
  let previous: DurableEpochSnapshot | null = null;
  for (
    let attempt = 0;
    attempt < MAX_STABLE_EPOCH_READ_ATTEMPTS;
    attempt += 1
  ) {
    const snapshot = captureDurableEpoch(storage, key);
    if (snapshot.signature === previous?.signature) {
      if (snapshot.retirementIntentEpoch > snapshot.committedEpoch) {
        // A constructor in another tab may observe an in-progress intent
        // before its owner finishes. Persist that observation monotonically so
        // the owner cannot later roll back a lifetime another realm adopted.
        return promoteObservedRetirementIntent(
          storage,
          key,
          snapshot.retirementIntentEpoch,
        );
      }
      return snapshot.epoch;
    }
    previous = snapshot;
  }
  throw new ProfileWriteFenceUnavailableError(
    "Cannot safely read the durable profile write barrier because it did not stabilize.",
  );
}

function readEpoch(key: string): number {
  const epoch = Math.max(sameRealmEpochs.get(key) ?? 0, readDurableEpoch(key));
  sameRealmEpochs.set(key, epoch);
  return epoch;
}

function writeEpoch(key: string, epoch: number): boolean {
  sameRealmEpochs.set(key, Math.max(sameRealmEpochs.get(key) ?? 0, epoch));
  try {
    const storage = getDurableStorage();
    if (!storage) return false;
    const storageKey = epochStorageKey(key);
    const existing = parseDurableEpoch(storage.getItem(storageKey));
    if (existing !== null && existing > epoch) {
      sameRealmEpochs.set(key, existing);
      return true;
    }
    storage.setItem(storageKey, String(epoch));
    return parseDurableEpoch(storage.getItem(storageKey)) === epoch;
  } catch {
    return false;
  }
}

/**
 * Persist the future lifetime before any destructive callback starts. If the
 * tab crashes after this point, a fresh tab adopts the new lifetime and an old
 * suspended tab fails its next write instead of recreating cleared data.
 */
function writeRetirementIntent(key: string, epoch: number): boolean {
  const storage = getDurableStorage();
  if (!storage) return false;
  try {
    const storageKey = retirementIntentStorageKey(key);
    const existing = parseDurableEpoch(storage.getItem(storageKey));
    if (existing !== null && existing > epoch) {
      throw new Error("A newer profile retirement is already pending.");
    }
    if (existing !== null && existing < epoch) {
      const committed =
        parseDurableEpoch(storage.getItem(epochStorageKey(key))) ?? 0;
      if (committed < existing && !writeEpoch(key, existing)) {
        throw new Error(
          "The previously adopted profile retirement could not be compacted.",
        );
      }
    }
    storage.setItem(storageKey, String(epoch));
    if (parseDurableEpoch(storage.getItem(storageKey)) === epoch) {
      if (existing !== null && existing < epoch) {
        clearRetirementObservation(key, existing);
      }
      return true;
    }
  } catch {
    // Throw the same stable error below. Destructive work has not started.
  }
  throw new ProfileWriteFenceUnavailableError(
    "Cannot safely clear this profile because its cross-tab retirement barrier could not be persisted.",
  );
}

function clearRetirementIntent(key: string, epoch: number): boolean {
  try {
    const storage = getDurableStorage();
    if (!storage) return true;
    const storageKey = retirementIntentStorageKey(key);
    if (parseDurableEpoch(storage.getItem(storageKey)) === epoch) {
      storage.removeItem(storageKey);
    }
    return parseDurableEpoch(storage.getItem(storageKey)) !== epoch;
  } catch {
    // Leaving the intent in place is fail-closed: the old lifetime stays stale.
    return false;
  }
}

let retirementChannel: BroadcastChannel | null = null;
try {
  if (typeof BroadcastChannel !== "undefined") {
    retirementChannel = new BroadcastChannel(RETIRE_CHANNEL_NAME);
    retirementChannel.onmessage = (event) => {
      const message = event.data as { key?: unknown; epoch?: unknown } | null;
      if (
        !message ||
        typeof message.key !== "string" ||
        typeof message.epoch !== "number" ||
        !Number.isSafeInteger(message.epoch) ||
        message.epoch < 0
      ) {
        return;
      }
      const current = readEpoch(message.key);
      if (message.epoch > current) writeEpoch(message.key, message.epoch);
      notifyRetired(message.key, message.epoch);
    };
  }
} catch {
  retirementChannel = null;
}

function notifyRetired(key: string, epoch: number): void {
  for (const listener of retiredListeners.get(key) ?? []) {
    try {
      listener(epoch);
    } catch {
      // One view must not prevent the other profile containers from clearing.
    }
  }
}

function publishRetired(key: string, epoch: number): void {
  notifyRetired(key, epoch);
  try {
    retirementChannel?.postMessage({ key, epoch });
  } catch {
    // Same-realm invalidation and the persisted epoch still fail closed.
  }
}

async function withWebLock<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  let locks: LockManager | undefined;
  try {
    locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  } catch (error) {
    throw new ProfileWriteFenceUnavailableError(
      "Cannot safely serialize profile writes across browser contexts.",
      error,
    );
  }
  if (!locks || typeof locks.request !== "function") {
    if (IS_BROWSER_RUNTIME) {
      throw new ProfileWriteFenceUnavailableError(
        "Cannot safely write profile data because Web Locks are unavailable.",
      );
    }
    return operation();
  }
  return locks.request(
    `${WEB_LOCK_PREFIX}${key}`,
    { mode: "exclusive" },
    operation,
  );
}

function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = sameRealmQueues.get(key) ?? Promise.resolve();
  const result = previous
    .catch(() => undefined)
    .then(() => withWebLock(key, operation));
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  sameRealmQueues.set(key, tail);
  void tail.then(() => {
    if (sameRealmQueues.get(key) === tail) sameRealmQueues.delete(key);
  });
  return result;
}

function createLease(key: string, epoch: number): ProfileWriteFenceLease {
  return { key, epoch, [leaseBrand]: true };
}

function isLeaseCurrent(
  lease: ProfileWriteFenceLease | undefined,
  key: string,
  epoch: number,
): lease is ProfileWriteFenceLease {
  return Boolean(
    lease &&
    lease[leaseBrand] === true &&
    lease.key === key &&
    lease.epoch === epoch,
  );
}

export class ProfileWriteFence {
  readonly key: string;
  readonly epoch: number;
  readonly profileId: string | undefined;

  constructor(profileId?: string) {
    this.profileId = profileId;
    this.key = profileKey(profileId);
    // Nested persistence helpers constructed by a retirement callback must use
    // its still-valid lease even though the durable future epoch is already
    // visible to every other realm.
    this.epoch =
      activeRetirementLeases.get(this.key)?.epoch ?? readEpoch(this.key);
    // Only authenticated browser profiles participate in the durable device
    // catalog. Test/worker stores may use opaque namespace ids and have no
    // same-origin localStorage to enumerate during a user-initiated wipe.
    registerBrowserDeviceProfile(profileId, this.epoch);
  }

  run<T>(
    operation: (lease: ProfileWriteFenceLease) => Promise<T>,
    existingLease?: ProfileWriteFenceLease,
  ): Promise<T> {
    return this.runInternal(operation, existingLease);
  }

  private runInternal<T>(
    operation: (lease: ProfileWriteFenceLease) => Promise<T>,
    existingLease?: ProfileWriteFenceLease,
    deviceWipeAuthorization?: DeviceProfileWipeGuard,
  ): Promise<T> {
    if (existingLease) {
      if (
        isLeaseCurrent(existingLease, this.key, this.epoch) &&
        activeRetirementLeases.get(this.key) === existingLease
      ) {
        return operation(existingLease);
      }
      if (
        !isLeaseCurrent(existingLease, this.key, this.epoch) ||
        activeWriteLeases.get(this.key) !== existingLease ||
        readEpoch(this.key) !== this.epoch
      ) {
        return Promise.reject(new StaleProfileWriteError());
      }
      return operation(existingLease);
    }

    return enqueue(this.key, async () => {
      assertDeviceWipeAccess(this.profileId, deviceWipeAuthorization);
      if (readEpoch(this.key) !== this.epoch) {
        throw new StaleProfileWriteError();
      }
      const lease = createLease(this.key, this.epoch);
      activeWriteLeases.set(this.key, lease);
      try {
        return await operation(lease);
      } finally {
        if (activeWriteLeases.get(this.key) === lease) {
          activeWriteLeases.delete(this.key);
        }
      }
    });
  }

  /**
   * Run the final clear while holding the profile lock, then invalidate every
   * client that captured the old profile lifetime. A failed/aborted clear does
   * not advance the epoch, so a same-account relogin remains usable.
   */
  retire<T>(
    operation: (lease: ProfileWriteFenceLease) => Promise<T>,
    existingLease?: ProfileWriteFenceLease,
  ): Promise<T> {
    return this.retireInternal(operation, existingLease);
  }

  private retireInternal<T>(
    operation: (lease: ProfileWriteFenceLease) => Promise<T>,
    existingLease?: ProfileWriteFenceLease,
    deviceWipeAuthorization?: DeviceProfileWipeGuard,
  ): Promise<T> {
    const retireWithLease = async (lease: ProfileWriteFenceLease) => {
      if (this.epoch >= Number.MAX_SAFE_INTEGER) {
        throw new Error(
          "This profile write lifetime can no longer be retired safely.",
        );
      }
      const nextEpoch = this.epoch + 1;
      const hasDurableIntent = writeRetirementIntent(this.key, nextEpoch);
      activeRetirementLeases.set(this.key, lease);
      let result: T;
      try {
        result = await operation(lease);
      } catch (error) {
        if (activeRetirementLeases.get(this.key) === lease) {
          activeRetirementLeases.delete(this.key);
        }
        let intentWasObserved = false;
        if (hasDurableIntent) {
          try {
            intentWasObserved = hasRetirementObservation(this.key, nextEpoch);
          } catch {
            // Unreadable/corrupt ownership state cannot authorize rollback.
            intentWasObserved = true;
          }
        }
        const rolledBack =
          !hasDurableIntent ||
          (!intentWasObserved && clearRetirementIntent(this.key, nextEpoch));
        const effectiveEpoch = rolledBack
          ? readDurableEpoch(this.key)
          : Math.max(readDurableEpoch(this.key), nextEpoch);
        sameRealmEpochs.set(this.key, effectiveEpoch);
        if (effectiveEpoch > this.epoch) {
          publishRetired(this.key, effectiveEpoch);
        }
        throw error;
      }
      if (activeRetirementLeases.get(this.key) === lease) {
        activeRetirementLeases.delete(this.key);
      }
      // Commit the compact epoch record when possible. If that final write is
      // unavailable, retain the already-durable intent as the same barrier.
      if (writeEpoch(this.key, nextEpoch) && hasDurableIntent) {
        clearRetirementIntent(this.key, nextEpoch);
        clearRetirementObservation(this.key, nextEpoch);
      }
      // Catalog the committed future lifetime after the destructive callback.
      // If this fails, the retirement barrier remains committed and callers
      // receive an error so a fresh fence can repair the append-only catalog.
      let catalogFailure: { error: unknown } | null = null;
      try {
        registerBrowserDeviceProfile(this.profileId, nextEpoch);
      } catch (error) {
        catalogFailure = { error };
      }
      publishRetired(this.key, nextEpoch);
      if (catalogFailure) throw catalogFailure.error;
      return result;
    };

    if (existingLease) {
      assertDeviceWipeAccess(this.profileId, deviceWipeAuthorization);
      if (
        !isLeaseCurrent(existingLease, this.key, this.epoch) ||
        activeWriteLeases.get(this.key) !== existingLease ||
        readEpoch(this.key) !== this.epoch
      ) {
        return Promise.reject(new StaleProfileWriteError());
      }
      return retireWithLease(existingLease);
    }

    return enqueue(this.key, async () => {
      assertDeviceWipeAccess(this.profileId, deviceWipeAuthorization);
      if (readEpoch(this.key) !== this.epoch) {
        throw new StaleProfileWriteError();
      }
      return retireWithLease(createLease(this.key, this.epoch));
    });
  }

  /**
   * Clear one profile for the exact durable device-wipe claim. The first
   * successful pass retires the captured lifetime; a crash after retirement
   * but before the journal checkpoint safely replays in the already-retired
   * lifetime while the guard continues to reject ordinary writers.
   */
  runDeviceDataWipe<T>(
    guard: DeviceProfileWipeGuard,
    operation: (lease: ProfileWriteFenceLease) => Promise<T>,
  ): Promise<T> {
    if (
      guard.profileId !== (this.profileId ?? null) ||
      (this.epoch !== guard.expectedEpoch && this.epoch !== guard.targetEpoch)
    ) {
      return Promise.reject(
        new Error("The profile lifetime no longer matches its device-wipe guard."),
      );
    }
    return this.epoch === guard.expectedEpoch
      ? this.retireInternal(operation, undefined, guard)
      : this.runInternal(operation, undefined, guard);
  }

  subscribeRetired(listener: RetiredListener): () => void {
    const listeners =
      retiredListeners.get(this.key) ?? new Set<RetiredListener>();
    listeners.add(listener);
    retiredListeners.set(this.key, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) retiredListeners.delete(this.key);
    };
  }
}
