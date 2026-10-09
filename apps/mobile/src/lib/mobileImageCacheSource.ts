import type { MobileImageCacheSource } from "@/lib/mobileImageCache";
import { sanitizeMobileHotlinkImageHeaders } from "@/lib/mobileCoverPlaceholder";

/**
 * Source-owned image URLs are fetched through the HTTPS-only native download
 * seam (JS `requireHttps`, the native SSRF policy and ATS all refuse cleartext),
 * so a plain-`http:` cover or page URL used to sit on its placeholder forever.
 * Legacy Chinese sources (e.g. 漫客栈's `http://oss.mkzcdn.com/...` covers)
 * still emit `http:` links although their CDNs serve the same paths over TLS,
 * so upgrade the scheme before the URL reaches the policy or the cache key.
 * Hosts that really are HTTP-only fail exactly as they did before.
 */
export function upgradeMobileImageUriScheme(uri: string): string {
  return /^http:\/\//i.test(uri) ? `https://${uri.slice("http://".length)}` : uri;
}

/**
 * Canonical form of an image request, applied before both the cache key and
 * the download: the scheme upgrade above, and hotlink-guard header removal
 * (a foreign Referer/Origin makes MangaDex answer with its "read this at
 * mangadex.org" placeholder; see `mobileCoverPlaceholder`). Sanitising before
 * the key also means a cover resolved through another source's request
 * settings shares the owner's cache entry instead of a poisoned one.
 */
export function normalizeMobileImageCacheSource<
  T extends MobileImageCacheSource | null | undefined,
>(source: T): T {
  if (!source?.uri) return source;
  const upgraded = upgradeMobileImageUriScheme(source.uri);
  const headers = sanitizeMobileHotlinkImageHeaders(upgraded, source.headers);
  if (upgraded === source.uri && headers === source.headers) return source;
  const next: MobileImageCacheSource = { ...source, uri: upgraded };
  if (headers) next.headers = headers;
  else delete next.headers;
  return next as T;
}
