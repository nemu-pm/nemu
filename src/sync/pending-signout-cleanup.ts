import {
  ProfileWriteFence,
  type ProfileWriteFenceLease,
} from "@/data/profile-write-fence";

const DB_NAME = "nemu-security-state";
const DB_VERSION = 1;
const STORE_NAME = "pending-profile-cleanups";
const LOCAL_STORAGE_KEY = "nemu:pending-signout-cleanups";

export type PendingSignOutCleanup = {
  version: 2;
  status: "pending";
  operationId: string;
  profileSequence: number;
  profileId: string;
  userId: string;
  keepData: boolean;
  cleanupStage: 0 | 1;
  expectedGeneration: number | null;
  remoteConfirmedAt: number;
};

type CompletedSignOutCleanup = {
  version: 2;
  status: "completed";
  operationId: string;
  profileSequence: number;
  profileId: string;
  remoteConfirmedAt: number;
  completedAt: number;
};

type SignOutCleanupRecord = PendingSignOutCleanup | CompletedSignOutCleanup;

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isGeneration(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isSafeInteger(value) && value >= 0)
  );
}

function hasRecordIdentity(
  record: Partial<SignOutCleanupRecord> | null,
): record is Partial<SignOutCleanupRecord> & {
  version: 2;
  operationId: string;
  profileSequence: number;
  profileId: string;
  remoteConfirmedAt: number;
} {
  return Boolean(
    record &&
    record.version === 2 &&
    typeof record.operationId === "string" &&
    record.operationId.length > 0 &&
    typeof record.profileSequence === "number" &&
    Number.isSafeInteger(record.profileSequence) &&
    record.profileSequence > 0 &&
    typeof record.profileId === "string" &&
    record.profileId.startsWith("user:") &&
    isTimestamp(record.remoteConfirmedAt),
  );
}

function isPendingCleanup(value: unknown): value is PendingSignOutCleanup {
  const marker = value as Partial<PendingSignOutCleanup> | null;
  return Boolean(
    hasRecordIdentity(marker) &&
    marker.status === "pending" &&
    typeof marker.userId === "string" &&
    marker.userId.length > 0 &&
    marker.profileId === `user:${marker.userId}` &&
    typeof marker.keepData === "boolean" &&
    (marker.cleanupStage === 0 || marker.cleanupStage === 1) &&
    (marker.cleanupStage === 0 || marker.expectedGeneration === null) &&
    isGeneration(marker.expectedGeneration),
  );
}

function isCompletedCleanup(value: unknown): value is CompletedSignOutCleanup {
  const marker = value as Partial<CompletedSignOutCleanup> | null;
  return Boolean(
    hasRecordIdentity(marker) &&
    marker.status === "completed" &&
    isTimestamp(marker.completedAt) &&
    marker.completedAt >= marker.remoteConfirmedAt,
  );
}

function isCleanupRecord(value: unknown): value is SignOutCleanupRecord {
  return isPendingCleanup(value) || isCompletedCleanup(value);
}

function readLocalRecords(): SignOutCleanupRecord[] {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(LOCAL_STORAGE_KEY) ?? "[]",
    ) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isCleanupRecord) : [];
  } catch {
    return [];
  }
}

function writeLocalRecord(record: SignOutCleanupRecord): void {
  const records = readLocalRecords().filter(
    (entry) => entry.profileId !== record.profileId,
  );
  records.push(record);
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
}

function deleteLocalRecord(profileId: string): void {
  const records = readLocalRecords().filter(
    (entry) => entry.profileId !== profileId,
  );
  if (records.length === 0) {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } else {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(records));
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "profileId" });
      }
    };
  });
}

async function putIndexedDbRecord(record: SignOutCleanupRecord): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Cleanup marker save failed."));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("Cleanup marker save aborted."));
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

async function getIndexedDbRecords(): Promise<SignOutCleanupRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).getAll();
    let records: SignOutCleanupRecord[] = [];
    request.onsuccess = () => {
      records = request.result.filter(isCleanupRecord);
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Cleanup marker load failed."));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("Cleanup marker load aborted."));
    };
    tx.oncomplete = () => {
      db.close();
      resolve(records);
    };
  });
}

async function deleteIndexedDbRecord(profileId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(profileId);
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error("Cleanup marker delete failed."));
    };
    tx.onabort = () => {
      db.close();
      reject(tx.error ?? new Error("Cleanup marker delete aborted."));
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
  });
}

function pendingRecordsFrom(
  records: SignOutCleanupRecord[],
): PendingSignOutCleanup[] {
  const byProfile = new Map<string, SignOutCleanupRecord[]>();
  for (const record of records) {
    const existing = byProfile.get(record.profileId) ?? [];
    existing.push(record);
    byProfile.set(record.profileId, existing);
  }

  const pending: PendingSignOutCleanup[] = [];
  for (const profileRecords of byProfile.values()) {
    const latestCompletion = profileRecords
      .filter(isCompletedCleanup)
      .sort((a, b) => b.profileSequence - a.profileSequence)[0];
    const candidate = profileRecords
      .filter(isPendingCleanup)
      .filter(
        (marker) =>
          !latestCompletion ||
          (marker.operationId !== latestCompletion.operationId &&
            marker.profileSequence > latestCompletion.profileSequence),
      )
      .sort((a, b) => {
        if (a.profileSequence !== b.profileSequence) {
          return b.profileSequence - a.profileSequence;
        }
        if (a.cleanupStage !== b.cleanupStage) {
          return b.cleanupStage - a.cleanupStage;
        }
        return b.operationId.localeCompare(a.operationId);
      })[0];
    if (candidate) pending.push(candidate);
  }
  return pending.sort((a, b) => a.profileId.localeCompare(b.profileId));
}

type PendingSignOutCleanupInput = Pick<
  PendingSignOutCleanup,
  | "profileId"
  | "userId"
  | "keepData"
  | "expectedGeneration"
  | "remoteConfirmedAt"
>;

function generateOperationId(): string {
  let cause: unknown;
  try {
    const cryptography = globalThis.crypto;
    if (cryptography && typeof cryptography.randomUUID === "function") {
      try {
        return cryptography.randomUUID();
      } catch (error) {
        cause = error;
      }
    }
    if (cryptography && typeof cryptography.getRandomValues === "function") {
      try {
        const bytes = cryptography.getRandomValues(new Uint8Array(16));
        // Preserve UUID-compatible version/variant bits for readable logs.
        bytes[6] = (bytes[6]! & 0x0f) | 0x40;
        bytes[8] = (bytes[8]! & 0x3f) | 0x80;
        const hex = [...bytes].map((byte) =>
          byte.toString(16).padStart(2, "0"),
        );
        return [
          hex.slice(0, 4).join(""),
          hex.slice(4, 6).join(""),
          hex.slice(6, 8).join(""),
          hex.slice(8, 10).join(""),
          hex.slice(10).join(""),
        ].join("-");
      } catch (error) {
        cause = error;
      }
    }
  } catch (error) {
    cause = error;
  }
  throw new Error(
    "Cannot safely create a durable sign-out cleanup operation because secure randomness is unavailable.",
    cause === undefined ? undefined : { cause },
  );
}

/**
 * Allocate and persist a profile-local logical operation number.
 *
 * Wall clocks can move backwards. Ordering a later explicit sign-out by this
 * durable sequence prevents an older completion tombstone in one backend from
 * suppressing the newer marker stored in the other backend.
 */
export async function persistPendingSignOutCleanup(
  input: PendingSignOutCleanupInput,
  lease?: ProfileWriteFenceLease,
): Promise<PendingSignOutCleanup> {
  if (
    input.profileId !== `user:${input.userId}` ||
    !isGeneration(input.expectedGeneration) ||
    !isTimestamp(input.remoteConfirmedAt)
  ) {
    throw new Error("Refusing to persist an invalid sign-out cleanup marker.");
  }

  return new ProfileWriteFence(input.profileId).run(async () => {
    const records = readLocalRecords();
    try {
      records.push(...(await getIndexedDbRecords()));
    } catch {
      // The remaining backend can still preserve the operation.
    }
    const profileSequence =
      records
        .filter((record) => record.profileId === input.profileId)
        .reduce(
          (maximum, record) => Math.max(maximum, record.profileSequence),
          0,
        ) + 1;
    const marker: PendingSignOutCleanup = {
      version: 2,
      status: "pending",
      operationId: generateOperationId(),
      profileSequence,
      cleanupStage: 0,
      ...input,
    };
    await savePendingSignOutCleanup(marker);
    return marker;
  }, lease);
}

/**
 * Record that canonical account data committed its clear and only the separate
 * source-settings database remains. Callers must restore the account snapshot
 * if this redundant write fails, keeping the durable marker and local phase in
 * agreement.
 */
export async function advancePendingSignOutCleanupToSourceSettings(
  marker: PendingSignOutCleanup,
  lease?: ProfileWriteFenceLease,
): Promise<PendingSignOutCleanup> {
  if (!isPendingCleanup(marker)) {
    throw new Error("Refusing to advance an invalid sign-out cleanup marker.");
  }
  if (marker.cleanupStage === 1) return marker;
  return new ProfileWriteFence(marker.profileId).run(async () => {
    const advanced: PendingSignOutCleanup = {
      ...marker,
      cleanupStage: 1,
      expectedGeneration: null,
    };
    await savePendingSignOutCleanup(advanced);
    return advanced;
  }, lease);
}

/** Persist redundantly so a post-logout cleanup failure remains recoverable. */
export async function savePendingSignOutCleanup(
  marker: PendingSignOutCleanup,
): Promise<void> {
  if (!isPendingCleanup(marker)) {
    throw new Error("Refusing to persist an invalid sign-out cleanup marker.");
  }
  const results = await Promise.allSettled([
    Promise.resolve().then(() => writeLocalRecord(marker)),
    putIndexedDbRecord(marker),
  ]);
  if (results.every((result) => result.status === "rejected")) {
    throw new Error(
      "Remote sign-out was confirmed, but cleanup recovery could not be persisted.",
    );
  }
}

export async function listPendingSignOutCleanups(): Promise<
  PendingSignOutCleanup[]
> {
  const localRecords = readLocalRecords();
  let indexedDbRecords: SignOutCleanupRecord[] = [];
  try {
    indexedDbRecords = await getIndexedDbRecords();
  } catch {
    // localStorage remains a durable fallback.
  }
  return pendingRecordsFrom([...localRecords, ...indexedDbRecords]);
}

/**
 * Mark one exact remote-confirmed operation complete before compacting it.
 *
 * If only one backend accepts the completion tombstone, retain it there. It
 * suppresses a stale pending copy in the other backend on the next startup.
 */
export async function deletePendingSignOutCleanup(
  marker: PendingSignOutCleanup,
): Promise<void> {
  if (!isPendingCleanup(marker)) {
    throw new Error("Refusing to complete an invalid sign-out cleanup marker.");
  }
  await new ProfileWriteFence(marker.profileId).run(async () => {
    const completion: CompletedSignOutCleanup = {
      version: 2,
      status: "completed",
      operationId: marker.operationId,
      profileSequence: marker.profileSequence,
      profileId: marker.profileId,
      remoteConfirmedAt: marker.remoteConfirmedAt,
      completedAt: Math.max(Date.now(), marker.remoteConfirmedAt),
    };
    const completed = await Promise.allSettled([
      Promise.resolve().then(() => writeLocalRecord(completion)),
      putIndexedDbRecord(completion),
    ]);
    if (completed.every((result) => result.status === "rejected")) {
      throw new Error("Completed cleanup marker could not be recorded.");
    }

    // Both stores now agree that this operation is complete, so its tombstone
    // can be compacted. With only one acknowledgement it must remain durable
    // to dominate the other backend's stale pending record.
    if (completed.every((result) => result.status === "fulfilled")) {
      await Promise.allSettled([
        Promise.resolve().then(() => deleteLocalRecord(marker.profileId)),
        deleteIndexedDbRecord(marker.profileId),
      ]);
    }
  });
}
