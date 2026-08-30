import type { InstalledSource } from "@/data/schema";
import {
  cacheSourcePackage,
  hasCachedSourcePackage,
} from "@/sources/sourcePackageCache";
import type { MobileRegistrySource } from "@/sources/aidokuRegistry";
import { isAixArtifactCacheKey } from "@/sources/aidokuRegistry";
import {
  installedSourceIdFromKey,
  normalizeInstalledSource,
} from "@/sources/mobileSourceRuntime";
import type {
  SourcePackageCacheOptions,
  SourcePackageCacheResult,
} from "@/sources/sourcePackageCacheTypes";
import { assertAidokuSourcePackageIdentity } from "@/sources/sourcePackageCacheTypes";

type CacheSourcePackage = (
  source: MobileRegistrySource,
  options?: SourcePackageCacheOptions,
) => Promise<SourcePackageCacheResult>;

type HasCachedSourcePackage = (
  packageCacheKey: string,
) => Promise<boolean>;

export type HydrateMobileSyncedSourcePackagesOptions = {
  cachePackage?: CacheSourcePackage;
  hasPackage?: HasCachedSourcePackage;
  onHydrationError?: (source: InstalledSource, error: unknown) => void;
  shouldContinue?: () => boolean;
  signal?: AbortSignal;
};

async function needsPackageHydration(
  source: InstalledSource,
  hasPackage: HasCachedSourcePackage,
): Promise<boolean> {
  if (source.removed) return false;
  const normalized = normalizeInstalledSource(source);
  // Mobile does not ship a Tachiyomi executor. Do not spend background data,
  // battery, disk, or JS memory downloading APKs that this build cannot run.
  if (normalized.sourceKind === "tachiyomi") return false;
  if (!source.downloadUrl) return false;
  if (!source.packageUri || !source.packageCacheKey) return true;

  const expectedSourceId = installedSourceIdFromKey(normalized) ?? normalized.sourceId;
  if (
    !isAixArtifactCacheKey(source.packageCacheKey) ||
    !source.packageMetadata ||
    source.packageMetadata.sourceId !== expectedSourceId ||
    source.packageMetadata.version !== source.version
  ) {
    return true;
  }

  try {
    return !(await hasPackage(source.packageCacheKey));
  } catch {
    return true;
  }
}

function toRegistrySource(source: InstalledSource): MobileRegistrySource | null {
  if (!source.downloadUrl) return null;
  const normalized = normalizeInstalledSource(source);
  const registryId = source.registryId || normalized.registryId;
  const sourceId = installedSourceIdFromKey(normalized) ?? normalized.sourceId;

  return {
    id: sourceId,
    registryId,
    registryName: registryId,
    sourceKind: source.sourceKind,
    name: source.name ?? sourceId,
    version: source.version,
    icon: source.icon,
    downloadUrl: source.downloadUrl,
    languages: source.languages,
    contentRating: source.contentRating,
    ...(source.hasAuthentication == null
      ? {}
      : { hasAuthentication: source.hasAuthentication }),
    ...(source.hasCloudflare == null ? {} : { hasCloudflare: source.hasCloudflare }),
    packageMetadata: source.packageMetadata ?? null,
  };
}

async function hydrateMobileSyncedSourcePackage(
  source: InstalledSource,
  options: Required<
    Pick<HydrateMobileSyncedSourcePackagesOptions, "cachePackage" | "hasPackage">
  > &
    Pick<HydrateMobileSyncedSourcePackagesOptions, "signal">
): Promise<InstalledSource> {
  if (!(await needsPackageHydration(source, options.hasPackage))) return source;

  const registrySource = toRegistrySource(source);
  if (!registrySource) return source;

  const packageResult = await options.cachePackage(registrySource, {
    signal: options.signal,
  });
  if (!packageResult.packageUri || !packageResult.packageCacheKey) return source;

  if (registrySource.sourceKind !== "tachiyomi") {
    if (!packageResult.metadata) {
      throw new Error("The cached AIX package is missing validated metadata.");
    }
    assertAidokuSourcePackageIdentity(registrySource, packageResult.metadata);
    if (!isAixArtifactCacheKey(packageResult.packageCacheKey)) {
      throw new Error("The cached AIX package does not use an immutable artifact key.");
    }
  }

  const packageMetadata = packageResult.metadata ?? source.packageMetadata ?? null;

  return {
    ...source,
    sourceKind: source.sourceKind ?? registrySource.sourceKind,
    sourceId: packageMetadata?.sourceId ?? source.sourceId ?? registrySource.id,
    name: packageMetadata?.name ?? source.name,
    languages: packageMetadata?.languages ?? source.languages,
    contentRating: packageMetadata?.contentRating ?? source.contentRating,
    packageUri: packageResult.packageUri,
    packageCacheKey: packageResult.packageCacheKey,
    packageMetadata,
  };
}

export async function hydrateMobileSyncedSourcePackages(
  sources: InstalledSource[],
  options: HydrateMobileSyncedSourcePackagesOptions = {},
): Promise<InstalledSource[]> {
  const cachePackage = options.cachePackage ?? cacheSourcePackage;
  const hasPackage = options.hasPackage ?? hasCachedSourcePackage;
  const hydrated: InstalledSource[] = [];

  for (const source of sources) {
    if (options.signal?.aborted || options.shouldContinue?.() === false) {
      return sources;
    }
    try {
      const next = await hydrateMobileSyncedSourcePackage(source, {
        cachePackage,
        hasPackage,
        signal: options.signal,
      });
      if (options.signal?.aborted || options.shouldContinue?.() === false) {
        return sources;
      }
      hydrated.push(next);
    } catch (error) {
      if (options.signal?.aborted) return sources;
      options.onHydrationError?.(source, error);
      hydrated.push(source);
    }
  }

  return hydrated;
}
