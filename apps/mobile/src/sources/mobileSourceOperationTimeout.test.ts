import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MOBILE_SOURCE_OPERATION_TIMEOUT_MS,
  isMobileSourceOperationTimeoutError,
  withMobileSourceOperationTimeout,
} from "./mobileSourceOperationTimeout";

describe("mobile source operation timeout", () => {
  test("caps the full source operation below the native long-task window", () => {
    expect(DEFAULT_MOBILE_SOURCE_OPERATION_TIMEOUT_MS).toBe(20_000);
  });

  test("resolves successful operations before the deadline", async () => {
    await expect(
      withMobileSourceOperationTimeout(Promise.resolve("ready"), {
        timeoutMs: 10,
      }),
    ).resolves.toBe("ready");
  });

  test("rejects hung operations with a typed timeout", async () => {
    const error = await withMobileSourceOperationTimeout(
      new Promise(() => undefined),
      {
        timeoutMs: 1,
        message: "Timed out while loading source content.",
      },
    ).catch((nextError) => nextError);

    expect(isMobileSourceOperationTimeoutError(error)).toBe(true);
    expect(error).toMatchObject({
      name: "MobileSourceOperationTimeoutError",
      message: "Timed out while loading source content.",
    });
  });
});
