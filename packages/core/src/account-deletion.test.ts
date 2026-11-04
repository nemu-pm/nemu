import { describe, expect, test } from "bun:test";
import {
  APPLE_REAUTH_REQUIRED,
  APPLE_REVOKE_FAILED,
  APPLE_UNAVAILABLE,
  classifyAccountDeletionError,
  deleteAccount,
} from "./account-deletion";

const convexError = (code: string) => Object.assign(new Error("Server Error"), { data: { code } });

describe("classifyAccountDeletionError", () => {
  test("reads ConvexError data codes and plain messages", () => {
    expect(classifyAccountDeletionError(convexError(APPLE_REAUTH_REQUIRED))).toBe("apple-reauth-required");
    expect(classifyAccountDeletionError(new Error(`x ${APPLE_UNAVAILABLE} y`))).toBe("apple-unavailable");
    expect(classifyAccountDeletionError(convexError(APPLE_REVOKE_FAILED))).toBe("apple-revoke-failed");
    expect(classifyAccountDeletionError(new Error("boom"))).toBe("unknown");
  });
});

describe("deleteAccount", () => {
  test("deletes directly when no Apple re-authentication is needed", async () => {
    const calls: unknown[] = [];
    const result = await deleteAccount({
      deleteMyAccount: async (args) => void calls.push(args),
    });
    expect(result).toEqual({ status: "deleted" });
    expect(calls).toEqual([{}]);
  });

  test("prompts Sign in with Apple once when the server asks, then retries with the code", async () => {
    const calls: unknown[] = [];
    let prompts = 0;
    const result = await deleteAccount({
      deleteMyAccount: async (args) => {
        calls.push(args);
        if (!("appleAuthorizationCode" in args)) throw convexError(APPLE_REAUTH_REQUIRED);
      },
      requestAppleAuthorizationCode: async () => {
        prompts++;
        return "code-1";
      },
    });
    expect(result).toEqual({ status: "deleted" });
    expect(prompts).toBe(1);
    expect(calls).toEqual([{}, { appleAuthorizationCode: "code-1" }]);
  });

  test("cancelling the Apple prompt deletes nothing", async () => {
    const result = await deleteAccount({
      deleteMyAccount: async () => {
        throw convexError(APPLE_REAUTH_REQUIRED);
      },
      requestAppleAuthorizationCode: async () => null,
    });
    expect(result).toEqual({ status: "cancelled" });
  });

  test("reports other failures without prompting", async () => {
    let prompted = false;
    const result = await deleteAccount({
      deleteMyAccount: async () => {
        throw convexError(APPLE_UNAVAILABLE);
      },
      requestAppleAuthorizationCode: async () => {
        prompted = true;
        return "x";
      },
    });
    expect(result).toEqual({ status: "failed", kind: "apple-unavailable" });
    expect(prompted).toBe(false);
  });

  test("a failure after the fresh code is final", async () => {
    const result = await deleteAccount({
      deleteMyAccount: async (args) => {
        throw convexError("appleAuthorizationCode" in args ? APPLE_REVOKE_FAILED : APPLE_REAUTH_REQUIRED);
      },
      requestAppleAuthorizationCode: async () => "c",
    });
    expect(result).toEqual({ status: "failed", kind: "apple-revoke-failed" });
  });
});
