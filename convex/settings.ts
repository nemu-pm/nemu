import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

const DEFAULT_SETTINGS = {
  readingMode: "rtl" as const,
  installedSources: [],
};

// Get user settings
export const get = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const settings = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();

    if (!settings) {
      return DEFAULT_SETTINGS;
    }

    return {
      readingMode: settings.readingMode,
      installedSources: settings.installedSources,
    };
  },
});

// Save user settings
export const save = mutation({
  args: {
    readingMode: v.union(
      v.literal("rtl"),
      v.literal("ltr"),
      v.literal("scrolling")
    ),
    installedSources: v.array(
      v.object({
        id: v.string(),
        registryId: v.string(),
        version: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        readingMode: args.readingMode,
        installedSources: args.installedSources,
      });
    } else {
      await ctx.db.insert("settings", {
        userId,
        ...args,
      });
    }
  },
});

// Add installed source
export const addInstalledSource = mutation({
  args: {
    source: v.object({
      id: v.string(),
      registryId: v.string(),
      version: v.number(),
    }),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject;

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      const sources = existing.installedSources.filter(
        (s) => s.id !== args.source.id
      );
      sources.push(args.source);
      await ctx.db.patch(existing._id, { installedSources: sources });
    } else {
      await ctx.db.insert("settings", {
        userId,
        readingMode: DEFAULT_SETTINGS.readingMode,
        installedSources: [args.source],
      });
    }
  },
});

// Remove installed source
export const removeInstalledSource = mutation({
  args: { sourceId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        installedSources: existing.installedSources.filter(
          (s) => s.id !== args.sourceId
        ),
      });
    }
  },
});

