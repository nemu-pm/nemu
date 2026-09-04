import { describe, expect, test } from "bun:test";
import {
  createMobileSourceEgressWarmup,
  isTransientMobileHttpError,
  MOBILE_HTTP_RETRY_BASE_BACKOFF_MS,
  MOBILE_HTTP_RETRY_MAX_ATTEMPTS,
  MOBILE_HTTP_RETRY_MAX_BACKOFF_MS,
  mobileHttpRetryBackoffMs,
  runMobileHttpRequestWithRetry,
} from "./mobileNativeHttpRetry";

function timeoutError(message = "Source installation timed out.") {
  const error = new Error(message);
  error.name = "MobileSourceOperationTimeoutError";
  return error;
}

function abortError() {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

describe("mobile native HTTP retry policy", () => {
  test("returns the first success without retrying", async () => {
    const sleeps: number[] = [];
    let attempts = 0;
    const result = await runMobileHttpRequestWithRetry(
      async () => {
        attempts += 1;
        return "ok";
      },
      { sleep: (ms) => (sleeps.push(ms), Promise.resolve()) },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(1);
    expect(sleeps).toEqual([]);
  });

  test("retries transient failures with short exponential backoff", async () => {
    const sleeps: number[] = [];
    let attempts = 0;
    const result = await runMobileHttpRequestWithRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error("Request timed out.");
        return "ok";
      },
      {
        sleep: (ms) => (sleeps.push(ms), Promise.resolve()),
      },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([
      MOBILE_HTTP_RETRY_BASE_BACKOFF_MS,
      MOBILE_HTTP_RETRY_BASE_BACKOFF_MS * 2,
    ]);
  });

  test("exhausts the attempt budget and throws the last error", async () => {
    let attempts = 0;
    await expect(
      runMobileHttpRequestWithRetry(
        async () => {
          attempts += 1;
          throw new Error("The network connection was lost.");
        },
        { sleep: () => Promise.resolve() },
      ),
    ).rejects.toThrow("The network connection was lost.");
    expect(attempts).toBe(MOBILE_HTTP_RETRY_MAX_ATTEMPTS);
  });

  test("never retries non-transient failures", async () => {
    let attempts = 0;
    await expect(
      runMobileHttpRequestWithRetry(
        async () => {
          attempts += 1;
          throw new Error(
            "Native source networking blocked a private or reserved destination.",
          );
        },
        { sleep: () => Promise.resolve() },
      ),
    ).rejects.toThrow("blocked a private or reserved destination");
    expect(attempts).toBe(1);
  });

  test("caller aborts between attempts win over another retry", async () => {
    const controller = new AbortController();
    const deadline = timeoutError();
    let attempts = 0;
    await expect(
      runMobileHttpRequestWithRetry(
        async () => {
          attempts += 1;
          if (attempts === 1) {
            // Mirror the install watchdog: abort with the deadline reason.
            controller.abort(deadline);
          }
          throw new Error("Request timed out.");
        },
        { signal: controller.signal, sleep: () => Promise.resolve() },
      ),
    ).rejects.toBe(deadline);
    expect(attempts).toBe(1);
  });

  test("abort during the backoff sleep rejects immediately", async () => {
    const controller = new AbortController();
    let attempts = 0;
    const run = runMobileHttpRequestWithRetry(
      async () => {
        attempts += 1;
        throw new Error("Request timed out.");
      },
      {
        signal: controller.signal,
        attempts: 3,
        sleep: (ms) =>
          new Promise<void>((resolve, reject) => {
            setTimeout(() => {
              controller.abort(timeoutError());
              reject(timeoutError());
            }, Math.min(ms, 5));
          }),
      },
    );
    await expect(run).rejects.toMatchObject({
      name: "MobileSourceOperationTimeoutError",
    });
    expect(attempts).toBe(1);
  });

  test("does not enter a retry for a pre-aborted signal", async () => {
    const controller = new AbortController();
    controller.abort();
    let attempts = 0;
    await expect(
      runMobileHttpRequestWithRetry(
        async () => {
          attempts += 1;
          throw new Error("Request timed out.");
        },
        { signal: controller.signal, sleep: () => Promise.resolve() },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(attempts).toBe(0);
  });

  test("default backoff sleep rejects with the caller's abort reason", async () => {
    const controller = new AbortController();
    const deadline = timeoutError();
    let attempts = 0;
    const run = runMobileHttpRequestWithRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          setTimeout(() => controller.abort(deadline), 2);
        }
        throw new Error("Request timed out.");
      },
      { signal: controller.signal, backoffMs: () => 25 },
    );
    await expect(run).rejects.toBe(deadline);
    expect(attempts).toBe(1);
  });

  test("default backoff is short, exponential and capped", () => {
    expect(mobileHttpRetryBackoffMs(1)).toBe(MOBILE_HTTP_RETRY_BASE_BACKOFF_MS);
    expect(mobileHttpRetryBackoffMs(2)).toBe(MOBILE_HTTP_RETRY_BASE_BACKOFF_MS * 2);
    expect(mobileHttpRetryBackoffMs(10)).toBe(MOBILE_HTTP_RETRY_MAX_BACKOFF_MS);
  });
});

describe("transient mobile HTTP error classification", () => {
  test("matches cold-egress and transport failures", () => {
    expect(isTransientMobileHttpError(new Error("Request timed out."))).toBe(
      true,
    );
    expect(
      isTransientMobileHttpError(new Error("The request timed out.")),
    ).toBe(true);
    expect(
      isTransientMobileHttpError(new Error("Network request failed")),
    ).toBe(true);
    expect(
      isTransientMobileHttpError(
        new Error("The network connection was lost."),
      ),
    ).toBe(true);
    expect(
      isTransientMobileHttpError(
        new Error(
          "A server with the specified hostname could not be found.",
        ),
      ),
    ).toBe(true);
    expect(
      isTransientMobileHttpError(
        new Error(
          "Network unavailable or source host could not be resolved safely.",
        ),
      ),
    ).toBe(true);
    expect(isTransientMobileHttpError("connection reset by peer")).toBe(true);
  });

  test("does not match cancellations, deadlines or policy blocks", () => {
    expect(isTransientMobileHttpError(abortError())).toBe(false);
    expect(isTransientMobileHttpError(timeoutError())).toBe(false);
    expect(
      isTransientMobileHttpError(
        new Error(
          "Native source networking blocked a private or reserved destination.",
        ),
      ),
    ).toBe(false);
    expect(
      isTransientMobileHttpError(
        new Error(
          "Native source networking blocked an unverified or private destination.",
        ),
      ),
    ).toBe(false);
    expect(
      isTransientMobileHttpError(new Error("Failed to fetch aidoku: 404")),
    ).toBe(false);
    expect(isTransientMobileHttpError(new Error(""))).toBe(false);
    expect(isTransientMobileHttpError(null)).toBe(false);
  });
});

describe("mobile source egress warmup tracking", () => {
  test("warms each origin exactly once per session", () => {
    const warmup = createMobileSourceEgressWarmup();
    expect(warmup.shouldWarm("https://github.com")).toBe(true);
    expect(warmup.shouldWarm("https://github.com")).toBe(false);
    expect(warmup.shouldWarm("https://raw.githubusercontent.com")).toBe(true);
    expect(warmup.shouldWarm("https://raw.githubusercontent.com")).toBe(false);
  });

  test("ignores empty origins", () => {
    const warmup = createMobileSourceEgressWarmup();
    expect(warmup.shouldWarm("")).toBe(false);
    expect(warmup.shouldWarm("")).toBe(false);
  });
});
