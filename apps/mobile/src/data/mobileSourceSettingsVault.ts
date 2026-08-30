import {
  bytesToBase64Url,
  isSafeSourceSettingValueKey,
  sanitizeSourceSettingValues,
  sha256Bytes,
} from "@nemu/core";
import type { NativeKVStore } from "./contracts";
import { SecureNativeKVStore } from "./nativeKV";
import type { LocalSourceSettings } from "./schema";

const SOURCE_SETTINGS_VAULT_VERSION = 1;
const SOURCE_SETTINGS_VAULT_MAX_ENTRIES = 512;
const SOURCE_SETTINGS_VAULT_MAX_VALUE_BYTES = 512 * 1024;
const SOURCE_SETTINGS_VAULT_PREFIX = "nemu.mobile.source-settings.v1";
const SOURCE_SETTINGS_CHUNK_FORMAT_VERSION = 2;
const SOURCE_SETTINGS_CHUNK_BYTES = 1_200;
const SOURCE_SETTINGS_CHUNK_MAX_COUNT = Math.ceil(
  SOURCE_SETTINGS_VAULT_MAX_VALUE_BYTES / SOURCE_SETTINGS_CHUNK_BYTES,
);
/**
 * Expo documents that large SecureStore payloads can be rejected by the
 * underlying Keychain/Keystore implementation. Keep every value comfortably
 * below the roughly 2 KiB portability ceiling, including manifests and
 * journals as well as credential chunks.
 */
export const MOBILE_SECURE_STORE_ITEM_MAX_BYTES = 1_700;
const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
const sharedSourceSettingsSecureStore = new SecureNativeKVStore({
  keychainService: "pm.nemu.mobile.source-settings.v1",
  deviceOnly: true,
});
// Reads can complete a pending cleanup journal, so all public vault operations
// serialize across store instances that share the same profile namespace.
const sourceSettingsVaultQueues = new Map<string, Promise<unknown>>();

export type MobileSourceSettingsVaultMarker = {
  __nemuSourceSettingsVault: typeof SOURCE_SETTINGS_VAULT_VERSION;
  ref: string;
};

export interface MobileSourceSettingsVault {
  put(settings: LocalSourceSettings): Promise<string>;
  get(ref: string, expectedSourceKey: string): Promise<LocalSourceSettings>;
  remove(ref: string): Promise<void>;
  clearAll(): Promise<void>;
  isValidRef(ref: string): boolean;
}

type ChunkManifest = {
  v: typeof SOURCE_SETTINGS_CHUNK_FORMAT_VERSION;
  g: string;
  n: number;
  b: number;
  h: string;
};

type ChunkReference = Pick<ChunkManifest, "g" | "n">;

type ChunkWriteJournal = {
  v: typeof SOURCE_SETTINGS_CHUNK_FORMAT_VERSION;
  o: "w";
  next: ChunkManifest;
  previous: ChunkReference | null;
};

type ChunkDeleteJournal = {
  v: typeof SOURCE_SETTINGS_CHUNK_FORMAT_VERSION;
  o: "d";
  previous: ChunkReference;
};

type ChunkJournal = ChunkWriteJournal | ChunkDeleteJournal;

let generationCounter = 0;

function hashBytes(value: Uint8Array): string {
  return Array.from(sha256Bytes(value), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function stableHash(value: string): string {
  return hashBytes(utf8Encoder.encode(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isChunkReference(value: unknown): value is ChunkReference {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["g", "n"]) &&
    typeof value.g === "string" &&
    /^[a-f0-9]{24}$/.test(value.g) &&
    Number.isSafeInteger(value.n) &&
    (value.n as number) >= 1 &&
    (value.n as number) <= SOURCE_SETTINGS_CHUNK_MAX_COUNT
  );
}

function parseChunkManifest(raw: string): ChunkManifest | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value) || value.v !== SOURCE_SETTINGS_CHUNK_FORMAT_VERSION) {
    return null;
  }
  if (
    !hasExactKeys(value, ["v", "g", "n", "b", "h"]) ||
    !isChunkReference({ g: value.g, n: value.n }) ||
    !Number.isSafeInteger(value.b) ||
    (value.b as number) < 1 ||
    (value.b as number) > SOURCE_SETTINGS_VAULT_MAX_VALUE_BYTES ||
    value.n !== Math.ceil((value.b as number) / SOURCE_SETTINGS_CHUNK_BYTES) ||
    typeof value.h !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.h)
  ) {
    throw new TypeError("Invalid secure mobile source settings manifest.");
  }
  return value as ChunkManifest;
}

function parseChunkJournal(raw: string): ChunkJournal {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new TypeError("Invalid secure mobile source settings journal.");
  }
  if (
    !isRecord(value) ||
    value.v !== SOURCE_SETTINGS_CHUNK_FORMAT_VERSION ||
    (value.o !== "w" && value.o !== "d")
  ) {
    throw new TypeError("Invalid secure mobile source settings journal.");
  }
  if (value.o === "d") {
    if (
      !hasExactKeys(value, ["v", "o", "previous"]) ||
      !isChunkReference(value.previous)
    ) {
      throw new TypeError("Invalid secure mobile source settings journal.");
    }
    return value as ChunkDeleteJournal;
  }
  if (
    !hasExactKeys(value, ["v", "o", "next", "previous"]) ||
    !isRecord(value.next)
  ) {
    throw new TypeError("Invalid secure mobile source settings journal.");
  }
  const next = parseChunkManifest(JSON.stringify(value.next));
  if (!next || (value.previous !== null && !isChunkReference(value.previous))) {
    throw new TypeError("Invalid secure mobile source settings journal.");
  }
  return { ...value, next } as ChunkWriteJournal;
}

function chunkManifestsEqual(
  left: ChunkManifest | null,
  right: ChunkManifest,
): boolean {
  return (
    left !== null &&
    left.v === right.v &&
    left.g === right.g &&
    left.n === right.n &&
    left.b === right.b &&
    left.h === right.h
  );
}

function makeChunkGeneration(seed: string, previous?: string): string {
  generationCounter += 1;
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    try {
      const bytes = cryptoApi.getRandomValues(new Uint8Array(12));
      const value = Array.from(bytes, (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      if (value !== previous) return value;
    } catch {
      // A generation is an opaque collision-avoidance token, not a secret.
      // Fall through when the platform RNG is temporarily unavailable.
    }
  }
  const value = stableHash(
    `${Date.now()}:${generationCounter}:${Math.random()}:${seed}:${previous ?? ""}`,
  ).slice(0, 24);
  return value === previous
    ? stableHash(`${value}:${generationCounter}`).slice(0, 24)
    : value;
}

function decodeBase64Url(value: string): Uint8Array {
  if (
    value.length === 0 ||
    value.length > MOBILE_SECURE_STORE_ITEM_MAX_BYTES ||
    !/^[A-Za-z0-9_-]+$/.test(value) ||
    value.length % 4 === 1
  ) {
    throw new TypeError("Invalid secure mobile source settings chunk.");
  }
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const byteLength = Math.floor((value.length * 6) / 8);
  const output = new Uint8Array(byteLength);
  let accumulator = 0;
  let bits = 0;
  let offset = 0;
  for (const char of value) {
    const sextet = alphabet.indexOf(char);
    if (sextet < 0) {
      throw new TypeError("Invalid secure mobile source settings chunk.");
    }
    accumulator = (accumulator << 6) | sextet;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output[offset] = (accumulator >> bits) & 0xff;
      offset += 1;
    }
  }
  if (offset !== output.length || bytesToBase64Url(output) !== value) {
    throw new TypeError("Invalid secure mobile source settings chunk.");
  }
  return output;
}

function extractDatabasePath(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    // Handles boxed strings without trusting an overridden object `toString`.
    if (Object.prototype.toString.call(value) === "[object String]") {
      return String.prototype.valueOf.call(value);
    }
  } catch {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  for (const key of ["databasePath", "path", "uri", "pathname", "name"]) {
    try {
      if (typeof candidate[key] === "string") return candidate[key];
    } catch {
      // A native host-object getter can fail while protected data is locked.
      // Continue through known alternatives without stringifying the object.
    }
  }
  return null;
}

export function getMobileSourceSettingsDatabaseScope(
  databasePath: unknown,
): string {
  const raw = extractDatabasePath(databasePath);
  if (!raw) return "default";
  // JSC does not consistently provide String.prototype.replaceAll. Regex
  // replacement works on every supported engine. Only retain the basename so
  // absolute app-container paths never enter SecureStore keys or diagnostics.
  const normalized = raw.replace(/\\/g, "/").split(/[?#]/, 1)[0] ?? "";
  const segments = normalized.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? "default";
}

function parseSourceSettings(
  json: string,
  expectedSourceKey?: string,
): LocalSourceSettings {
  if (
    utf8Encoder.encode(json).byteLength > SOURCE_SETTINGS_VAULT_MAX_VALUE_BYTES
  ) {
    throw new TypeError(
      "Secure mobile source settings exceed the safety limit.",
    );
  }
  return sanitizeLocalSourceSettings(
    JSON.parse(json),
    expectedSourceKey,
    false,
  );
}

function ownDataValue(value: object, key: PropertyKey): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}

function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  try {
    if (Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

function sourceSettingValuesAreUnchanged(
  input: Record<string, unknown>,
  sanitized: Record<string, unknown>,
): boolean {
  let inputKeys: string[];
  try {
    inputKeys = Object.getOwnPropertyNames(input);
    if (Object.getOwnPropertySymbols(input).length > 0) return false;
  } catch {
    return false;
  }
  const sanitizedKeys = Object.keys(sanitized);
  if (inputKeys.length !== sanitizedKeys.length) return false;

  for (const key of inputKeys) {
    const inputValue = ownDataValue(input, key);
    const sanitizedValue = ownDataValue(sanitized, key);
    if (inputValue === sanitizedValue) continue;
    let inputIsArray = false;
    try {
      inputIsArray = Array.isArray(inputValue);
    } catch {
      return false;
    }
    if (!inputIsArray || !Array.isArray(sanitizedValue)) return false;
    const inputArray = inputValue as readonly unknown[];
    const sanitizedArray = sanitizedValue as readonly unknown[];
    let inputArrayKeys: string[];
    try {
      if (Object.getOwnPropertySymbols(inputArray).length > 0) return false;
      inputArrayKeys = Object.getOwnPropertyNames(inputArray);
    } catch {
      return false;
    }
    const inputLength = ownDataValue(inputArray, "length");
    if (
      !Number.isSafeInteger(inputLength) ||
      inputLength !== sanitizedArray.length ||
      inputArrayKeys.length !== sanitizedArray.length + 1
    ) {
      return false;
    }
    for (let index = 0; index < sanitizedArray.length; index += 1) {
      if (ownDataValue(inputArray, String(index)) !== sanitizedArray[index]) {
        return false;
      }
    }
  }
  return true;
}

function sanitizeLocalSourceSettings(
  value: unknown,
  expectedSourceKey: string | undefined,
  rejectInvalidValues: boolean,
): LocalSourceSettings {
  if (!isPlainDataRecord(value)) {
    throw new TypeError("Invalid secure mobile source settings.");
  }
  const sourceKey = ownDataValue(value, "sourceKey");
  const rawValues = ownDataValue(value, "values");
  const updatedAt = ownDataValue(value, "updatedAt");
  if (
    typeof sourceKey !== "string" ||
    !isSafeSourceSettingValueKey(sourceKey) ||
    (expectedSourceKey !== undefined && sourceKey !== expectedSourceKey) ||
    !isPlainDataRecord(rawValues) ||
    typeof updatedAt !== "number" ||
    !Number.isFinite(updatedAt) ||
    updatedAt < 0
  ) {
    throw new TypeError("Invalid secure mobile source settings.");
  }
  const values = sanitizeSourceSettingValues(rawValues);
  if (
    rejectInvalidValues &&
    !sourceSettingValuesAreUnchanged(rawValues, values)
  ) {
    throw new TypeError(
      "Secure mobile source settings values exceed a safety limit or use an unsupported shape.",
    );
  }
  return { sourceKey, values, updatedAt };
}

export function encodeMobileSourceSettingsVaultMarker(ref: string): string {
  return JSON.stringify({
    __nemuSourceSettingsVault: SOURCE_SETTINGS_VAULT_VERSION,
    ref,
  } satisfies MobileSourceSettingsVaultMarker);
}

export function decodeMobileSourceSettingsVaultMarker(
  json: string,
): MobileSourceSettingsVaultMarker | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Partial<MobileSourceSettingsVaultMarker>;
  return Object.keys(value).length === 2 &&
    candidate.__nemuSourceSettingsVault === SOURCE_SETTINGS_VAULT_VERSION &&
    typeof candidate.ref === "string" &&
    candidate.ref.length > 0 &&
    candidate.ref.length <= 256 &&
    /^[A-Za-z0-9._-]+$/.test(candidate.ref)
    ? (candidate as MobileSourceSettingsVaultMarker)
    : null;
}

export function decodeLegacyMobileSourceSettings(
  json: string,
  expectedSourceKey: string,
): LocalSourceSettings {
  return parseSourceSettings(json, expectedSourceKey);
}

/**
 * Source credentials live in Expo SecureStore (Keychain/Android Keystore),
 * never in SQLite. SQLite contains only an opaque marker so normal database
 * backup, WAL, and debug tooling cannot disclose bearer tokens or passwords.
 */
export class SecureMobileSourceSettingsVault implements MobileSourceSettingsVault {
  private readonly entryPrefix: string;
  private readonly indexKey: string;

  constructor(
    databasePath: unknown,
    private readonly storage: NativeKVStore = sharedSourceSettingsSecureStore,
  ) {
    const scopeHash = stableHash(
      getMobileSourceSettingsDatabaseScope(databasePath),
    );
    this.entryPrefix = `${SOURCE_SETTINGS_VAULT_PREFIX}.entry.${scopeHash}.`;
    this.indexKey = `${SOURCE_SETTINGS_VAULT_PREFIX}.index.${scopeHash}`;
  }

  isValidRef(ref: string): boolean {
    return (
      ref.startsWith(this.entryPrefix) &&
      ref.length === this.entryPrefix.length + 64 &&
      /^[a-f0-9]+$/.test(ref.slice(this.entryPrefix.length))
    );
  }

  async put(settings: LocalSourceSettings): Promise<string> {
    const sanitized = sanitizeLocalSourceSettings(settings, undefined, true);
    const json = JSON.stringify(sanitized);
    if (
      utf8Encoder.encode(json).byteLength >
      SOURCE_SETTINGS_VAULT_MAX_VALUE_BYTES
    ) {
      throw new TypeError(
        "Secure mobile source settings exceed the safety limit.",
      );
    }
    // One stable secure entry per source avoids retaining older credential
    // versions after an update while keeping the source key itself opaque.
    const ref = `${this.entryPrefix}${stableHash(sanitized.sourceKey)}`;
    await this.enqueue(async () => {
      const previousIndex = await this.readIndex();
      if (!previousIndex.includes(ref)) {
        if (previousIndex.length >= SOURCE_SETTINGS_VAULT_MAX_ENTRIES) {
          throw new Error("Too many secure mobile source settings entries.");
        }
        // Index first: a crash can leave a missing indexed value, but never an
        // unindexed credential that account-data cleanup cannot discover.
        await this.writeIndex([...previousIndex, ref]);
      }
      try {
        await this.writeLogicalValue(ref, json);
      } catch (error) {
        if (!previousIndex.includes(ref)) {
          await this.writeIndex(previousIndex).catch(() => undefined);
        }
        throw error;
      }
    });
    return ref;
  }

  async get(
    ref: string,
    expectedSourceKey: string,
  ): Promise<LocalSourceSettings> {
    this.assertValidRef(ref);
    return this.enqueue(async () => {
      const json = await this.readLogicalValue(ref);
      if (json === null) {
        throw new Error("Secure mobile source settings are unavailable.");
      }
      return parseSourceSettings(json, expectedSourceKey);
    });
  }

  async remove(ref: string): Promise<void> {
    this.assertValidRef(ref);
    await this.enqueue(async () => {
      await this.removeLogicalValue(ref);
      const index = await this.readIndex();
      if (index.includes(ref)) {
        await this.writeIndex(index.filter((entry) => entry !== ref));
      }
    });
  }

  async clearAll(): Promise<void> {
    await this.enqueue(async () => {
      const index = await this.readIndex();
      let firstError: unknown;
      for (const ref of index) {
        try {
          await this.removeLogicalValue(ref);
        } catch (error) {
          firstError ??= error;
        }
      }
      if (firstError === undefined) {
        await this.removeLogicalValue(this.indexKey);
      } else {
        throw firstError;
      }
    });
  }

  private assertValidRef(ref: string): void {
    if (!this.isValidRef(ref)) {
      throw new TypeError("Invalid secure mobile source settings reference.");
    }
  }

  private async readIndex(): Promise<string[]> {
    const raw = await this.readLogicalValue(this.indexKey);
    if (raw === null) return [];
    const value: unknown = JSON.parse(raw);
    if (
      !Array.isArray(value) ||
      value.length > SOURCE_SETTINGS_VAULT_MAX_ENTRIES ||
      value.some(
        (entry, index) =>
          typeof entry !== "string" ||
          !this.isValidRef(entry) ||
          value.indexOf(entry) !== index,
      )
    ) {
      throw new TypeError("Invalid secure mobile source settings index.");
    }
    return value;
  }

  private async writeIndex(index: string[]): Promise<void> {
    if (index.length === 0) {
      await this.removeLogicalValue(this.indexKey);
    } else {
      await this.writeLogicalValue(this.indexKey, JSON.stringify(index));
    }
  }

  private journalKey(key: string): string {
    return `${key}.pending`;
  }

  private chunkKey(
    key: string,
    reference: ChunkReference,
    index: number,
  ): string {
    return `${key}.chunk.${reference.g}.${index}`;
  }

  private async setSecureItem(key: string, value: string): Promise<void> {
    if (
      utf8Encoder.encode(value).byteLength > MOBILE_SECURE_STORE_ITEM_MAX_BYTES
    ) {
      throw new TypeError("SecureStore item exceeds the portable size limit.");
    }
    await this.storage.setString(key, value);
  }

  private async removeChunks(
    key: string,
    reference: ChunkReference | null,
  ): Promise<void> {
    if (!reference) return;
    for (let index = 0; index < reference.n; index += 1) {
      await this.storage.remove(this.chunkKey(key, reference, index));
    }
  }

  private async recoverLogicalValue(key: string): Promise<void> {
    const rawJournal = await this.storage.getString(this.journalKey(key));
    if (rawJournal === null) return;
    const journal = parseChunkJournal(rawJournal);
    if (journal.o === "d") {
      await this.storage.remove(key);
      await this.removeChunks(key, journal.previous);
      await this.storage.remove(this.journalKey(key));
      return;
    }

    const rawCurrent = await this.storage.getString(key);
    const current = rawCurrent === null ? null : parseChunkManifest(rawCurrent);
    if (chunkManifestsEqual(current, journal.next)) {
      await this.removeChunks(key, journal.previous);
    } else {
      await this.removeChunks(key, journal.next);
    }
    await this.storage.remove(this.journalKey(key));
  }

  private async readLogicalValue(key: string): Promise<string | null> {
    await this.recoverLogicalValue(key);
    const raw = await this.storage.getString(key);
    if (raw === null) return null;
    const manifest = parseChunkManifest(raw);
    if (!manifest) {
      if (
        utf8Encoder.encode(raw).byteLength >
        SOURCE_SETTINGS_VAULT_MAX_VALUE_BYTES
      ) {
        throw new TypeError(
          "Secure mobile source settings exceed the safety limit.",
        );
      }
      // Version-one vaults stored the JSON directly at the logical key. Keep
      // reading that format; the next mutation upgrades it atomically.
      return raw;
    }

    const bytes = new Uint8Array(manifest.b);
    let offset = 0;
    for (let index = 0; index < manifest.n; index += 1) {
      const encoded = await this.storage.getString(
        this.chunkKey(key, manifest, index),
      );
      if (encoded === null) {
        throw new Error("Secure mobile source settings are unavailable.");
      }
      const chunk = decodeBase64Url(encoded);
      const expectedLength = Math.min(
        SOURCE_SETTINGS_CHUNK_BYTES,
        manifest.b - offset,
      );
      if (chunk.byteLength !== expectedLength) {
        throw new TypeError(
          "Secure mobile source settings failed integrity checks.",
        );
      }
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    if (offset !== manifest.b || hashBytes(bytes) !== manifest.h) {
      throw new TypeError(
        "Secure mobile source settings failed integrity checks.",
      );
    }
    try {
      return utf8Decoder.decode(bytes);
    } catch {
      throw new TypeError(
        "Secure mobile source settings failed integrity checks.",
      );
    }
  }

  private async writeLogicalValue(key: string, value: string): Promise<void> {
    const bytes = utf8Encoder.encode(value);
    if (
      bytes.byteLength < 1 ||
      bytes.byteLength > SOURCE_SETTINGS_VAULT_MAX_VALUE_BYTES
    ) {
      throw new TypeError(
        "Secure mobile source settings exceed the safety limit.",
      );
    }
    await this.recoverLogicalValue(key);
    const rawPrevious = await this.storage.getString(key);
    const previous =
      rawPrevious === null ? null : parseChunkManifest(rawPrevious);
    const generation = makeChunkGeneration(value, previous?.g);
    const next: ChunkManifest = {
      v: SOURCE_SETTINGS_CHUNK_FORMAT_VERSION,
      g: generation,
      n: Math.ceil(bytes.byteLength / SOURCE_SETTINGS_CHUNK_BYTES),
      b: bytes.byteLength,
      h: hashBytes(bytes),
    };
    const previousReference = previous
      ? { g: previous.g, n: previous.n }
      : null;
    const journal: ChunkWriteJournal = {
      v: SOURCE_SETTINGS_CHUNK_FORMAT_VERSION,
      o: "w",
      next,
      previous: previousReference,
    };
    await this.setSecureItem(this.journalKey(key), JSON.stringify(journal));

    let committed = false;
    const serializedManifest = JSON.stringify(next);
    try {
      for (let index = 0; index < next.n; index += 1) {
        const start = index * SOURCE_SETTINGS_CHUNK_BYTES;
        const chunk = bytes.subarray(
          start,
          Math.min(start + SOURCE_SETTINGS_CHUNK_BYTES, bytes.byteLength),
        );
        const encoded = bytesToBase64Url(chunk);
        await this.setSecureItem(this.chunkKey(key, next, index), encoded);
        if (
          (await this.storage.getString(this.chunkKey(key, next, index))) !==
          encoded
        ) {
          throw new Error("SecureStore did not persist a credential chunk.");
        }
      }
      await this.setSecureItem(key, serializedManifest);
      if ((await this.storage.getString(key)) !== serializedManifest) {
        throw new Error("SecureStore did not persist a credential manifest.");
      }
      committed = true;
    } catch (error) {
      let durableManifest: string | null;
      try {
        durableManifest = await this.storage.getString(key);
      } catch {
        // The manifest outcome is ambiguous. Keep both generations and the
        // journal; the next operation can resolve it without deleting the
        // generation that may have become authoritative.
        throw error;
      }
      if (durableManifest === serializedManifest) {
        // Native storage may commit and then surface an error. The manifest is
        // the commit point, so preserve its verified chunks and finish only
        // cleanup of the superseded generation.
        try {
          await this.removeChunks(key, previousReference);
          await this.storage.remove(this.journalKey(key));
        } catch {
          // Leave the journal for deterministic stale-generation cleanup.
        }
        return;
      }
      try {
        await this.removeChunks(key, next);
        await this.storage.remove(this.journalKey(key));
      } catch {
        // Keep the journal when rollback itself is interrupted. The next read,
        // write, removal, or Clear All deterministically completes it.
      }
      throw error;
    }

    if (committed) {
      try {
        await this.removeChunks(key, previousReference);
        await this.storage.remove(this.journalKey(key));
      } catch {
        // The new manifest is already the commit point. Retain the journal so
        // stale chunks are securely removed on the next vault operation.
      }
    }
  }

  private async removeLogicalValue(key: string): Promise<void> {
    await this.recoverLogicalValue(key);
    const raw = await this.storage.getString(key);
    if (raw === null) {
      await this.storage.remove(this.journalKey(key));
      return;
    }
    const manifest = parseChunkManifest(raw);
    if (!manifest) {
      await this.storage.remove(key);
      return;
    }
    const previous = { g: manifest.g, n: manifest.n };
    const journal: ChunkDeleteJournal = {
      v: SOURCE_SETTINGS_CHUNK_FORMAT_VERSION,
      o: "d",
      previous,
    };
    await this.setSecureItem(this.journalKey(key), JSON.stringify(journal));
    await this.storage.remove(key);
    await this.removeChunks(key, previous);
    await this.storage.remove(this.journalKey(key));
  }

  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const previous =
      sourceSettingsVaultQueues.get(this.indexKey) ?? Promise.resolve();
    const task = previous.then(operation);
    const barrier = task.catch(() => undefined);
    sourceSettingsVaultQueues.set(this.indexKey, barrier);
    void barrier.then(() => {
      if (sourceSettingsVaultQueues.get(this.indexKey) === barrier) {
        sourceSettingsVaultQueues.delete(this.indexKey);
      }
    });
    return task;
  }
}

export function createMobileSourceSettingsVault(
  databasePath: unknown,
): MobileSourceSettingsVault {
  return new SecureMobileSourceSettingsVault(databasePath);
}
