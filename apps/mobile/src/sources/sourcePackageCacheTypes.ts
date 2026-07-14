import type { SourcePackageMetadata } from "@/data/schema";
import type { MobileRegistrySource } from "./aidokuRegistry";

export type SourcePackageCacheResult = {
  packageUri: string | null;
  packageCacheKey: string | null;
  metadata: SourcePackageMetadata | null;
};

export type SourcePackageCacheOptions = {
  signal?: AbortSignal;
};

export type SourcePackageKind = "aidoku-aix" | "tachiyomi-extension";

type SourcePackageDescriptor = Pick<
  MobileRegistrySource,
  "id" | "registryId" | "sourceKind" | "downloadUrl"
>;

export function assertAidokuSourcePackageIdentity(
  source: Pick<MobileRegistrySource, "id" | "version">,
  metadata: Pick<SourcePackageMetadata, "sourceId" | "version">,
): void {
  if (metadata.sourceId !== source.id || metadata.version !== source.version) {
    throw new Error(
      "The downloaded AIX package identity or version does not match the registry entry.",
    );
  }
}

export function getSourcePackageKind(source: SourcePackageDescriptor): SourcePackageKind {
  return source.sourceKind === "tachiyomi" ||
    source.registryId === "tachiyomi-local" ||
    source.registryId.startsWith("tachiyomi-")
    ? "tachiyomi-extension"
    : "aidoku-aix";
}

export function makeTachiyomiExtensionCacheKey(
  registryId: string,
  sourceId: string,
): string {
  return `tachiyomi:${encodeURIComponent(registryId)}:${encodeURIComponent(sourceId)}`;
}

export function sourcePackageContentType(
  source: SourcePackageDescriptor,
  kind: SourcePackageKind = getSourcePackageKind(source),
): string {
  if (kind === "aidoku-aix") return "application/vnd.aidoku.aix";

  const path = source.downloadUrl?.split("?")[0]?.toLowerCase() ?? "";
  if (path.endsWith(".zip")) return "application/zip";
  if (path.endsWith(".apk")) return "application/vnd.android.package-archive";
  if (path.endsWith(".js") || path.endsWith(".mjs")) return "text/javascript";
  return "application/octet-stream";
}
