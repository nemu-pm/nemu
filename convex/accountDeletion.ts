import { ConvexError, v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { components, internal } from "./_generated/api";
import {
  PURGE_PAGE_SIZE,
  r2KeysOfLibraryItem,
  USER_OWNED_TABLES,
  type UserOwnedTable,
} from "./accountDeletionPlan";
import { runAccountDeletion, type AccountDeletionResult } from "./accountDeletionRun";
import { revokeAppleAccount } from "./appleRevoke";
import { r2 } from "./r2";

const tableValidator = v.string();

function assertUserOwnedTable(table: string): UserOwnedTable {
  if (!(USER_OWNED_TABLES as readonly string[]).includes(table)) {
    throw new Error(`Not a user-owned table: ${table}`);
  }
  return table as UserOwnedTable;
}

/** Deletes one bounded page of a user's rows. Internal: reachable only from deleteMyAccount. */
export const purgePage = internalMutation({
  args: { userId: v.string(), table: tableValidator },
  returns: v.object({ deleted: v.number(), done: v.boolean() }),
  handler: async (ctx, args): Promise<{ deleted: number; done: boolean }> => {
    const table = assertUserOwnedTable(args.table);
    const rows = await ctx.db
      .query(table)
      .withIndex(
        "by_user" as never,
        ((q: { eq(field: string, value: string): unknown }) =>
          q.eq("userId", args.userId)) as never,
      )
      .take(PURGE_PAGE_SIZE);
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length, done: rows.length < PURGE_PAGE_SIZE };
  },
});

/** One page of R2 keys referenced by a user's ownership rows or library covers. */
export const r2KeysPage = internalQuery({
  args: {
    userId: v.string(),
    source: v.union(v.literal("r2_uploads"), v.literal("library_items")),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.object({
    keys: v.array(v.string()),
    cursor: v.union(v.string(), v.null()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ keys: string[]; cursor: string | null }> => {
    const page = await ctx.db
      .query(args.source)
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .paginate({ numItems: PURGE_PAGE_SIZE, cursor: args.cursor });
    const keys =
      args.source === "r2_uploads"
        ? (page.page as Array<{ key: string }>).map((row) => row.key)
        : (page.page as Array<Parameters<typeof r2KeysOfLibraryItem>[0]>).flatMap(
            r2KeysOfLibraryItem,
          );
    return { keys, cursor: page.isDone ? null : page.continueCursor };
  },
});

/**
 * Deletes the signed-in user's account and all data associated with it
 * (App Review 5.1.1(v)). Safe to call again after a failure. The Convex JWT of
 * connected clients stays valid until it expires, so clients must sign out
 * locally as soon as this resolves.
 */
export const deleteMyAccount = action({
  // Optional authorizationCode from a fresh native Sign in with Apple run by
  // the client at deletion time (also serves as re-authentication).
  args: { appleAuthorizationCode: v.optional(v.string()) },
  returns: v.object({
    appleRevoke: v.string(),
    r2ObjectsDeleted: v.number(),
  }),
  handler: async (ctx, args): Promise<AccountDeletionResult> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const userId = identity.subject;

    try {
    return await runAccountDeletion(
      {
        appleTokens: async (id) => {
          const accounts = await ctx.runQuery(
            components.betterAuth.adapter.findMany,
            {
              model: "account",
              where: [{ field: "userId", value: id }],
              paginationOpts: { numItems: 50, cursor: null },
            },
          );
          return accounts.page
            .filter((account: Record<string, unknown>) => account.providerId === "apple")
            .map((account: Record<string, unknown>) => ({
              refreshToken: account.refreshToken as string | null | undefined,
              accessToken: account.accessToken as string | null | undefined,
              idToken: account.idToken as string | null | undefined,
            }));
        },
        revokeApple: async (tokens, code) => {
          const result = await revokeAppleAccount(tokens, code, {
            APPLE_CLIENT_ID: process.env.APPLE_CLIENT_ID,
            APPLE_CLIENT_SECRET: process.env.APPLE_CLIENT_SECRET,
            APPLE_APP_BUNDLE_ID: process.env.APPLE_APP_BUNDLE_ID,
            APPLE_NATIVE_CLIENT_SECRET: process.env.APPLE_NATIVE_CLIENT_SECRET,
          });
          if (result.outcome !== "revoked" && result.outcome !== "already-revoked") {
            // Never log tokens or secrets; outcome and status identify the cause.
            console.warn("[accountDeletion] Apple revoke", result.outcome, result.status);
          }
          return result.outcome;
        },
        r2KeysPage: (id, source, cursor) =>
          ctx.runQuery(internal.accountDeletion.r2KeysPage, {
            userId: id,
            source,
            cursor,
          }),
        deleteR2Object: (key) => r2.deleteObject(ctx, key),
        purgePage: (id, table) =>
          ctx.runMutation(internal.accountDeletion.purgePage, {
            userId: id,
            table,
          }),
        userEmail: async (id) => {
          const user = await ctx.runQuery(components.betterAuth.adapter.findOne, {
            model: "user",
            where: [{ field: "_id", value: id }],
          });
          return typeof user?.email === "string" ? user.email : null;
        },
        deleteAuthRows: async (model, field, value) => {
          for (let page = 0; page < 10_000; page++) {
            const result = await ctx.runMutation(
              components.betterAuth.adapter.deleteMany,
              {
                input: {
                  model: model as never,
                  where: [{ field: field as never, operator: "eq" as const, value }],
                },
                paginationOpts: { numItems: 100, cursor: null },
              },
            );
            if (result.count === 0) return;
          }
        },
        deleteAuthUser: async (id) => {
          await ctx.runMutation(components.betterAuth.adapter.deleteOne, {
            input: { model: "user", where: [{ field: "_id", value: id }] },
          });
        },
      },
      userId,
      { appleAuthorizationCode: args.appleAuthorizationCode },
    );
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code.startsWith("ACCOUNT_DELETION_APPLE_")) throw new ConvexError({ code });
      throw error;
    }
  },
});
