import { describe, it, expect, vi } from "vitest";
import {
  retry,
  retryWithTimeout,
  sleep,
  isNetworkError,
  isTimeoutError,
  isRetryableStatus,
  createRetryableFetch,
} from "./retry";

describe("retry utilities", () => {
  describe("sleep", () => {
    it("should sleep for specified duration", async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(90); // Allow some tolerance
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe("retry", () => {
    it("should succeed on first try", async () => {
      const fn = vi.fn().mockResolvedValue("success");
      const result = await retry(fn);
      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure", async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail 1"))
        .mockRejectedValueOnce(new Error("fail 2"))
        .mockResolvedValue("success");

      const result = await retry(fn, {
        maxRetries: 3,
        initialDelay: 10,
      });

      expect(result).toBe("success");
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it("should throw after max retries", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("always fails"));

      await expect(
        retry(fn, { maxRetries: 2, initialDelay: 10 })
      ).rejects.toThrow("always fails");

      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it("should call onRetry callback", async () => {
      const onRetry = vi.fn();
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValue("success");

      await retry(fn, {
        maxRetries: 3,
        initialDelay: 10,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
    });

    it("should respect isRetryable predicate", async () => {
      const fn = vi.fn().mockRejectedValue(new Error("not retryable"));

      await expect(
        retry(fn, {
          maxRetries: 3,
          initialDelay: 10,
          isRetryable: () => false,
        })
      ).rejects.toThrow("not retryable");

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should use exponential backoff", async () => {
      const delays: number[] = [];
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error("fail 1"))
        .mockRejectedValueOnce(new Error("fail 2"))
        .mockResolvedValue("success");

      await retry(fn, {
        maxRetries: 3,
        initialDelay: 100,
        backoffMultiplier: 2,
        jitter: false,
        onRetry: (_, __, delay) => delays.push(delay),
      });

      expect(delays[0]).toBe(100); // First retry: 100 * 2^0
      expect(delays[1]).toBe(200); // Second retry: 100 * 2^1
    });
  });

  describe("retryWithTimeout", () => {
    it("should timeout if operation takes too long", async () => {
      const fn = vi.fn().mockImplementation(async () => {
        await sleep(1000);
        return "success";
      });

      await expect(
        retryWithTimeout(fn, 100, { maxRetries: 0 })
      ).rejects.toThrow("Operation timed out");
    });

    it("should succeed if operation completes in time", async () => {
      const fn = vi.fn().mockResolvedValue("success");
      const result = await retryWithTimeout(fn, 1000, { maxRetries: 0 });
      expect(result).toBe("success");
    });
  });

  describe("error detection", () => {
    it("should detect network errors", () => {
      expect(isNetworkError(new Error("Network request failed"))).toBe(true);
      expect(isNetworkError(new Error("Failed to fetch"))).toBe(true);
      expect(isNetworkError(new Error("Connection refused"))).toBe(true);
      expect(isNetworkError(new Error("net::ERR_CONNECTION_RESET"))).toBe(true);
      expect(isNetworkError(new Error("Some other error"))).toBe(false);
      expect(isNetworkError(null)).toBe(false);
    });

    it("should detect timeout errors", () => {
      expect(isTimeoutError(new Error("Request timeout"))).toBe(true);
      expect(isTimeoutError(new Error("Operation timed out"))).toBe(true);
      expect(isTimeoutError(new Error("Some other error"))).toBe(false);
      expect(isTimeoutError(null)).toBe(false);
    });

    it("should identify retryable status codes", () => {
      expect(isRetryableStatus(500)).toBe(true);
      expect(isRetryableStatus(502)).toBe(true);
      expect(isRetryableStatus(503)).toBe(true);
      expect(isRetryableStatus(504)).toBe(true);
      expect(isRetryableStatus(429)).toBe(true); // Rate limit
      expect(isRetryableStatus(408)).toBe(true); // Request timeout
      expect(isRetryableStatus(200)).toBe(false);
      expect(isRetryableStatus(404)).toBe(false);
      expect(isRetryableStatus(400)).toBe(false);
    });
  });

  describe("createRetryableFetch", () => {
    it("should create a function", () => {
      const retryFetch = createRetryableFetch();
      expect(typeof retryFetch).toBe("function");
    });
  });
});
