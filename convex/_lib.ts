import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";

// ============ Auth Helpers ============

export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

// ============ Shared Validators ============

export const installedSourceValidator = v.object({
  id: v.string(),
  registryId: v.string(),
  version: v.number(),
});
