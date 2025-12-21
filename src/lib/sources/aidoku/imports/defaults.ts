// defaults namespace - User settings storage
// Settings are pushed from main thread to worker, read synchronously by WASM
import { GlobalStore } from "../global-store";
import { getSourceSettingsStore } from "../../../../stores/source-settings";
import type { SettingsGetter } from "../runtime";
import {
  encodeString,
  encodeI32,
  encodeF32,
  encodeBool,
  encodeVecString,
  decodeString,
  decodeI64,
  decodeF32,
  decodeBool,
  decodeVec,
  concatBytes,
  encodeVarint,
} from "../postcard";

// DefaultValue kind enum matching aidoku-rs
const DefaultKind = {
  Data: 0,       // Raw bytes (postcard-encoded)
  Bool: 1,
  Int: 2,        // i32
  Float: 3,      // f32
  String: 4,
  StringArray: 5,
  Null: 6,
} as const;

export function createDefaultsImports(store: GlobalStore, settingsGetter: SettingsGetter) {
  const sourceKey = store.id;

  // Helper to encode a JS value to postcard bytes for storage
  function encodeValueForStorage(value: unknown): Uint8Array {
    if (value === null || value === undefined) {
      return new Uint8Array([0]); // empty
    }
    if (typeof value === "boolean") {
      return encodeBool(value);
    }
    if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return encodeI32(value);
      }
      return encodeF32(value);
    }
    if (typeof value === "string") {
      return encodeString(value);
    }
    if (Array.isArray(value)) {
      return encodeVecString(value.map(String));
    }
    // For objects/other types, try JSON as string
    return encodeString(JSON.stringify(value));
  }

  // Helper to decode postcard bytes from WASM memory based on kind
  function decodeValueFromWasm(kind: number, ptr: number): unknown {
    if (ptr <= 0) return null;

    // Read the postcard-encoded value from WASM memory
    // First we need to read the length prefix (varint)
    // Then read the actual data
    
    // For aidoku-rs defaults.set, the ptr points to the postcard-encoded value
    // The format depends on kind
    const memory = store.memory;
    if (!memory) return null;

    // Read enough bytes for decoding (max reasonable size for settings)
    const maxLen = 4096;
    const bytes = store.readBytes(ptr, maxLen);
    if (!bytes) return null;

    try {
      switch (kind) {
        case DefaultKind.Null:
          return null;
        case DefaultKind.Bool: {
          const [val] = decodeBool(bytes, 0);
          return val;
        }
        case DefaultKind.Int: {
          // i32 is zigzag varint encoded in postcard
          const [val] = decodeI64(bytes, 0); // Use i64 decoder which handles zigzag
          return val;
        }
        case DefaultKind.Float: {
          const [val] = decodeF32(bytes, 0);
          return val;
        }
        case DefaultKind.String: {
          const [val] = decodeString(bytes, 0);
          return val;
        }
        case DefaultKind.StringArray: {
          const [val] = decodeVec(bytes, 0, decodeString);
          return val;
        }
        case DefaultKind.Data: {
          // Raw data - just store the bytes
          // First decode the length to know how much to read
          let len = 0;
          let shift = 0;
          let pos = 0;
          while (pos < bytes.length) {
            const byte = bytes[pos++];
            len |= (byte & 0x7f) << shift;
            if ((byte & 0x80) === 0) break;
            shift += 7;
          }
          return bytes.slice(pos, pos + len);
        }
        default:
          return null;
      }
    } catch (e) {
      console.error("[defaults] Failed to decode value:", e);
      return null;
    }
  }

  return {
    // Signature: get(key: *const u8, len: usize) -> FFIResult (RID to value)
    // aidoku-rs: Calls read::<T>() which uses postcard::from_bytes(), so we store postcard-encoded bytes
    get: (keyPtr: number, keyLen: number): number => {
      if (keyLen <= 0) return -1;
      const key = store.readString(keyPtr, keyLen);
      if (!key) return -1;

      // Read from settings getter (provided by worker, backed by main thread data)
      const value = settingsGetter(key);
      if (value !== undefined && value !== null) {
        console.debug(`[defaults.get] ${key} = ${JSON.stringify(value)}`);
        // aidoku-rs calls read::<T>() which uses postcard::from_bytes() to deserialize
        // So we store postcard-encoded bytes directly
        const encoded = encodeValueForStorage(value);
        return store.storeStdValue(encoded);
      }
      console.debug(`[defaults.get] ${key} = (not found)`);
      return -1;
    },

    // aidoku-rs signature: set(key: *const u8, len: usize, kind: u8, value: Ptr) -> FFIResult
    set: (keyPtr: number, keyLen: number, kind: number, valuePtr: number): number => {
      if (keyLen <= 0) return -4; // InvalidString
      const key = store.readString(keyPtr, keyLen);
      if (!key) return -4;

      // Decode value from WASM memory based on kind
      const value = decodeValueFromWasm(kind, valuePtr);
      console.debug(`[defaults.set] ${key} = ${JSON.stringify(value)} (kind=${kind})`);

      // Write to source-settings store (persists to IndexedDB)
      getSourceSettingsStore().getState().setSetting(sourceKey, key, value);
      return 0; // Success
    },
  };
}

/**
 * Clear all persisted settings for a source
 */
export function clearPersistedSettings(sourceKey: string): void {
  getSourceSettingsStore().getState().resetSettings(sourceKey);
}

/**
 * Get all stored source keys
 */
export function getStoredSourceKeys(): string[] {
  const { values } = getSourceSettingsStore().getState();
  return Array.from(values.keys());
}
