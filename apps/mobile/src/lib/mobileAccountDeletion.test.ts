import { describe, expect, test } from "bun:test";
import {
  mobileAccountDeletionFailureMessage,
  runMobileAccountDeletion,
} from "./mobileAccountDeletion";
import { mobileStringsEn } from "./mobileI18n.en";

const convexError = (code: string) => Object.assign(new Error("Server Error"), { data: { code } });

describe("runMobileAccountDeletion", () => {
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
