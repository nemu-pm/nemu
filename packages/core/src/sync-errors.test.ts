import { describe, expect, test } from "bun:test";
import {
  AUTH_ACCOUNT_MISMATCH,
  classifySyncError,
  INVALID_SYNC_CLOCK,
  INSTALLED_SOURCE_SET_LIMIT_EXCEEDED,
  isTerminalSyncError,
  SYNC_CLOCK_REQUIRED,
  SYNC_GENERATION_MISMATCH,
  SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED,
  SYNC_MUTATION_CONTEXT_REQUIRED,
  SYNC_PAGINATED_SNAPSHOT_REQUIRED,
} from "./sync-errors";

/**
 * Convex wraps a server-thrown Error's message in framing text before the
 * client ever sees it, so every case here embeds the code the way it actually
 * arrives rather than matching the bare string.
 */
function convexError(message: string): Error {
  return new Error(
    `[CONVEX M(history:save)] [Request ID: abc123] Server Error\nUncaught Error: ${message}\n    at handler (../convex/history.ts:60:5)`,
  );
}

describe("sync error classification", () => {
  test("recognises a generation mismatch and its expected generation", () => {
    const classification = classifySyncError(
      convexError(`${SYNC_GENERATION_MISMATCH}: expected 4, received 2`),
    );
    expect(classification).toEqual({
      kind: "generation-mismatch",
      code: SYNC_GENERATION_MISMATCH,
      expectedGeneration: 4,
    });
  });

  test("still classifies a mismatch whose generation cannot be parsed", () => {
    // Recovery has to re-read the generation from the server anyway, so an
    // unparseable message must not fall through to "unknown transient error".
    const classification = classifySyncError(
      convexError(`${SYNC_GENERATION_MISMATCH}: expected ?, received ?`),
    );
    expect(classification?.kind).toBe("generation-mismatch");
    expect(classification?.expectedGeneration).toBeUndefined();
  });

  test("maps every protocol code that a stale bundle can produce", () => {
    for (const code of [
      SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED,
      SYNC_MUTATION_CONTEXT_REQUIRED,
      SYNC_PAGINATED_SNAPSHOT_REQUIRED,
      SYNC_CLOCK_REQUIRED,
    ]) {
      expect(classifySyncError(convexError(code))).toEqual({
        kind: "upgrade-required",
        code,
      });
    }
  });

  test("surfaces the installed-source set limit as user-actionable", () => {
    expect(
      classifySyncError(convexError(INSTALLED_SOURCE_SET_LIMIT_EXCEEDED)),
    ).toEqual({
      kind: "limit-exceeded",
      code: INSTALLED_SOURCE_SET_LIMIT_EXCEEDED,
    });
  });

  test("surfaces an invalid device clock as terminal and actionable", () => {
    const error = convexError(`${INVALID_SYNC_CLOCK}: updatedAt`);
    expect(classifySyncError(error)).toEqual({
      kind: "clock-invalid",
      code: INVALID_SYNC_CLOCK,
    });
    expect(isTerminalSyncError(error)).toBe(true);
  });

  test("recognises a write replayed under a different account", () => {
    expect(classifySyncError(convexError(AUTH_ACCOUNT_MISMATCH))).toEqual({
      kind: "account-mismatch",
      code: AUTH_ACCOUNT_MISMATCH,
    });
  });

  test("leaves ordinary failures unclassified so they keep retrying", () => {
    expect(classifySyncError(new Error("Network request failed"))).toBeNull();
    expect(classifySyncError(undefined)).toBeNull();
    expect(classifySyncError(null)).toBeNull();
    expect(classifySyncError({})).toBeNull();
    expect(classifySyncError("")).toBeNull();
  });

  test("reads plain strings and Convex error payload objects", () => {
    expect(classifySyncError(SYNC_GENERATION_MISMATCH)?.kind).toBe(
      "generation-mismatch",
    );
    expect(
      classifySyncError({ data: SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED })?.kind,
    ).toBe("upgrade-required");
    expect(
      classifySyncError({ message: INSTALLED_SOURCE_SET_LIMIT_EXCEEDED })?.kind,
    ).toBe("limit-exceeded");
  });

  test("treats only a generation mismatch as worth retrying", () => {
    expect(isTerminalSyncError(convexError(SYNC_GENERATION_MISMATCH))).toBe(
      false,
    );
    expect(
      isTerminalSyncError(convexError(SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED)),
    ).toBe(true);
    expect(isTerminalSyncError(new Error("Network request failed"))).toBe(false);
  });
});
