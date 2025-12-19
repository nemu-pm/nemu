import { describe, it, expect } from "vitest";
import {
  AidokuError,
  NetworkError,
  WasmError,
  ParseError,
  SourceError,
  ErrorCodes,
  getErrorMessage,
  tryCatch,
  tryCatchAsync,
  formatError,
  extractErrorInfo,
  isAidokuError,
  isNetworkError,
  isWasmError,
  isParseError,
  isSourceError,
} from "./errors";

describe("error utilities", () => {
  describe("error classes", () => {
    it("should create AidokuError", () => {
      const error = new AidokuError("test error", "TEST_CODE", { extra: "data" });
      expect(error.message).toBe("test error");
      expect(error.code).toBe("TEST_CODE");
      expect(error.details).toEqual({ extra: "data" });
      expect(error.name).toBe("AidokuError");
    });

    it("should create NetworkError", () => {
      const error = new NetworkError("network failed", 500, "https://example.com");
      expect(error.message).toBe("network failed");
      expect(error.code).toBe("NETWORK_ERROR");
      expect(error.statusCode).toBe(500);
      expect(error.url).toBe("https://example.com");
      expect(error.name).toBe("NetworkError");
    });

    it("should create WasmError", () => {
      const error = new WasmError("wasm panic", "unreachable");
      expect(error.message).toBe("wasm panic");
      expect(error.code).toBe("WASM_ERROR");
      expect(error.wasmError).toBe("unreachable");
      expect(error.name).toBe("WasmError");
    });

    it("should create ParseError", () => {
      const error = new ParseError("invalid json", "{invalid}");
      expect(error.message).toBe("invalid json");
      expect(error.code).toBe("PARSE_ERROR");
      expect(error.input).toBe("{invalid}");
      expect(error.name).toBe("ParseError");
    });

    it("should create SourceError", () => {
      const error = new SourceError("source failed", "test.source");
      expect(error.message).toBe("source failed");
      expect(error.code).toBe("SOURCE_ERROR");
      expect(error.sourceId).toBe("test.source");
      expect(error.name).toBe("SourceError");
    });
  });

  describe("error codes", () => {
    it("should have correct error codes", () => {
      expect(ErrorCodes.SUCCESS).toBe(0);
      expect(ErrorCodes.UNKNOWN_ERROR).toBe(-1);
      expect(ErrorCodes.INVALID_DESCRIPTOR).toBe(-2);
      expect(ErrorCodes.MISSING_DATA).toBe(-3);
      expect(ErrorCodes.PARSE_ERROR).toBe(-5);
    });
  });

  describe("getErrorMessage", () => {
    it("should return correct messages", () => {
      expect(getErrorMessage(ErrorCodes.SUCCESS)).toBe("Success");
      expect(getErrorMessage(ErrorCodes.UNKNOWN_ERROR)).toBe("Unknown error");
      expect(getErrorMessage(ErrorCodes.INVALID_DESCRIPTOR)).toBe("Invalid descriptor");
      expect(getErrorMessage(ErrorCodes.PARSE_ERROR)).toBe("Parse error");
      expect(getErrorMessage(ErrorCodes.NOT_AN_IMAGE)).toBe("Not an image");
    });

    it("should return generic message for unknown codes", () => {
      expect(getErrorMessage(-999 as never)).toBe("Error code: -999");
    });
  });

  describe("tryCatch", () => {
    it("should return ok result on success", () => {
      const result = tryCatch(() => "success");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("success");
      }
    });

    it("should return error result on failure", () => {
      const result = tryCatch(() => {
        throw new Error("failed");
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("failed");
      }
    });

    it("should convert non-Error throws to Error", () => {
      const result = tryCatch(() => {
        throw "string error";
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(Error);
        expect(result.error.message).toBe("string error");
      }
    });
  });

  describe("tryCatchAsync", () => {
    it("should return ok result on success", async () => {
      const result = await tryCatchAsync(async () => "success");
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe("success");
      }
    });

    it("should return error result on failure", async () => {
      const result = await tryCatchAsync(async () => {
        throw new Error("async failed");
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toBe("async failed");
      }
    });
  });

  describe("formatError", () => {
    it("should format AidokuError", () => {
      const error = new AidokuError("test", "TEST");
      expect(formatError(error)).toBe("[TEST] test");
    });

    it("should format regular Error", () => {
      const error = new Error("regular error");
      expect(formatError(error)).toBe("regular error");
    });

    it("should format non-Error values", () => {
      expect(formatError("string error")).toBe("string error");
      expect(formatError(123)).toBe("123");
    });
  });

  describe("extractErrorInfo", () => {
    it("should extract info from AidokuError", () => {
      const error = new AidokuError("test", "CODE", { data: 1 });
      const info = extractErrorInfo(error);
      expect(info.message).toBe("test");
      expect(info.code).toBe("CODE");
      expect(info.details).toEqual({ data: 1 });
      expect(info.stack).toBeDefined();
    });

    it("should extract info from regular Error", () => {
      const error = new Error("regular");
      const info = extractErrorInfo(error);
      expect(info.message).toBe("regular");
      expect(info.stack).toBeDefined();
      expect(info.code).toBeUndefined();
    });

    it("should handle non-Error values", () => {
      const info = extractErrorInfo("string error");
      expect(info.message).toBe("string error");
    });
  });

  describe("type guards", () => {
    it("should identify AidokuError", () => {
      expect(isAidokuError(new AidokuError("test", "CODE"))).toBe(true);
      expect(isAidokuError(new NetworkError("test", 500))).toBe(true);
      expect(isAidokuError(new Error("test"))).toBe(false);
      expect(isAidokuError(null)).toBe(false);
    });

    it("should identify NetworkError", () => {
      expect(isNetworkError(new NetworkError("test", 500))).toBe(true);
      expect(isNetworkError(new AidokuError("test", "CODE"))).toBe(false);
      expect(isNetworkError(new Error("test"))).toBe(false);
    });

    it("should identify WasmError", () => {
      expect(isWasmError(new WasmError("test", "panic"))).toBe(true);
      expect(isWasmError(new AidokuError("test", "CODE"))).toBe(false);
    });

    it("should identify ParseError", () => {
      expect(isParseError(new ParseError("test", "input"))).toBe(true);
      expect(isParseError(new AidokuError("test", "CODE"))).toBe(false);
    });

    it("should identify SourceError", () => {
      expect(isSourceError(new SourceError("test", "source.id"))).toBe(true);
      expect(isSourceError(new AidokuError("test", "CODE"))).toBe(false);
    });
  });
});
