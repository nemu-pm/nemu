import type { MutationCtx } from "./_generated/server";
import { requireAuth, requireAuthForUser } from "./_lib";
import {
  getCurrentSyncGeneration,
  requireSyncGeneration,
  resolveSyncClock,
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
 * Validators keep the two fields optional because Convex deploys independently
 * of the web bundle: for the whole window between a backend push and the last
 * browser picking up new JS, every production client is still sending neither
 * field. Rejecting those payloads would silently discard every write those
 * clients make, so a payload with *both* fields absent takes the legacy path
 * and executes with the semantics the pre-fencing backend had.
 *
 * The legacy path stays fail-closed for cross-account safety. The account is
 * derived from the transport's own authentication, never from client input, so
 * a queued payload replayed on a reconnected socket can only ever write to the
 * account that socket is currently authenticated as — it can never be steered
 * at another user's data. A *half*-populated payload is still rejected: it
 * cannot be produced by any released client and would mean the caller believes
 * it is fencing when it is not.
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
    const userId = await requireAuth(ctx);
    // A legacy client cannot name a generation, so it writes into whichever
    // one the account currently occupies. That matches the pre-fencing
    // behaviour (writes always landed) and keeps its data visible to current
    // clients, at the cost of an un-upgraded device being able to re-push
    // into a generation created by a reset it never saw.
    const generation = await getCurrentSyncGeneration(ctx, userId);
    return {
      userId,
      generation,
      legacy: true,
      // Legacy payloads predate the logical clock requirement, so fall back to
      // the server's wall clock instead of failing the write.
      resolveClock: (clock, legacyNow) =>
        resolveSyncClock(clock, 0, legacyNow),
    };
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
