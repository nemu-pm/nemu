import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { expo } from "@better-auth/expo";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { betterAuth } from "better-auth";
import authConfig from "./auth.config";
import { getAuthCrossSubDomainCookieConfig } from "./authCookiePolicy";
import { createMobileOriginBridge } from "./authMobileOriginBridge";

const siteUrl = process.env.SITE_URL!;
const devUrl = process.env.DEV_URL;
const convexSiteUrl = process.env.CONVEX_SITE_URL!;
const crossSubDomainCookieConfig =
  getAuthCrossSubDomainCookieConfig(convexSiteUrl);
const mobileTrustedOrigins = [
  "nemu://",
  "nemu://*",
  "pm.nemu.mobile://",
  "pm.nemu.mobile://*",
];

export const authComponent = createClient<DataModel>(components.betterAuth);

const appleConfigured = Boolean(
  process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET
);

export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth({
    // Better Auth 1.6 no longer treats request-host inference as a stable
    // server configuration. Convex provides this canonical deployment URL at
    // runtime, keeping OAuth callbacks deterministic behind its HTTP router.
    baseURL: convexSiteUrl,
    trustedOrigins: [
      siteUrl,
      devUrl,
      "https://appleid.apple.com",
      ...mobileTrustedOrigins,
    ].filter(Boolean) as string[],
    database: authComponent.adapter(ctx),
    socialProviders: {
      google: {
        prompt: "select_account",
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
      ...(appleConfigured && {
        apple: {
          clientId: process.env.APPLE_CLIENT_ID!,
          clientSecret: process.env.APPLE_CLIENT_SECRET!,
          appBundleIdentifier: process.env.APPLE_APP_BUNDLE_ID,
        },
      }),
    },
    advanced: {
      cookiePrefix: "nemu",
      useSecureCookies: true,
      ...(crossSubDomainCookieConfig
        ? { crossSubDomainCookies: crossSubDomainCookieConfig }
        : {}),
    },
    plugins: [
      createMobileOriginBridge({ siteUrl, devUrl }),
      expo({ disableOriginOverride: true }),
      crossDomain({ siteUrl }),
      convex({ authConfig }),
    ],
  });
};

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});

/**
 * Lightweight, non-throwing identity probe used to bind local sync profiles to
 * the account actually authenticated on the Convex transport.
 */
export const getCurrentUserId = query({
  args: {},
  handler: async (ctx) => (await ctx.auth.getUserIdentity())?.subject ?? null,
});

/**
 * Validate a session from HTTP request headers in httpAction handlers.
 *
 * The crossDomainClient() plugin sends session tokens via a custom
 * "Better-Auth-Cookie" header instead of browser cookies.  The server-side
 * crossDomain plugin's before-hook only runs on better-auth's own routes
 * (/api/auth/*), so custom httpAction endpoints never see it.  We replicate
 * the same logic here: copy the header value into "cookie" so that
 * auth.api.getSession can find the session token.
 */
export async function getHttpSession(ctx: ActionCtx, request: Request) {
  const { auth } = await authComponent.getAuth(createAuth, ctx);

  // Relay cross-domain cookie header (mirrors crossDomain server plugin logic)
  const betterAuthCookie = request.headers.get("better-auth-cookie");
  if (betterAuthCookie) {
    const headers = new Headers(request.headers);
    const existing = headers.get("cookie") ?? "";
    headers.set("cookie", existing ? `${existing}; ${betterAuthCookie}` : betterAuthCookie);
    return auth.api.getSession({ headers });
  }

  return auth.api.getSession({ headers: request.headers });
}

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
