/**
 * Centralized key generation for storage and caching
 * All composite keys should be generated through this module
 */

/** Registry ID for locally installed .aix files */
export const LOCAL_REGISTRY_ID = "aidoku-local";

/** Key separator used in composite keys */
const SEP = ":";

/** Simple hash for cache keys (djb2) */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Generate composite keys for various entities
 */
export const Keys = {
  /** Source key: registryId:sourceId */
  source: (registryId: string, sourceId: string) => `${registryId}${SEP}${sourceId}`,

  /** Manga key: registryId:sourceId:mangaId */
  manga: (registryId: string, sourceId: string, mangaId: string) =>
    `${registryId}${SEP}${sourceId}${SEP}${mangaId}`,
} as const;

/**
 * Parse a source composite key back to components
 */
export function parseSourceKey(key: string): { registryId: string; sourceId: string } {
  const idx = key.indexOf(SEP);
  if (idx === -1) throw new Error(`Invalid source key: ${key}`);
  return {
    registryId: key.slice(0, idx),
    sourceId: key.slice(idx + 1),
  };
}

/**
 * Cache key helpers - for IndexedDB cache store
 */
export const CacheKeys = {
  /** The whole .aix package blob */
  aix: (registryId: string, sourceId: string) => `aix${SEP}${registryId}${SEP}${sourceId}`,
  manga: (registryId: string, sourceId: string, mangaId: string) =>
    `manga${SEP}${registryId}${SEP}${sourceId}${SEP}${mangaId}`,
  chapters: (registryId: string, sourceId: string, mangaId: string) =>
    `chapters${SEP}${registryId}${SEP}${sourceId}${SEP}${mangaId}`,
  image: (url: string) => `image${SEP}${hashString(url)}`,
  /** Home layout cache for sources */
  home: (registryId: string, sourceId: string) => `home${SEP}${registryId}${SEP}${sourceId}`,
};

