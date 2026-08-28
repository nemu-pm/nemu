import { beforeEach, describe, expect, mock, test } from "bun:test";

const getMobileNativeHttpStatusMock = mock<() => Record<string, unknown>>(() => ({
  available: true,
  version: "built-in",
  platform: "ios",
  detail: "Native source networking is available.",
}));

mock.module("@/sources/mobileNativeHttp", () => ({
  getMobileNativeHttpStatus: getMobileNativeHttpStatusMock,
}));

import {
  canCheckMobileAgentStatus,
  fetchMobileAgentStatus,
  getMobileAgentCapability,
  isMobileAgentActionBusy,
} from "./mobileAgentStatus";

describe("mobile agent status", () => {
  beforeEach(() => {
    getMobileNativeHttpStatusMock.mockReset();
    getMobileNativeHttpStatusMock.mockImplementation(() => ({
      available: true,
      supportsCloudflareSolver: false,
      version: "built-in",
      platform: "ios",
      detail: "Native source networking is available.",
    }));
  });

  test("reads built-in native source networking status", async () => {
    await expect(fetchMobileAgentStatus()).resolves.toEqual({
      available: true,
      supportsCloudflareSolver: false,
      version: "built-in",
      platform: "ios",
      detail: "Native source networking is available.",
    });
  });

  test("ignores malformed optional metadata", async () => {
    getMobileNativeHttpStatusMock.mockImplementation(() => ({
      available: true,
      version: 3,
      platform: null,
      detail: "",
    }));

    await expect(fetchMobileAgentStatus()).resolves.toEqual({
      available: true,
      supportsCloudflareSolver: false,
      version: undefined,
      platform: undefined,
      detail: undefined,
    });
  });

  test("reports Cloudflare verification only from the explicit native capability", async () => {
    getMobileNativeHttpStatusMock.mockImplementation(() => ({
      available: true,
      supportsCloudflareSolver: true,
    }));

    await expect(fetchMobileAgentStatus()).resolves.toMatchObject({
      available: true,
      supportsCloudflareSolver: true,
    });
  });

  test("returns unavailable when native status throws", async () => {
    getMobileNativeHttpStatusMock.mockImplementation(() => {
      throw new Error("native module missing");
    });

    await expect(fetchMobileAgentStatus()).resolves.toEqual({
      available: false,
      supportsCloudflareSolver: false,
      platform: "unknown",
      detail: "native module missing",
      version: undefined,
    });
  });

  test("distinguishes native networking from Cloudflare verification", () => {
    expect(
      getMobileAgentCapability({
        available: true,
        supportsCloudflareSolver: false,
      }),
    ).toBe("native-networking");
    expect(
      getMobileAgentCapability({
        available: true,
        supportsCloudflareSolver: true,
      }),
    ).toBe("cloudflare-verification");
    expect(
      getMobileAgentCapability({
        available: false,
        supportsCloudflareSolver: true,
      }),
    ).toBe("unavailable");
  });

  test("gates status refresh while native work is active", () => {
    const idle = {
      checkingStatus: false,
    };

    expect(isMobileAgentActionBusy(idle)).toBe(false);
    expect(canCheckMobileAgentStatus(idle)).toBe(true);
    expect(
      isMobileAgentActionBusy({ ...idle, checkingStatus: true }),
    ).toBe(true);
    expect(
      canCheckMobileAgentStatus({ ...idle, checkingStatus: true }),
    ).toBe(false);
  });
});
