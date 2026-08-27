import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearSyncRecoveryRequest,
  getSyncRecoveryRequest,
  reportSyncMutationError,
  resetSyncRecoveryState,
  runSyncMutation,
  subscribeSyncRecovery,
} from "./sync-error-recovery";

function convexError(message: string): Error {
  return new Error(
    `[CONVEX M(library:save)] [Request ID: abc] Server Error\nUncaught Error: ${message}`,
  );
}

describe("sync mutation error recovery", () => {
  beforeEach(() => {
    resetSyncRecoveryState();
  });

  test("publishes a generation mismatch for the reset recovery path", async () => {
    const seen: (string | undefined)[] = [];
    const unsubscribe = subscribeSyncRecovery(() => {
      seen.push(getSyncRecoveryRequest()?.kind);
    });

    const result = await runSyncMutation(async () => {
      throw convexError("SYNC_GENERATION_MISMATCH: expected 7, received 3");
    });

    expect(result).toBeUndefined();
    expect(seen).toEqual(["generation-mismatch"]);
    expect(getSyncRecoveryRequest()).toMatchObject({
      kind: "generation-mismatch",
      expectedGeneration: 7,
    });
    unsubscribe();
  });

  test("swallows the rejection so a fired-and-forgotten write cannot crash", async () => {
    // Store operations start these mutations without awaiting them, so an
    // unhandled rejection was the only signal the write had been refused.
    await expect(
      runSyncMutation(async () => {
        throw convexError("SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED");
      }),
    ).resolves.toBeUndefined();
    expect(getSyncRecoveryRequest()?.kind).toBe("upgrade-required");
  });

  test("surfaces the installed-source set limit as user-actionable", async () => {
    await runSyncMutation(async () => {
      throw convexError("SYNC_INSTALLED_SOURCE_SET_LIMIT_EXCEEDED");
    });
    expect(getSyncRecoveryRequest()?.kind).toBe("limit-exceeded");
  });

  test("re-throws an ordinary failure so existing retries still apply", async () => {
    await expect(
      runSyncMutation(async () => {
        throw new Error("Network request failed");
      }),
    ).rejects.toThrow("Network request failed");
    expect(getSyncRecoveryRequest()).toBeNull();
  });

  test("returns the mutation result when nothing fails", async () => {
    expect(await runSyncMutation(async () => "ok")).toBe("ok");
    expect(getSyncRecoveryRequest()).toBeNull();
  });

  test("drops a write replayed under another account without stopping sync", async () => {
    // The identity guards already made this write a no-op, and there is no
    // user-facing recovery, so it must not pin the session into an error state.
    await expect(
      runSyncMutation(async () => {
        throw convexError("AUTH_ACCOUNT_MISMATCH");
      }),
    ).resolves.toBeUndefined();
    expect(getSyncRecoveryRequest()).toBeNull();
  });

  test("bumps the revision so a repeated failure still wakes subscribers", () => {
    const first = reportSyncMutationError(
      convexError("SYNC_GENERATION_MISMATCH: expected 1, received 0"),
    );
    const second = reportSyncMutationError(
      convexError("SYNC_GENERATION_MISMATCH: expected 1, received 0"),
    );
    expect(second!.revision).toBeGreaterThan(first!.revision);
  });

  test("a slow handler cannot clear a newer failure", () => {
    const stale = reportSyncMutationError(
      convexError("SYNC_GENERATION_MISMATCH: expected 1, received 0"),
    )!;
    const fresh = reportSyncMutationError(
      convexError("SYNC_GENERATION_MISMATCH: expected 2, received 1"),
    )!;

    clearSyncRecoveryRequest(stale.revision);
    expect(getSyncRecoveryRequest()?.revision).toBe(fresh.revision);

    clearSyncRecoveryRequest(fresh.revision);
    expect(getSyncRecoveryRequest()).toBeNull();
  });
});
