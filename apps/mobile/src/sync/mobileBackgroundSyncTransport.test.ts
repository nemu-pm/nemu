import { describe, expect, test } from "bun:test";
import {
  createMobileBackgroundSyncFetch,
  MOBILE_BACKGROUND_SYNC_NATIVE_RESPONSE_MAX_BYTES,
} from "./mobileBackgroundSyncTransport";

describe("mobile background sync transport", () => {
  test("preserves Convex bearer requests through a bounded HTTPS-only native fetch", async () => {
    const calls: Array<{
      url: string;
      init: Parameters<
        Parameters<typeof createMobileBackgroundSyncFetch>[0]
      >[1];
    }> = [];
    const controller = new AbortController();
    const fetch = createMobileBackgroundSyncFetch(async (url, init) => {
      calls.push({ url, init });
      return {
        status: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ value: 1 }),
      };
    }, controller.signal);

    const response = await fetch("https://custom-sync.example.test/api/query", {
      method: "POST",
      headers: {
        authorization: "Bearer fixed-task-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ path: "sync:generation", args: {} }),
    });

    expect(await response.json()).toEqual({ value: 1 });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      "https://custom-sync.example.test/api/query",
    );
    expect(calls[0]?.init).toMatchObject({
      method: "POST",
      body: JSON.stringify({ path: "sync:generation", args: {} }),
      maxResponseBytes: MOBILE_BACKGROUND_SYNC_NATIVE_RESPONSE_MAX_BYTES,
      requireHttps: true,
      responseMode: "text",
      signal: controller.signal,
    });
    expect(calls[0]?.init.headers).toMatchObject({
      authorization: "Bearer fixed-task-token",
      "content-type": "application/json",
    });
  });

  test("allows valid sync pages larger than the narrower auth response cap", async () => {
    const body = "x".repeat(2 * 1024 * 1024 + 1);
    let observedMaxResponseBytes = 0;
    const fetch = createMobileBackgroundSyncFetch(async (_url, init) => {
      observedMaxResponseBytes = init.maxResponseBytes;
      return { status: 200, headers: {}, body };
    }, new AbortController().signal);

    const response = await fetch("https://custom-sync.example.test/api/query");

    expect((await response.text()).length).toBe(body.length);
    expect(observedMaxResponseBytes).toBe(32 * 1024 * 1024);
  });
});
