import type { QueryCtx, MutationCtx } from "./_generated/server";

// ============ Auth Helpers ============

export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

/**
 * A Convex websocket replays unconfirmed mutations after reconnect under the
 * socket's then-current authentication. Sync clients therefore bind every
 * queued write to the account that produced its local payload; a stale
 * profile-A mutation must fail instead of executing after the socket becomes B.
 */
export async function requireAuthForUser(
  ctx: QueryCtx | MutationCtx,
  expectedUserId: string,
): Promise<string> {
  const userId = await requireAuth(ctx);
  if (userId !== expectedUserId) {
    throw new Error("AUTH_ACCOUNT_MISMATCH");
  }
  return userId;
}
