import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { requireAuth } from "./_lib";
import {
  canonicalizeLwwRecords,
  newestLwwRecord,
  shouldApplyLww,
  pruneDuplicateRows,
} from "./lww";
import {
  currentSyncGenerationRows,
  getCurrentSyncGeneration,
  storedSyncGeneration,
} from "./syncGeneration";
import { requireSyncMutationContext } from "./syncCompatibility";
import {
  assertInstalledSourceSetAdmission,
  compactInstalledSourceTombstone,
} from "./settingsLimits";
import { normalizeSyncClock } from "../packages/core/src/sync-clock";

const DEFAULT_SETTINGS = {
  installedSources: [] as [],
};

const SNAPSHOT_PAGE_MAX_ITEMS = 128;

const installedSourceWithClockValidator = v.object({
  id: v.string(),
  registryId: v.string(),
  sourceKind: v.optional(v.union(v.literal("aidoku"), v.literal("tachiyomi"))),
  sourceId: v.optional(v.string()),
  name: v.optional(v.string()),
  icon: v.optional(v.string()),
  languages: v.optional(v.array(v.string())),
  contentRating: v.optional(v.number()),
  hasAuthentication: v.optional(v.boolean()),
  hasCloudflare: v.optional(v.boolean()),
  downloadUrl: v.optional(v.string()),
  version: v.number(),
  updatedAt: v.optional(v.number()),
  removed: v.optional(v.boolean()),
});

type InstalledSourceRecord = {
  id: string;
  registryId: string;
  sourceKind?: "aidoku" | "tachiyomi";
  sourceId?: string;
  name?: string;
  icon?: string;
  languages?: string[];
  contentRating?: number;
  hasAuthentication?: boolean;
  hasCloudflare?: boolean;
  downloadUrl?: string;
  version: number;
  updatedAt?: number;
  removed?: boolean;
};

function mergeInstalledSources(
  existing: readonly InstalledSourceRecord[],
  incoming: readonly InstalledSourceRecord[],
): { sources: InstalledSourceRecord[]; accepted: boolean } {
  const byId = new Map(
    canonicalizeLwwRecords(
      existing,
      (source) => source.id,
      (source) => source.removed === true,
    ).map((source) => [source.id, source]),
  );

  let accepted = false;
  for (const source of incoming) {
    const current = byId.get(source.id);
    if (current && !shouldApplyLww(current.updatedAt, source.updatedAt ?? 0)) {
      continue;
    }
    byId.set(source.id, { ...source, removed: source.removed ?? false });
    accepted = true;
  }
  return {
    sources: [...byId.values()].map((source) =>
      compactInstalledSourceTombstone({
        ...source,
        updatedAt: normalizeSyncClock(source.updatedAt),
      }),
    ),
    accepted,
  };
}

function canonicalInstalledSources(
  sources: readonly InstalledSourceRecord[],
): InstalledSourceRecord[] {
  return canonicalizeLwwRecords(
    sources,
    (source) => source.id,
    (source) => source.removed === true,
  );
}

function maxSourceClock(sources: readonly InstalledSourceRecord[]): number {
  const now = Date.now();
  return sources.reduce(
    (maximum, source) =>
      Math.max(maximum, normalizeSyncClock(source.updatedAt, now)),
    0,
  );
}

function maxAcceptableClock(
  ...clocks: Array<number | null | undefined>
): number {
  const now = Date.now();
  return Math.max(0, ...clocks.map((clock) => normalizeSyncClock(clock, now)));
}

async function readSettings(ctx: QueryCtx, userId: string) {
  const generation = await getCurrentSyncGeneration(ctx, userId);
  const settingsRows = currentSyncGenerationRows(
    await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    generation,
  );

  if (settingsRows.length === 0) {
    return { ...DEFAULT_SETTINGS, updatedAt: 0 };
  }

  const installedSources = canonicalizeLwwRecords(
    settingsRows.flatMap((settings) => settings.installedSources),
    (source) => source.id,
    (source) => source.removed === true,
  );

  return {
    installedSources,
    updatedAt: maxAcceptableClock(
      ...settingsRows.map((settings) => settings.updatedAt),
      maxSourceClock(installedSources),
    ),
  };
}

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    return readSettings(ctx, userId);
  },
});

export const getV2 = query({
  args: {
    generation: v.number(),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const generation = await getCurrentSyncGeneration(ctx, userId);
    if (generation !== args.generation) {
      return {
        generation,
        page: [{ kind: "generation" as const, generation }],
        continueCursor: "",
        isDone: true,
      };
    }
    const requestedItems = Number.isFinite(args.paginationOpts.numItems)
      ? Math.floor(args.paginationOpts.numItems)
      : 1;
    const result = await ctx.db
      .query("settings")
      .withIndex("by_user_sync_generation", (q) =>
        q
          .eq("userId", userId)
          .eq("syncGeneration", storedSyncGeneration(generation)),
      )
      .paginate({
        ...args.paginationOpts,
        numItems: Math.max(
          1,
          Math.min(SNAPSHOT_PAGE_MAX_ITEMS, requestedItems),
        ),
      });
    return {
      generation,
      ...result,
      page: [
        { kind: "generation" as const, generation },
        ...result.page.map((row) => ({
          kind: "row" as const,
          generation,
          row: {
            installedSources: row.installedSources,
            updatedAt: row.updatedAt ?? 0,
          },
        })),
      ],
    };
  },
});

export const save = mutation({
  args: {
    expectedUserId: v.optional(v.string()),
    installedSources: v.array(installedSourceWithClockValidator),
    updatedAt: v.optional(v.number()),
    generation: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, generation, resolveClock } =
      await requireSyncMutationContext(ctx, args);
    const legacyNow = Date.now();
    const updatedAt = resolveClock(args.updatedAt, legacyNow);
    const incomingSources = args.installedSources.map((source) => ({
      ...source,
      updatedAt: resolveClock(source.updatedAt, legacyNow),
    }));
    const matches = currentSyncGenerationRows(
      await ctx.db
        .query("settings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      generation,
    );
    const existing = newestLwwRecord(matches);
    const storedSources = matches.flatMap((entry) => entry.installedSources);
    const merged = mergeInstalledSources(storedSources, incomingSources);
    assertInstalledSourceSetAdmission(
      canonicalInstalledSources(storedSources),
      merged.sources,
    );

    await pruneDuplicateRows(ctx.db, matches, existing);

    if (existing) {
      const mergedClock = maxSourceClock(merged.sources);
      await ctx.db.patch(existing._id, {
        installedSources: merged.sources,
        updatedAt: merged.accepted
          ? maxAcceptableClock(existing.updatedAt, mergedClock, updatedAt)
          : maxAcceptableClock(existing.updatedAt, mergedClock),
      });
    } else {
      await ctx.db.insert("settings", {
        userId,
        syncGeneration: storedSyncGeneration(generation),
        installedSources: merged.sources,
        updatedAt,
      });
    }
  },
});

/** Upsert a single installed source with record-level LWW semantics. */
export const saveInstalledSource = mutation({
  args: {
    expectedUserId: v.optional(v.string()),
    source: installedSourceWithClockValidator,
    generation: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, generation, resolveClock } =
      await requireSyncMutationContext(ctx, args);
    const source = {
      ...args.source,
      updatedAt: resolveClock(args.source.updatedAt, Date.now()),
      removed: false,
    };
    const matches = currentSyncGenerationRows(
      await ctx.db
        .query("settings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      generation,
    );
    const existing = newestLwwRecord(matches);
    const storedSources = matches.flatMap((entry) => entry.installedSources);
    const merged = mergeInstalledSources(storedSources, [source]);
    assertInstalledSourceSetAdmission(
      canonicalInstalledSources(storedSources),
      merged.sources,
    );

    await pruneDuplicateRows(ctx.db, matches, existing);

    if (existing) {
      // Duplicate cleanup may have contributed records even when this input is
      // stale, so always persist the safely merged canonical array.
      const mergedClock = maxSourceClock(merged.sources);
      await ctx.db.patch(existing._id, {
        installedSources: merged.sources,
        updatedAt: merged.accepted
          ? maxAcceptableClock(
              existing.updatedAt,
              mergedClock,
              source.updatedAt,
            )
          : maxAcceptableClock(existing.updatedAt, mergedClock),
      });
    } else {
      await ctx.db.insert("settings", {
        userId,
        syncGeneration: storedSyncGeneration(generation),
        installedSources: merged.sources,
        updatedAt: source.updatedAt,
      });
    }
  },
});

/** Remove a single installed source by writing a logical tombstone. */
export const removeInstalledSource = mutation({
  args: {
    expectedUserId: v.optional(v.string()),
    id: v.string(),
    registryId: v.string(),
    updatedAt: v.optional(v.number()),
    generation: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId, generation, resolveClock } =
      await requireSyncMutationContext(ctx, args);
    const updatedAt = resolveClock(args.updatedAt, Date.now());
    const matches = currentSyncGenerationRows(
      await ctx.db
        .query("settings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      generation,
    );
    const existing = newestLwwRecord(matches);
    const storedSources = matches.flatMap((entry) => entry.installedSources);
    const current = newestLwwRecord(
      storedSources.filter((source) => source.id === args.id),
      (source) => source.removed === true,
    );
    const tombstone: InstalledSourceRecord = {
      id: args.id,
      registryId: args.registryId,
      version: current?.version ?? 0,
      updatedAt,
      removed: true,
    };
    const merged = mergeInstalledSources(storedSources, [tombstone]);
    assertInstalledSourceSetAdmission(
      canonicalInstalledSources(storedSources),
      merged.sources,
    );

    await pruneDuplicateRows(ctx.db, matches, existing);

    if (existing) {
      const mergedClock = maxSourceClock(merged.sources);
      await ctx.db.patch(existing._id, {
        installedSources: merged.sources,
        updatedAt: merged.accepted
          ? maxAcceptableClock(existing.updatedAt, mergedClock, updatedAt)
          : maxAcceptableClock(existing.updatedAt, mergedClock),
      });
    } else {
      await ctx.db.insert("settings", {
        userId,
        syncGeneration: storedSyncGeneration(generation),
        installedSources: merged.sources,
        updatedAt,
      });
    }
  },
});
