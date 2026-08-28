import type { InstalledSource } from "@/data/schema";

export function sourceHasCachedPackage(source: InstalledSource): boolean {
  return !!source.packageUri || !!source.packageCacheKey;
}

export function clearInstalledSourcePackageCache(
  source: InstalledSource,
): InstalledSource {
  if (!sourceHasCachedPackage(source)) return source;
  return {
    ...source,
    packageUri: null,
    packageCacheKey: null,
  };
}
