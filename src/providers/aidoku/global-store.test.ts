import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GlobalStore, isCheerioNode, isArray, isObject } from "./global-store";

describe("GlobalStore", () => {
  let store: GlobalStore;

  beforeEach(() => {
    store = new GlobalStore("test-source");
  });

  afterEach(() => {
    store.destroy();
  });

  describe("descriptor management", () => {
    it("should store and retrieve values", () => {
      const descriptor = store.storeStdValue("test value");
      expect(descriptor).toBeGreaterThan(0);
      expect(store.readStdValue(descriptor)).toBe("test value");
    });

    it("should return undefined for invalid descriptors", () => {
      expect(store.readStdValue(-1)).toBeUndefined();
      expect(store.readStdValue(9999)).toBeUndefined();
    });

    it("should increment descriptor IDs", () => {
      const d1 = store.storeStdValue("a");
      const d2 = store.storeStdValue("b");
      const d3 = store.storeStdValue("c");
      expect(d2).toBe(d1 + 1);
      expect(d3).toBe(d2 + 1);
    });

    it("should handle reference counting", () => {
      const descriptor = store.storeStdValue("ref counted");
      store.retainStdValue(descriptor);
      store.retainStdValue(descriptor);

      // First release
      store.removeStdValue(descriptor);
      expect(store.readStdValue(descriptor)).toBe("ref counted");

      // Second release
      store.removeStdValue(descriptor);
      expect(store.readStdValue(descriptor)).toBe("ref counted");

      // Third release - should remove
      store.removeStdValue(descriptor);
      expect(store.readStdValue(descriptor)).toBeUndefined();
    });

    it("should force remove regardless of ref count", () => {
      const descriptor = store.storeStdValue("force remove");
      store.retainStdValue(descriptor);
      store.retainStdValue(descriptor);

      store.forceRemoveStdValue(descriptor);
      expect(store.readStdValue(descriptor)).toBeUndefined();
    });
  });

  describe("request management", () => {
    it("should create requests with correct method", () => {
      const id = store.createRequest(0);
      const request = store.getRequest(id);
      expect(request).toBeDefined();
      expect(request?.method).toBe("GET");
    });

    it("should create POST request", () => {
      const id = store.createRequest(1);
      const request = store.getRequest(id);
      expect(request?.method).toBe("POST");
    });

    it("should remove requests", () => {
      const id = store.createRequest(0);
      expect(store.getRequest(id)).toBeDefined();
      store.removeRequest(id);
      expect(store.getRequest(id)).toBeUndefined();
    });
  });

  describe("memory operations", () => {
    it("should set and read memory", () => {
      const memory = new WebAssembly.Memory({ initial: 1 });
      store.setMemory(memory);

      const testData = new Uint8Array([1, 2, 3, 4, 5]);
      store.writeBytes(testData, 0);

      const read = store.readBytes(0, 5);
      expect(read).toEqual(testData);
    });

    it("should write and read strings", () => {
      const memory = new WebAssembly.Memory({ initial: 1 });
      store.setMemory(memory);

      const testString = "Hello, World!";
      store.writeString(testString, 0);

      const read = store.readString(0, new TextEncoder().encode(testString).length);
      expect(read).toBe(testString);
    });

    it("should return null for invalid reads", () => {
      expect(store.readString(0, 10)).toBeNull();
      expect(store.readBytes(0, 10)).toBeNull();
    });
  });

  describe("settings management", () => {
    it("should set and get settings", () => {
      store.setSetting("key1", "value1");
      store.setSetting("key2", 42);

      expect(store.getSetting("key1")).toBe("value1");
      expect(store.getSetting("key2")).toBe(42);
    });

    it("should export settings", () => {
      store.setSetting("a", 1);
      store.setSetting("b", 2);

      const exported = store.exportSettings();
      expect(exported).toEqual({ a: 1, b: 2 });
    });

    it("should import settings", () => {
      store.importSettings({ x: "hello", y: "world" });

      expect(store.getSetting("x")).toBe("hello");
      expect(store.getSetting("y")).toBe("world");
    });
  });

  describe("cleanup", () => {
    it("should reset all state", () => {
      store.storeStdValue("test");
      store.createRequest(0);
      store.chapterCounter = 5;

      store.reset();

      expect(store.getStats().descriptorCount).toBe(0);
      expect(store.getStats().requestCount).toBe(0);
      expect(store.chapterCounter).toBe(0);
    });

    it("should perform cleanup of old entries", () => {
      // Create some entries
      const d1 = store.storeStdValue("test1");
      store.removeStdValue(d1); // Mark for cleanup

      // Perform cleanup
      store.performCleanup();

      // Stats should reflect cleanup
      const stats = store.getStats();
      expect(stats.totalDescriptorsCreated).toBeGreaterThan(0);
    });
  });

  describe("statistics", () => {
    it("should track creation and destruction", () => {
      const d1 = store.storeStdValue("a");
      store.storeStdValue("b"); // Second descriptor
      store.removeStdValue(d1);

      const stats = store.getStats();
      expect(stats.totalDescriptorsCreated).toBe(2);
      expect(stats.totalDescriptorsDestroyed).toBe(1);
    });
  });
});

describe("type guards", () => {
  it("isArray should identify arrays", () => {
    expect(isArray([])).toBe(true);
    expect(isArray([1, 2, 3])).toBe(true);
    expect(isArray({})).toBe(false);
    expect(isArray("string")).toBe(false);
    expect(isArray(null)).toBe(false);
  });

  it("isObject should identify plain objects", () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ a: 1 })).toBe(true);
    expect(isObject([])).toBe(false);
    expect(isObject(null)).toBe(false);
    expect(isObject("string")).toBe(false);
  });

  it("isCheerioNode should identify cheerio nodes", () => {
    expect(isCheerioNode({ cheerio: true })).toBe(true);
    expect(isCheerioNode({})).toBe(false);
    expect(isCheerioNode(null)).toBe(false);
  });
});
