import { describe, expect, test } from "bun:test";
import {
  createMobileNativeHttpRequestId,
  runAbortableMobileNativeHttpRequest,
} from "./mobileNativeHttpAbort";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe("mobile native HTTP abort orchestration", () => {
  test("does not enter native code for a pre-aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    let prepared = 0;
    let executed = 0;

    await expect(
      runAbortableMobileNativeHttpRequest({
        requestId: "pre-aborted",
        signal: controller.signal,
        prepare: () => {
          prepared += 1;
        },
        cancel: () => {},
        release: () => {},
        execute: async () => {
          executed += 1;
          return "late";
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(prepared).toBe(0);
    expect(executed).toBe(0);
  });

  test("cancels an in-flight native request and rejects its late result", async () => {
    const controller = new AbortController();
    const pending = deferred<string>();
    const cancelled: string[] = [];
    const released: string[] = [];
    let applied = false;
    const request = runAbortableMobileNativeHttpRequest({
      requestId: "target",
      signal: controller.signal,
      prepare: () => {},
      cancel: (requestId) => cancelled.push(requestId),
      release: (requestId) => released.push(requestId),
      execute: () => pending.promise,
    }).then(() => {
      applied = true;
    });

    controller.abort();
    pending.resolve("late response");

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(cancelled).toEqual(["target"]);
    expect(released).toEqual(["target"]);
    expect(applied).toBe(false);
  });

  test("preserves a caller-provided abort reason over a native cancellation error", async () => {
    const controller = new AbortController();
    const pending = deferred<string>();
    const deadline = new Error("Source installation timed out.");
    deadline.name = "MobileSourceOperationTimeoutError";
    const request = runAbortableMobileNativeHttpRequest({
      requestId: "deadline",
      signal: controller.signal,
      prepare: () => {},
      cancel: () => {},
      release: () => {},
      execute: () => pending.promise,
    });

    controller.abort(deadline);
    pending.reject(new Error("Native request cancelled."));

    await expect(request).rejects.toBe(deadline);
  });

  test("aborting one request never cancels a concurrent request", async () => {
    const firstController = new AbortController();
    const first = deferred<string>();
    const second = deferred<string>();
    const cancelled: string[] = [];
    const run = (requestId: string, signal: AbortSignal, promise: Promise<string>) =>
      runAbortableMobileNativeHttpRequest({
        requestId,
        signal,
        prepare: () => {},
        cancel: (id) => cancelled.push(id),
        release: () => {},
        execute: () => promise,
      });

    const firstRun = run("first", firstController.signal, first.promise);
    const secondRun = run("second", new AbortController().signal, second.promise);
    firstController.abort();
    first.resolve("late");
    second.resolve("ok");

    await expect(firstRun).rejects.toMatchObject({ name: "AbortError" });
    await expect(secondRun).resolves.toBe("ok");
    expect(cancelled).toEqual(["first"]);
  });

  test("generates stable short unique request identifiers", () => {
    const first = createMobileNativeHttpRequestId(1_000);
    const second = createMobileNativeHttpRequestId(1_000);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^nemu-http-[a-z0-9]+-[a-z0-9]+$/);
    expect(first.length).toBeLessThan(64);
  });
});
