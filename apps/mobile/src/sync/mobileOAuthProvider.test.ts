import { describe, expect, it } from "bun:test";
import {
  canSelectMobileCloudSignOutChoice,
  classifyMobileCloudSignOutError,
  canStartMobileCloudSignOut,
  canStartMobileOAuthSignIn,
  completeMobileCloudSignOut,
  getMobileCloudSignOutResultAction,
  normalizeMobileOAuthProvider,
  resolveMobileCloudSignInErrorDetail,
  resolveMobileOAuthSignInOutcome,
  MOBILE_APPLE_SYSTEM_SHEET_GRACE_MS,
  MOBILE_OAUTH_SESSION_MAX_MS,
  watchMobileOAuthSession,
  withMobileAuthDeadline,
} from "./mobileOAuthProvider";
import { signOutAndUnregisterMobileBackgroundSync } from "./mobileBackgroundSyncLifecycle";

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
            storageUnavailable: "storage unavailable",
          },
        ),
      ).toBe(detail);
    }
  });

  it("surfaces a localized retry message when auth storage cannot persist", () => {
    expect(
      resolveMobileCloudSignInErrorDetail(
        { message: "MOBILE_AUTH_STORAGE_UNAVAILABLE" },
        {
          signInFailed: "fallback",
          networkUnavailable: "offline",
          storageUnavailable:
            "nemu could not securely save this sign-in. Check device storage and try again.",
        },
      ),
    ).toBe(
      "nemu could not securely save this sign-in. Check device storage and try again.",
    );
  });

  it("treats a dismissed OAuth browser as neither success nor failure", () => {
    expect(resolveMobileOAuthSignInOutcome({ data: null, error: null })).toBe(
      "dismissed",
    );
    expect(resolveMobileOAuthSignInOutcome({ data: {} })).toBe("dismissed");
    expect(resolveMobileOAuthSignInOutcome(undefined)).toBe("dismissed");
  });

  it("confirms sign-in only when the callback persisted a session user", () => {
    expect(
      resolveMobileOAuthSignInOutcome({
        data: { user: { id: "user-1" } },
        error: null,
      }),
    ).toBe("signed-in");
  });

  it("surfaces a session lookup failure instead of a false success", () => {
    expect(
      resolveMobileOAuthSignInOutcome({
        data: null,
        error: { status: 503, message: "MOBILE_AUTH_NETWORK_UNAVAILABLE" },
      }),
    ).toBe("failed");
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
      signOutAndUnregister: async (onSignOutConfirmed) => {
        calls.push("sign-out");
        await onSignOutConfirmed();
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

  it("honors the selected local disposition after confirmed sign-out cleanup", async () => {
    const calls: string[] = [];

    await completeMobileCloudSignOut({
      keepData: false,
      signOutAndUnregister: (onSignOutConfirmed) =>
        signOutAndUnregisterMobileBackgroundSync({
          onSignOutConfirmed,
          signOut: async () => {
            calls.push("confirmed-sign-out");
            return { data: { success: true }, error: null };
          },
          unregister: async () => {
            calls.push("unregister-failed");
            throw new Error("OS scheduler unavailable");
          },
        }),
      retainLocalData: async () => {
        calls.push("retain");
      },
      clearLocalData: async () => {
        calls.push("clear");
      },
    });

    expect(calls).toEqual([
      "confirmed-sign-out",
      "clear",
      "unregister-failed",
    ]);
  });
});

describe("classifyMobileCloudSignOutError", () => {
  it("the auth transport's codes are classified, never shown", () => {
    expect(classifyMobileCloudSignOutError(new Error("MOBILE_AUTH_NETWORK_UNAVAILABLE"))).toBe("network");
    expect(classifyMobileCloudSignOutError(new Error("MOBILE_AUTH_STORAGE_UNAVAILABLE"))).toBe("storage");
    expect(classifyMobileCloudSignOutError(new Error("Failed to confirm sign out"))).toBe("other");
    expect(classifyMobileCloudSignOutError("nope")).toBe("other");
  });
});

describe("watchMobileOAuthSession", () => {
  function setup(provider: "apple" | "google" = "apple") {
    const timers = new Map<number, { run: () => void; ms: number }>();
    let nextId = 1;
    let listener: ((state: string) => void) | null = null;
    let unsubscribed = false;
    let dismissals = 0;
    const stop = watchMobileOAuthSession({
      provider,
      subscribeToAppState: (next) => {
        listener = next;
        return () => {
          unsubscribed = true;
        };
      },
      dismiss: () => {
        dismissals += 1;
      },
      setTimer: ((run: () => void, ms: number) => {
        timers.set(nextId, { run, ms });
        return nextId++;
      }) as never,
      clearTimer: ((id: number) => {
        timers.delete(id);
      }) as never,
    });
    const fire = (ms: number) => {
      for (const [id, timer] of [...timers]) {
        if (timer.ms === ms) {
          timers.delete(id);
          timer.run();
        }
      }
    };
    return {
      stop,
      fire,
      send: (...states: string[]) => states.forEach((state) => listener?.(state)),
      hasListener: () => listener !== null,
      graceArmed: () =>
        [...timers.values()].some((timer) => timer.ms === MOBILE_APPLE_SYSTEM_SHEET_GRACE_MS),
      timerCount: () => timers.size,
      dismissals: () => dismissals,
      unsubscribed: () => unsubscribed,
    };
  }

  it("leaves the consent alert alone", () => {
    const watch = setup();
    watch.send("inactive", "active");
    expect(watch.graceArmed()).toBe(false);
  });

  it("closes the session when the system sheet went and no redirect followed", () => {
    const watch = setup();
    watch.send("inactive", "active", "inactive", "active");
    expect(watch.graceArmed()).toBe(true);
    watch.fire(MOBILE_APPLE_SYSTEM_SHEET_GRACE_MS);
    expect(watch.dismissals()).toBe(1);
  });

  it("gives someone on Apple's form 20 seconds", () => {
    expect(MOBILE_APPLE_SYSTEM_SHEET_GRACE_MS).toBe(20 * 1000);
  });

  it("does not close a session that finished inside the grace period", () => {
    const watch = setup();
    watch.send("inactive", "active", "inactive", "active");
    watch.stop();
    expect(watch.timerCount()).toBe(0);
    expect(watch.unsubscribed()).toBe(true);
    expect(watch.dismissals()).toBe(0);
  });

  it("does not count leaving the app for a code as the system sheet", () => {
    const watch = setup();
    watch.send("inactive", "active", "inactive", "background", "active");
    expect(watch.graceArmed()).toBe(false);
  });

  it("does not rearm after returning from the background", () => {
    const watch = setup();
    watch.send("inactive", "active", "inactive", "active", "background", "active");
    expect(watch.graceArmed()).toBe(false);
  });

  it("holds the grace period while another sheet is up", () => {
    const watch = setup();
    watch.send("inactive", "active", "inactive", "active", "inactive");
    expect(watch.graceArmed()).toBe(false);
  });

  it("never watches Google, whose page has no system sheet", () => {
    const watch = setup("google");
    expect(watch.hasListener()).toBe(false);
    expect(watch.graceArmed()).toBe(false);
  });

  it("ends any provider's session when the OAuth state has expired", () => {
    for (const provider of ["apple", "google"] as const) {
      const watch = setup(provider);
      watch.fire(MOBILE_OAUTH_SESSION_MAX_MS);
      expect(watch.dismissals()).toBe(1);
    }
  });
});

describe("withMobileAuthDeadline", () => {
  it("settles with the fallback when the work never does", async () => {
    await expect(
      withMobileAuthDeadline(new Promise<string>(() => undefined), 1, "late"),
    ).resolves.toBe("late");
  });

  it("passes through a result and a rejection", async () => {
    await expect(withMobileAuthDeadline(Promise.resolve("ok"), 1000, "late")).resolves.toBe("ok");
    await expect(
      withMobileAuthDeadline(Promise.reject(new Error("no")), 1000, "late"),
    ).rejects.toThrow("no");
  });
});
