import { internal } from "./_generated/api";
import type { MutationCtx } from "./_generated/server";
import {
  advanceSyncGeneration,
  SYNC_CLEANUP_TABLES,
  type SyncCleanupToken,
} from "./syncGeneration";

/** Atomically hides the old snapshot and starts its durable bounded cleanup. */
export async function beginSyncReset(
  ctx: MutationCtx,
  userId: string,
  expectedGeneration: number | undefined,
): Promise<{ generation: number; cleanupToken: SyncCleanupToken }> {
  const generation = await advanceSyncGeneration(
    ctx,
    userId,
    expectedGeneration,
  );
  const cleanupToken = {
    table: SYNC_CLEANUP_TABLES[0],
  } as const;
  // Cleanup must not depend on the client receiving the reset response. A
  // lost response still leaves this durable worker chain scheduled.
  await ctx.scheduler.runAfter(0, internal.sync.cleanupOldRows, {
    userId,
    targetGeneration: generation,
    cleanupToken,
  });
  return { generation, cleanupToken };
}
