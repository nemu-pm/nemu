import { describe, expect, test } from "bun:test";
import { createFetch } from "@better-fetch/fetch";
import {
  createFailClosedMobileAuthStorage,
  createFailClosedMobileAuthFetch,
} from "./mobileAuthSecureStorage";

describe("mobile auth secure storage", () => {
  test("normalizes offline transport failures instead of rejecting globally", async () => {
    const safeFetch = createFailClosedMobileAuthFetch(() =>
      Promise.reject(new TypeError("network offline with secret context")),
    );
    const authFetch = createFetch({
      baseURL: "https://auth.invalid",
      customFetchImpl: safeFetch,
    });

    const result = await authFetch("/get-session");

    expect(result.data).toBeNull();
    expect(result.error?.status).toBe(503);
    expect(result.error?.statusText).toBe("Service Unavailable");
    expect(JSON.stringify(result.error)).not.toContain("secret context");
  });

  test("normalizes aborted native fetches without leaking the abort rejection", async () => {
    const controller = new AbortController();
    controller.abort();
    const safeFetch = createFailClosedMobileAuthFetch(() =>
      Promise.reject(new Error("native abort detail")),
    );

    const response = await safeFetch("https://auth.invalid", {
      signal: controller.signal,
    });

    expect(response.status).toBe(499);
    expect(response.statusText).toBe("Request Cancelled");
    expect(await response.json()).toEqual({
      message: "Authentication network unavailable.",
    });
  });

  test("preserves successful reads and writes", () => {
    const values = new Map<string, string>();
    const storage = createFailClosedMobileAuthStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    });

    storage.setItem("cookie", "secret");

    expect(storage.getItem("cookie")).toBe("secret");
  });

  test("fails closed and emits one stable warning without secret context", () => {
    const warnings: string[] = [];
    const storage = createFailClosedMobileAuthStorage(
      {
        getItem() {
          throw new Error("native failure containing a secret");
        },
        setItem() {
          throw new Error("native write failure containing a secret");
        },
      },
      () => warnings.push("secure_storage_unavailable"),
    );

    expect(storage.getItem("sensitive-cookie-key")).toBeNull();
    expect(storage.setItem("sensitive-cookie-key", "sensitive-value")).toBeUndefined();
    expect(storage.getItem("another-key")).toBeNull();
    expect(warnings).toEqual(["secure_storage_unavailable"]);
    expect(JSON.stringify(warnings)).not.toContain("sensitive");
    expect(JSON.stringify(warnings)).not.toContain("native failure");
  });

  test("swallows asynchronous write failures and deduplicates warnings", async () => {
    const warnings: string[] = [];
    const storage = createFailClosedMobileAuthStorage(
      {
        getItem: () => null,
        setItem: () => Promise.reject(new Error("secret async failure")),
      },
      () => warnings.push("secure_storage_unavailable"),
    );

    await storage.setItem("cookie", "secret");
    await storage.setItem("cookie", "secret");

    expect(warnings).toEqual(["secure_storage_unavailable"]);
  });
});
