import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth } from "better-auth";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL!;
const devUrl = process.env.DEV_URL;

export const authComponent = createClient<DataModel>(components.betterAuth);

const appleConfigured = Boolean(
  process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    trustedOrigins: [siteUrl, devUrl, "https://appleid.apple.com"].filter(
      Boolean
    ) as string[],
    database: authComponent.adapter(ctx),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      },
      ...(appleConfigured && {
        apple: {
          clientId: process.env.APPLE_CLIENT_ID!,
          clientSecret: process.env.APPLE_CLIENT_SECRET!,
          appBundleIdentifier: process.env.APPLE_APP_BUNDLE_ID,
        },
      }),
    },
    plugins: [crossDomain({ siteUrl }), convex({ authConfig })],
  });
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});

export const getOAuthProvider = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.safeGetAuthUser(ctx);
    if (!user) return null;

    const account = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "account",
      where: [{ field: "userId", value: user._id }],
    });

    if (!account || typeof account.providerId !== "string") return null;
    return account.providerId;
  },
});
