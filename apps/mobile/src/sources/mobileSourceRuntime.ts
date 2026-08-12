import type { InstalledSource, SourcePackageMetadata } from "@/data/schema";
import { mergeSourceSettingValues } from "@/lib/mobileSourceSettings";
import { makeAixCacheKey, parseSourceKey } from "./aidokuRegistry";
import { makeTachiyomiExtensionCacheKey } from "./sourcePackageCacheTypes";

const MOBILE_TACHIYOMI_LOCAL_REGISTRY_ID = "tachiyomi-local";
export const MOBILE_TACHIYOMI_UNSUPPORTED_DETAIL =
  "Tachiyomi extensions need a native Tachiyomi bridge on mobile because Expo/React Native does not provide the Web Worker runtime used by the web implementation.";

export type MobileSourceKind = "aidoku" | "tachiyomi";

export type MobileSourcePackageLoadPlan =
  | {
      status: "ready";
      sourceKey: string;
      packageUri: string;
      packageCacheKey: string;
      expectedSourceId: string;
      expectedSourceIds: string[];
      expectedVersion: number;
    }
  | {
      status: "blocked";
      sourceKey: string | null;
      reason:
        | "source-missing"
        | "package-missing"
        | "cache-key-missing"
        | "wasm-missing"
        | "unsupported-runtime";
      detail: string;
    };

export type MobileRuntimeSource = {
  id: string;
  registryId: string;
  sourceId: string;
  sourceKind: MobileSourceKind;
  name: string;
  version: number;
  icon?: string;
  languages?: string[];
  contentRating?: number;
  hasAuthentication?: boolean;
  hasCloudflare?: boolean;
  downloadUrl?: string;
  packageUri?: string | null;
  packageCacheKey?: string | null;
  packageMetadata?: SourcePackageMetadata | null;
};

export function getMobileSourceKind(
  source:
    | Pick<InstalledSource, "id" | "registryId" | "sourceKind">
    | Pick<MobileRuntimeSource, "id" | "registryId" | "sourceKind">
    | null
    | undefined,
): MobileSourceKind {
  if (!source) return "aidoku";
  if (source.sourceKind === "aidoku" || source.sourceKind === "tachiyomi") {
    return source.sourceKind;
  }
  const parsed = parseSourceKey(source.id);
  const registryId = source.registryId || parsed.registryId;
  return registryId === MOBILE_TACHIYOMI_LOCAL_REGISTRY_ID ||
    registryId.startsWith("tachiyomi-")
    ? "tachiyomi"
    : "aidoku";
}

export async function defaultMobileSourceSettings(
  _sourceKey: string,
  source: InstalledSource,
) {
  return mergeSourceSettingValues(source.packageMetadata?.settings ?? [], null);
}

export function normalizeInstalledSource(source: InstalledSource): MobileRuntimeSource {
  const parsed = parseSourceKey(source.id);
  const fallbackRegistryId = parsed.registryId;
  const fallbackSourceId = parsed.sourceId;
  const sourceId = source.sourceId ?? fallbackSourceId;
  const registryId = source.registryId || fallbackRegistryId || "unknown";

  return {
    id: source.id,
    registryId,
    sourceId,
    sourceKind: getMobileSourceKind({ id: source.id, registryId, sourceKind: source.sourceKind }),
    name: source.name ?? sourceId,
    version: source.version,
    icon: source.icon,
    languages: source.languages,
    contentRating: source.contentRating,
    ...(source.hasAuthentication == null
      ? {}
      : { hasAuthentication: source.hasAuthentication }),
    ...(source.hasCloudflare == null ? {} : { hasCloudflare: source.hasCloudflare }),
    downloadUrl: source.downloadUrl,
    packageUri: source.packageUri,
    packageCacheKey: source.packageCacheKey,
    packageMetadata: source.packageMetadata,
  };
}

export function makeMobileRuntimeSourceKey(source: MobileRuntimeSource): string {
  return `${source.registryId}:${source.sourceId}`;
}

export function resolveMobileSourcePackageCacheKey(
  source: MobileRuntimeSource | null | undefined
): string | null {
  if (!source) return null;
  if (source.packageCacheKey) return source.packageCacheKey;

  const parsed = parseSourceKey(source.id);
  const sourceIdFromInstalledKey = parsed.registryId === "unknown" ? "" : parsed.sourceId;
  const registryId = source.registryId || parsed.registryId;
  const sourceId = sourceIdFromInstalledKey || source.sourceId;
  return source.sourceKind === "tachiyomi"
    ? makeTachiyomiExtensionCacheKey(registryId, sourceId)
    : makeAixCacheKey(registryId, sourceId);
}

export function installedSourceIdFromKey(source: MobileRuntimeSource): string | null {
  const parsed = parseSourceKey(source.id);
  return parsed.registryId === "unknown" ? null : parsed.sourceId || null;
}

function expectedMobileSourcePackageIds(source: MobileRuntimeSource): string[] {
  // The installed record key is the durable registry identity. Cached package
  // metadata is derived from executable bytes and must never be allowed to
  // expand the set of identities those same bytes are trusted to claim.
  const installedSourceId = installedSourceIdFromKey(source);
  const expectedSourceId = (installedSourceId ?? source.sourceId).trim();
  return expectedSourceId ? [expectedSourceId] : [];
}

export function buildMobileSourcePackageLoadPlan(
  source: MobileRuntimeSource | null | undefined
): MobileSourcePackageLoadPlan {
  if (!source) {
    return {
      status: "blocked",
      sourceKey: null,
      reason: "source-missing",
      detail: "Install the source before creating a native runtime session.",
    };
  }

  const sourceKey = makeMobileRuntimeSourceKey(source);
  if (!source.packageUri) {
    return {
      status: "blocked",
      sourceKey,
      reason: "package-missing",
      detail:
        source.sourceKind === "tachiyomi"
          ? "The Tachiyomi extension package bytes are not cached on this device."
          : "The AIX package bytes are not cached on this device.",
    };
  }

  if (
    source.sourceKind !== "tachiyomi" &&
    source.packageMetadata &&
    !source.packageMetadata.hasWasm
  ) {
    return {
      status: "blocked",
      sourceKey,
      reason: "wasm-missing",
      detail: "The cached AIX package does not include Payload/main.wasm.",
    };
  }

  const packageCacheKey = resolveMobileSourcePackageCacheKey(source);
  if (!packageCacheKey) {
    return {
      status: "blocked",
      sourceKey,
      reason: "cache-key-missing",
      detail: "The cached package has no readable cache key.",
    };
  }

  const expectedSourceIds = expectedMobileSourcePackageIds(source);
  return {
    status: "ready",
    sourceKey,
    packageUri: source.packageUri,
    packageCacheKey,
    expectedSourceId: expectedSourceIds[0] ?? source.sourceId,
    expectedSourceIds,
    expectedVersion: source.version,
  };
}
