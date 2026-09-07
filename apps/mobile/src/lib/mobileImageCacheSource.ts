import type { MobileImageCacheSource } from "@/lib/mobileImageCache";

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

export function normalizeMobileImageCacheSource<
  T extends MobileImageCacheSource | null | undefined,
>(source: T): T {
  if (!source?.uri) return source;
  const upgraded = upgradeMobileImageUriScheme(source.uri);
  if (upgraded === source.uri) return source;
  return { ...source, uri: upgraded } as T;
}
