import { describe, expect, test } from "bun:test";
import {
  MOBILE_NATIVE_HTTP_REQUIRED_ABI_VERSION,
  assertMobileNativeHttpCapability,
  resolveMobileNativeHttpCapabilityStatus,
} from "./mobileNativeHttpCapabilities";

const completeModule = {
  prepareHttpRequest() {},
  cancelHttpRequest() {},
  releaseHttpRequest() {},
  async downloadHttpFile() {},
  async sendHttpRequest() {},
  sendHttpRequestSync() {},
  async resetMobileSourceProfileAuthState() {},
};

describe("mobile native HTTP capability negotiation", () => {
  test("accepts the current ABI", () => {
    expect(
      resolveMobileNativeHttpCapabilityStatus(
        {
          available: true,
          abiVersion: MOBILE_NATIVE_HTTP_REQUIRED_ABI_VERSION,
          supportsRequestLifecycle: true,
        },
        completeModule,
      ),
    ).toMatchObject({ available: true, supportsRequestLifecycle: true });
  });

  test("fails closed when the installed native bridge omits its ABI", () => {
    expect(
      resolveMobileNativeHttpCapabilityStatus(
        { available: true, version: "built-in" },
        completeModule,
      ),
    ).toMatchObject({ available: false, supportsRequestLifecycle: false });
  });

  test("fails closed when Metro JS is newer than the installed native app", () => {
    const status = resolveMobileNativeHttpCapabilityStatus(
      { available: true, version: "built-in" },
      {
        sendHttpRequest() {},
        sendHttpRequestSync() {},
      },
    );

    expect(status).toMatchObject({
      available: false,
      supportsRequestLifecycle: false,
    });
    expect(status.detail).toContain("out of date");
    expect(() => assertMobileNativeHttpCapability(status)).toThrow(
      "reinstall Nemu",
    );
  });

  test("rejects an explicitly old ABI even when method names exist", () => {
    const status = resolveMobileNativeHttpCapabilityStatus(
      {
        available: true,
        abiVersion: MOBILE_NATIVE_HTTP_REQUIRED_ABI_VERSION - 1,
        supportsRequestLifecycle: true,
      },
      completeModule,
    );

    expect(status.available).toBe(false);
  });

  test("preserves a native unavailable reason", () => {
    const status = resolveMobileNativeHttpCapabilityStatus(
      { available: false, platform: "web", detail: "Unavailable on web." },
      {},
    );

    expect(status).toEqual({
      available: false,
      platform: "web",
      detail: "Unavailable on web.",
    });
  });
});
