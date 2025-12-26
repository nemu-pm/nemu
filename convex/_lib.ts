import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";

// ============ Constants ============

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ============ Auth Helpers ============

export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

// ============ Shared Validators ============

const chapterSummaryValidator = v.object({
  id: v.string(),
  title: v.optional(v.string()),
  chapterNumber: v.optional(v.number()),
  volumeNumber: v.optional(v.number()),
});

export const sourceRefValidator = v.object({
  registryId: v.string(),
  sourceId: v.string(),
  mangaId: v.string(),
  // Chapter availability tracking (reading progress derived from history)
  latestChapter: v.optional(chapterSummaryValidator),
  updateAcknowledged: v.optional(chapterSummaryValidator), // renamed from seenLatestChapter
});

export const installedSourceValidator = v.object({
  id: v.string(),
  registryId: v.string(),
  version: v.number(),
});
