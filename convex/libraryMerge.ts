import type { Doc } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { newestLwwRecord } from "./lww";
import {
  currentSyncGenerationRows,
} from "./syncGeneration";
import {
  MAX_LIBRARY_MERGE_ALIAS_HOPS as SHARED_MAX_LIBRARY_MERGE_ALIAS_HOPS,
} from "../packages/core/src/sync";

export const MAX_LIBRARY_MERGE_ALIAS_HOPS =
  SHARED_MAX_LIBRARY_MERGE_ALIAS_HOPS;
export const LIBRARY_MERGE_ALIAS_INVALID = "LIBRARY_MERGE_ALIAS_INVALID";
export const LIBRARY_MERGE_ALIAS_CYCLE = "LIBRARY_MERGE_ALIAS_CYCLE";
export const LIBRARY_MERGE_ALIAS_LIMIT = "LIBRARY_MERGE_ALIAS_LIMIT";

export type ResolvedLibraryMergeAlias = {
  libraryItemId: string;
  item: Doc<"library_items"> | undefined;
  rows: Doc<"library_items">[];
  /** Includes the requested id and every followed alias through the terminal id. */
  chain: string[];
};

/**
 * Select one logical library row without allowing a later-clock active
 * duplicate to erase an irreversible merge redirect.
 */
export function newestLibraryMergeAwareItem(
  rows: readonly Doc<"library_items">[],
): Doc<"library_items"> | undefined {
  const aliases = rows.filter(
    (item) => item.mergedIntoLibraryItemId !== undefined,
  );
  if (aliases.length === 0) {
    return newestLwwRecord(rows, (candidate) => candidate.inLibrary === false);
  }
  const targets = new Set(
    aliases.map((item) => item.mergedIntoLibraryItemId),
  );
  if (targets.size !== 1) {
    throw new Error(LIBRARY_MERGE_ALIAS_INVALID);
  }
  const alias = newestLwwRecord(
    aliases,
    (candidate) => candidate.inLibrary === false,
  );
  if (!alias || alias.inLibrary !== false) {
    throw new Error(LIBRARY_MERGE_ALIAS_INVALID);
  }
  return alias;
}

/**
 * Resolve an irreversible merge alias to one terminal canonical library id.
 *
 * Old tombstones have no alias and remain valid terminal rows. New aliases are
 * bounded and cycle-checked so corrupt server state cannot turn a user
 * mutation into an unbounded query chain.
 */
export async function resolveLibraryMergeAlias(
  ctx: Pick<MutationCtx, "db">,
  userId: string,
  generation: number,
  requestedLibraryItemId: string,
  options: { maxHops?: number } = {},
): Promise<ResolvedLibraryMergeAlias> {
  if (requestedLibraryItemId.length === 0) {
    throw new Error(LIBRARY_MERGE_ALIAS_INVALID);
  }

  const chain: string[] = [];
  const seen = new Set<string>();
  let libraryItemId = requestedLibraryItemId;
  const maxHops = options.maxHops ?? MAX_LIBRARY_MERGE_ALIAS_HOPS;
  if (
    !Number.isSafeInteger(maxHops) ||
    maxHops < 0 ||
    maxHops > MAX_LIBRARY_MERGE_ALIAS_HOPS
  ) {
    throw new Error(LIBRARY_MERGE_ALIAS_LIMIT);
  }
  for (let hop = 0; hop <= maxHops; hop += 1) {
    if (seen.has(libraryItemId)) {
      throw new Error(LIBRARY_MERGE_ALIAS_CYCLE);
    }
    seen.add(libraryItemId);
    chain.push(libraryItemId);

    const rows = currentSyncGenerationRows(
      await ctx.db
        .query("library_items")
        .withIndex("by_user_item", (q) =>
          q.eq("userId", userId).eq("libraryItemId", libraryItemId),
        )
        .collect(),
      generation,
    );
    const item = newestLibraryMergeAwareItem(rows);
    const target = item?.mergedIntoLibraryItemId;
    if (target === undefined) {
      return { libraryItemId, item, rows, chain };
    }
    if (target.length === 0 || target === libraryItemId) {
      throw new Error(LIBRARY_MERGE_ALIAS_INVALID);
    }
    if (hop === maxHops) {
      throw new Error(LIBRARY_MERGE_ALIAS_LIMIT);
    }
    libraryItemId = target;
  }

  throw new Error(LIBRARY_MERGE_ALIAS_LIMIT);
}
