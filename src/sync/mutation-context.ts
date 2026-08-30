export type SyncMutationIdentity = {
  authenticated: boolean;
  subscriptionStopped: boolean;
  sessionUserId: string | undefined;
  effectiveProfileId: string | undefined;
  localProfileId: string;
  generation: number | null;
};

export type SyncAccountOperationIdentity = {
  authenticated: boolean;
  sessionUserId: string | undefined;
  effectiveProfileId: string | undefined;
  localProfileId: string;
  client: object | null;
};

/**
 * A local write may reach its cloud phase after an account/profile switch.
 * Bind that phase to the exact authenticated profile that owns the local DB;
 * otherwise a stale profile-A closure could write its data into account B's
 * current Convex session.
 */
export function isSyncMutationIdentityCurrent(
  identity: SyncMutationIdentity,
): identity is SyncMutationIdentity & {
  sessionUserId: string;
  effectiveProfileId: string;
  generation: number;
} {
  if (
    !identity.authenticated ||
    identity.subscriptionStopped ||
    identity.generation === null ||
    !identity.sessionUserId ||
    !identity.effectiveProfileId
  ) {
    return false;
  }

  const authenticatedProfileId = `user:${identity.sessionUserId}`;
  return (
    identity.localProfileId === authenticatedProfileId &&
    identity.effectiveProfileId === authenticatedProfileId
  );
}

/**
 * Destructive account operations intentionally pause subscriptions, so they
 * cannot use the regular mutation guard. Bind them to the exact client and
 * account identity captured before the first await and compare again at every
 * remote mutation boundary.
 */
export function isSyncAccountOperationIdentityCurrent(
  expected: SyncAccountOperationIdentity,
  current: SyncAccountOperationIdentity,
): boolean {
  if (
    !expected.authenticated ||
    !current.authenticated ||
    !expected.client ||
    expected.client !== current.client ||
    !expected.sessionUserId ||
    expected.sessionUserId !== current.sessionUserId ||
    !expected.effectiveProfileId ||
    expected.effectiveProfileId !== current.effectiveProfileId ||
    expected.localProfileId !== current.localProfileId
  ) {
    return false;
  }

  const authenticatedProfileId = `user:${expected.sessionUserId}`;
  return (
    expected.localProfileId === authenticatedProfileId &&
    expected.effectiveProfileId === authenticatedProfileId
  );
}
