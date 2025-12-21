import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireAuth, installedSourceValidator } from "./_lib";

const DEFAULT_SETTINGS = {
  installedSources: [] as [],
};

export const get = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);

    const settings = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!settings) {
      return { ...DEFAULT_SETTINGS, updatedAt: 0 };
    }

    return {
      installedSources: settings.installedSources,
      updatedAt: settings.updatedAt ?? 0,
    };
  },
});

export const save = mutation({
  args: {
    installedSources: v.array(installedSourceValidator),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const now = Date.now();

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        installedSources: args.installedSources,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("settings", {
        userId,
        installedSources: args.installedSources,
        updatedAt: now,
      });
    }
  },
});
