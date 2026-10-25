import { describe, expect, test } from "bun:test";
import {
  followMobileSupersedingReload,
  isMobileReloadCancellation,
} from "./mobileReloadHandover";

function abortError(message = "The registry catalog fetch was aborted.") {
  const error = new Error(message);
  error.name = "AbortError";
  return error;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("superseded reload hand-over", () => {
  test("a reload aborted by a newer one settles with the newer result", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    let latest: Promise<string> = first.promise;
    const user = followMobileSupersedingReload(first.promise, () => latest);
    latest = second.promise;
    first.reject(abortError());
    second.resolve("fresh");
    expect(await user).toBe("fresh");
  });

  test("a superseded reload that returned early also follows its successor", async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    let latest: Promise<string> = first.promise;
    const user = followMobileSupersedingReload(first.promise, () => latest);
    latest = second.promise;
    first.resolve("stale");
    second.reject(new Error("Could not connect to the server."));
    await expect(user).rejects.toThrow("Could not connect to the server.");
  });

  test("a chain of supersessions follows to the last run", async () => {
    const runs = [deferred<number>(), deferred<number>(), deferred<number>()];
    let latest: Promise<number> = runs[0]!.promise;
    const user = followMobileSupersedingReload(runs[0]!.promise, () => latest);
    latest = runs[1]!.promise;
    runs[0]!.reject(abortError());
    await Promise.resolve();
    latest = runs[2]!.promise;
    runs[1]!.reject(abortError());
    runs[2]!.resolve(3);
    expect(await user).toBe(3);
  });

  test("a cancellation with no successor still rejects as a cancellation", async () => {
    const only = Promise.reject(abortError());
    const user = followMobileSupersedingReload(only, () => only);
    const error = await user.catch((caught: unknown) => caught);
    expect(isMobileReloadCancellation(error)).toBe(true);
  });

  test("a real failure of the current run is reported", async () => {
    const only = Promise.reject(new Error("HTTP 500"));
    await expect(
      followMobileSupersedingReload(only, () => only),
    ).rejects.toThrow("HTTP 500");
  });
});
