import type { MobileRegistrySource } from "./aidokuRegistry";
import type {
  SourcePackageCacheOptions,
  SourcePackageCacheResult,
} from "./sourcePackageCacheTypes";

export async function cacheSourcePackage(
  source: MobileRegistrySource,
  options: SourcePackageCacheOptions = {},
): Promise<SourcePackageCacheResult> {
  void source;
  void options;
  return { packageUri: null, packageCacheKey: null, metadata: null };
}

export async function cacheImportedAixSourcePackage({
  uri,
  registryId,
}: {
  uri: string;
  registryId: string;
}): Promise<SourcePackageCacheResult> {
  void uri;
  void registryId;
  throw new Error("AIX source import is only available on native devices.");
}

export async function readCachedSourcePackageBytes(
  packageCacheKey: string | null | undefined
): Promise<Uint8Array | null> {
  void packageCacheKey;
  return null;
}

export async function hasCachedSourcePackage(
  packageCacheKey: string | null | undefined,
): Promise<boolean> {
  return (await resolveCachedSourcePackageUri(packageCacheKey)) !== null;
}

export async function resolveCachedSourcePackageUri(
  packageCacheKey: string | null | undefined,
): Promise<string | null> {
  void packageCacheKey;
  return null;
}

export async function clearCachedSourcePackage(
  packageCacheKey: string | null | undefined
): Promise<void> {
  void packageCacheKey;
  return undefined;
}

export async function clearCachedSourcePackages(): Promise<void> {
  return undefined;
}
