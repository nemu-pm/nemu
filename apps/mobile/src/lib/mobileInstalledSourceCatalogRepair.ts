import type { InstalledSource } from "@/data/schema";
import { makeSourceKey, type MobileRegistrySource } from "@/sources/aidokuRegistry";
import {
  isMobileInstalledSourceDisabled,
  normalizeInstalledSource,
} from "@/sources/mobileSourceRuntime";
import { getMobileInstalledSourceRegistryKeys } from "./mobileInstalledSourceKeys";

/**
 * Older clients synced installed sources as bare `{ id, registryId, version }`
 * records: no download URL, name, icon, or languages. Package hydration needs a
 * download URL, and the registry update pass only fires on a *newer* version,
 * so such a source stayed half-registered forever on a fresh install — listed
 * under its raw id, with nothing to run. The registry catalog still knows the
 * package, so these helpers find and fill those records from it.
 */
export function mobileInstalledSourceNeedsCatalogRepair(
  source: InstalledSource,
): boolean {
  if (source.removed) return false;
  if (isMobileInstalledSourceDisabled(source)) return false;
  // Mobile has no Tachiyomi executor, so there is nothing to repair into.
  if (normalizeInstalledSource(source).sourceKind === "tachiyomi") return false;
  return !source.downloadUrl;
}

export function findMobileCatalogEntryForInstalledSource(
  source: InstalledSource,
  catalog: readonly MobileRegistrySource[],
): MobileRegistrySource | null {
  const keys = new Set(getMobileInstalledSourceRegistryKeys(source));
  return (
    catalog.find(
      (entry) =>
        Boolean(entry.downloadUrl) &&
        entry.sourceKind !== "tachiyomi" &&
        keys.has(makeSourceKey(entry.registryId, entry.id)),
    ) ?? null
  );
}

/** Catalog entries to (re)install for installed records missing a package URL. */
export function findMobileSourceCatalogRepairs(
  installedSources: readonly InstalledSource[],
  catalog: readonly MobileRegistrySource[],
): MobileRegistrySource[] {
  const repairs: MobileRegistrySource[] = [];
  const seen = new Set<string>();
  for (const source of installedSources) {
    if (!mobileInstalledSourceNeedsCatalogRepair(source)) continue;
    const entry = findMobileCatalogEntryForInstalledSource(source, catalog);
    if (!entry) continue;
    const key = makeSourceKey(entry.registryId, entry.id);
    if (seen.has(key)) continue;
    seen.add(key);
    repairs.push(entry);
  }
  return repairs;
}

/**
 * Fills a bare installed record's package identity and display fields from its
 * catalog entry. The version follows the catalog, because the download URL
 * points at that version's package and hydration checks the two agree.
 * Fields the record already carries are kept; the sync clock is not touched.
 */
export function applyMobileCatalogEntryToInstalledSource(
  source: InstalledSource,
  entry: MobileRegistrySource,
): InstalledSource {
  return {
    ...source,
    sourceKind: source.sourceKind ?? "aidoku",
    sourceId: source.sourceId ?? entry.id,
    name: source.name ?? entry.name,
    icon: source.icon ?? entry.icon,
    languages: source.languages ?? entry.languages,
    contentRating: source.contentRating ?? entry.contentRating,
    ...(source.hasAuthentication == null && entry.hasAuthentication != null
      ? { hasAuthentication: entry.hasAuthentication }
      : {}),
    ...(source.hasCloudflare == null && entry.hasCloudflare != null
      ? { hasCloudflare: entry.hasCloudflare }
      : {}),
    downloadUrl: entry.downloadUrl,
    version: entry.version,
    // A package cached for another version must not be reused.
    ...(source.version === entry.version
      ? {}
      : { packageUri: null, packageCacheKey: null, packageMetadata: null }),
  };
}
