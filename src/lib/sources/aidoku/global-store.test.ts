import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { GlobalStore, DescriptorScope, isCheerioNode, isArray, isObject, ResourceType } from "./global-store";

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

    // B1: HttpMethod enum order must match aidoku-rs
    it("should map HttpMethod enum correctly (aidoku-rs order)", () => {
      // aidoku-rs HttpMethod enum: Get=0, Post=1, Put=2, Head=3, Delete=4, Patch=5, Options=6, Connect=7, Trace=8
      const methods = [
        { index: 0, expected: "GET" },
        { index: 1, expected: "POST" },
        { index: 2, expected: "PUT" },
        { index: 3, expected: "HEAD" },
        { index: 4, expected: "DELETE" },
        { index: 5, expected: "PATCH" },
        { index: 6, expected: "OPTIONS" },
        { index: 7, expected: "CONNECT" },
        { index: 8, expected: "TRACE" },
      ];

      for (const { index, expected } of methods) {
        const id = store.createRequest(index);
        const request = store.getRequest(id);
        expect(request?.method).toBe(expected);
      }
    });

    it("should default to GET for unknown method index", () => {
      const id = store.createRequest(99);
      const request = store.getRequest(id);
      expect(request?.method).toBe("GET");
    });
  });

  // B3: std.destroy must free all resource types (unified store)
  describe("unified resource destruction (std.destroy)", () => {
    it("should destroy std values via destroyResource", () => {
      const rid = store.storeStdValue("test value");
      expect(store.readStdValue(rid)).toBe("test value");
      
      const destroyed = store.destroyResource(rid);
      
      expect(destroyed).toBe(true);
      expect(store.readStdValue(rid)).toBeUndefined();
    });

    it("should destroy requests via destroyResource", () => {
      const rid = store.createRequest(0);
      expect(store.getRequest(rid)).toBeDefined();
      
      const destroyed = store.destroyResource(rid);
      
      expect(destroyed).toBe(true);
      expect(store.getRequest(rid)).toBeUndefined();
    });

    it("should return false for unknown RID", () => {
      const destroyed = store.destroyResource(99999);
      expect(destroyed).toBe(false);
    });

    it("should track resource types correctly", () => {
      const stdRid = store.storeStdValue("std value");
      const reqRid = store.createRequest(0);
      
      expect(store.getResourceType(stdRid)).toBe(ResourceType.StdValue);
      expect(store.getResourceType(reqRid)).toBe(ResourceType.Request);
    });

    it("should use unified RID counter across resource types", () => {
      const rid1 = store.storeStdValue("value1");
      const rid2 = store.createRequest(0);
      const rid3 = store.storeStdValue("value2");
      
      // RIDs should be sequential regardless of resource type
      expect(rid2).toBe(rid1 + 1);
      expect(rid3).toBe(rid2 + 1);
    });

    it("should register custom resource types", () => {
      const rid = store.storeStdValue({ type: "canvas", data: "test" });
      store.registerResource(rid, ResourceType.Canvas);
      
      expect(store.getResourceType(rid)).toBe(ResourceType.Canvas);
      
      // Should still be destroyable
      const destroyed = store.destroyResource(rid);
      expect(destroyed).toBe(true);
      expect(store.readStdValue(rid)).toBeUndefined();
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

  describe("scoped cleanup", () => {
    it("should create a scope via createScope()", () => {
      const scope = store.createScope();
      expect(scope).toBeInstanceOf(DescriptorScope);
      expect(scope.size).toBe(0);
      expect(scope.isDisposed).toBe(false);
    });

    it("should track descriptors and clean them up", () => {
      const scope = store.createScope();
      
      const d1 = scope.track(store.storeStdValue("value1"));
      const d2 = scope.track(store.storeStdValue("value2"));
      const d3 = scope.track(store.storeStdValue("value3"));

      expect(scope.size).toBe(3);
      expect(store.readStdValue(d1)).toBe("value1");
      expect(store.readStdValue(d2)).toBe("value2");
      expect(store.readStdValue(d3)).toBe("value3");

      scope.cleanup();

      expect(scope.isDisposed).toBe(true);
      expect(scope.size).toBe(0);
      expect(store.readStdValue(d1)).toBeUndefined();
      expect(store.readStdValue(d2)).toBeUndefined();
      expect(store.readStdValue(d3)).toBeUndefined();
    });

    it("should provide storeValue() convenience method", () => {
      const scope = store.createScope();
      
      const d1 = scope.storeValue("convenience1");
      const d2 = scope.storeValue(new Uint8Array([1, 2, 3]));

      expect(scope.size).toBe(2);
      expect(store.readStdValue(d1)).toBe("convenience1");
      expect(store.readStdValue(d2)).toEqual(new Uint8Array([1, 2, 3]));

      scope.cleanup();

      expect(store.readStdValue(d1)).toBeUndefined();
      expect(store.readStdValue(d2)).toBeUndefined();
    });

    it("should be safe to call cleanup() multiple times", () => {
      const scope = store.createScope();
      const d1 = scope.storeValue("test");

      scope.cleanup();
      scope.cleanup();
      scope.cleanup();

      expect(store.readStdValue(d1)).toBeUndefined();
      expect(scope.isDisposed).toBe(true);
    });

    it("should throw when tracking on disposed scope", () => {
      const scope = store.createScope();
      scope.cleanup();

      expect(() => scope.track(store.storeStdValue("test"))).toThrow(
        "Cannot track descriptor on disposed scope"
      );
    });

    it("should ignore invalid descriptors (<=0)", () => {
      const scope = store.createScope();
      
      scope.track(-1);
      scope.track(0);

      expect(scope.size).toBe(0);
    });

    it("should work with try/finally pattern", () => {
      const descriptors: number[] = [];
      
      const doWork = () => {
        const scope = store.createScope();
        try {
          descriptors.push(scope.storeValue("a"));
          descriptors.push(scope.storeValue("b"));
          return "result";
        } finally {
          scope.cleanup();
        }
      };

      const result = doWork();
      expect(result).toBe("result");
      expect(store.readStdValue(descriptors[0])).toBeUndefined();
      expect(store.readStdValue(descriptors[1])).toBeUndefined();
    });

    it("should clean up even when exception is thrown", () => {
      const scope = store.createScope();
      let descriptor: number | undefined;

      try {
        descriptor = scope.storeValue("will be cleaned");
        throw new Error("test error");
      } catch {
        // Expected
      } finally {
        scope.cleanup();
      }

      expect(descriptor).toBeDefined();
      expect(store.readStdValue(descriptor!)).toBeUndefined();
    });

    it("should force remove regardless of refCount", () => {
      const scope = store.createScope();
      const d1 = store.storeStdValue("retained");
      
      // Manually retain multiple times
      store.retainStdValue(d1);
      store.retainStdValue(d1);
      
      scope.track(d1);
      scope.cleanup();

      // Should be removed even though refCount was 3
      expect(store.readStdValue(d1)).toBeUndefined();
    });

    it("should track stats correctly with scoped cleanup", () => {
      const initialStats = store.getStats();
      const scope = store.createScope();

      scope.storeValue("a");
      scope.storeValue("b");
      scope.storeValue("c");

      const afterCreate = store.getStats();
      expect(afterCreate.totalDescriptorsCreated).toBe(initialStats.totalDescriptorsCreated + 3);

      scope.cleanup();

      const afterCleanup = store.getStats();
      expect(afterCleanup.totalDescriptorsDestroyed).toBe(initialStats.totalDescriptorsDestroyed + 3);
    });

    it("should handle multiple independent scopes", () => {
      const scope1 = store.createScope();
      const scope2 = store.createScope();

      const d1 = scope1.storeValue("scope1-value");
      const d2 = scope2.storeValue("scope2-value");

      expect(store.readStdValue(d1)).toBe("scope1-value");
      expect(store.readStdValue(d2)).toBe("scope2-value");

      scope1.cleanup();

      expect(store.readStdValue(d1)).toBeUndefined();
      expect(store.readStdValue(d2)).toBe("scope2-value");

      scope2.cleanup();

      expect(store.readStdValue(d2)).toBeUndefined();
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
