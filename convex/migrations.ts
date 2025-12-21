import { mutation } from "./_generated/server";

export const removeReadingModeFromSettings = mutation({
  handler: async (ctx) => {
    const settings = await ctx.db.query("settings").collect();
    let count = 0;
    for (const doc of settings) {
      if ("readingMode" in doc) {
        const { readingMode, ...rest } = doc as any;
        await ctx.db.replace(doc._id, rest);
        count++;
      }
    }
    return { migrated: count };
  },
});

