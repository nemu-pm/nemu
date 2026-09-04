import { describe, expect, mock, test } from "bun:test";
import { createFetch } from "@better-fetch/fetch";
import {
  createMobileAuthChunkCleanupStorage,
  createFailClosedMobileAuthStorage,
  createFailClosedMobileAuthFetch,
  createHttpsOnlyMobileAuthFetch,
  type MobileAuthHttpsNativeFetch,
} from "./mobileAuthSecureStorage";

const CHUNK_MARKER = "\u0001ba-chunks:";

mock.module("react-native", () => ({
  AppState: {
    addEventListener: () => ({ remove: () => undefined }),
  },
  Platform: { OS: "ios" },
}));
mock.module("expo-constants", () => ({
  default: { expoConfig: { scheme: "nemu" }, platform: {} },
}));
mock.module("expo-linking", () => ({
  createURL: (path: string) => `nemu://${path}`,
}));

class MemoryMutableAuthStorage {
  readonly values = new Map<string, string>();
  failDeleteOnce: string | null = null;
  commitThenThrowKey: string | null = null;
  skipPersistKey: string | null = null;

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.skipPersistKey === key) {
      this.skipPersistKey = null;
      return;
    }
    this.values.set(key, value);
    if (this.commitThenThrowKey === key) {
      this.commitThenThrowKey = null;
      throw new Error("native write reported failure after commit");
    }
  }

  async deleteItem(key: string): Promise<void> {
    if (this.failDeleteOnce === key) {
      this.failDeleteOnce = null;
      throw new Error("native delete failed with secret context");
    }
    this.values.delete(key);
  }
}

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
      code: "MOBILE_AUTH_NETWORK_UNAVAILABLE",
      message: "MOBILE_AUTH_NETWORK_UNAVAILABLE",
    });
  });

  test("retries transient transport failures before reporting offline", async () => {
    let calls = 0;
    const safeFetch = createFailClosedMobileAuthFetch(
      async () => {
        calls += 1;
        if (calls < 3) throw new TypeError("Network request failed");
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
      { sleep: () => Promise.resolve() },
    );

    const response = await safeFetch("https://auth.invalid/get-session");

    expect(response.status).toBe(200);
    expect(calls).toBe(3);
  });

  test("non-idempotent requests are never replayed", async () => {
    // A transport failure says nothing about whether the server saw the
    // request; replaying a sign-up or a one-time-token exchange would consume
    // a single-use credential.
    let calls = 0;
    const safeFetch = createFailClosedMobileAuthFetch(
      async () => {
        calls += 1;
        throw new TypeError("Network request failed");
      },
      { sleep: () => Promise.resolve() },
    );

    const response = await safeFetch("https://auth.invalid/sign-up/email", {
      method: "POST",
      body: "{}",
    });

    expect(response.status).toBe(503);
    expect(calls).toBe(1);
  });

  test("a Request object's own method decides replayability", async () => {
    let calls = 0;
    const safeFetch = createFailClosedMobileAuthFetch(
      async () => {
        calls += 1;
        throw new TypeError("Network request failed");
      },
      { sleep: () => Promise.resolve() },
    );

    await safeFetch(
      new Request("https://auth.invalid/sign-out", { method: "POST" }),
    );

    expect(calls).toBe(1);
  });

  test("non-transient failures are not retried", async () => {
    let calls = 0;
    const safeFetch = createFailClosedMobileAuthFetch(
      async () => {
        calls += 1;
        throw new TypeError("network offline with secret context");
      },
      { sleep: () => Promise.resolve() },
    );

    const response = await safeFetch("https://auth.invalid/get-session");

    expect(response.status).toBe(503);
    expect(calls).toBe(1);
  });

  test("routes auth bodies and cookies through the HTTPS-only bounded native transport", async () => {
    const calls: Array<{
      url: string;
      init: Parameters<MobileAuthHttpsNativeFetch>[1];
    }> = [];
    const authFetch = createHttpsOnlyMobileAuthFetch(async (url, init) => {
      calls.push({ url, init });
      return {
        status: 200,
        headers: { "set-cookie": "nemu.session=next" },
        body: JSON.stringify({ ok: true }),
      };
    });

    const response = await authFetch("https://auth.example.test/sign-in", {
      method: "POST",
      headers: {
        cookie: "nemu.session=secret",
        "content-type": "application/json",
      },
      body: JSON.stringify({ password: "credential" }),
    });

    expect(await response.json()).toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toBe("nemu.session=next");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://auth.example.test/sign-in");
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ password: "credential" }),
      maxResponseBytes: 2 * 1024 * 1024,
      requireHttps: true,
      responseMode: "text",
    });
    expect(calls[0]?.init.headers).toMatchObject({
      cookie: "nemu.session=secret",
      "content-type": "application/json",
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

  test("fails reads closed and throws one stable write error without secret context", () => {
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
    expect(() =>
      storage.setItem("sensitive-cookie-key", "sensitive-value"),
    ).toThrow("MOBILE_AUTH_STORAGE_UNAVAILABLE");
    expect(storage.getItem("another-key")).toBeNull();
    expect(warnings).toEqual(["secure_storage_unavailable"]);
    expect(JSON.stringify(warnings)).not.toContain("sensitive");
    expect(JSON.stringify(warnings)).not.toContain("native failure");
  });

  test("sanitizes asynchronous write failures and deduplicates warnings", async () => {
    const warnings: string[] = [];
    const storage = createFailClosedMobileAuthStorage(
      {
        getItem: () => null,
        setItem: () => Promise.reject(new Error("secret async failure")),
      },
      () => warnings.push("secure_storage_unavailable"),
    );

    await expect(storage.setItem("cookie", "secret")).rejects.toThrow(
      "MOBILE_AUTH_STORAGE_UNAVAILABLE",
    );
    await expect(storage.setItem("cookie", "secret")).rejects.toThrow(
      "MOBILE_AUTH_STORAGE_UNAVAILABLE",
    );

    expect(warnings).toEqual(["secure_storage_unavailable"]);
  });

  test("deletes Better Auth cookie and session chunks when values shrink", async () => {
    const raw = new MemoryMutableAuthStorage();
    for (const baseKey of ["nemu_cookie", "nemu_session_data"]) {
      raw.values.set(baseKey, `${CHUNK_MARKER}3`);
      raw.values.set(`${baseKey}.0`, "old-0");
      raw.values.set(`${baseKey}.1`, "old-1");
      raw.values.set(`${baseKey}.2`, "old-2");
    }
    const storage = createMobileAuthChunkCleanupStorage(raw, {
      storagePrefix: "nemu",
    });

    await storage.setItem("nemu_cookie", "{}");
    await storage.setItem("nemu_session_data", "{}");

    expect(raw.values.get("nemu_cookie")).toBe("{}");
    expect(raw.values.get("nemu_session_data")).toBe("{}");
    expect(
      Array.from(raw.values.keys()).some((key) =>
        /^nemu_(?:cookie|session_data)\.\d+$/.test(key),
      ),
    ).toBe(false);
  });

  test("preserves a newly written chunk set and removes an older longer tail", async () => {
    const raw = new MemoryMutableAuthStorage();
    raw.values.set("nemu_cookie", `${CHUNK_MARKER}4`);
    for (let index = 0; index < 4; index += 1) {
      raw.values.set(`nemu_cookie.${index}`, `old-${index}`);
    }
    const storage = createMobileAuthChunkCleanupStorage(raw, {
      storagePrefix: "nemu",
    });

    // This is the exact sequence used by @better-auth/expo's storage adapter.
    await storage.setItem("nemu_cookie", "");
    await storage.setItem("nemu_cookie.0", "new-0");
    await storage.setItem("nemu_cookie.1", "new-1");
    await storage.setItem("nemu_cookie", `${CHUNK_MARKER}2`);

    expect(raw.values.get("nemu_cookie")).toBe(`${CHUNK_MARKER}2`);
    expect(raw.values.get("nemu_cookie.0")).toBe("new-0");
    expect(raw.values.get("nemu_cookie.1")).toBe("new-1");
    expect(raw.values.has("nemu_cookie.2")).toBe(false);
    expect(raw.values.has("nemu_cookie.3")).toBe(false);
  });

  test("recovers orphan chunks left before Better Auth commits its marker", async () => {
    const raw = new MemoryMutableAuthStorage();
    const firstProcess = createMobileAuthChunkCleanupStorage(raw, {
      storagePrefix: "nemu",
    });
    await firstProcess.setItem("nemu_cookie", "");
    await firstProcess.setItem("nemu_cookie.0", "orphan-secret");

    const afterRestart = createMobileAuthChunkCleanupStorage(raw, {
      storagePrefix: "nemu",
    });
    await afterRestart.recoverStaleChunks();

    expect(raw.values.get("nemu_cookie")).toBe("");
    expect(raw.values.has("nemu_cookie.0")).toBe(false);
    expect(raw.values.has("nemu_cookie.__nemu_chunk_high_water")).toBe(false);
  });

  test("fails closed on malformed or unbounded markers without synchronous read loops", async () => {
    for (const marker of [
      `${CHUNK_MARKER}999999999`,
      `${CHUNK_MARKER}not-a-count`,
    ]) {
      const raw = new MemoryMutableAuthStorage();
      raw.values.set("nemu_cookie", marker);
      raw.values.set("nemu_cookie.0", "legacy-secret-0");
      raw.values.set("nemu_cookie.63", "legacy-secret-63");
      raw.values.set("nemu_cookie.__nemu_chunk_high_water", "999999999");
      const storage = createMobileAuthChunkCleanupStorage(raw, {
        storagePrefix: "nemu",
      });

      expect(storage.getItem("nemu_cookie")).toBeNull();
      await storage.recoverStaleChunks();

      expect(raw.values.has("nemu_cookie")).toBe(false);
      expect(raw.values.has("nemu_cookie.0")).toBe(false);
      expect(raw.values.has("nemu_cookie.63")).toBe(false);
      expect(raw.values.has("nemu_cookie.__nemu_chunk_high_water")).toBe(false);
    }
  });

  test("uses a durable cleanup journal when secure deletion is interrupted", async () => {
    const raw = new MemoryMutableAuthStorage();
    raw.values.set("nemu_session_data", `${CHUNK_MARKER}2`);
    raw.values.set("nemu_session_data.0", "session-secret-0");
    raw.values.set("nemu_session_data.1", "session-secret-1");
    raw.failDeleteOnce = "nemu_session_data.0";
    const firstProcess = createMobileAuthChunkCleanupStorage(raw, {
      storagePrefix: "nemu",
    });

    await expect(
      firstProcess.setItem("nemu_session_data", "{}"),
    ).rejects.toThrow("native delete failed");
    expect(raw.values.get("nemu_session_data")).toBe("{}");
    expect(raw.values.has("nemu_session_data.__nemu_chunk_cleanup")).toBe(true);

    const afterRestart = createMobileAuthChunkCleanupStorage(raw, {
      storagePrefix: "nemu",
    });
    await afterRestart.recoverStaleChunks();

    expect(raw.values.has("nemu_session_data.0")).toBe(false);
    expect(raw.values.has("nemu_session_data.1")).toBe(false);
    expect(raw.values.has("nemu_session_data.__nemu_chunk_cleanup")).toBe(
      false,
    );
  });

  test("fails closed when a shrinking base write is silently dropped", async () => {
    const raw = new MemoryMutableAuthStorage();
    raw.values.set("nemu_cookie", `${CHUNK_MARKER}2`);
    raw.values.set("nemu_cookie.0", "secret-0");
    raw.values.set("nemu_cookie.1", "secret-1");
    raw.skipPersistKey = "nemu_cookie";
    const firstProcess = createMobileAuthChunkCleanupStorage(raw, {
      storagePrefix: "nemu",
    });

    await expect(firstProcess.setItem("nemu_cookie", "{}")).rejects.toThrow(
      "did not persist",
    );
    expect(firstProcess.getItem("nemu_cookie")).toBeNull();

    const afterRestart = createMobileAuthChunkCleanupStorage(raw, {
      storagePrefix: "nemu",
    });
    await afterRestart.recoverStaleChunks();
    expect(raw.values.has("nemu_cookie")).toBe(false);
    expect(raw.values.has("nemu_cookie.0")).toBe(false);
    expect(raw.values.has("nemu_cookie.1")).toBe(false);
  });

  test("finishes cleanup when a shrinking base committed before throwing", async () => {
    const raw = new MemoryMutableAuthStorage();
    raw.values.set("nemu_cookie", `${CHUNK_MARKER}2`);
    raw.values.set("nemu_cookie.0", "secret-0");
    raw.values.set("nemu_cookie.1", "secret-1");
    raw.commitThenThrowKey = "nemu_cookie";
    const firstProcess = createMobileAuthChunkCleanupStorage(raw, {
      storagePrefix: "nemu",
    });

    await expect(firstProcess.setItem("nemu_cookie", "{}")).rejects.toThrow(
      "after commit",
    );
    expect(firstProcess.getItem("nemu_cookie")).toBeNull();

    const afterRestart = createMobileAuthChunkCleanupStorage(raw, {
      storagePrefix: "nemu",
    });
    await afterRestart.recoverStaleChunks();
    expect(raw.values.get("nemu_cookie")).toBe("{}");
    expect(raw.values.has("nemu_cookie.0")).toBe(false);
    expect(raw.values.has("nemu_cookie.1")).toBe(false);
  });

  test("rejects unbounded chunk indices and oversized direct items", async () => {
    const raw = new MemoryMutableAuthStorage();
    const storage = createMobileAuthChunkCleanupStorage(raw, {
      storagePrefix: "nemu",
    });

    await expect(storage.setItem("nemu_cookie.64", "secret")).rejects.toThrow(
      "safety limit",
    );
    await expect(
      storage.setItem("nemu_cookie", "x".repeat(1_801)),
    ).rejects.toThrow("portable size limit");
    expect(raw.values.has("nemu_cookie.64")).toBe(false);
    expect(raw.values.has("nemu_cookie")).toBe(false);
  });

  test("Better Auth chunks multibyte values by UTF-8 bytes without splitting code points", async () => {
    const { storageAdapter } = await import("@better-auth/expo/client");
    const raw = new MemoryMutableAuthStorage();
    const storage = createMobileAuthChunkCleanupStorage(raw, {
      storagePrefix: "nemu",
    });
    const adapter = storageAdapter(storage);
    const value = `${"漢".repeat(901)}${"😀".repeat(451)}`;

    await adapter.setItem("nemu_cookie", value);

    expect(adapter.getItem("nemu_cookie")).toBe(value);
    const count = Number(
      raw.values
        .get("nemu_cookie")
        ?.slice(CHUNK_MARKER.length),
    );
    expect(count).toBeGreaterThan(1);
    for (let index = 0; index < count; index += 1) {
      const chunk = raw.values.get(`nemu_cookie.${index}`);
      expect(chunk).toBeDefined();
      expect(new TextEncoder().encode(chunk).byteLength).toBeLessThanOrEqual(
        1_800,
      );
      expect(chunk).not.toMatch(/[\uD800-\uDBFF]$/);
      expect(chunk).not.toMatch(/^[\uDC00-\uDFFF]/);
    }
  });

  test("Better Auth rethrows storage failures as a stable sanitized error", async () => {
    const { storageAdapter } = await import("@better-auth/expo/client");
    const adapter = storageAdapter({
      getItem: () => null,
      setItem() {
        throw new Error("native key and secret value must not escape");
      },
    });

    await expect(adapter.setItem("nemu_cookie", "credential")).rejects.toThrow(
      "MOBILE_AUTH_STORAGE_UNAVAILABLE",
    );
  });

  test("does not report an auth response as successful when its cookie cannot persist", async () => {
    const { expoClient } = await import("@better-auth/expo/client");
    const plugin = expoClient({
      scheme: "nemu",
      storagePrefix: "nemu",
      cookiePrefix: "nemu",
      storage: {
        getItem: () => null,
        setItem() {
          throw new Error("secret native persistence detail");
        },
      },
    });
    const onSuccess = plugin.fetchPlugins[0]?.hooks?.onSuccess;
    if (!onSuccess) throw new Error("Expo auth success hook is missing");

    await expect(
      onSuccess({
        data: { ok: true },
        response: new Response(null, {
          headers: {
            "set-cookie": "nemu.session_token=value; Path=/; HttpOnly",
          },
        }),
        request: {
          baseURL: "https://auth.example.test",
          body: "{}",
          url: new URL("https://auth.example.test/sign-in/social"),
        },
      } as never),
    ).rejects.toThrow("MOBILE_AUTH_STORAGE_UNAVAILABLE");
  });
});
