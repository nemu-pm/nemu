import { describe, it, expect, beforeEach, vi } from "vitest";
import { GlobalStore } from "../global-store";
import { createDefaultsImports } from "./defaults";
import { createStdImports } from "./std";
import { encodeBool, encodeI32, encodeF32, encodeString, encodeVecString } from "../postcard";

// Mock the source settings store
vi.mock("../../../../stores/source-settings", () => ({
  getSourceSettingsStore: () => ({
    getState: () => ({
      setSetting: vi.fn(),
      getSetting: vi.fn(),
      resetSettings: vi.fn(),
      values: new Map(),
    }),
  }),
}));

describe("defaults imports", () => {
  let store: GlobalStore;
  let defaults: ReturnType<typeof createDefaultsImports>;
  let std: ReturnType<typeof createStdImports>;
  const settingsMap = new Map<string, unknown>();

  beforeEach(() => {
    store = new GlobalStore("test-source");
    // Mock WASM memory
    const memory = new WebAssembly.Memory({ initial: 1 });
    store.memory = memory;
    
    settingsMap.clear();
    defaults = createDefaultsImports(store, (key) => settingsMap.get(key));
    std = createStdImports(store);
  });

  // Helper to write string to WASM memory and return pointer
  function writeString(str: string): { ptr: number; len: number } {
    const bytes = new TextEncoder().encode(str);
    const ptr = 100; // arbitrary offset
    const view = new Uint8Array(store.memory!.buffer);
    view.set(bytes, ptr);
    return { ptr, len: bytes.length };
  }

  // Helper to write bytes to WASM memory
  function writeBytes(bytes: Uint8Array, offset: number): void {
    const view = new Uint8Array(store.memory!.buffer);
    view.set(bytes, offset);
  }

  describe("get", () => {
    it("should return -1 for non-existent key", () => {
      const { ptr, len } = writeString("nonexistent");
      const result = defaults.get(ptr, len);
      expect(result).toBe(-1);
    });

    it("should return RID for existing string value", () => {
      settingsMap.set("uid", "486922991");
      const { ptr, len } = writeString("uid");
      const rid = defaults.get(ptr, len);
      expect(rid).toBeGreaterThanOrEqual(0);
    });

    // Regression test: defaults.get should store raw values for legacy ABI compatibility
    it("should store raw string value accessible via std.read_string (legacy ABI)", () => {
      const testValue = "486922991";
      settingsMap.set("uid", testValue);
      
      const { ptr, len } = writeString("uid");
      const rid = defaults.get(ptr, len);
      expect(rid).toBeGreaterThanOrEqual(0);

      // Legacy sources read via std.string_len + std.read_string
      const strLen = std.string_len(rid);
      expect(strLen).toBe(new TextEncoder().encode(testValue).length);

      // Read the string into a buffer
      const bufPtr = 200;
      std.read_string(rid, bufPtr, strLen);

      // Verify the bytes match the original string
      const view = new Uint8Array(store.memory!.buffer);
      const readBytes = view.slice(bufPtr, bufPtr + strLen);
      const readStr = new TextDecoder().decode(readBytes);
      expect(readStr).toBe(testValue);
    });

    it("should store raw number value accessible via std.read_int", () => {
      settingsMap.set("count", 42);
      
      const { ptr, len } = writeString("count");
      const rid = defaults.get(ptr, len);
      expect(rid).toBeGreaterThanOrEqual(0);

      // Legacy sources read numbers via std.read_int
      const value = std.read_int(rid);
      expect(value).toBe(BigInt(42));
    });

    it("should store raw boolean value accessible via std.read_bool", () => {
      settingsMap.set("enabled", true);
      
      const { ptr, len } = writeString("enabled");
      const rid = defaults.get(ptr, len);
      expect(rid).toBeGreaterThanOrEqual(0);

      // Legacy sources read booleans via std.read_bool
      const value = std.read_bool(rid);
      expect(value).toBe(1);
    });

    // Regression test: std.typeof should return String type for postcard-encoded strings
    it("should return correct type via std.typeof for string values", () => {
      settingsMap.set("uid", "486922991");
      
      const { ptr, len } = writeString("uid");
      const rid = defaults.get(ptr, len);
      expect(rid).toBeGreaterThanOrEqual(0);

      // Legacy sources check type via std.typeof before reading
      // ObjectType.String = 3
      const typeVal = std.typeof(rid);
      expect(typeVal).toBe(3); // ObjectType.String
    });

    // Regression test: read_int should parse numeric strings
    it("should read numeric string as integer via std.read_int", () => {
      settingsMap.set("uid", "486922991");
      
      const { ptr, len } = writeString("uid");
      const rid = defaults.get(ptr, len);
      expect(rid).toBeGreaterThanOrEqual(0);

      // Legacy sources may call read_int on string values containing numbers
      const value = std.read_int(rid);
      expect(value).toBe(BigInt(486922991));
    });

    // Regression test: read_float should parse numeric strings
    it("should read numeric string as float via std.read_float", () => {
      settingsMap.set("ratio", "3.14");
      
      const { ptr, len } = writeString("ratio");
      const rid = defaults.get(ptr, len);
      expect(rid).toBeGreaterThanOrEqual(0);

      // Legacy sources may call read_float on string values containing numbers
      const value = std.read_float(rid);
      expect(value).toBeCloseTo(3.14, 2);
    });

    it("should return -1 for invalid key length", () => {
      const result = defaults.get(100, 0);
      expect(result).toBe(-1);
    });

    it("should return -1 for null/undefined values", () => {
      settingsMap.set("nullval", null);
      const { ptr, len } = writeString("nullval");
      const result = defaults.get(ptr, len);
      expect(result).toBe(-1);
    });
  });

  describe("set (aidoku-rs ABI)", () => {
    // DefaultKind values matching aidoku-rs
    const DefaultKind = {
      Data: 0,
      Bool: 1,
      Int: 2,
      Float: 3,
      String: 4,
      StringArray: 5,
      Null: 6,
    };

    it("should set bool value", () => {
      const { ptr: keyPtr, len: keyLen } = writeString("enabled");
      
      // Write bool value (postcard bool = 1 byte)
      const valueBytes = encodeBool(true);
      const valuePtr = 200;
      writeBytes(valueBytes, valuePtr);
      
      const result = defaults.set(keyPtr, keyLen, DefaultKind.Bool, valuePtr);
      expect(result).toBe(0); // Success
    });

    it("should set int value", () => {
      const { ptr: keyPtr, len: keyLen } = writeString("count");
      
      // Write i32 value (postcard zigzag varint)
      const valueBytes = encodeI32(42);
      const valuePtr = 200;
      writeBytes(valueBytes, valuePtr);
      
      const result = defaults.set(keyPtr, keyLen, DefaultKind.Int, valuePtr);
      expect(result).toBe(0);
    });

    it("should set float value", () => {
      const { ptr: keyPtr, len: keyLen } = writeString("ratio");
      
      // Write f32 value (4 bytes LE)
      const valueBytes = encodeF32(3.14);
      const valuePtr = 200;
      writeBytes(valueBytes, valuePtr);
      
      const result = defaults.set(keyPtr, keyLen, DefaultKind.Float, valuePtr);
      expect(result).toBe(0);
    });

    it("should set string value", () => {
      const { ptr: keyPtr, len: keyLen } = writeString("username");
      
      // Write string value (postcard encoded)
      const valueBytes = encodeString("testuser");
      const valuePtr = 200;
      writeBytes(valueBytes, valuePtr);
      
      const result = defaults.set(keyPtr, keyLen, DefaultKind.String, valuePtr);
      expect(result).toBe(0);
    });

    it("should set string array value", () => {
      const { ptr: keyPtr, len: keyLen } = writeString("tags");
      
      // Write Vec<String> value
      const valueBytes = encodeVecString(["tag1", "tag2", "tag3"]);
      const valuePtr = 200;
      writeBytes(valueBytes, valuePtr);
      
      const result = defaults.set(keyPtr, keyLen, DefaultKind.StringArray, valuePtr);
      expect(result).toBe(0);
    });

    it("should set null value", () => {
      const { ptr: keyPtr, len: keyLen } = writeString("cleared");
      
      const result = defaults.set(keyPtr, keyLen, DefaultKind.Null, 0);
      expect(result).toBe(0);
    });

    it("should return error for invalid key", () => {
      const result = defaults.set(100, 0, DefaultKind.String, 200);
      expect(result).toBe(-4); // InvalidString
    });
  });
});
