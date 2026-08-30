export const REMOVAL_CASCADE_LEASE_MS = 5 * 60 * 1_000;
export const REMOVAL_CASCADE_MAX_RECOVERY_ATTEMPTS = 3;

export type RemovalCascadeLock = {
  removedAt: number;
  operationId: string;
  /** Merge survivor, present only for a library-item relationship migration. */
  mergeTargetLibraryItemId?: string;
  /** Monotonic per-parent nonce; optional only for rolling-deploy tolerance. */
  operationVersion?: number;
  status: "active" | "completed" | "exhausted";
  leaseExpiresAt?: number;
  recoveryAttempts: number;
  finishedAt?: number;
};

type RemovalCascadeIdentity = {
  removedAt: number;
  operationId: string;
  mergeTargetLibraryItemId?: string;
};

export function isRemovalCascadeOwner(
  lock: RemovalCascadeLock | undefined,
  identity: RemovalCascadeIdentity,
): lock is RemovalCascadeLock {
  return Boolean(
    lock &&
      lock.status === "active" &&
      lock.removedAt === identity.removedAt &&
      lock.operationId === identity.operationId &&
      lock.mergeTargetLibraryItemId === identity.mergeTargetLibraryItemId,
  );
}

export function removalCascadeLeaseIsActive(
  lock: RemovalCascadeLock | undefined,
  now: number,
): lock is RemovalCascadeLock {
  return Boolean(
    lock?.status === "active" &&
      Number.isSafeInteger(lock.leaseExpiresAt) &&
      lock.leaseExpiresAt! > now,
  );
}

export function newRemovalCascadeLock(args: {
  scope: "collection" | "library-item";
  generation: number;
  parentId: string;
  removedAt: number;
  startedAt: number;
  mergeTargetLibraryItemId?: string;
  previousLock?: Pick<RemovalCascadeLock, "operationId" | "operationVersion">;
}): RemovalCascadeLock {
  const previousVersion =
    Number.isSafeInteger(args.previousLock?.operationVersion) &&
    args.previousLock!.operationVersion! >= 0
      ? args.previousLock!.operationVersion!
      : 0;
  if (previousVersion === Number.MAX_SAFE_INTEGER) {
    throw new Error("REMOVAL_CASCADE_OPERATION_VERSION_EXHAUSTED");
  }
  const operationVersion = previousVersion + 1;
  const operationId = JSON.stringify([
    args.scope,
    args.generation,
    args.parentId,
    args.removedAt,
    args.mergeTargetLibraryItemId ?? null,
    operationVersion,
    args.startedAt,
  ]);
  return {
    removedAt: args.removedAt,
    operationId,
    ...(args.mergeTargetLibraryItemId === undefined
      ? {}
      : { mergeTargetLibraryItemId: args.mergeTargetLibraryItemId }),
    operationVersion,
    status: "active",
    leaseExpiresAt: args.startedAt + REMOVAL_CASCADE_LEASE_MS,
    recoveryAttempts: 0,
  };
}

export function finishRemovalCascade(
  lock: RemovalCascadeLock,
  status: "completed" | "exhausted",
  finishedAt: number,
): RemovalCascadeLock {
  return {
    removedAt: lock.removedAt,
    operationId: lock.operationId,
    operationVersion: lock.operationVersion,
    status,
    recoveryAttempts: lock.recoveryAttempts,
    finishedAt,
  };
}
