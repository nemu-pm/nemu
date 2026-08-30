import { describe, expect, test } from "bun:test";
import { createRetryablePromiseCache } from "./retryablePromiseCache";

describe("retryable promise cache", () => {
  test("shares and permanently caches a successful creation", async () => {
    let calls = 0;
    const get = createRetryablePromiseCache(async () => ({ call: ++calls }));

    const first = get();
    const second = get();
    expect(first).toBe(second);
    expect(await first).toEqual({ call: 1 });
    expect(await get()).toEqual({ call: 1 });
    expect(calls).toBe(1);
  });

  test("clears a rejected creation so the next request can recover", async () => {
    let calls = 0;
    const get = createRetryablePromiseCache(async () => {
      calls += 1;
      if (calls === 1) throw new Error("runtime unavailable");
      return "ready";
    });

    await expect(get()).rejects.toThrow("runtime unavailable");
    expect(await get()).toBe("ready");
    expect(calls).toBe(2);
  });
});
