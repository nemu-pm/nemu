import { isDeviceDataProfileId } from "./device-profile-catalog";
import { isDeviceProfileWipeGuardStorageKey } from "./device-profile-wipe-guard";
import {
  captureDurableStorageSnapshot,
  DurableStorageSnapshotChangedError,
} from "./durable-storage-snapshot";
import { isProfileWriteFenceStorageKey } from "./profile-write-fence";

const JOURNAL_STORAGE_KEY = "nemu:pending-device-data-wipe";
const JOURNAL_VERSION = 1;
const DEVICE_WIPE_LOCK_NAME = "nemu:device-data-wipe";
const MAX_PROFILES = 128;
const MAX_DATABASES = 16;
const MAX_LOCAL_STORAGE_KEYS = 2_048;
const MAX_COOKIE_NAMES = 128;
const MAX_KEY_LENGTH = 4_096;
const MAX_OPERATION_ID_LENGTH = 128;
const MAX_JOURNAL_LENGTH = 512 * 1_024;
const SHA_256_HEX_LENGTH = 64;
const MAX_OWNED_STORAGE_VALUE_LENGTH = 256 * 1_024;
const MAX_VISIBLE_COOKIE_VALUE_LENGTH = 4_096;
const MAX_STABLE_SCOPE_CAPTURE_ATTEMPTS = 4;

const NEMU_LEGACY_LOCAL_STORAGE_KEYS = new Set([
  "library_last_refresh",
  "search-selected-sources",
  "better-auth_cookie",
  "better-auth_session_data",
]);
const NEMU_LEGACY_LOCAL_STORAGE_PREFIXES = ["aidoku_defaults_"] as const;
const NEMU_VISIBLE_COOKIE_NAMES = new Set(["sidebar_state"]);

const NEMU_NON_PROFILE_DATABASES = new Set([
  "nemu-cache",
  "nemu-plugins",
  "nemu-security-state",
]);

export type DeviceDataWipeProfile = {
  profileId: string | null;
  expectedEpoch: number;
};

export type DeviceDataWipeLocalStorageEntry = {
  key: string;
  fingerprint: string;
};

export type DeviceDataWipeCookie = {
  name: string;
  fingerprint: string;
};

export type DeviceDataWipeClientStorageClearPlan = {
  localStorageEntries: Array<{ key: string; value: string }>;
  sessionStorageEntries: Array<{ key: string; value: string }>;
  cookies: Array<{ name: string; value: string }>;
};

export type PendingDeviceDataWipe = {
  version: 1;
  status: "pending";
  operationId: string;
  createdAt: number;
  initiatingProfileId: string | null;
  remoteSignOutConfirmed: boolean;
  profiles: DeviceDataWipeProfile[];
  completedProfiles: DeviceDataWipeProfile[];
  databases: string[];
  completedDatabases: string[];
  localStorageEntries: DeviceDataWipeLocalStorageEntry[];
  sessionStorageEntries: DeviceDataWipeLocalStorageEntry[];
  cookies: DeviceDataWipeCookie[];
};

const sameRealmWipeQueue: { tail: Promise<void> } = {
  tail: Promise.resolve(),
};

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const required = [...expected].sort();
  return (
    keys.length === required.length &&
    keys.every((key, index) => key === required[index])
  );
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isStoredProfileId(value: unknown): value is string | null {
  return value === null || isDeviceDataProfileId(value);
}

function isProfileScope(value: unknown): value is DeviceDataWipeProfile {
  const profile = value as Partial<DeviceDataWipeProfile> | null;
  return Boolean(
    profile &&
    hasExactKeys(profile, ["profileId", "expectedEpoch"]) &&
    isStoredProfileId(profile.profileId) &&
    typeof profile.expectedEpoch === "number" &&
    Number.isSafeInteger(profile.expectedEpoch) &&
    profile.expectedEpoch >= 0 &&
    profile.expectedEpoch < Number.MAX_SAFE_INTEGER,
  );
}

export function isNemuNonProfileDatabaseName(value: unknown): value is string {
  return typeof value === "string" && NEMU_NON_PROFILE_DATABASES.has(value);
}

function uniqueBoundedArray<T>(
  value: unknown,
  maximum: number,
  predicate: (entry: unknown) => entry is T,
): value is T[] {
  if (!Array.isArray(value) || value.length > maximum) return false;
  const seen = new Set<string>();
  for (const entry of value) {
    if (!predicate(entry)) return false;
    const identity = JSON.stringify(entry);
    if (seen.has(identity)) return false;
    seen.add(identity);
  }
  return true;
}

function uniqueProfileScopeArray(
  value: unknown,
): value is DeviceDataWipeProfile[] {
  if (!Array.isArray(value) || value.length > MAX_PROFILES) return false;
  const profiles = new Set<string>();
  for (const entry of value) {
    if (!isProfileScope(entry)) return false;
    const identity = entry.profileId ?? "";
    if (profiles.has(identity)) return false;
    profiles.add(identity);
  }
  return true;
}

function isStorageKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_KEY_LENGTH &&
    (value.startsWith("nemu:") ||
      NEMU_LEGACY_LOCAL_STORAGE_KEYS.has(value) ||
      NEMU_LEGACY_LOCAL_STORAGE_PREFIXES.some((prefix) =>
        value.startsWith(prefix),
      )) &&
    value !== JOURNAL_STORAGE_KEY &&
    !isProfileWriteFenceStorageKey(value) &&
    !isDeviceProfileWipeGuardStorageKey(value) &&
    !value.startsWith("nemu:device-profile-catalog:")
  );
}

function hasCookieControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isCookieName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    NEMU_VISIBLE_COOKIE_NAMES.has(value) &&
    value.length > 0 &&
    value.length <= 256 &&
    !value.includes("=") &&
    !value.includes(";") &&
    !hasCookieControlCharacters(value)
  );
}

function isFingerprint(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length === SHA_256_HEX_LENGTH &&
    [...value].every(
      (character) =>
        (character >= "0" && character <= "9") ||
        (character >= "a" && character <= "f"),
    )
  );
}

function isLocalStorageEntry(
  value: unknown,
): value is DeviceDataWipeLocalStorageEntry {
  const entry = value as Partial<DeviceDataWipeLocalStorageEntry> | null;
  return Boolean(
    entry &&
    hasExactKeys(entry, ["key", "fingerprint"]) &&
    isStorageKey(entry.key) &&
    isFingerprint(entry.fingerprint),
  );
}

function isCookie(value: unknown): value is DeviceDataWipeCookie {
  const cookie = value as Partial<DeviceDataWipeCookie> | null;
  return Boolean(
    cookie &&
    hasExactKeys(cookie, ["name", "fingerprint"]) &&
    isCookieName(cookie.name) &&
    isFingerprint(cookie.fingerprint),
  );
}

function isSubset<T>(subset: T[], superset: T[]): boolean {
  const allowed = new Set(superset.map((entry) => JSON.stringify(entry)));
  return subset.every((entry) => allowed.has(JSON.stringify(entry)));
}

export function isPendingDeviceDataWipe(
  value: unknown,
): value is PendingDeviceDataWipe {
  const journal = value as Partial<PendingDeviceDataWipe> | null;
  return Boolean(
    journal &&
    hasExactKeys(journal, [
      "version",
      "status",
      "operationId",
      "createdAt",
      "initiatingProfileId",
      "remoteSignOutConfirmed",
      "profiles",
      "completedProfiles",
      "databases",
      "completedDatabases",
      "localStorageEntries",
      "sessionStorageEntries",
      "cookies",
    ]) &&
    journal.version === JOURNAL_VERSION &&
    journal.status === "pending" &&
    typeof journal.operationId === "string" &&
    journal.operationId.length > 0 &&
    journal.operationId.length <= MAX_OPERATION_ID_LENGTH &&
    isTimestamp(journal.createdAt) &&
    isStoredProfileId(journal.initiatingProfileId) &&
    typeof journal.remoteSignOutConfirmed === "boolean" &&
    uniqueProfileScopeArray(journal.profiles) &&
    journal.profiles.length > 0 &&
    (journal.initiatingProfileId === null ||
      journal.profiles.some(
        (profile) => profile.profileId === journal.initiatingProfileId,
      )) &&
    uniqueProfileScopeArray(journal.completedProfiles) &&
    isSubset(journal.completedProfiles, journal.profiles) &&
    uniqueBoundedArray(
      journal.databases,
      MAX_DATABASES,
      isNemuNonProfileDatabaseName,
    ) &&
    uniqueBoundedArray(
      journal.completedDatabases,
      MAX_DATABASES,
      isNemuNonProfileDatabaseName,
    ) &&
    isSubset(journal.completedDatabases, journal.databases) &&
    uniqueBoundedArray(
      journal.localStorageEntries,
      MAX_LOCAL_STORAGE_KEYS,
      isLocalStorageEntry,
    ) &&
    uniqueBoundedArray(
      journal.sessionStorageEntries,
      MAX_LOCAL_STORAGE_KEYS,
      isLocalStorageEntry,
    ) &&
    uniqueBoundedArray(journal.cookies, MAX_COOKIE_NAMES, isCookie),
  );
}

function parseJournal(raw: string | null): PendingDeviceDataWipe | null {
  if (raw === null || raw.length > MAX_JOURNAL_LENGTH) return null;
  try {
    const value = JSON.parse(raw) as unknown;
    return isPendingDeviceDataWipe(value) ? value : null;
  } catch {
    return null;
  }
}

export class DeviceDataWipeJournalUnavailableError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "DeviceDataWipeJournalUnavailableError";
  }
}

export function readPendingDeviceDataWipe(): PendingDeviceDataWipe | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(JOURNAL_STORAGE_KEY);
  } catch (error) {
    throw new DeviceDataWipeJournalUnavailableError(
      "Cannot safely read the pending device-data wipe journal.",
      error,
    );
  }
  if (raw === null) return null;
  const journal = parseJournal(raw);
  if (!journal) {
    throw new DeviceDataWipeJournalUnavailableError(
      "The pending device-data wipe journal is invalid.",
    );
  }
  return journal;
}

export function isDeviceDataWipeJournalStorageKey(key: string): boolean {
  return key === JOURNAL_STORAGE_KEY;
}

function writeJournal(journal: PendingDeviceDataWipe): void {
  if (!isPendingDeviceDataWipe(journal)) {
    throw new Error("Refusing to persist an invalid device-data wipe journal.");
  }
  const serialized = JSON.stringify(journal);
  if (serialized.length > MAX_JOURNAL_LENGTH) {
    throw new Error(
      "The device-data wipe scope is too large to persist safely.",
    );
  }
  try {
    localStorage.setItem(JOURNAL_STORAGE_KEY, serialized);
    const durable = parseJournal(localStorage.getItem(JOURNAL_STORAGE_KEY));
    if (!durable || JSON.stringify(durable) !== serialized) {
      throw new Error("Device-data wipe journal verification failed.");
    }
  } catch (error) {
    throw new Error(
      "Cannot safely clear device data because its recovery journal could not be persisted.",
      { cause: error },
    );
  }
}

function generateOperationId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  throw new Error(
    "Cannot safely start device-data cleanup because secure randomness is unavailable.",
  );
}

function sortedProfiles(
  profiles: Iterable<DeviceDataWipeProfile>,
): DeviceDataWipeProfile[] {
  const byProfile = new Map<string, DeviceDataWipeProfile>();
  for (const profile of profiles) {
    if (!isProfileScope(profile)) {
      throw new Error(
        "Refusing to create an invalid device-data wipe profile scope.",
      );
    }
    const identity = profile.profileId ?? "";
    const existing = byProfile.get(identity);
    if (existing && existing.expectedEpoch !== profile.expectedEpoch) {
      throw new Error(
        `Refusing to clear ${profile.profileId ?? "the local profile"} because its discovered write epochs conflict.`,
      );
    }
    if (!existing) byProfile.set(identity, profile);
  }
  return [...byProfile.values()].sort((left, right) =>
    (left.profileId ?? "").localeCompare(right.profileId ?? ""),
  );
}

function sortedStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

async function fingerprintValue(
  kind: "localStorage" | "sessionStorage" | "cookie",
  name: string,
  value: string,
): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof subtle.digest !== "function") {
    throw new Error(
      "Cannot safely snapshot client storage because SHA-256 is unavailable.",
    );
  }
  const encoded = new TextEncoder().encode(
    JSON.stringify(["nemu-device-data-wipe-v1", kind, name, value]),
  );
  const digest = await subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function captureStorageEntries(
  storage: Storage,
  kind: "localStorage" | "sessionStorage",
): Promise<DeviceDataWipeLocalStorageEntry[]> {
  for (
    let attempt = 0;
    attempt < MAX_STABLE_SCOPE_CAPTURE_ATTEMPTS;
    attempt += 1
  ) {
    let before;
    try {
      before = captureDurableStorageSnapshot(storage, {
        maximumKeys: MAX_LOCAL_STORAGE_KEYS,
        maximumKeyLength: MAX_KEY_LENGTH,
        maximumSelectedEntries: MAX_LOCAL_STORAGE_KEYS,
        maximumSelectedValueLength: MAX_OWNED_STORAGE_VALUE_LENGTH,
        select: isStorageKey,
      });
    } catch (error) {
      if (error instanceof DurableStorageSnapshotChangedError) continue;
      throw new Error(`Cannot safely snapshot device ${kind}.`, {
        cause: error,
      });
    }
    const entries = await Promise.all(
      before.entries.map(async ({ key, value }) => ({
        key,
        fingerprint: await fingerprintValue(kind, key, value),
      })),
    );
    let after;
    try {
      after = captureDurableStorageSnapshot(storage, {
        maximumKeys: MAX_LOCAL_STORAGE_KEYS,
        maximumKeyLength: MAX_KEY_LENGTH,
        maximumSelectedEntries: MAX_LOCAL_STORAGE_KEYS,
        maximumSelectedValueLength: MAX_OWNED_STORAGE_VALUE_LENGTH,
        select: isStorageKey,
      });
    } catch (error) {
      if (error instanceof DurableStorageSnapshotChangedError) continue;
      throw new Error(`Cannot safely snapshot device ${kind}.`, {
        cause: error,
      });
    }
    if (before.signature === after.signature) return entries;
  }
  throw new Error(
    `Cannot safely snapshot device ${kind} because it did not stabilize.`,
  );
}

type RawCookieSnapshot = {
  signature: string;
  cookies: Array<{ name: string; value: string }>;
};

function captureRawCookies(): RawCookieSnapshot {
  if (typeof document === "undefined") {
    return { signature: "[]", cookies: [] };
  }
  let raw: string;
  try {
    raw = document.cookie;
  } catch (error) {
    throw new Error("Cannot safely snapshot device cookies.", { cause: error });
  }
  const cookies: Array<{ name: string; value: string }> = [];
  const seenNames = new Set<string>();
  if (!raw) return { signature: "[]", cookies };
  for (const rawCookie of raw.split(";")) {
    const cookie = rawCookie.trim();
    const separator = cookie.indexOf("=");
    const name = separator < 0 ? cookie : cookie.slice(0, separator);
    const value = separator < 0 ? "" : cookie.slice(separator + 1);
    if (!isCookieName(name)) continue;
    if (seenNames.has(name)) {
      throw new Error("Cannot safely snapshot duplicate Nemu cookies.");
    }
    if (value.length > MAX_VISIBLE_COOKIE_VALUE_LENGTH) {
      throw new Error("Cannot safely snapshot an oversized Nemu cookie.");
    }
    seenNames.add(name);
    cookies.push({ name, value });
  }
  if (cookies.length > MAX_COOKIE_NAMES) {
    throw new Error(
      "Cannot safely clear device data because the visible cookie scope exceeds its supported limit.",
    );
  }
  cookies.sort((left, right) => left.name.localeCompare(right.name));
  return { signature: JSON.stringify(cookies), cookies };
}

async function captureCookies(): Promise<DeviceDataWipeCookie[]> {
  for (
    let attempt = 0;
    attempt < MAX_STABLE_SCOPE_CAPTURE_ATTEMPTS;
    attempt += 1
  ) {
    const before = captureRawCookies();
    const cookies = await Promise.all(
      before.cookies.map(async ({ name, value }) => ({
        name,
        fingerprint: await fingerprintValue("cookie", name, value),
      })),
    );
    if (before.signature === captureRawCookies().signature) return cookies;
  }
  throw new Error(
    "Cannot safely snapshot device cookies because they did not stabilize.",
  );
}

export async function createPendingDeviceDataWipe(input: {
  profiles: Iterable<DeviceDataWipeProfile>;
  databases: Iterable<string>;
  initiatingProfileId?: string;
}): Promise<PendingDeviceDataWipe> {
  if (readPendingDeviceDataWipe()) {
    throw new Error("A device-data wipe is already pending.");
  }
  const journal: PendingDeviceDataWipe = {
    version: JOURNAL_VERSION,
    status: "pending",
    operationId: generateOperationId(),
    createdAt: Math.max(1, Date.now()),
    initiatingProfileId: input.initiatingProfileId ?? null,
    remoteSignOutConfirmed: input.initiatingProfileId === undefined,
    profiles: sortedProfiles(input.profiles),
    completedProfiles: [],
    databases: sortedStrings(input.databases),
    completedDatabases: [],
    localStorageEntries: await captureStorageEntries(
      localStorage,
      "localStorage",
    ),
    sessionStorageEntries:
      typeof sessionStorage === "undefined"
        ? []
        : await captureStorageEntries(sessionStorage, "sessionStorage"),
    cookies: await captureCookies(),
  };
  if (!isPendingDeviceDataWipe(journal)) {
    throw new Error("Refusing to create an unsafe device-data wipe scope.");
  }
  if (readPendingDeviceDataWipe()) {
    throw new Error("A device-data wipe started in another tab.");
  }
  writeJournal(journal);
  return journal;
}

function sameImmutableScope(
  left: PendingDeviceDataWipe,
  right: PendingDeviceDataWipe,
): boolean {
  return (
    left.operationId === right.operationId &&
    left.createdAt === right.createdAt &&
    left.initiatingProfileId === right.initiatingProfileId &&
    JSON.stringify(left.profiles) === JSON.stringify(right.profiles) &&
    JSON.stringify(left.databases) === JSON.stringify(right.databases) &&
    JSON.stringify(left.localStorageEntries) ===
      JSON.stringify(right.localStorageEntries) &&
    JSON.stringify(left.sessionStorageEntries) ===
      JSON.stringify(right.sessionStorageEntries) &&
    JSON.stringify(left.cookies) === JSON.stringify(right.cookies)
  );
}

/**
 * Persist a monotonic checkpoint without allowing a corrupted/stale caller to
 * expand the originally authorized scope.
 */
export function checkpointPendingDeviceDataWipe(
  previous: PendingDeviceDataWipe,
  next: PendingDeviceDataWipe,
): PendingDeviceDataWipe {
  const durable = readPendingDeviceDataWipe();
  if (
    !durable ||
    !sameImmutableScope(previous, durable) ||
    !sameImmutableScope(previous, next) ||
    durable.remoteSignOutConfirmed !== previous.remoteSignOutConfirmed ||
    JSON.stringify(durable.completedProfiles) !==
      JSON.stringify(previous.completedProfiles) ||
    JSON.stringify(durable.completedDatabases) !==
      JSON.stringify(previous.completedDatabases) ||
    (previous.remoteSignOutConfirmed && !next.remoteSignOutConfirmed) ||
    !isSubset(previous.completedProfiles, next.completedProfiles) ||
    !isSubset(previous.completedDatabases, next.completedDatabases)
  ) {
    throw new Error(
      "Device-data wipe scope changed while the operation was in progress.",
    );
  }
  writeJournal(next);
  return next;
}

export function deletePendingDeviceDataWipe(
  journal: PendingDeviceDataWipe,
): void {
  const durable = readPendingDeviceDataWipe();
  if (
    !durable ||
    !sameImmutableScope(journal, durable) ||
    JSON.stringify(journal) !== JSON.stringify(durable) ||
    !journal.remoteSignOutConfirmed ||
    journal.completedProfiles.length !== journal.profiles.length ||
    journal.completedDatabases.length !== journal.databases.length
  ) {
    throw new Error(
      "Device-data wipe journal changed before it could be completed.",
    );
  }
  try {
    localStorage.removeItem(JOURNAL_STORAGE_KEY);
    if (localStorage.getItem(JOURNAL_STORAGE_KEY) !== null) {
      throw new Error("Device-data wipe journal removal failed.");
    }
  } catch (error) {
    throw new Error(
      "Completed device-data wipe recovery could not be removed.",
      {
        cause: error,
      },
    );
  }
}

async function withWebLock<T>(operation: () => Promise<T>): Promise<T> {
  let locks: LockManager | undefined;
  try {
    locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  } catch (error) {
    throw new DeviceDataWipeJournalUnavailableError(
      "Cannot safely serialize device-data cleanup across browser contexts.",
      error,
    );
  }
  if (!locks || typeof locks.request !== "function") {
    // There is no browser primitive with localStorage's synchronous API that
    // can provide a crash-safe, non-stealable mutex. A module queue is enough
    // for SSR/tests, but a destructive browser operation must fail closed
    // rather than let two tabs snapshot, sign out, and clear concurrently.
    if (typeof window !== "undefined") {
      throw new DeviceDataWipeJournalUnavailableError(
        "Cannot safely serialize device-data cleanup because Web Locks are unavailable.",
      );
    }
    return operation();
  }
  return locks.request(DEVICE_WIPE_LOCK_NAME, { mode: "exclusive" }, operation);
}

/** Serialize snapshot/sign-out/clear/checkpoint work in this realm and tab set. */
export function withDeviceDataWipeLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const previous = sameRealmWipeQueue.tail;
  const result = previous
    .catch(() => undefined)
    .then(() => withWebLock(operation));
  sameRealmWipeQueue.tail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
