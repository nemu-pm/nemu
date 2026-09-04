import {
  getActiveMobileSourceProfileScope,
  registerMobileSourceProfileTransitionHandler,
} from "@/sources/mobileSourceProfileScope";
import type { MobileSourceListingResult } from "@/sources/mobileSourceListings";
import type { MobileLiveSearchManga } from "@/sources/mobileSourceSearch";

/**
 * In-memory listing pages for the source browse grid. It lives outside the
 * screen module so every cache-clear path (Settings "clear cache", the
 * device-wide data clear, and profile transitions) can drop it without
 * importing a screen.
 */
export type MobileSourceListingBrowseState =
  | { status: "idle"; items: MobileLiveSearchManga[]; detail: string }
  | { status: "loading"; items: MobileLiveSearchManga[]; detail: string }
  | {
      status: "ready";
      result: Extract<MobileSourceListingResult, { status: "ready" }>;
      items: MobileLiveSearchManga[];
    }
  | {
      status: "blocked";
      result: Extract<MobileSourceListingResult, { status: "blocked" }>;
      items: MobileLiveSearchManga[];
    }
  | { status: "error"; items: MobileLiveSearchManga[]; detail: string };

const SOURCE_LISTING_CACHE_TTL_MS = 5 * 60 * 1000;
const SOURCE_LISTING_CACHE_LIMIT = 80;
const sourceListingCache = new Map<
  string,
  { state: MobileSourceListingBrowseState; updatedAt: number }
>();

export function readMobileSourceListingCache(
  key: string,
): MobileSourceListingBrowseState | null {
  const cached = sourceListingCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.updatedAt > SOURCE_LISTING_CACHE_TTL_MS) {
    sourceListingCache.delete(key);
    return null;
  }
  return cached.state;
}

export function writeMobileSourceListingCache(
  key: string,
  state: MobileSourceListingBrowseState,
): void {
  if (state.status === "idle" || state.status === "loading") return;
  sourceListingCache.set(key, { state, updatedAt: Date.now() });
  while (sourceListingCache.size > SOURCE_LISTING_CACHE_LIMIT) {
    const firstKey = sourceListingCache.keys().next().value;
    if (!firstKey) break;
    sourceListingCache.delete(firstKey);
  }
}

export function clearMobileSourceListingCacheForRuntime(
  sourceRuntimeKey: string | null,
  profileScope = getActiveMobileSourceProfileScope(),
): void {
  if (!sourceRuntimeKey) return;
  const prefix = `${profileScope}:${sourceRuntimeKey}:`;
  for (const key of sourceListingCache.keys()) {
    if (key.startsWith(prefix)) sourceListingCache.delete(key);
  }
}

export function clearMobileSourceListingCache(): void {
  sourceListingCache.clear();
}

registerMobileSourceProfileTransitionHandler(
  "source-listing-cache",
  clearMobileSourceListingCache,
);
