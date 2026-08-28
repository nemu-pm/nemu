import type { MutationCtx, QueryCtx } from "./_generated/server";
import { isAcceptableSyncClock } from "../packages/core/src/sync-clock";
import { INVALID_SYNC_CLOCK } from "../packages/core/src/sync-errors";

export { INVALID_SYNC_CLOCK };

export const SYNC_GENERATION_MISMATCH = "SYNC_GENERATION_MISMATCH";
export const SYNC_CLOCK_REQUIRED = "SYNC_CLOCK_REQUIRED";
export const INVALID_SYNC_GENERATION = "INVALID_SYNC_GENERATION";
export const INVALID_SYNC_NUMBER = "INVALID_SYNC_NUMBER";
export const SYNC_PAGINATED_SNAPSHOT_REQUIRED = "SYNC_PAGINATED_SNAPSHOT_REQUIRED";
/**
 * Thrown for unfenced payloads after the configured legacy-write cutoff. The
 * shared client protocol classifies it as a terminal upgrade requirement.
 */
export const SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED =
  "SYNC_LEGACY_CLIENT_UPGRADE_REQUIRED";
export const SYNC_MUTATION_CONTEXT_REQUIRED = "SYNC_MUTATION_CONTEXT_REQUIRED";

export const SYNC_CLEANUP_TABLES = [
  "library_items",
  "library_source_links",
  "collections",
  "collection_items",
  "chapter_progress",
  "manga_progress",
  "settings",
] as const;

export type SyncCleanupTable = (typeof SYNC_CLEANUP_TABLES)[number];
export type SyncCleanupToken = {
  table: SyncCleanupTable;
};

export function nextSyncCleanupToken(
  current: SyncCleanupToken,
  pageWasFull: boolean,
): SyncCleanupToken | null {
  if (pageWasFull) return current;
  const nextTable = SYNC_CLEANUP_TABLES[
    SYNC_CLEANUP_TABLES.indexOf(current.table) + 1
  ];
  return nextTable ? { table: nextTable } : null;
}

export type SyncGenerationRow = { syncGeneration?: number };

export function assertNonNegativeSafeInteger(
  value: number,
  field: string,
): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${INVALID_SYNC_NUMBER}: ${field}`);
  }
  return value;
}

export function assertFiniteNumber(
  value: number | undefined,
  field: string,
): number | undefined {
  if (value !== undefined && !Number.isFinite(value)) {
    throw new Error(`${INVALID_SYNC_NUMBER}: ${field}`);
  }
  return value;
}

/** Legacy rows belong to generation zero. Once an account is reset they must
 * be invisible to both snapshots and LWW/canonicalization in later writes. */
export function rowSyncGeneration(row: SyncGenerationRow): number {
  return row.syncGeneration ?? 0;
}

/** Keep generation-zero rows in the legacy (missing-field) index bucket so a
 * single paginated index stream covers both pre-migration and new gen-0 data. */
export function storedSyncGeneration(generation: number): number | undefined {
  return generation === 0 ? undefined : generation;
}

export function currentSyncGenerationRows<T extends SyncGenerationRow>(
  rows: T[],
  generation: number,
): T[] {
  return rows.filter((row) => rowSyncGeneration(row) === generation);
}

export function resolveSyncGeneration(
  currentGeneration: number,
  incomingGeneration: number | undefined,
): number {
  if (
    !Number.isSafeInteger(currentGeneration) ||
    currentGeneration < 0 ||
    (incomingGeneration !== undefined &&
      (!Number.isSafeInteger(incomingGeneration) || incomingGeneration < 0))
  ) {
    throw new Error(INVALID_SYNC_GENERATION);
  }
  if (incomingGeneration === undefined && currentGeneration === 0) return 0;
  if (incomingGeneration !== currentGeneration) {
    throw new Error(
      `${SYNC_GENERATION_MISMATCH}: expected ${currentGeneration}, received ${incomingGeneration ?? "missing"}`,
    );
  }
  return currentGeneration;
}

export function resolveSyncClock(
  clock: number | undefined,
  generation: number,
  legacyNow: number,
): number {
  if (clock !== undefined) {
    if (!isAcceptableSyncClock(clock, legacyNow)) {
      throw new Error(INVALID_SYNC_CLOCK);
    }
    return clock;
  }
  if (generation === 0) {
    if (!isAcceptableSyncClock(legacyNow, legacyNow)) {
      throw new Error(INVALID_SYNC_CLOCK);
    }
    return legacyNow;
  }
  throw new Error(`${SYNC_CLOCK_REQUIRED}: generation ${generation}`);
}

export function nextSyncGeneration(
  currentGeneration: number,
  expectedGeneration: number | undefined,
): number {
  resolveSyncGeneration(currentGeneration, expectedGeneration);
  if (currentGeneration === Number.MAX_SAFE_INTEGER) {
    throw new Error(INVALID_SYNC_GENERATION);
  }
  return currentGeneration + 1;
}

export async function getCurrentSyncGeneration(
  ctx: QueryCtx | MutationCtx,
  userId: string,
): Promise<number> {
  const rows = await ctx.db
    .query("sync_generations")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return rows.reduce((maximum, row) => {
    return Number.isSafeInteger(row.generation) && row.generation >= 0
      ? Math.max(maximum, row.generation)
      : maximum;
  }, 0);
}

export async function requireSyncGeneration(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  incomingGeneration: number | undefined,
): Promise<number> {
  const current = await getCurrentSyncGeneration(ctx, userId);
  return resolveSyncGeneration(current, incomingGeneration);
}

export async function advanceSyncGeneration(
  ctx: MutationCtx,
  userId: string,
  expectedGeneration: number | undefined,
): Promise<number> {
  const rows = await ctx.db
    .query("sync_generations")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const currentGeneration = rows.reduce((maximum, row) => {
    return Number.isSafeInteger(row.generation) && row.generation >= 0
      ? Math.max(maximum, row.generation)
      : maximum;
  }, 0);
  const nextGeneration = nextSyncGeneration(
    currentGeneration,
    expectedGeneration,
  );
  const canonical = rows.find((row) => row.generation === currentGeneration);
  for (const row of rows) {
    if (canonical && row._id === canonical._id) continue;
    await ctx.db.delete(row._id);
  }

  if (canonical) {
    await ctx.db.patch(canonical._id, {
      generation: nextGeneration,
      updatedAt: Date.now(),
    });
  } else {
    await ctx.db.insert("sync_generations", {
      userId,
      generation: nextGeneration,
      updatedAt: Date.now(),
    });
  }
  return nextGeneration;
}
