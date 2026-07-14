import type { InstalledSource, SourcePackageMetadata } from "@/data/schema";
import type { MobileRegistrySource } from "./aidokuRegistry";
import { isAixArtifactCacheKey } from "./aidokuRegistry";
import { extractAixMetadata } from "./aixMetadata";
import {
  buildMobileSourcePackageLoadPlan,
  installedSourceIdFromKey,
  type MobileRuntimeSource,
  type MobileSourcePackageLoadPlan,
} from "./mobileSourceRuntime";
import {
  cacheSourcePackage,
  readCachedSourcePackageBytes,
  resolveCachedSourcePackageUri,
} from "./sourcePackageCache";
import {
  assertAidokuSourcePackageIdentity,
  type SourcePackageCacheResult,
} from "./sourcePackageCacheTypes";
import { nextSyncTimestamp } from "@nemu/core";

export type MobileSourcePackageLoadFailure =
  | "source-blocked"
  | "package-cache-failed"
  | "bytes-missing"
  | "invalid-package"
  | "metadata-mismatch"
  | "wasm-missing";

export type CacheMobileSourcePackage = (
  source: MobileRegistrySource
) => Promise<SourcePackageCacheResult>;

export type ResolveCachedMobileSourcePackageUri = (
  packageCacheKey: string,
) => Promise<string | null>;

export type MobileSourcePackageHydration = {
  sourceKind: MobileRuntimeSource["sourceKind"];
  sourceId: string;
  name: string;
  languages?: string[];
  contentRating?: number;
  packageUri: string;
  packageCacheKey: string;
  packageMetadata: SourcePackageMetadata;
};

export type MobileSourcePackageHydrationHandler = (
  source: InstalledSource,
  hydration: MobileSourcePackageHydration,
) => Promise<void> | void;

export type MobileSourcePackageLoadResult =
  | {
      status: "ready";
      sourceKey: string;
      packageCacheKey: string;
      packageUri: string;
      /** Present only for bridges that execute or inspect the package in the
       * React Native JS runtime. Native sandboxes read the private file URI
       * directly so a large executable is never copied into the app heap. */
      bytes?: Uint8Array;
      byteLength?: number;
      metadata: SourcePackageMetadata;
      sourcePackageHydration?: MobileSourcePackageHydration;
    }
  | {
      status: "blocked";
      sourceKey: string | null;
      reason: MobileSourcePackageLoadFailure;
      detail: string;
      sourcePackageHydration?: MobileSourcePackageHydration;
    };

type ReadCachedPackageBytes = (packageCacheKey: string) => Promise<Uint8Array | null>;

export type MobileSourcePackageLoadOptions = {
  cachePackage?: CacheMobileSourcePackage;
  resolvePackageUri?: ResolveCachedMobileSourcePackageUri;
  packageLoadMode?: "bytes" | "native-file";
};

function metadataMatchesPlan(metadata: SourcePackageMetadata, plan: MobileSourcePackageLoadPlan) {
  return (
    plan.status === "ready" &&
    plan.expectedSourceIds.includes(metadata.sourceId) &&
    metadata.version === plan.expectedVersion
  );
}

function errorDetail(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function toRegistrySource(source: MobileRuntimeSource): MobileRegistrySource | null {
  if (!source.downloadUrl) return null;
  return {
    id: installedSourceIdFromKey(source) ?? source.sourceId,
    registryId: source.registryId,
    registryName: source.registryId,
    sourceKind: source.sourceKind,
    name: source.name,
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

async function hydrateMissingSourcePackage(
  source: MobileRuntimeSource | null | undefined,
  cachePackage: CacheMobileSourcePackage,
): Promise<MobileRuntimeSource | null> {
  if (!source) return null;
  const registrySource = toRegistrySource(source);
  if (!registrySource) return null;

  const packageResult = await cachePackage(registrySource);
  if (!packageResult.packageUri || !packageResult.packageCacheKey) return null;

  if (source.sourceKind !== "tachiyomi") {
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
    sourceId: packageMetadata?.sourceId ?? source.sourceId,
    name: packageMetadata?.name ?? source.name,
    languages: packageMetadata?.languages ?? source.languages,
    contentRating: packageMetadata?.contentRating ?? source.contentRating,
    packageUri: packageResult.packageUri,
    packageCacheKey: packageResult.packageCacheKey,
    packageMetadata,
  };
}

function sourceHydration(
  source: MobileRuntimeSource,
  packageCacheKey: string,
  packageUri: string,
  metadata: SourcePackageMetadata,
): MobileSourcePackageHydration {
  return {
    sourceKind: source.sourceKind,
    sourceId: metadata.sourceId,
    name: metadata.name,
    languages: metadata.languages ?? source.languages,
    contentRating: metadata.contentRating ?? source.contentRating,
    packageUri,
    packageCacheKey,
    packageMetadata: metadata,
  };
}

export function applyMobileSourcePackageHydration(
  source: InstalledSource,
  hydration: MobileSourcePackageHydration,
  updatedAt = nextSyncTimestamp(source.updatedAt),
): InstalledSource {
  if (mobileSourcePackageHydrationMatchesSource(source, hydration)) {
    return source;
  }
  return {
    ...source,
    sourceKind: hydration.sourceKind,
    sourceId: hydration.sourceId,
    name: hydration.name,
    languages: hydration.languages ?? source.languages,
    contentRating: hydration.contentRating ?? source.contentRating,
    packageUri: hydration.packageUri,
    packageCacheKey: hydration.packageCacheKey,
    packageMetadata: hydration.packageMetadata,
    updatedAt,
    removed: false,
  };
}

/**
 * Compare the complete durable package snapshot without depending on object
 * identity or JSON property order. Native stores deserialize metadata into new
 * objects, and optional `undefined` fields are omitted during persistence, so
 * both cases must still count as the same hydration.
 */
function samePersistedJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (left === undefined || right === undefined) {
    return left === undefined && right === undefined;
  }
  if (left === null || right === null) return left === right;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return false;
    return (
      left.length === right.length &&
      left.every((value, index) =>
        samePersistedJsonValue(value, right[index]),
      )
    );
  }
  if (typeof left === "object" || typeof right === "object") {
    if (typeof left !== "object" || typeof right !== "object") return false;
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const leftKeys = Object.keys(leftRecord)
      .filter((key) => leftRecord[key] !== undefined)
      .sort();
    const rightKeys = Object.keys(rightRecord)
      .filter((key) => rightRecord[key] !== undefined)
      .sort();
    return (
      leftKeys.length === rightKeys.length &&
      leftKeys.every(
        (key, index) =>
          key === rightKeys[index] &&
          samePersistedJsonValue(leftRecord[key], rightRecord[key]),
      )
    );
  }
  return false;
}

export function mobileSourcePackageHydrationMatchesSource(
  source: InstalledSource,
  hydration: MobileSourcePackageHydration,
): boolean {
  return (
    source.sourceKind === hydration.sourceKind &&
    source.sourceId === hydration.sourceId &&
    source.name === hydration.name &&
    (hydration.languages === undefined ||
      samePersistedJsonValue(source.languages, hydration.languages)) &&
    (hydration.contentRating === undefined ||
      source.contentRating === hydration.contentRating) &&
    source.packageUri === hydration.packageUri &&
    source.packageCacheKey === hydration.packageCacheKey &&
    samePersistedJsonValue(source.packageMetadata, hydration.packageMetadata) &&
    source.removed !== true
  );
}

export async function notifyMobileSourcePackageHydrated(
  source: InstalledSource,
  hydration: MobileSourcePackageHydration | null | undefined,
  handler: MobileSourcePackageHydrationHandler | null | undefined,
): Promise<void> {
  if (
    !hydration ||
    !handler ||
    mobileSourcePackageHydrationMatchesSource(source, hydration)
  ) {
    return;
  }
  try {
    await handler(source, hydration);
  } catch {
    // Package hydration should repair runtime loading even if persistence fails.
  }
}

export async function loadMobileSourcePackage(
  source: MobileRuntimeSource | null | undefined,
  readBytes: ReadCachedPackageBytes = readCachedSourcePackageBytes,
  options: MobileSourcePackageLoadOptions = {},
): Promise<MobileSourcePackageLoadResult> {
  const cachePackage = options.cachePackage ?? cacheSourcePackage;
  const resolvePackageUri =
    options.resolvePackageUri ?? resolveCachedSourcePackageUri;
  let activeSource = source;
  let plan = buildMobileSourcePackageLoadPlan(activeSource);
  let hydrated = false;

  if (plan.status === "blocked" && plan.reason === "package-missing") {
    try {
      const hydratedSource = await hydrateMissingSourcePackage(activeSource, cachePackage);
      if (hydratedSource) {
        activeSource = hydratedSource;
        hydrated = true;
        plan = buildMobileSourcePackageLoadPlan(activeSource);
      }
    } catch (error) {
      return {
        status: "blocked",
        sourceKey: plan.sourceKey,
        reason: "package-cache-failed",
        detail: errorDetail(error, "Failed to cache the source package."),
      };
    }
  }

  if (plan.status === "blocked") {
    return {
      status: "blocked",
      sourceKey: plan.sourceKey,
      reason: "source-blocked",
      detail: plan.detail,
    };
  }

  // Stable legacy AIX keys could contain bytes from an older registry version.
  // Remote packages can be repaired deterministically, so migrate them before
  // trusting persisted metadata or handing a private file to the native VM.
  if (
    plan.status === "ready" &&
    activeSource?.sourceKind === "aidoku" &&
    activeSource.downloadUrl &&
    !isAixArtifactCacheKey(plan.packageCacheKey)
  ) {
    try {
      const hydratedSource = await hydrateMissingSourcePackage(
        activeSource,
        cachePackage,
      );
      if (!hydratedSource) {
        throw new Error("Failed to migrate the legacy AIX package cache entry.");
      }
      activeSource = hydratedSource;
      hydrated = true;
      plan = buildMobileSourcePackageLoadPlan(activeSource);
    } catch (error) {
      return {
        status: "blocked",
        sourceKey: plan.sourceKey,
        reason: "package-cache-failed",
        detail: errorDetail(error, "Failed to migrate the source package cache."),
      };
    }
  }

  if (
    plan.status === "ready" &&
    options.packageLoadMode === "native-file" &&
    activeSource?.packageMetadata &&
    metadataMatchesPlan(activeSource.packageMetadata, plan) &&
    activeSource.packageMetadata.hasWasm
  ) {
    let currentPackageUri: string | null = null;
    try {
      currentPackageUri = await resolvePackageUri(plan.packageCacheKey);
    } catch {
      // Treat a metadata/stat failure as a cache miss and use the normal repair
      // path below. The native sandbox will still parse and validate the AIX.
    }

    if (!currentPackageUri) {
      try {
        const hydratedSource = await hydrateMissingSourcePackage(
          activeSource,
          cachePackage,
        );
        if (hydratedSource) {
          activeSource = hydratedSource;
          hydrated = true;
          plan = buildMobileSourcePackageLoadPlan(activeSource);
          if (plan.status === "ready") {
            currentPackageUri = await resolvePackageUri(
              plan.packageCacheKey,
            ).catch(() => null);
          }
        }
      } catch (error) {
        return {
          status: "blocked",
          sourceKey: plan.sourceKey,
          reason: "package-cache-failed",
          detail: errorDetail(
            error,
            "Failed to repair the source package cache.",
          ),
        };
      }
    }

    if (
      currentPackageUri &&
      plan.status === "ready" &&
      activeSource?.packageMetadata &&
      metadataMatchesPlan(activeSource.packageMetadata, plan) &&
      activeSource.packageMetadata.hasWasm
    ) {
      const metadata = activeSource.packageMetadata;
      const packageUriWasRebased = currentPackageUri !== plan.packageUri;
      const hydration =
        (hydrated || packageUriWasRebased) && activeSource
          ? sourceHydration(
              activeSource,
              plan.packageCacheKey,
              currentPackageUri,
              metadata,
            )
          : undefined;
      return {
        status: "ready",
        sourceKey: plan.sourceKey,
        packageCacheKey: plan.packageCacheKey,
        packageUri: currentPackageUri,
        metadata,
        ...(hydration ? { sourcePackageHydration: hydration } : {}),
      };
    }
  }

  if (plan.status === "blocked") {
    return {
      status: "blocked",
      sourceKey: plan.sourceKey,
      reason: "source-blocked",
      detail: plan.detail,
    };
  }

  let bytes = await readBytes(plan.packageCacheKey);
  if (!bytes) {
    try {
      const hydratedSource = await hydrateMissingSourcePackage(activeSource, cachePackage);
      if (hydratedSource) {
        activeSource = hydratedSource;
        hydrated = true;
        plan = buildMobileSourcePackageLoadPlan(activeSource);
        if (plan.status === "ready") {
          bytes = await readBytes(plan.packageCacheKey);
        }
      }
    } catch (error) {
      return {
        status: "blocked",
        sourceKey: plan.sourceKey,
        reason: "package-cache-failed",
        detail: errorDetail(error, "Failed to repair the source package cache."),
      };
    }
  }

  if (plan.status === "blocked") {
    return {
      status: "blocked",
      sourceKey: plan.sourceKey,
      reason: "source-blocked",
      detail: plan.detail,
    };
  }

  if (!bytes) {
    return {
      status: "blocked",
      sourceKey: plan.sourceKey,
      reason: "bytes-missing",
      detail: "The package cache entry exists in metadata, but the AIX bytes could not be read.",
    };
  }

  let metadata: SourcePackageMetadata;
  try {
    metadata = extractAixMetadata(bytes);
  } catch (error) {
    return {
      status: "blocked",
      sourceKey: plan.sourceKey,
      reason: "invalid-package",
      detail: error instanceof Error ? error.message : "The cached AIX package is invalid.",
    };
  }

  if (!metadataMatchesPlan(metadata, plan)) {
    return {
      status: "blocked",
      sourceKey: plan.sourceKey,
      reason: "metadata-mismatch",
      detail: "The cached AIX package does not match the installed source metadata.",
    };
  }

  if (!metadata.hasWasm) {
    return {
      status: "blocked",
      sourceKey: plan.sourceKey,
      reason: "wasm-missing",
      detail: "The cached AIX package does not include Payload/main.wasm.",
    };
  }

  const hydration =
    hydrated && activeSource
      ? sourceHydration(activeSource, plan.packageCacheKey, plan.packageUri, metadata)
      : undefined;

  return {
    status: "ready",
    sourceKey: plan.sourceKey,
    packageCacheKey: plan.packageCacheKey,
    packageUri: plan.packageUri,
    bytes,
    byteLength: bytes.byteLength,
    metadata,
    ...(hydration ? { sourcePackageHydration: hydration } : {}),
  };
}
