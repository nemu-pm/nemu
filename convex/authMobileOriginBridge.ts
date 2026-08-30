import type { BetterAuthPlugin } from "better-auth";

export const mobileOriginPrefixes = ["nemu://", "pm.nemu.mobile://"];

function isMobileOrigin(url: string): boolean {
  return mobileOriginPrefixes.some((origin) => url.startsWith(origin));
}

/**
 * Better Auth's Expo plugin needs a server-side origin bridge for native apps,
 * where requests carry `expo-origin` instead of the browser `Origin` header.
 *
 * The bridge only rewrites the request's Origin to the trusted site URL and
 * teaches `isTrustedOrigin` about the app's custom schemes. It deliberately
 * leaves Better Auth's origin-check middleware enabled: setting
 * `ctx.skipOriginCheck = true` also disables `callbackURL` / `redirectTo` /
 * `errorCallbackURL` / `newUserCallbackURL` validation, which would let a
 * forged native request mint an OAuth state whose post-login redirect (and the
 * one-time token appended to it) points at an attacker-controlled host.
 *
 * Accepting `expo-origin` here is only safe because that header is NOT in the
 * CORS `Access-Control-Allow-Headers` allowlist (convex/http.ts), so a browser
 * can never send it cross-origin — and same-origin/browser requests always
 * carry a real Origin header, which takes the early return below. Adding
 * `expo-origin` to that allowlist would let any website forge the header.
 *
 * `ctx` is the per-request Better Auth context (`@convex-dev/better-auth`
 * calls `createAuth` for every request), so mutating `isTrustedOrigin` here
 * cannot leak across requests.
 */
export function createMobileOriginBridge({
  siteUrl,
  devUrl,
}: {
  siteUrl?: string;
  devUrl?: string;
}): BetterAuthPlugin {
  return {
    id: "nemu-mobile-origin-bridge",
    async onRequest(request, ctx) {
      if (request.headers.get("origin")) return;

      const expoOrigin = request.headers.get("expo-origin");
      if (!expoOrigin || !isMobileOrigin(expoOrigin)) return;

      const req = request.clone();
      req.headers.set("origin", siteUrl || devUrl || new URL(request.url).origin);
      const originalIsTrustedOrigin = ctx.isTrustedOrigin.bind(ctx);
      ctx.isTrustedOrigin = (url, settings) => {
        if (typeof url === "string" && isMobileOrigin(url)) return true;
        return originalIsTrustedOrigin(url, settings);
      };
      return { request: req };
    },
  };
}
