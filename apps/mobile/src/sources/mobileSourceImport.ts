import type {
  InstalledSource,
  SourcePackageMetadata,
  SourceRegistry,
} from "@/data/schema";
import { makeSourceKey } from "./aidokuRegistry";
import type { SourcePackageCacheResult } from "./sourcePackageCacheTypes";
import { nextSyncTimestamp } from "@nemu/core";

export const MOBILE_CUSTOM_AIDOKU_REGISTRY_ID = "custom-aidoku";

export const MOBILE_CUSTOM_AIDOKU_REGISTRY: SourceRegistry = {
  id: MOBILE_CUSTOM_AIDOKU_REGISTRY_ID,
  name: "Custom AIX",
  type: "builtin",
};

export function buildImportedAixInstalledSource({
  packageResult,
  now = nextSyncTimestamp(),
}: {
  packageResult: SourcePackageCacheResult;
  now?: number;
}): InstalledSource {
  const metadata = packageResult.metadata;
  if (!metadata) {
    throw new Error("Imported AIX package did not include readable metadata.");
  }

  return installedSourceFromImportedAixMetadata({
    metadata,
    packageUri: packageResult.packageUri,
    packageCacheKey: packageResult.packageCacheKey,
    now,
  });
}

export function installedSourceFromImportedAixMetadata({
  metadata,
  packageUri,
  packageCacheKey,
  now = nextSyncTimestamp(),
}: {
  metadata: SourcePackageMetadata;
  packageUri: string | null;
  packageCacheKey: string | null;
  now?: number;
}): InstalledSource {
  const sourceId = metadata.sourceId.trim();
  if (!sourceId) {
    throw new Error("Imported AIX package is missing a source id.");
  }

  return {
    id: makeSourceKey(MOBILE_CUSTOM_AIDOKU_REGISTRY_ID, sourceId),
    registryId: MOBILE_CUSTOM_AIDOKU_REGISTRY_ID,
    sourceKind: "aidoku",
    sourceId,
    name: metadata.name || sourceId,
    languages: metadata.languages,
    contentRating: metadata.contentRating,
    packageUri,
    packageCacheKey,
    packageMetadata: metadata,
    version: metadata.version,
    updatedAt: now,
    removed: false,
  };
}
