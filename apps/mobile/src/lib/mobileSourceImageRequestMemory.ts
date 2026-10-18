import type { MobileSourceImageRequest } from "@/sources/mobileSourceImages";

/**
 * Resolved source image requests remembered across launches, so the first
 * frame after a cold start paints a cover through the request its source
 * resolved last time (same URL and headers, so the same cached image)
 * instead of the raw URL, which then swapped ~200 ms later. The live resolve
 * still runs and replaces a remembered request that changed.
 *
 * Only plain remote requests are kept: a processed cover's local `file://`
 * may be pruned between launches, and headers that can carry credentials
 * (cookies, authorization, tokens) never go to a cache file.
 */
export type MobileSourceImageRequestMemory = Map<string, MobileSourceImageRequest>;

export const MOBILE_SOURCE_IMAGE_REQUEST_MEMORY_MAX = 400;

/** Request headers a cover may be remembered with: none of them carries a credential. */
const SAFE_HEADERS = new Set(["referer", "origin", "user-agent", "accept", "accept-language"]);

export function isRememberableMobileSourceImageRequest(
  request: MobileSourceImageRequest | null | undefined,
): request is MobileSourceImageRequest {
  if (!request || !/^https?:\/\//i.test(request.url)) return false;
  return Object.keys(request.headers ?? {}).every((name) => SAFE_HEADERS.has(name.toLowerCase()));
}

/** Which image, through which build of which source, in which profile. */
export function makeMobileSourceImageRequestMemoryKey(
  identity: {
    scope: string;
    sourceId: string;
    packageCacheKey?: string | null;
    version: string | number;
    updatedAt?: string | number | null;
  },
  url: string,
): string {
  return [
    identity.scope,
    identity.sourceId,
    identity.packageCacheKey ?? "",
    identity.version,
    identity.updatedAt ?? "",
    url,
  ].join("|");
}

function sameRequest(a: MobileSourceImageRequest, b: MobileSourceImageRequest): boolean {
  if (a.url !== b.url) return false;
  const aKeys = Object.keys(a.headers ?? {});
  const bHeaders = b.headers ?? {};
  return aKeys.length === Object.keys(bHeaders).length && aKeys.every((name) => a.headers[name] === bHeaders[name]);
}

/**
 * Records one settled request. Returns whether the memory changed (so the
 * caller persists only then). A request that can't be remembered drops any
 * older entry for the key; the newest entries outlive the oldest.
 */
export function rememberMobileSourceImageRequest(
  memory: MobileSourceImageRequestMemory,
  key: string,
  request: MobileSourceImageRequest | null,
): boolean {
  const existing = memory.get(key);
  if (!isRememberableMobileSourceImageRequest(request)) {
    // A failed resolve (null) says nothing new about the request; keep it.
    return request !== null && memory.delete(key);
  }
  if (existing && sameRequest(existing, request)) return false;
  memory.delete(key);
  memory.set(key, { url: request.url, headers: { ...request.headers } });
  while (memory.size > MOBILE_SOURCE_IMAGE_REQUEST_MEMORY_MAX) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
  return true;
}

export function parseMobileSourceImageRequestMemory(text: string | null): MobileSourceImageRequestMemory {
  const memory: MobileSourceImageRequestMemory = new Map();
  if (!text) return memory;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return memory;
  }
  const entries = (parsed as { v?: unknown; entries?: unknown })?.v === 1 ? (parsed as { entries: unknown }).entries : null;
  if (!Array.isArray(entries)) return memory;
  for (const entry of entries) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string") continue;
    const request = entry[1] as MobileSourceImageRequest | null;
    if (
      request &&
      typeof request.url === "string" &&
      request.headers &&
      typeof request.headers === "object" &&
      Object.values(request.headers).every((value) => typeof value === "string")
    ) {
      rememberMobileSourceImageRequest(memory, entry[0], request);
    }
  }
  return memory;
}

export function serializeMobileSourceImageRequestMemory(memory: MobileSourceImageRequestMemory): string {
  return JSON.stringify({ v: 1, entries: [...memory.entries()] });
}
