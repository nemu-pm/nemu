import type { MutationCtx } from "./_generated/server";
import { requireAuth } from "./_lib";

type OwnershipCtx = Pick<MutationCtx, "auth" | "db">;

export const R2_UPLOAD_FORBIDDEN = "R2_UPLOAD_FORBIDDEN";

/**
 * Attributes an R2 object key to the signed-in user. Idempotent for the same
 * user; a key already owned by someone else is rejected so a caller who learns
 * a key cannot take it over (or later delete it through their own account).
 */
export async function claimR2Upload(
  ctx: OwnershipCtx,
  key: string,
): Promise<string> {
  const userId = await requireAuth(ctx);
  const existing = await ctx.db
    .query("r2_uploads")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (existing) {
    if (existing.userId !== userId) throw new Error(R2_UPLOAD_FORBIDDEN);
    return userId;
  }
  await ctx.db.insert("r2_uploads", { userId, key, createdAt: Date.now() });
  return userId;
}
