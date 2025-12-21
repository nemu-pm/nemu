import { describe, it, expect } from "vitest";
import {
  readResultPayload,
  decodeZigzagVarint,
  decodeRidFromPayload,
  isResultError,
  RuntimeMode,
  detectRuntimeMode,
} from "./result-decoder";

describe("result-decoder", () => {
  describe("decodeZigzagVarint", () => {
    it("should decode positive integers", () => {
      // 1 -> zigzag 2 -> 0x02
      const [value, bytesRead] = decodeZigzagVarint(new Uint8Array([0x02]), 0);
      expect(value).toBe(1);
      expect(bytesRead).toBe(1);
    });

    it("should decode negative integers", () => {
      // -1 -> zigzag 1 -> 0x01
      const [value, bytesRead] = decodeZigzagVarint(new Uint8Array([0x01]), 0);
      expect(value).toBe(-1);
      expect(bytesRead).toBe(1);
    });

    it("should decode zero", () => {
      const [value, bytesRead] = decodeZigzagVarint(new Uint8Array([0x00]), 0);
      expect(value).toBe(0);
      expect(bytesRead).toBe(1);
    });

    it("should decode larger positive numbers", () => {
      // 100 -> zigzag 200 -> 0xc8 0x01
      const [value, bytesRead] = decodeZigzagVarint(new Uint8Array([0xc8, 0x01]), 0);
      expect(value).toBe(100);
      expect(bytesRead).toBe(2);
    });

    it("should decode larger negative numbers", () => {
      // -100 -> zigzag 199 -> 0xc7 0x01
      const [value, bytesRead] = decodeZigzagVarint(new Uint8Array([0xc7, 0x01]), 0);
      expect(value).toBe(-100);
      expect(bytesRead).toBe(2);
    });

    it("should respect offset", () => {
      const bytes = new Uint8Array([0xff, 0xff, 0x02, 0x00]);
      const [value, bytesRead] = decodeZigzagVarint(bytes, 2);
      expect(value).toBe(1);
      expect(bytesRead).toBe(1);
    });
  });

  describe("readResultPayload", () => {
    it("should return null for invalid pointer", () => {
      const memory = new WebAssembly.Memory({ initial: 1 });
      expect(readResultPayload(memory, -1)).toBeNull();
      expect(readResultPayload(memory, 0)).toBeNull();
    });

    it("should return null for too small length", () => {
      const memory = new WebAssembly.Memory({ initial: 1 });
      const view = new DataView(memory.buffer);
      // Write len = 8 (just header, no payload)
      view.setInt32(100, 8, true);
      expect(readResultPayload(memory, 100)).toBeNull();
    });

    it("should read payload correctly", () => {
      const memory = new WebAssembly.Memory({ initial: 1 });
      const view = new DataView(memory.buffer);
      const view8 = new Uint8Array(memory.buffer);
      
      // Write result at offset 100
      // len = 12 (8 header + 4 payload)
      view.setInt32(100, 12, true);
      // cap = 12
      view.setInt32(104, 12, true);
      // payload: [0x01, 0x02, 0x03, 0x04]
      view8.set([0x01, 0x02, 0x03, 0x04], 108);
      
      const payload = readResultPayload(memory, 100);
      expect(payload).toEqual(new Uint8Array([0x01, 0x02, 0x03, 0x04]));
    });
  });

  describe("decodeRidFromPayload", () => {
    it("should return null for empty payload", () => {
      expect(decodeRidFromPayload(new Uint8Array([]))).toBeNull();
    });

    it("should decode positive RID", () => {
      // RID 42 -> zigzag 84 -> 0x54
      expect(decodeRidFromPayload(new Uint8Array([0x54]))).toBe(42);
    });

    it("should decode zero RID", () => {
      expect(decodeRidFromPayload(new Uint8Array([0x00]))).toBe(0);
    });

    it("should decode negative RID (error case)", () => {
      // -1 -> zigzag 1 -> 0x01
      expect(decodeRidFromPayload(new Uint8Array([0x01]))).toBe(-1);
    });
  });

  describe("isResultError", () => {
    it("should identify negative pointers as errors", () => {
      expect(isResultError(-1)).toBe(true);
      expect(isResultError(-2)).toBe(true);
      expect(isResultError(-3)).toBe(true);
    });

    it("should identify non-negative pointers as success", () => {
      expect(isResultError(0)).toBe(false);
      expect(isResultError(1)).toBe(false);
      expect(isResultError(100)).toBe(false);
    });
  });

  describe("detectRuntimeMode", () => {
    it("should detect aidoku-rs mode with new exports", () => {
      const exports = {
        start: () => {},
        get_search_manga_list: () => 0,
        get_manga_update: () => 0,
        get_page_list: () => 0,
      };
      expect(detectRuntimeMode(exports)).toBe(RuntimeMode.AidokuRs);
    });

    it("should detect legacy mode with old exports", () => {
      const exports = {
        get_manga_list: () => 0,
        get_manga_details: () => 0,
        get_chapter_list: () => 0,
        get_page_list: () => 0,
      };
      expect(detectRuntimeMode(exports)).toBe(RuntimeMode.Legacy);
    });

    it("should prefer aidoku-rs when both ABIs present", () => {
      const exports = {
        get_search_manga_list: () => 0, // New ABI
        get_manga_details: () => 0, // Old ABI
      };
      expect(detectRuntimeMode(exports)).toBe(RuntimeMode.AidokuRs);
    });

    it("should default to aidoku-rs for unknown exports", () => {
      const exports = {
        custom_function: () => {},
      };
      expect(detectRuntimeMode(exports)).toBe(RuntimeMode.AidokuRs);
    });
  });
});

