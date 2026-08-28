/**
 * Resolve the only identity state in which crash-recovery cleanup may run.
 *
 * `null` means either auth layer is still loading or the two layers disagree,
 * so cleanup must wait. `undefined` is a fully-settled signed-out state. A
 * string is the exact fully-settled active user, whose own marker must be
 * superseded rather than applied.
 */
export function resolvePendingSignOutCleanupRetryIdentity(input: {
  convexLoading: boolean;
  sessionPending: boolean;
  convexAuthenticated: boolean;
  sessionUserId: string | undefined;
}): string | undefined | null {
  if (input.convexLoading || input.sessionPending) return null;
  const hasSessionUser = Boolean(input.sessionUserId);
  if (input.convexAuthenticated !== hasSessionUser) return null;
  return hasSessionUser ? input.sessionUserId : undefined;
}
