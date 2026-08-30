export type AuthCrossSubDomainCookieConfig = {
  enabled: true;
  domain: ".nemu.pm";
};

const COOKIE_DOMAIN = ".nemu.pm";

/**
 * A browser only accepts `Domain=.nemu.pm` from a response served by nemu.pm
 * or one of its subdomains. When Better Auth runs on a Convex host (every
 * development deployment) that attribute makes the browser silently discard
 * every auth cookie it sets — OAuth state, session token, session data — so
 * those hosts must fall back to host-only cookies.
 *
 * The comparison is deliberately strict: exact apex or dot-suffix match on the
 * normalized hostname, trailing-dot FQDNs stripped, and https only (the cookies
 * are `Secure`, so an http base URL could never receive them anyway).
 */
export function getAuthCrossSubDomainCookieConfig(
  baseUrl: string | undefined,
): AuthCrossSubDomainCookieConfig | null {
  try {
    const url = new URL(baseUrl ?? "");
    if (url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
    if (hostname === "nemu.pm" || hostname.endsWith(COOKIE_DOMAIN)) {
      return { enabled: true, domain: COOKIE_DOMAIN };
    }
  } catch {
    // Invalid or missing configuration is reported by Better Auth startup.
  }
  return null;
}
