// Persisted registry index (stale-while-revalidate) shared by native and the
// bun-test/web base implementation.
//
// Cold starts paint the last known source list instantly while the network
// refresh runs; offline launches keep a usable catalog instead of an error.
// The cache holds public registry catalog data only (no credentials), so a
// plain cache file with defensive decoding is sufficient.

import {
  MOBILE_AIDOKU_REGISTRY_MAX_SOURCES,
  type MobileRegistrySource,
} from "./aidokuRegistry";

const REGISTRY_INDEX_CACHE_FORMAT_VERSION = 1;

interface RegistryIndexCachePayload {
  v: number;
  savedAt?: number;
  sources: MobileRegistrySource[];
}

export type MobileRegistryIndexCacheSnapshot = {
  sources: MobileRegistrySource[];
  savedAt: number | null;
};

export function isMobileRegistrySourceShape(
  value: unknown,
): value is MobileRegistrySource {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<MobileRegistrySource>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.length > 0 &&
    typeof candidate.registryId === "string" &&
    candidate.registryId.length > 0 &&
    typeof candidate.name === "string" &&
    typeof candidate.version === "number" &&
    Number.isSafeInteger(candidate.version) &&
    candidate.version >= 0
  );
}

export function encodeRegistryIndexCache(
  sources: MobileRegistrySource[],
): string {
  const payload: RegistryIndexCachePayload = {
    v: REGISTRY_INDEX_CACHE_FORMAT_VERSION,
    savedAt: Date.now(),
    sources,
  };
  return JSON.stringify(payload);
}

/**
 * Decode a cached index. Corrupt entries are dropped rather than rejecting
 * the whole catalog; the next successful refresh rewrites the file anyway.
 * Returns null for anything unusable (wrong version, empty, over the source
 * safety limit, or no surviving entries).
 */
export function decodeRegistryIndexCache(
  raw: string,
): MobileRegistrySource[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null;
  }
  const { v, sources } = parsed as {
    v?: unknown;
    sources?: unknown;
  };
  if (v !== REGISTRY_INDEX_CACHE_FORMAT_VERSION || !Array.isArray(sources)) {
    return null;
  }
  if (
    sources.length === 0 ||
    sources.length > MOBILE_AIDOKU_REGISTRY_MAX_SOURCES
  ) {
    return null;
  }
  const valid = sources.filter(isMobileRegistrySourceShape);
  if (valid.length === 0) return null;
  return valid;
}

export function decodeRegistryIndexCacheSnapshot(
  raw: string,
): MobileRegistryIndexCacheSnapshot | null {
  const sources = decodeRegistryIndexCache(raw);
  if (!sources) return null;
  try {
    const parsed = JSON.parse(raw) as { savedAt?: unknown };
    return {
      sources,
      savedAt:
        typeof parsed.savedAt === "number" && Number.isFinite(parsed.savedAt)
          ? parsed.savedAt
          : null,
    };
  } catch {
    return null;
  }
}

// Base (bun tests / Expo web) implementation: process-lifetime memory only.
let cachedPayload: string | null = null;

export async function loadCachedRegistryIndex(): Promise<MobileRegistrySource[] | null> {
  if (cachedPayload == null) return null;
  return decodeRegistryIndexCache(cachedPayload);
}

export async function loadCachedRegistryIndexSnapshot(): Promise<MobileRegistryIndexCacheSnapshot | null> {
  if (cachedPayload == null) return null;
  return decodeRegistryIndexCacheSnapshot(cachedPayload);
}

export async function saveCachedRegistryIndex(
  sources: MobileRegistrySource[],
): Promise<void> {
  if (sources.length === 0) return;
  cachedPayload = encodeRegistryIndexCache(sources);
}

export async function clearCachedRegistryIndex(): Promise<void> {
  cachedPayload = null;
}
