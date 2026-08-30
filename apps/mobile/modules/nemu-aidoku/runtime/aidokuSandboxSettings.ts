export const MAX_SANDBOX_SETTING_KEYS = 128;
export const MAX_SANDBOX_SETTING_KEY_LENGTH = 256;
export const MAX_SANDBOX_SETTING_STRING_LENGTH = 16 * 1024;
export const MAX_SANDBOX_SETTING_ARRAY_LENGTH = 256;
export const MAX_SANDBOX_SETTING_BYTES = 64 * 1024;

export type SandboxJsonRecord = Record<string, unknown>;

type EncodedSetting =
  | { type: "null" }
  | { type: "boolean"; value: boolean }
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "strings"; value: string[] }
  | { type: "bytes"; hex: string };

function hasOwn(value: SandboxJsonRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function assertPlainRecord(value: unknown, label: string): SandboxJsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as SandboxJsonRecord;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function assertSettingKey(key: string): void {
  if (
    key.length === 0 ||
    key.length > MAX_SANDBOX_SETTING_KEY_LENGTH ||
    hasControlCharacter(key)
  ) {
    throw new Error("Aidoku setting key is invalid.");
  }
}

function encodeHex(bytes: Uint8Array): string {
  let output = "";
  for (const byte of bytes) output += byte.toString(16).padStart(2, "0");
  return output;
}

function decodeHex(value: string): Uint8Array {
  if (
    value.length % 2 !== 0 ||
    value.length > MAX_SANDBOX_SETTING_BYTES * 2 ||
    !/^[0-9a-f]*$/i.test(value)
  ) {
    throw new Error("Persisted Aidoku byte setting is invalid.");
  }
  const output = new Uint8Array(value.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

export function encodeSandboxSetting(value: unknown): EncodedSetting {
  if (value == null) return { type: "null" };
  if (typeof value === "boolean") return { type: "boolean", value };
  if (typeof value === "number" && Number.isFinite(value)) {
    return { type: "number", value };
  }
  if (typeof value === "string") {
    if (value.length > MAX_SANDBOX_SETTING_STRING_LENGTH) {
      throw new Error("Aidoku string setting exceeds the safety limit.");
    }
    return { type: "string", value };
  }
  if (value instanceof Uint8Array) {
    if (value.byteLength > MAX_SANDBOX_SETTING_BYTES) {
      throw new Error("Aidoku byte setting exceeds the safety limit.");
    }
    return { type: "bytes", hex: encodeHex(value) };
  }
  if (Array.isArray(value)) {
    if (
      value.length > MAX_SANDBOX_SETTING_ARRAY_LENGTH ||
      value.some(
        (item) =>
          typeof item !== "string" ||
          item.length > MAX_SANDBOX_SETTING_STRING_LENGTH,
      )
    ) {
      throw new Error("Aidoku string-array setting exceeds the safety limit.");
    }
    return { type: "strings", value: [...value] };
  }
  throw new Error("Aidoku setting value is not persistable.");
}

export function decodeSandboxSetting(value: unknown): unknown {
  const encoded = assertPlainRecord(value, "Persisted Aidoku setting");
  switch (encoded.type) {
    case "null":
      return null;
    case "boolean":
      if (typeof encoded.value !== "boolean") break;
      return encoded.value;
    case "number":
      if (typeof encoded.value !== "number" || !Number.isFinite(encoded.value)) break;
      return encoded.value;
    case "string":
      if (
        typeof encoded.value !== "string" ||
        encoded.value.length > MAX_SANDBOX_SETTING_STRING_LENGTH
      ) {
        break;
      }
      return encoded.value;
    case "strings":
      if (
        !Array.isArray(encoded.value) ||
        encoded.value.length > MAX_SANDBOX_SETTING_ARRAY_LENGTH ||
        encoded.value.some(
          (item) =>
            typeof item !== "string" ||
            item.length > MAX_SANDBOX_SETTING_STRING_LENGTH,
        )
      ) {
        break;
      }
      return [...encoded.value];
    case "bytes":
      if (typeof encoded.hex !== "string") break;
      return decodeHex(encoded.hex);
    default:
      break;
  }
  throw new Error("Persisted Aidoku setting is invalid.");
}

export function decodeSandboxPersistedSettings(value: unknown): SandboxJsonRecord {
  const encoded = assertPlainRecord(value, "Persisted Aidoku settings");
  const entries = Object.entries(encoded);
  if (entries.length > MAX_SANDBOX_SETTING_KEYS) {
    throw new Error("Persisted Aidoku settings exceed the key limit.");
  }
  return Object.fromEntries(
    entries.map(([key, setting]) => {
      assertSettingKey(key);
      return [key, decodeSandboxSetting(setting)];
    }),
  );
}

export function encodeSandboxSettingsPatch(
  patch: SandboxJsonRecord,
): Record<string, EncodedSetting> {
  const entries = Object.entries(patch);
  if (entries.length > MAX_SANDBOX_SETTING_KEYS) {
    throw new Error("Aidoku settings patch exceeds the key limit.");
  }
  return Object.fromEntries(
    entries.map(([key, value]) => {
      assertSettingKey(key);
      return [key, encodeSandboxSetting(value)];
    }),
  );
}

/**
 * A source operation gets a fresh transaction for every replay run. Mutations
 * are visible to later reads in that run, but are emitted only by the final
 * successful run. Explicit user settings always win over source persistence.
 */
export class SandboxSettingsTransaction {
  private readonly patch: SandboxJsonRecord = {};

  constructor(
    private readonly defaults: SandboxJsonRecord,
    private readonly persisted: SandboxJsonRecord,
    private readonly user: SandboxJsonRecord,
  ) {}

  get(key: string): unknown {
    if (hasOwn(this.user, key)) return this.user[key];
    if (hasOwn(this.patch, key)) return this.patch[key];
    if (hasOwn(this.persisted, key)) return this.persisted[key];
    return this.defaults[key];
  }

  set(key: string, value: unknown): void {
    assertSettingKey(key);
    // Validate at the write boundary so an invalid source mutation fails the
    // operation instead of poisoning a later native persistence commit.
    this.patch[key] = decodeSandboxSetting(encodeSandboxSetting(value));
  }

  encodedPatch(): Record<string, EncodedSetting> {
    return encodeSandboxSettingsPatch(this.patch);
  }

  rawPatch(): SandboxJsonRecord {
    // Values were validated and defensively copied by set(); return another
    // shallow copy so a direct-runtime session can commit only the final replay.
    return { ...this.patch };
  }
}
