/**
 * Which cookie scope (and so which scoped local-network grant) an image URL
 * may be fetched with.
 *
 * Image downloads run in a shared pipeline that knows nothing about the source
 * that produced a URL. Letting it pick a grant from the URL's host would hand
 * any downloaded package a way to reach the user's server, so the pipeline
 * only honours URLs a built-in self-hosted source itself returned: the
 * executor records each exact URL it hands out (covers, pages), and the
 * pipeline looks that exact string up. A package cannot name such a URL.
 */
const scopes = new Map<string, string>();
const MAX_ENTRIES = 6_000;

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
