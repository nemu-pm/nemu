export {
  mapCloudChapterProgress,
  mapCloudCollectionItems,
  mapCloudCollections,
  mapCloudLibraryItems,
  mapCloudMangaProgress,
  mapCloudSourceLinks,
  mergeCollectionSnapshot,
  mergeLibrarySnapshot,
} from "@nemu/core";
export type {
  CloudChapterProgress as MobileCloudChapterProgress,
  CloudLibraryItem as MobileCloudLibraryItem,
  CloudMangaProgress as MobileCloudMangaProgress,
  CloudSourceLink as MobileCloudSourceLink,
} from "@nemu/core";
import { mergeInstalledSources as mergeCoreInstalledSources } from "@nemu/core";
import type { InstalledSource } from "@/data/schema";

const MOBILE_INSTALLED_SOURCE_LOCAL_FIELDS = [
  "sourceKind",
  "sourceId",
  "name",
  "icon",
  "languages",
  "contentRating",
  "hasAuthentication",
  "hasCloudflare",
  "downloadUrl",
  "packageUri",
  "packageCacheKey",
  "packageMetadata",
] as const;

export type MobileCloudSettings = {
  installedSources?: InstalledSource[];
};

export function mergeMobileInstalledSources(
  localSources: InstalledSource[],
  cloudSources: InstalledSource[],
): InstalledSource[] {
  const merged = mergeCoreInstalledSources(localSources, cloudSources, {
    preserveLocalFields: MOBILE_INSTALLED_SOURCE_LOCAL_FIELDS,
  });
  const localById = new Map(localSources.map((source) => [source.id, source]));
  const cloudById = new Map(cloudSources.map((source) => [source.id, source]));

  return merged.map((source) => {
    const local = localById.get(source.id);
    const cloud = cloudById.get(source.id);
    if (!local || !cloud || source.removed) return source;

    // Cloud owns ties. A cached native package is safe to carry across a
    // metadata-only cloud update, but never across a package identity change:
    // the cache key is intentionally stable across versions, so merely
    // checking whether that file exists would otherwise execute old bytes
    // forever. Clearing all three local artifact fields makes hydration fetch
    // the new package and makes a failed/offline refresh fail closed.
    const cloudWins = (cloud.updatedAt ?? 0) >= (local.updatedAt ?? 0);
    const packageIdentityChanged =
      source.registryId !== local.registryId ||
      source.sourceKind !== local.sourceKind ||
      source.sourceId !== local.sourceId ||
      source.version !== local.version ||
      source.downloadUrl !== local.downloadUrl;
    if (!cloudWins || !packageIdentityChanged) return source;

    return {
      ...source,
      packageUri: null,
      packageCacheKey: null,
      packageMetadata: null,
    };
  });
}
