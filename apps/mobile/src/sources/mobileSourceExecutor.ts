import {
  type AsyncAidokuSource,
  type Chapter as AidokuChapter,
  type Filter,
  type FilterValue,
  type HomeLayout,
  type Listing,
  type Manga as AidokuManga,
  type MangaPageResult,
  type Page as AidokuPage,
} from "./aidokuContract";
import type { SourcePackageMetadata } from "@/data/schema";
import { defaultMobileAidokuExecutorBridge } from "./mobileAidokuExecutorBridge";
import {
  loadMobileSourcePackage,
  type CacheMobileSourcePackage,
  type MobileSourcePackageLoadFailure,
  type MobileSourcePackageHydration,
  type ResolveCachedMobileSourcePackageUri,
} from "./mobileSourcePackageLoader";
import {
  MOBILE_TACHIYOMI_UNSUPPORTED_DETAIL,
  type MobileRuntimeSource,
} from "./mobileSourceRuntime";
import { readCachedSourcePackageBytes } from "./sourcePackageCache";
import { makeMobileSourceExecutionKey } from "./mobileSourceProfileScope";

type ReadCachedPackageBytes = (packageCacheKey: string) => Promise<Uint8Array | null>;

export type MobileSourceExecutorRuntime = "native-aidoku" | "web-aidoku";

export type MobileSourcePage = AidokuPage & {
  /** Stable, compact reader identity. Aidoku pages fall back to URL identity. */
  id?: string;
  /** Headers already known by the source; avoids a per-page header lookup. */
  headers?: Record<string, string>;
};

export type MobileAidokuExecutorSource = Omit<
  Pick<
    AsyncAidokuSource,
    | "getSearchMangaList"
    | "getMangaDetails"
    | "getChapterList"
    | "getPageList"
    | "getFilters"
    | "getListings"
    | "getMangaListForListing"
    | "hasListingProvider"
    | "hasHomeProvider"
    | "hasListings"
    | "isOnlySearch"
    | "handlesBasicLogin"
    | "handlesWebLogin"
    | "getHome"
    | "getHomeWithPartials"
    | "modifyImageRequest"
    | "hasImageProcessor"
    | "processPageImage"
    | "updateSettings"
    | "dispose"
  >,
  "dispose" | "updateSettings" | "getPageList"
> & {
  readonly id: string;
  getPageList(
    manga: AidokuManga,
    chapter: AidokuChapter,
  ): Promise<MobileSourcePage[]>;
  /** Optional deferred resolver. Reader invokes it only inside its near-page window. */
  resolvePageImage?: (page: MobileSourcePage) => Promise<string | null>;
  dispose: () => void | Promise<void>;
  /** Settings application may be async. Callers that record a new settings
   * signature as applied must await it — see the session cache. */
  updateSettings: (settings: Record<string, unknown>) => void | Promise<void>;
  getSettingsSchema?: () => Promise<string | null>;
};

export type MobileAidokuExecutorLoadInput = {
  sourceKey: string;
  packageCacheKey: string;
  packageUri: string;
  bytes?: Uint8Array;
  byteLength?: number;
  metadata: SourcePackageMetadata;
  settings: Record<string, unknown>;
};

export type MobileAidokuExecutorLoadResult =
  | {
      status: "ready";
      runtime: "native-aidoku" | "web-aidoku";
      source: MobileAidokuExecutorSource;
    }
  | {
      status: "blocked";
      reason: "native-bridge-missing" | "unsupported-platform" | "bridge-load-failed";
      detail: string;
    };

export type MobileAidokuExecutorBridge = {
  /** Native isolated runtimes can consume the private package file directly.
   * Omit this field for bridges that require validated JS package bytes. */
  packageLoadMode?: "bytes" | "native-file";
  loadSource(input: MobileAidokuExecutorLoadInput): Promise<MobileAidokuExecutorLoadResult>;
};

export type MobileSourceExecutorFailure =
  | MobileSourcePackageLoadFailure
  | "native-bridge-missing"
  | "unsupported-platform"
  | "unsupported-package"
  | "unsafe-runtime-disabled"
  | "bridge-load-failed"
  | "invalid-native-session";

export type MobileSourceExecutorSession =
  | {
      status: "ready";
      sourceKey: string;
      runtime: MobileSourceExecutorRuntime;
      metadata?: SourcePackageMetadata;
      sourcePackageHydration?: MobileSourcePackageHydration;
      source: MobileAidokuExecutorSource;
    }
  | {
      status: "blocked";
      sourceKey: string | null;
      reason: MobileSourceExecutorFailure;
      detail: string;
      metadata?: SourcePackageMetadata;
      sourcePackageHydration?: MobileSourcePackageHydration;
    };

export type MobileSourceExecutorOptions = {
  bridge?: MobileAidokuExecutorBridge;
  readBytes?: ReadCachedPackageBytes;
  cachePackage?: CacheMobileSourcePackage;
  resolvePackageUri?: ResolveCachedMobileSourcePackageUri;
  settings?: Record<string, unknown>;
  /** Opaque account namespace captured before async session creation. */
  executionScope?: string;
};
export async function createMobileSourceExecutorSession(
  source: MobileRuntimeSource | null | undefined,
  options: MobileSourceExecutorOptions = {}
): Promise<MobileSourceExecutorSession> {
  if (source?.sourceKind === "tachiyomi") {
    // This build intentionally has no native Tachiyomi runtime. Fail before
    // package hydration or a cache read: an APK can be tens of MiB and no
    // production bridge can consume it.
    return {
      status: "blocked",
      sourceKey: `${source.registryId}:${source.sourceId}`,
      reason: "native-bridge-missing",
      detail: MOBILE_TACHIYOMI_UNSUPPORTED_DETAIL,
    };
  }

  const bridge = options.bridge ?? defaultMobileAidokuExecutorBridge;
  const packageResult = await loadMobileSourcePackage(
    source,
    options.readBytes ?? readCachedSourcePackageBytes,
    {
      cachePackage: options.cachePackage,
      resolvePackageUri: options.resolvePackageUri,
      packageLoadMode: bridge.packageLoadMode ?? "bytes",
    },
  );

  if (packageResult.status === "blocked") {
    return {
      status: "blocked",
      sourceKey: packageResult.sourceKey,
      reason: packageResult.reason,
      detail: packageResult.detail,
      ...(packageResult.sourcePackageHydration
        ? { sourcePackageHydration: packageResult.sourcePackageHydration }
        : {}),
    };
  }

  let loadResult: MobileAidokuExecutorLoadResult;
  const executionSourceKey = makeMobileSourceExecutionKey(
    packageResult.sourceKey,
    options.executionScope,
  );
  try {
    loadResult = await bridge.loadSource({
      sourceKey: executionSourceKey,
      packageCacheKey: packageResult.packageCacheKey,
      packageUri: packageResult.packageUri,
      ...(packageResult.bytes
        ? {
            bytes: packageResult.bytes,
            byteLength: packageResult.byteLength,
          }
        : {}),
      metadata: packageResult.metadata,
      settings: options.settings ?? {},
    });
  } catch (error) {
    return {
      status: "blocked",
      sourceKey: packageResult.sourceKey,
      reason: "bridge-load-failed",
      detail: error instanceof Error ? error.message : "The native Aidoku bridge failed to load.",
      metadata: packageResult.metadata,
      ...(packageResult.sourcePackageHydration
        ? { sourcePackageHydration: packageResult.sourcePackageHydration }
        : {}),
    };
  }

  if (loadResult.status === "blocked") {
    return {
      status: "blocked",
      sourceKey: packageResult.sourceKey,
      reason: loadResult.reason,
      detail: loadResult.detail,
      metadata: packageResult.metadata,
      ...(packageResult.sourcePackageHydration
        ? { sourcePackageHydration: packageResult.sourcePackageHydration }
        : {}),
    };
  }

  return {
    status: "ready",
    sourceKey: packageResult.sourceKey,
    runtime: loadResult.runtime,
    metadata: packageResult.metadata,
    ...(packageResult.sourcePackageHydration
      ? { sourcePackageHydration: packageResult.sourcePackageHydration }
      : {}),
    source: loadResult.source,
  };
}

export type {
  AidokuChapter,
  AidokuManga,
  AidokuPage,
  Filter,
  FilterValue,
  HomeLayout,
  Listing,
  MangaPageResult,
};
