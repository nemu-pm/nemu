import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
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
    trustedOrigins: [
      siteUrl,
      devUrl,
      "https://appleid.apple.com",
      // Capacitor / native shell origins — the iOS WKWebView serves the
      // bundle from capacitor://localhost (Android: https://localhost), and
      // OAuth callbacks return into the native app via the nemu:// scheme.
      // These must be trusted so better-auth accepts callbackURLs pointing
      // at them and emits cross-origin cookies/tokens for the SPA shell.
      "capacitor://localhost",
      "https://localhost",
      // Native app scheme — needed for OAuth callback URL validation.
      // The Expo plugin docs explicitly use 'myapp://' as a trusted origin.
      "nemu://",
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
      crossSubDomainCookies: {
        enabled: true,
        domain: ".nemu.pm",
      },
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
