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

export const sourceRefValidator = v.object({
  registryId: v.string(),
  sourceId: v.string(),
  mangaId: v.string(),
});

export const installedSourceValidator = v.object({
  id: v.string(),
  registryId: v.string(),
  version: v.number(),
});
