import { describe, expect, it } from "bun:test";
import {
  canSelectMobileCloudSignOutChoice,
  canStartMobileCloudSignOut,
  canStartMobileOAuthSignIn,
  completeMobileCloudSignOut,
  getMobileCloudSignOutResultAction,
  normalizeMobileOAuthProvider,
  resolveMobileCloudSignInErrorDetail,
} from "./mobileOAuthProvider";

describe("normalizeMobileOAuthProvider", () => {
  it("localizes offline sign-in failures without exposing the transport message", () => {
    const localizedOffline = [
      "Authentication requires a network connection.",
      "身份验证需要网络连接。",
      "認証にはネットワーク接続が必要です。",
    ];

    for (const detail of localizedOffline) {
      expect(
        resolveMobileCloudSignInErrorDetail(
          {
            status: 503,
            message: "MOBILE_AUTH_NETWORK_UNAVAILABLE",
          },
          {
            signInFailed: "fallback",
            networkUnavailable: detail,
          },
        ),
      ).toBe(detail);
    }
  });

  it("keeps supported OAuth providers", () => {
    expect(normalizeMobileOAuthProvider("google")).toBe("google");
    expect(normalizeMobileOAuthProvider("apple")).toBe("apple");
  });

  it("hides unsupported or missing providers", () => {
    expect(normalizeMobileOAuthProvider("credential")).toBeNull();
    expect(normalizeMobileOAuthProvider(null)).toBeNull();
    expect(normalizeMobileOAuthProvider(undefined)).toBeNull();
  });

  it("gates mobile cloud auth actions while another auth action is active", () => {
    expect(canStartMobileOAuthSignIn(null, false)).toBe(true);
    expect(canStartMobileOAuthSignIn("google", false)).toBe(false);
    expect(canStartMobileOAuthSignIn(null, true)).toBe(false);

    expect(canStartMobileCloudSignOut(null, false)).toBe(true);
    expect(canStartMobileCloudSignOut("apple", false)).toBe(false);
    expect(canStartMobileCloudSignOut(null, true)).toBe(false);
  });

  it("only allows inactive cloud sign-out choices while idle", () => {
    expect(
      canSelectMobileCloudSignOutChoice({ active: false, loading: false }),
    ).toBe(true);
    expect(
      canSelectMobileCloudSignOutChoice({ active: true, loading: false }),
    ).toBe(false);
    expect(
      canSelectMobileCloudSignOutChoice({ active: false, loading: true }),
    ).toBe(false);
  });

  it("keeps failed cloud sign-outs retryable from the confirmation sheet", () => {
    expect(getMobileCloudSignOutResultAction({ succeeded: true })).toBe(
      "close-confirmation",
    );
    expect(getMobileCloudSignOutResultAction({ succeeded: false })).toBe(
      "keep-confirmation-open",
    );
  });

  it("applies the local-data choice only after sign-out succeeds", async () => {
    const calls: string[] = [];

    await completeMobileCloudSignOut({
      keepData: false,
      signOutAndUnregister: async () => {
        calls.push("sign-out");
      },
      retainLocalData: async () => {
        calls.push("retain");
      },
      clearLocalData: async () => {
        calls.push("clear");
      },
    });

    expect(calls).toEqual(["sign-out", "clear"]);
  });

  it("does not clear local data when remote sign-out fails", async () => {
    let clearCalls = 0;

    await expect(
      completeMobileCloudSignOut({
        keepData: false,
        signOutAndUnregister: async () => {
          throw new Error("offline");
        },
        retainLocalData: async () => undefined,
        clearLocalData: async () => {
          clearCalls += 1;
        },
      }),
    ).rejects.toThrow("offline");

    expect(clearCalls).toBe(0);
  });
});
