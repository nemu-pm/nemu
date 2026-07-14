import type { MutationCtx } from "./_generated/server";
import { requireAuthForUser } from "./_lib";
import {
  requireSyncGeneration,
  resolveSyncClock,
  SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED,
  SYNC_MUTATION_CONTEXT_REQUIRED,
} from "./syncGeneration";

export function legacyVisibleLibraryRows<
  T extends { id: string; inLibrary?: boolean },
>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.inLibrary !== false);
}

export function legacyVisibleSourceLinkRows<
  T extends { libraryItemId: string; removed?: boolean },
>(rows: readonly T[], activeLibraryItemIds: ReadonlySet<string>): T[] {
  return rows.filter(
    (row) =>
      row.removed !== true && activeLibraryItemIds.has(row.libraryItemId),
  );
}

export function legacyVisibleCollectionRows<
  T extends { collectionId: string; removed?: boolean },
>(rows: readonly T[]): T[] {
  return rows.filter((row) => row.removed !== true);
}

export function legacyVisibleCollectionItemRows<
  T extends {
    collectionId: string;
    libraryItemId: string;
    removed?: boolean;
  },
>(
  rows: readonly T[],
  activeCollectionIds: ReadonlySet<string>,
  activeLibraryItemIds: ReadonlySet<string>,
): T[] {
  return rows.filter(
    (row) =>
      row.removed !== true &&
      activeCollectionIds.has(row.collectionId) &&
      activeLibraryItemIds.has(row.libraryItemId),
  );
}

export type SyncMutationContext = {
  userId: string;
  generation: number;
  legacy: boolean;
  resolveClock: (clock: number | undefined, legacyNow: number) => number;
};

/**
 * Account and generation fencing for queued sync mutations.
 *
 * Validators keep the two fields optional so a backend-first deployment does
 * not reject an old payload before this handler can return an actionable
 * upgrade error. Ownerless writes must never execute: Convex reconnect can
 * replay a queued payload on a newly authenticated transport, and the server
 * cannot recover the account that originally created such a payload.
 */
export async function requireSyncMutationContext(
  ctx: MutationCtx,
  args: {
    expectedUserId?: string;
    generation?: number;
  },
): Promise<SyncMutationContext> {
  const expectedUserId = args.expectedUserId;
  const legacy = expectedUserId === undefined && args.generation === undefined;
  if (legacy) {
    throw new Error(SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED);
  }
  if ((expectedUserId === undefined) !== (args.generation === undefined)) {
    throw new Error(SYNC_MUTATION_CONTEXT_REQUIRED);
  }
  const userId = await requireAuthForUser(ctx, expectedUserId!);
  const generation = await requireSyncGeneration(ctx, userId, args.generation);
  return {
    userId,
    generation,
    legacy: false,
    resolveClock: (clock, legacyNow) =>
      resolveSyncClock(clock, generation, legacyNow),
  };
}
