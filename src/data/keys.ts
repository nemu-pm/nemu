/**
 * Centralized key generation for storage and caching
 * All composite keys should be generated through this module
 */

/** Registry ID for locally installed .aix files */
export const LOCAL_REGISTRY_ID = "aidoku-local";

/** Key separator used in composite keys */
const SEP = ":";

/**
 * Generate composite keys for various entities
 */
export const Keys = {
  /** Source key: registryId:sourceId */
  source: (registryId: string, sourceId: string) => `${registryId}${SEP}${sourceId}`,

  /** Manga key: registryId:sourceId:mangaId */
  manga: (registryId: string, sourceId: string, mangaId: string) =>
    `${registryId}${SEP}${sourceId}${SEP}${mangaId}`,

  /** History/chapter key: registryId:sourceId:mangaId:chapterId */
  chapter: (registryId: string, sourceId: string, mangaId: string, chapterId: string) =>
    `${registryId}${SEP}${sourceId}${SEP}${mangaId}${SEP}${chapterId}`,
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
  wasm: (registryId: string, sourceId: string) => `wasm${SEP}${registryId}${SEP}${sourceId}`,
  manifest: (registryId: string, sourceId: string) => `manifest${SEP}${registryId}${SEP}${sourceId}`,
  manga: (registryId: string, sourceId: string, mangaId: string) =>
    `manga${SEP}${registryId}${SEP}${sourceId}${SEP}${mangaId}`,
  chapters: (registryId: string, sourceId: string, mangaId: string) =>
    `chapters${SEP}${registryId}${SEP}${sourceId}${SEP}${mangaId}`,
  image: (url: string) => `image${SEP}${btoa(url).slice(0, 100)}`,
};

