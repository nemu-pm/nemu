/**
 * Placeholder-cover defence.
 *
 * MangaDex hotlink-protects `uploads.mangadex.org`: a cover request that
 * carries a foreign `Referer` or `Origin` (for example the Referer another
 * source's `modifyImageRequest` adds for its own CDN) is answered with a
 * 600x642 "You can read this at mangadex.org" JPEG under the *real* cover URL
 * with HTTP 200. Nothing in the URL gives it away, so the guard works at two
 * levels:
 *
 * 1. Requests: headers that would trigger the substitution are dropped before
 *    the image cache key is computed, so a guarded host is never asked with a
 *    foreign Referer/Origin (and a stale poisoned cache entry is never hit).
 * 2. Responses: a downloaded body that matches a known placeholder fingerprint
 *    is rejected, so it can neither be painted nor cached.
 *
 * URL-level placeholders (static "no cover" images some sources return as the
 * cover itself) are recognised by `isMobilePlaceholderCoverUrl` and are never
 * persisted as a library cover.
 */

/** Hosts (registrable domains) that substitute a placeholder for hotlinks. */
const HOTLINK_GUARDED_IMAGE_DOMAINS = ["mangadex.org", "mangadex.network"];

/**
 * Byte-exact fingerprints of known placeholder bodies, per guarded domain.
 * `59480` is the MangaDex "You can read this at mangadex.org" JPEG
 * (md5 694855f70d4887848147c6debe9c96dc, 600x642), identical for the original
 * and the `.256.jpg` / `.512.jpg` thumbnail paths.
 */
const KNOWN_PLACEHOLDER_BYTE_LENGTHS: Record<string, readonly number[]> = {
  "mangadex.org": [59_480],
};

const PLACEHOLDER_COVER_PATH_PATTERNS: readonly RegExp[] = [
  /(^|[/_.-])(cover[-_]?)?placeholder([/_.-]|$)/i,
  /(^|\/)no[-_]?(cover|image|img)([/_.-]|$)/i,
];

// Two-label public suffixes common among manga CDNs; enough to keep
// `cf.hamreus.com` and `x.y.co.jp` apart without a PSL table.
const MULTI_LABEL_SUFFIXES = new Set([
  "co.jp",
  "ne.jp",
  "or.jp",
  "com.cn",
  "net.cn",
  "org.cn",
  "com.tw",
  "com.hk",
  "co.kr",
  "co.uk",
  "com.br",
  "com.vn",
]);

function parseHost(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url.trim());
  if (!match) return null;
  const authority = match[1]!;
  const host = authority
    .slice(authority.lastIndexOf("@") + 1)
    .replace(/:\d+$/, "")
    .replace(/\.$/, "")
    .toLowerCase();
  return host || null;
}

/** Approximate registrable domain (`uploads.mangadex.org` -> `mangadex.org`). */
export function getMobileRegistrableDomain(
  url: string | null | undefined,
): string | null {
  const host = parseHost(url);
  if (!host) return null;
  if (/^\d+(\.\d+){3}$/.test(host) || host.includes(":")) return host;
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  if (MULTI_LABEL_SUFFIXES.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}

function guardedDomainFor(url: string | null | undefined): string | null {
  const domain = getMobileRegistrableDomain(url);
  return domain && HOTLINK_GUARDED_IMAGE_DOMAINS.includes(domain)
    ? domain
    : null;
}

export function isMobileHotlinkGuardedImageUrl(
  url: string | null | undefined,
): boolean {
  return guardedDomainFor(url) !== null;
}

function isSameSiteHeaderValue(value: string, domain: string): boolean {
  const headerDomain = getMobileRegistrableDomain(value);
  return headerDomain !== null && HOTLINK_GUARDED_IMAGE_DOMAINS.includes(headerDomain)
    ? true
    : headerDomain === domain;
}

/**
 * Drops `Referer`/`Origin` headers that would make a hotlink-guarded host
 * answer with its placeholder. Returns the input object unchanged when nothing
 * had to be removed, so callers can compare identities cheaply.
 */
export function sanitizeMobileHotlinkImageHeaders(
  url: string | null | undefined,
  headers: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!headers) return headers;
  const domain = guardedDomainFor(url);
  if (!domain) return headers;
  let sanitized: Record<string, string> | null = null;
  for (const [name, value] of Object.entries(headers)) {
    const lower = name.toLowerCase();
    if (
      (lower === "referer" || lower === "origin") &&
      !isSameSiteHeaderValue(value, domain)
    ) {
      sanitized ??= { ...headers };
      delete sanitized[name];
    }
  }
  if (!sanitized) return headers;
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

/** A static "no cover" image returned as the cover URL itself. */
export function isMobilePlaceholderCoverUrl(
  url: string | null | undefined,
): boolean {
  const trimmed = url?.trim();
  if (!trimmed) return false;
  const pathMatch = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]+([^?#]*)/i.exec(trimmed);
  const path = pathMatch?.[1] ?? "";
  return PLACEHOLDER_COVER_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

/** A usable cover: non-empty and not a known URL-level placeholder. */
export function isMobileUsableCoverUrl(
  url: string | null | undefined,
): boolean {
  return Boolean(url?.trim()) && !isMobilePlaceholderCoverUrl(url);
}

/**
 * True when a downloaded image body is a known placeholder substitution for
 * the requested URL. Only guarded hosts are fingerprinted; everything else is
 * trusted.
 */
export function isMobileKnownPlaceholderImageResponse({
  url,
  byteLength,
}: {
  url: string | null | undefined;
  byteLength: number | null | undefined;
}): boolean {
  if (typeof byteLength !== "number" || !Number.isFinite(byteLength)) {
    return false;
  }
  const domain = guardedDomainFor(url);
  if (!domain) return false;
  return (KNOWN_PLACEHOLDER_BYTE_LENGTHS[domain] ?? []).includes(byteLength);
}
