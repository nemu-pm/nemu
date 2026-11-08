import { describe, expect, test } from "bun:test";
import {
  canSendMobileAccountDeletion,
  mobileAccountDeletionFailureMessage,
  runMobileAccountDeletion,
} from "./mobileAccountDeletion";
import { mobileStringsEn } from "./mobileI18n.en";

const convexError = (code: string) => Object.assign(new Error("Server Error"), { data: { code } });

describe("runMobileAccountDeletion", () => {
  test("a backend without account deletion: nothing is sent, nothing is deleted, no sign-out", async () => {
    const calls: string[] = [];
    const outcome = await runMobileAccountDeletion({
      deleteMyAccount: async () => void calls.push("delete"),
      signOutLocally: async () => (calls.push("signOut"), true),
      backendOutdated: () => true,
    });
    expect(outcome).toEqual({ status: "failed", kind: "server-unavailable" });
    expect(calls).toEqual([]);
    expect(mobileAccountDeletionFailureMessage("server-unavailable", mobileStringsEn))
      .toBe(mobileStringsEn.account.deleteNotAvailableYet);
    expect(mobileStringsEn.account.deleteNotAvailableYet).toContain("not deleted");
  });

  test("a missing function at call time reads as not available yet, never as deleted", async () => {
    let signedOut = false;
    const outcome = await runMobileAccountDeletion({
      deleteMyAccount: async () => {
        throw new Error("[CONVEX A(accountDeletion:deleteMyAccount)] Could not find public function for 'accountDeletion:deleteMyAccount'.");
      },
      signOutLocally: async () => (signedOut = true),
    });
    expect(outcome).toEqual({ status: "failed", kind: "server-unavailable" });
    expect(signedOut).toBe(false);
  });

  test("signs out locally right after a successful deletion", async () => {
    const order: string[] = [];
    const outcome = await runMobileAccountDeletion({
      deleteMyAccount: async () => void order.push("delete"),
      signOutLocally: async () => {
        order.push("signOut");
        return true;
      },
    });
    expect(outcome).toEqual({ status: "deleted", localCleanup: "ok" });
    expect(order).toEqual(["delete", "signOut"]);
  });

  test("a failed deletion never signs out or touches device data", async () => {
    let signedOut = false;
    const outcome = await runMobileAccountDeletion({
      deleteMyAccount: async () => {
        throw convexError("ACCOUNT_DELETION_APPLE_REAUTH_REQUIRED");
      },
      signOutLocally: async () => {
        signedOut = true;
        return true;
      },
    });
    // No native Sign in with Apple is shipped, so re-auth is surfaced, not prompted.
    expect(outcome).toEqual({ status: "failed", kind: "apple-reauth-required" });
    expect(signedOut).toBe(false);
  });

  test("a local sign-out failure is reported but the deletion stands", async () => {
    const outcome = await runMobileAccountDeletion({
      deleteMyAccount: async () => undefined,
      signOutLocally: async () => {
        throw new Error("storage");
      },
    });
    expect(outcome).toEqual({ status: "deleted", localCleanup: "failed" });
  });

  test("maps failure kinds to copy", () => {
    expect(mobileAccountDeletionFailureMessage("apple-reauth-required", mobileStringsEn)).toBe(
      mobileStringsEn.account.deleteReauth,
    );
    expect(mobileAccountDeletionFailureMessage("unknown", mobileStringsEn)).toBe(
      mobileStringsEn.account.deleteFailed,
    );
  });
});

describe("canSendMobileAccountDeletion", () => {
  test("waits for nothing: offline is refused up front", () => {
    expect(canSendMobileAccountDeletion({ isWebSocketConnected: false })).toBe(false);
    expect(canSendMobileAccountDeletion({ isWebSocketConnected: true })).toBe(true);
  });
});

describe("runMobileAccountDeletion with a native Apple account", () => {
  const reauthRequired = convexError("ACCOUNT_DELETION_APPLE_REAUTH_REQUIRED");

  test("runs the system sheet once and retries with its code", async () => {
    const calls: Array<{ appleAuthorizationCode?: string }> = [];
    const outcome = await runMobileAccountDeletion({
      deleteMyAccount: async (args) => {
        calls.push(args);
        if (!args.appleAuthorizationCode) throw reauthRequired;
      },
      requestAppleAuthorizationCode: async () => "fresh-code",
      signOutLocally: async () => true,
    });
    expect(outcome).toEqual({ status: "deleted", localCleanup: "ok" });
    expect(calls).toEqual([{}, { appleAuthorizationCode: "fresh-code" }]);
  });

  test("deletes nothing when the user cancels the sheet", async () => {
    let attempts = 0;
    let signedOut = false;
    const outcome = await runMobileAccountDeletion({
      deleteMyAccount: async () => {
        attempts += 1;
        throw reauthRequired;
      },
      requestAppleAuthorizationCode: async () => null,
      signOutLocally: async () => {
        signedOut = true;
        return true;
      },
    });
    expect(outcome).toEqual({ status: "cancelled" });
    expect(attempts).toBe(1);
    expect(signedOut).toBe(false);
  });

  test("reports the failure where there is no system sheet", async () => {
    const outcome = await runMobileAccountDeletion({
      deleteMyAccount: async () => {
        throw reauthRequired;
      },
      signOutLocally: async () => true,
    });
    expect(outcome).toEqual({ status: "failed", kind: "apple-reauth-required" });
  });
});
