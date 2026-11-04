/**
 * Which cookie scope (and so which scoped local-network grant) an image URL
 * may be fetched with.
 *
 * Image downloads run in a shared pipeline that knows nothing about the source
 * that produced a URL. Letting it pick a grant from the URL's host would hand
 * any downloaded package a way to reach the user's server, so the pipeline
 * only honours URLs registered here, by exact string:
 *
 * - a built-in self-hosted source records each URL it hands out (covers,
 *   pages) for its own scope;
 * - a source package that holds a local-network grant (LANraragi) has the
 *   image requests *it* produced recorded for *its* scope, and only when the
 *   URL names exactly the host:port native accepted for that scope. A package
 *   cannot register a URL for another source's scope, nor for any endpoint
 *   outside its own grant, and native re-checks the grant on every connection.
 */
const scopes = new Map<string, string>();
const MAX_ENTRIES = 6_000;

/**
 * What native accepted for each scope's local-network grant, in its own
 * `host:port` form (`NemuNativeLocalNetworkAllowance.setGrant`). Loopback,
 * metadata and public endpoints are never in here: native refuses to grant
 * them.
 */
const grantedEndpoints = new Map<string, ReadonlySet<string>>();

export function registerSelfHostedImageUrl(url: string, cookieScope: string): void {
  if (scopes.has(url)) scopes.delete(url);
  scopes.set(url, cookieScope);
  while (scopes.size > MAX_ENTRIES) {
    const oldest = scopes.keys().next().value;
    if (oldest === undefined) break;
    scopes.delete(oldest);
  }
}

export function selfHostedImageCookieScope(url: string | null | undefined): string | undefined {
  return url ? scopes.get(url) : undefined;
}

export function clearSelfHostedImageScopes(): void {
  scopes.clear();
}

/** Mirrors the endpoints native accepted for `scopeKey`; an empty list revokes. */
export function setLocalNetworkImageGrant(scopeKey: string, acceptedEndpoints: readonly string[]): void {
  if (acceptedEndpoints.length === 0) {
    grantedEndpoints.delete(scopeKey);
    return;
  }
  grantedEndpoints.set(scopeKey, new Set(acceptedEndpoints));
}

/** The `host:port` an http(s) URL connects to, normalised the way native normalises a grant. */
export function localNetworkEndpointOf(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  const host = parsed.hostname.replace(/^\[|\]$/g, "").replace(/\.+$/, "").toLowerCase();
  if (!host) return null;
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80;
  return `${host}:${port}`;
}

/**
 * Records an image URL a source package produced so the image pipeline
 * fetches it with that source's grant. Only a URL on exactly a granted
 * endpoint of `scopeKey` is recorded; anything else is left to the public
 * image path. Returns whether it was recorded.
 */
export function registerLocalNetworkImageUrl(url: string, scopeKey: string): boolean {
  const endpoints = grantedEndpoints.get(scopeKey);
  if (!endpoints) return false;
  const endpoint = localNetworkEndpointOf(url);
  if (!endpoint || !endpoints.has(endpoint)) return false;
  registerSelfHostedImageUrl(url, scopeKey);
  return true;
}

export function resetLocalNetworkImageGrantsForTests(): void {
  grantedEndpoints.clear();
  scopes.clear();
}
