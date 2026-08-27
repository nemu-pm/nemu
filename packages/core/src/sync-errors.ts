/**
 * Sync protocol error vocabulary, shared by the backend, the web client and
 * the mobile client.
 *
 * Convex surfaces a server-thrown `Error` to the client as a `ConvexError`
 * whose message embeds the original text (plus a stack//frame prefix and
 * suffix). Clients therefore have to recognise these by substring rather than
 * by instance, which is exactly what `classifySyncError` centralises.
 */

export const SYNC_GENERATION_MISMATCH = "SYNC_GENERATION_MISMATCH";
export const SYNC_CLOCK_REQUIRED = "SYNC_CLOCK_REQUIRED";
export const SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED =
  "SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED";
export const SYNC_MUTATION_CONTEXT_REQUIRED = "SYNC_MUTATION_CONTEXT_REQUIRED";
export const SYNC_PAGINATED_SNAPSHOT_REQUIRED =
  "SYNC_PAGINATED_SNAPSHOT_REQUIRED";
export const INSTALLED_SOURCE_SET_LIMIT_EXCEEDED =
  "SYNC_INSTALLED_SOURCE_SET_LIMIT_EXCEEDED";
export const AUTH_ACCOUNT_MISMATCH = "AUTH_ACCOUNT_MISMATCH";

export type SyncErrorKind =
  /** The account was reset elsewhere; local state must be re-pulled. */
  | "generation-mismatch"
  /** This build predates a required protocol field; the bundle is too old. */
  | "upgrade-required"
  /** The account exceeded a server-side set limit and needs user action. */
  | "limit-exceeded"
  /** The write was replayed under a different account and was refused. */
  | "account-mismatch";

export type SyncErrorClassification = {
  kind: SyncErrorKind;
  code: string;
  /**
   * Present only for `generation-mismatch`: the generation the server says is
   * current, parsed out of `SYNC_GENERATION_MISMATCH: expected N, received M`.
   * Recovery must still confirm this against the server rather than trusting
   * a message it may have failed to parse.
   */
  expectedGeneration?: number;
};

function syncErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const data = (error as { data?: unknown }).data;
    if (typeof data === "string") return data;
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

function parseExpectedGeneration(message: string): number | undefined {
  const match = /SYNC_GENERATION_MISMATCH: expected (\d+)/.exec(message);
  if (!match) return undefined;
  const generation = Number(match[1]);
  return Number.isSafeInteger(generation) && generation >= 0
    ? generation
    : undefined;
}

/**
 * Map a rejected sync mutation onto the recovery it needs, or `null` when the
 * failure is an ordinary transient one the caller should keep retrying.
 *
 * Ordering matters: `SYNC_MUTATION_CONTEXT_REQUIRED` is only ever produced by
 * a half-populated payload, which means a client too old to speak the current
 * protocol, so it maps onto the same upgrade path as the explicit code.
 */
export function classifySyncError(
  error: unknown,
): SyncErrorClassification | null {
  const message = syncErrorMessage(error);
  if (!message) return null;
  if (message.includes(SYNC_GENERATION_MISMATCH)) {
    return {
      kind: "generation-mismatch",
      code: SYNC_GENERATION_MISMATCH,
      expectedGeneration: parseExpectedGeneration(message),
    };
  }
  if (message.includes(INSTALLED_SOURCE_SET_LIMIT_EXCEEDED)) {
    return {
      kind: "limit-exceeded",
      code: INSTALLED_SOURCE_SET_LIMIT_EXCEEDED,
    };
  }
  if (message.includes(SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED)) {
    return {
      kind: "upgrade-required",
      code: SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED,
    };
  }
  if (message.includes(SYNC_MUTATION_CONTEXT_REQUIRED)) {
    return {
      kind: "upgrade-required",
      code: SYNC_MUTATION_CONTEXT_REQUIRED,
    };
  }
  if (message.includes(SYNC_PAGINATED_SNAPSHOT_REQUIRED)) {
    return {
      kind: "upgrade-required",
      code: SYNC_PAGINATED_SNAPSHOT_REQUIRED,
    };
  }
  if (message.includes(SYNC_CLOCK_REQUIRED)) {
    // A generation-fenced write reached the server without a logical clock.
    // Only a build that predates the clock requirement can produce this.
    return { kind: "upgrade-required", code: SYNC_CLOCK_REQUIRED };
  }
  if (message.includes(AUTH_ACCOUNT_MISMATCH)) {
    return { kind: "account-mismatch", code: AUTH_ACCOUNT_MISMATCH };
  }
  return null;
}

/** True when the failure will never succeed on retry with the same payload. */
export function isTerminalSyncError(error: unknown): boolean {
  const classification = classifySyncError(error);
  return (
    classification !== null &&
    classification.kind !== "generation-mismatch"
  );
}
