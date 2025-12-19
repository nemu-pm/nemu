import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth } from "better-auth";
import { SignJWT, importPKCS8 } from "jose";
import authConfig from "./auth.config";

const siteUrl = process.env.SITE_URL!;
const devUrl = process.env.DEV_URL; // Optional: localhost URL for dev

/**
 * Generate Apple client secret JWT (run this locally, not in Convex)
 * Apple requires a JWT signed with your private key that expires in max 180 days
 * 
 * Run: npx tsx scripts/generate-apple-secret.ts
 * Then: npx convex env set APPLE_CLIENT_SECRET "..."
 */
export async function generateAppleClientSecret(config: {
  teamId: string;
  keyId: string;
  clientId: string;
  privateKey: string;
}): Promise<string> {
  const key = await importPKCS8(config.privateKey, "ES256");

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.keyId })
    .setIssuer(config.teamId)
    .setIssuedAt()
    .setExpirationTime("180d")
    .setAudience("https://appleid.apple.com")
    .setSubject(config.clientId)
    .sign(key);
}

// The component client has methods needed for integrating Convex with Better Auth,
// as well as helper methods for general use.
export const authComponent = createClient<DataModel>(components.betterAuth);

// Check if Apple is configured
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
          // Pre-generate this JWT using the getAppleClientSecret function
          // or generate externally and store as APPLE_CLIENT_SECRET
          clientSecret: process.env.APPLE_CLIENT_SECRET!,
          appBundleIdentifier: process.env.APPLE_APP_BUNDLE_ID,
        },
      }),
    },
    plugins: [
      // The cross domain plugin is required for client side frameworks
      crossDomain({ siteUrl }),
      // The Convex plugin is required for Convex compatibility
      convex({ authConfig }),
    ],
  });
};

// Example function for getting the current user
// Feel free to edit, omit, etc.
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});

