import { describe, expect, test } from "bun:test";
import {
  createMobileSourceEgressWarmup,
  isMobileHttpBackgroundInterruption,
  isTransientMobileHttpError,
  type MobileHttpForegroundGate,
  MOBILE_HTTP_RETRY_BASE_BACKOFF_MS,
  MOBILE_HTTP_RETRY_MAX_ATTEMPTS,
  MOBILE_HTTP_RETRY_MAX_BACKOFF_MS,
  mobileHttpRetryBackoffMs,
  runMobileHttpRequestWithRetry,
} from "./mobileNativeHttpRetry";
import { createMobileHttpForegroundGate } from "./mobileHttpForegroundGate";

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

  test("matches connect/lost/lifecycle failures and non-user cancellations", () => {
    for (const message of [
      "Could not connect to the server.",
      "The network connection was lost.",
      "The operation couldn't be completed. (NSURLErrorDomain error -1004.)",
      "NSURLErrorDomain -1005",
      "NSURLErrorDomain error -1001",
      "App is not active.",
      "Request cancelled or app is not active.",
      "cancelled",
      "The operation was canceled. (-999)",
    ]) {
      expect(isTransientMobileHttpError(new Error(message))).toBe(true);
    }
  });

  test("never treats a caller abort or a superseded run as transient", () => {
    const cancelled = new Error("Request cancelled or app is not active.");
    cancelled.name = "AbortError";
    expect(isTransientMobileHttpError(cancelled)).toBe(false);
    expect(
      isTransientMobileHttpError(
        new Error("The registry catalog fetch was aborted."),
      ),
    ).toBe(false);
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

function fakeGate(initial: "active" | "background" = "active") {
  let state = initial;
  let epoch = 0;
  const waiters: Array<() => void> = [];
  const gate: MobileHttpForegroundGate = {
    isActive: () => state === "active",
    backgroundEpoch: () => epoch,
    waitForActive: () =>
      state === "active"
        ? Promise.resolve()
        : new Promise<void>((resolve) => waiters.push(resolve)),
  };
  return {
    gate,
    background() {
      state = "background";
      epoch += 1;
    },
    activate() {
      state = "active";
      for (const wake of waiters.splice(0)) wake();
    },
    waiting: () => waiters.length,
  };
}

describe("background-interrupted requests", () => {
  test("wait for the foreground and retry once before rejecting", async () => {
    const control = fakeGate();
    let attempts = 0;
    const run = runMobileHttpRequestWithRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          control.background();
          throw new Error("Could not connect to the server.");
        }
        return "ok";
      },
      { attempts: 1, foregroundGate: control.gate, sleep: async () => {} },
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(control.waiting()).toBe(1);
    expect(attempts).toBe(1);
    control.activate();
    expect(await run).toBe("ok");
    expect(attempts).toBe(2);
  });

  test("a second background failure reaches the caller (one extra attempt only)", async () => {
    const control = fakeGate();
    let attempts = 0;
    const run = runMobileHttpRequestWithRetry(
      async () => {
        attempts += 1;
        control.background();
        control.activate();
        throw new Error("The network connection was lost.");
      },
      { attempts: 1, foregroundGate: control.gate, sleep: async () => {} },
    );
    await expect(run).rejects.toThrow("network connection was lost");
    expect(attempts).toBe(2);
  });

  test("the background retry does not consume the transient budget", async () => {
    const control = fakeGate();
    let attempts = 0;
    const result = await runMobileHttpRequestWithRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          control.background();
          control.activate();
        }
        if (attempts < 4) throw new Error("Request timed out.");
        return "ok";
      },
      { foregroundGate: control.gate, sleep: async () => {} },
    );
    expect(result).toBe("ok");
    expect(attempts).toBe(4);
  });

  test("a source deadline that ran out in the background is retried; in the foreground it is not", async () => {
    const control = fakeGate();
    let attempts = 0;
    const result = await runMobileHttpRequestWithRetry(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          control.background();
          control.activate();
          throw timeoutError("Source operation timed out.");
        }
        return "ok";
      },
      { attempts: 1, foregroundGate: control.gate },
    );
    expect(result).toBe("ok");
    await expect(
      runMobileHttpRequestWithRetry(
        async () => {
          throw timeoutError("Source operation timed out.");
        },
        { attempts: 1, foregroundGate: control.gate },
      ),
    ).rejects.toThrow("Source operation timed out.");
  });

  test("a caller abort while backgrounded is never retried", async () => {
    const control = fakeGate();
    const controller = new AbortController();
    let attempts = 0;
    const run = runMobileHttpRequestWithRetry(
      async () => {
        attempts += 1;
        control.background();
        controller.abort();
        throw new Error("Request cancelled or app is not active.");
      },
      { signal: controller.signal, foregroundGate: control.gate },
    );
    await expect(run).rejects.toMatchObject({ name: "AbortError" });
    expect(attempts).toBe(1);
  });

  test("foreground failures with no background transition keep the old policy", () => {
    const control = fakeGate();
    expect(
      isMobileHttpBackgroundInterruption(
        new Error("Could not connect to the server."),
        { gate: control.gate, epochAtStart: 0 },
      ),
    ).toBe(false);
    control.background();
    expect(
      isMobileHttpBackgroundInterruption(
        new Error("Could not connect to the server."),
        { gate: control.gate, epochAtStart: 0 },
      ),
    ).toBe(true);
    expect(
      isMobileHttpBackgroundInterruption(new Error("HTTP 404"), {
        gate: control.gate,
        epochAtStart: 0,
      }),
    ).toBe(false);
    expect(
      isMobileHttpBackgroundInterruption(new Error("timed out"), {
        gate: null,
        epochAtStart: 0,
      }),
    ).toBe(false);
  });
});

describe("AppState foreground gate", () => {
  function fakeAppState(initial: "active" | "background" | "inactive") {
    let listener: ((state: "active" | "background" | "inactive") => void) | null =
      null;
    return {
      appState: {
        currentState: initial,
        addEventListener(
          _type: "change",
          next: (state: "active" | "background" | "inactive") => void,
        ) {
          listener = next;
          return { remove() {} };
        },
      },
      emit(state: "active" | "background" | "inactive") {
        listener?.(state);
      },
    };
  }

  test("counts background transitions and releases waiters on active", async () => {
    const fake = fakeAppState("active");
    const gate = createMobileHttpForegroundGate(fake.appState as never);
    expect(gate.isActive()).toBe(true);
    fake.emit("inactive");
    expect(gate.backgroundEpoch()).toBe(0);
    fake.emit("background");
    expect(gate.backgroundEpoch()).toBe(1);
    let released = false;
    const wait = gate.waitForActive().then(() => {
      released = true;
    });
    await Promise.resolve();
    expect(released).toBe(false);
    fake.emit("active");
    await wait;
    expect(released).toBe(true);
  });

  test("a waiter gives up at the cap or on abort", async () => {
    const fake = fakeAppState("background");
    const gate = createMobileHttpForegroundGate(fake.appState as never, {
      maxWaitMs: 5,
    });
    await gate.waitForActive();
    const controller = new AbortController();
    const wait = gate.waitForActive(controller.signal);
    controller.abort();
    await wait;
    expect(gate.isActive()).toBe(false);
  });
});
