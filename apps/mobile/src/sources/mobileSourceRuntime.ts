import type { MobileSourceRuntimeProbe } from "@/data/contracts";
import type { InstalledSource, SourcePackageMetadata } from "@/data/schema";
import {
  countRenderableSourceSettings,
  mergeSourceSettingValues,
} from "@/lib/mobileSourceSettings";
import { makeAixCacheKey, parseSourceKey } from "./aidokuRegistry";
import { makeTachiyomiExtensionCacheKey } from "./sourcePackageCacheTypes";

export const MOBILE_TACHIYOMI_LOCAL_REGISTRY_ID = "tachiyomi-local";
// Lives here (not in the executor-bridge seam) because the `.native.ts` bridge
// twin does not re-export values — a bridge export would resolve to `undefined`
// on device while staying green under tsc/bun, which resolve the base file.
export const MOBILE_TACHIYOMI_SOURCE_SELECTION_KEY = "__selected_source_id__";
export const MOBILE_TACHIYOMI_UNSUPPORTED_DETAIL =
  "Tachiyomi extensions need a native Tachiyomi bridge on mobile because Expo/React Native does not provide the Web Worker runtime used by the web implementation.";
export const MOBILE_TACHIYOMI_EXTENSION_MISSING_DETAIL =
  "The Tachiyomi extension package is not cached on this device. Reinstall or import this extension on mobile before running it natively.";
export const MOBILE_TACHIYOMI_PACKAGE_CACHED_DETAIL =
  "Tachiyomi extension bytes are cached locally, but live operations stay disabled until an isolated JavaScript runtime or native bridge is available.";

export type MobileSourceKind = "aidoku" | "tachiyomi";

export type MobileSourceOperationKey =
  | "package"
  | "settings"
  | "listings"
  | "filters"
  | "home"
  | "search"
  | "manga-details"
  | "chapters"
  | "pages"
  | "image-requests";

export type MobileSourceOperationStatus =
  | "metadata-ready"
  | "native-compatible"
  | "requires-runtime"
  | "requires-package"
  | "unsupported";

export type MobileSourceOperation = {
  key: MobileSourceOperationKey;
  title: string;
  detail: string;
  status: MobileSourceOperationStatus;
  count?: number;
  sourceKind?: MobileSourceKind;
};

export type MobileSourceOperationOptions = {
  executorReady?: boolean;
  executorBlockedReason?: string | null;
};

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

export function probeInstalledSourceRuntime(
  source: InstalledSource | null | undefined
): MobileSourceRuntimeProbe {
  if (!source) {
    return {
      sourceKind: "aidoku",
      status: "unsupported",
      detail: "Source is not installed.",
      packageUri: null,
    };
  }

  const sourceKind = getMobileSourceKind(source);
  if (sourceKind === "tachiyomi") {
    if (!source.packageUri) {
      return {
        sourceKind,
        status: "package-missing",
        detail: MOBILE_TACHIYOMI_EXTENSION_MISSING_DETAIL,
        packageUri: null,
      };
    }

    return {
      sourceKind,
      status: "requires-runtime-port",
      detail:
        "Tachiyomi extension bytes are cached, but live operations need an isolated JavaScript runtime or native Tachiyomi bridge that is not available in this build.",
      packageUri: source.packageUri,
    };
  }

  if (!source.packageUri) {
    return {
      sourceKind,
      status: "package-missing",
      detail: "Source package is not cached on this device.",
      packageUri: null,
    };
  }

  if (source.packageMetadata && !source.packageMetadata.hasWasm) {
    return {
      sourceKind,
      status: "unsupported",
      detail: "AIX package is cached, but it does not include Payload/main.wasm.",
      packageUri: source.packageUri,
    };
  }

  return {
    sourceKind,
    status: "requires-runtime-port",
    detail: source.packageMetadata
      ? "AIX package and manifest metadata are ready. Native execution needs the NemuAidoku bridge plus device WebAssembly support."
      : "AIX package is cached. Native execution needs the NemuAidoku bridge plus device WebAssembly support.",
    packageUri: source.packageUri,
  };
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

function packageBlockedStatus(
  source: MobileRuntimeSource | null | undefined,
  metadata: SourcePackageMetadata | null | undefined,
  executorReady = false,
  executorBlockedReason?: string | null,
): MobileSourceOperationStatus {
  if (source?.sourceKind === "tachiyomi") {
    if (!source.packageUri) return "requires-package";
    if (executorReady) return "native-compatible";
    return executorBlockedReason ? "unsupported" : "requires-runtime";
  }
  if (!source?.packageUri) return "requires-package";
  if (metadata && !metadata.hasWasm) return "unsupported";
  if (executorReady) return "native-compatible";
  return "requires-runtime";
}

function metadataOperation(
  key: "settings" | "listings" | "filters",
  title: string,
  count: number,
  runtimeDetail: string,
  source: MobileRuntimeSource | null | undefined,
  metadata: SourcePackageMetadata | null | undefined,
  executorReady: boolean,
  executorBlockedReason?: string | null,
): MobileSourceOperation {
  if (source?.sourceKind === "tachiyomi") {
    const status =
      count > 0
        ? "metadata-ready"
        : packageBlockedStatus(source, metadata, executorReady, executorBlockedReason);
    return {
      key,
      title,
      count,
      status,
      detail:
        count > 0
          ? runtimeDetail
          : executorReady
            ? "Native Tachiyomi bridge can request this from the source."
            : status === "requires-package"
              ? MOBILE_TACHIYOMI_EXTENSION_MISSING_DETAIL
              : status === "requires-runtime"
                ? MOBILE_TACHIYOMI_PACKAGE_CACHED_DETAIL
                : MOBILE_TACHIYOMI_UNSUPPORTED_DETAIL,
      sourceKind: "tachiyomi",
    };
  }

  if (!source?.packageUri) {
    return {
      key,
      title,
      count,
      status: "requires-package",
      detail: "Install and cache the source package before this can be used.",
    };
  }

  if (executorReady) {
    return {
      key,
      title,
      count,
      status: count > 0 ? "metadata-ready" : "native-compatible",
      detail: count > 0 ? runtimeDetail : "Native executor can request this from the source.",
    };
  }

  if (count > 0) {
    return {
      key,
      title,
      count,
      status: "metadata-ready",
      detail: runtimeDetail,
    };
  }

  return {
    key,
    title,
    count,
    status: packageBlockedStatus(source, metadata, executorReady, executorBlockedReason),
    detail:
      metadata && !metadata.hasWasm
        ? "Package metadata is available, but executable source code is missing."
        : "No static metadata was found. The native runtime must ask the source directly.",
  };
}

function executableOperation(
  key: Exclude<MobileSourceOperationKey, "package" | "settings" | "listings" | "filters">,
  title: string,
  detail: string,
  source: MobileRuntimeSource | null | undefined,
  metadata: SourcePackageMetadata | null | undefined,
  executorReady: boolean,
  executorBlockedReason?: string | null,
): MobileSourceOperation {
  if (source?.sourceKind === "tachiyomi") {
    const isHome = key === "home";
    const status = isHome
      ? "unsupported"
      : packageBlockedStatus(source, metadata, executorReady, executorBlockedReason);
    return {
      key,
      title,
      status,
      detail:
        isHome || status === "unsupported"
          ? MOBILE_TACHIYOMI_UNSUPPORTED_DETAIL
          : status === "requires-package"
            ? MOBILE_TACHIYOMI_EXTENSION_MISSING_DETAIL
            : status === "requires-runtime"
              ? MOBILE_TACHIYOMI_PACKAGE_CACHED_DETAIL
              : detail,
      sourceKind: "tachiyomi",
    };
  }

  return {
    key,
    title,
    status: packageBlockedStatus(source, metadata, executorReady, executorBlockedReason),
    detail:
      metadata && !metadata.hasWasm
        ? "Package metadata is available, but executable source code is missing."
        : detail,
    sourceKind: source?.sourceKind,
  };
}

export function buildMobileSourceOperations(
  source: MobileRuntimeSource | null | undefined,
  options: MobileSourceOperationOptions = {},
): MobileSourceOperation[] {
  const metadata = source?.packageMetadata;
  const hasPackage = !!source?.packageUri;
  const executorReady = options.executorReady === true;
  const executorBlockedReason = options.executorBlockedReason ?? null;

  return [
    {
      key: "package",
      title: source?.sourceKind === "tachiyomi" ? "Tachiyomi Extension" : "AIX Package",
      status:
        source?.sourceKind === "tachiyomi"
          ? !hasPackage
            ? "requires-package"
            : executorReady
              ? "native-compatible"
              : "metadata-ready"
          : hasPackage
            ? "metadata-ready"
            : "requires-package",
      detail:
        source?.sourceKind === "tachiyomi"
          ? !hasPackage
            ? MOBILE_TACHIYOMI_EXTENSION_MISSING_DETAIL
            : executorReady
              ? "Native Tachiyomi bridge is ready for this extension."
              : MOBILE_TACHIYOMI_PACKAGE_CACHED_DETAIL
          : hasPackage
            ? metadata
              ? "Cached locally with manifest metadata extracted."
              : "Cached locally. Manifest metadata will be extracted on reinstall."
            : "Package bytes are not cached on this device.",
      sourceKind: source?.sourceKind,
    },
    metadataOperation(
      "settings",
      "Settings Schema",
      countRenderableSourceSettings(metadata?.settings ?? []),
      "Static source settings can be rendered before the native runtime is executable.",
      source,
      metadata,
      executorReady,
      executorBlockedReason,
    ),
    metadataOperation(
      "listings",
      "Browse Listings",
      metadata?.listings.length ?? 0,
      "Static listing tabs are ready; fetching listing results still needs the native runtime.",
      source,
      metadata,
      executorReady,
      executorBlockedReason,
    ),
    metadataOperation(
      "filters",
      "Search Filters",
      metadata?.filters.length ?? 0,
      "Static filters are ready; applying them to source search still needs the native runtime.",
      source,
      metadata,
      executorReady,
      executorBlockedReason,
    ),
    executableOperation(
      "home",
      "Home Sections",
      "Home layouts are dynamic Aidoku exports and need the native Aidoku runtime.",
      source,
      metadata,
      executorReady,
      executorBlockedReason,
    ),
    executableOperation(
      "search",
      "Live Search",
      "Calls getSearchMangaList with query, page, and filter state.",
      source,
      metadata,
      executorReady,
      executorBlockedReason,
    ),
    executableOperation(
      "manga-details",
      "Manga Details",
      "Calls getMangaDetails before importing or refreshing a title.",
      source,
      metadata,
      executorReady,
      executorBlockedReason,
    ),
    executableOperation(
      "chapters",
      "Chapters",
      "Calls getChapterList and maps source chapters into the local reader model.",
      source,
      metadata,
      executorReady,
      executorBlockedReason,
    ),
    executableOperation(
      "pages",
      "Page List",
      "Calls getPageList for a selected manga and chapter.",
      source,
      metadata,
      executorReady,
      executorBlockedReason,
    ),
    executableOperation(
      "image-requests",
      "Image Requests",
      "Calls modifyImageRequest and optional page image processing before rendering pages.",
      source,
      metadata,
      executorReady,
      executorBlockedReason,
    ),
  ];
}

export function summarizeMobileSourceOperations(operations: MobileSourceOperation[]): {
  ready: number;
  metadataReady: number;
  nativeCompatible: number;
  runtimeBlocked: number;
  packageBlocked: number;
  unsupported: number;
} {
  return operations.reduce(
    (summary, operation) => {
      if (operation.status === "metadata-ready") {
        summary.ready += 1;
        summary.metadataReady += 1;
      }
      if (operation.status === "native-compatible") {
        summary.ready += 1;
        summary.nativeCompatible += 1;
      }
      if (operation.status === "requires-runtime") summary.runtimeBlocked += 1;
      if (operation.status === "requires-package") summary.packageBlocked += 1;
      if (operation.status === "unsupported") summary.unsupported += 1;
      return summary;
    },
    {
      ready: 0,
      metadataReady: 0,
      nativeCompatible: 0,
      runtimeBlocked: 0,
      packageBlocked: 0,
      unsupported: 0,
    },
  );
}
